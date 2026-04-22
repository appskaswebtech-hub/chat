import { useEffect, useState, useRef, useCallback } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import conversationStyles from "../styles/conversation.css?url";

export const links = () => [{ rel: "stylesheet", href: conversationStyles }];

// ─── LOADER ───
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const conversationId = params.conversationId;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: { orderBy: { createdAt: "asc" }, include: { agent: true } },
      shop: true,
    },
  });

  if (!conversation) throw new Response("Conversation not found", { status: 404 });

  await prisma.message.updateMany({
    where: { conversationId, senderType: "customer", isRead: false },
    data: { isRead: true },
  });

  return json({ conversation, messages: conversation.messages });
};

// ─── ACTION ───
export const action = async ({ request, params }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const conversationId = params.conversationId!;

  if (intent === "send-message") {
    const content = formData.get("content") as string;
    if (!content?.trim()) return json({ error: "Empty message" }, { status: 400 });

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { pushSubscriptions: true },
    });

    await prisma.message.create({ data: { conversationId, senderType: "agent", content: content.trim() } });
    await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });

    if (conversation?.pushSubscriptions?.length) {
      const webpush = await import("web-push");
      webpush.default.setVapidDetails(process.env.VAPID_EMAIL!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
      const payload = JSON.stringify({ title: "New message from support", body: content.trim().substring(0, 100), url: "/" });
      for (const sub of conversation.pushSubscriptions) {
        try {
          await webpush.default.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        } catch (e) { console.error("[Push] Failed:", e); }
      }
    }
    return json({ success: true });
  }

  if (intent === "close-conversation") {
    await prisma.message.create({ data: { conversationId, senderType: "system", content: "This conversation has been closed by support. Thank you for chatting with us!" } });
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: "closed", lastMessageAt: new Date() } });
    return json({ success: true });
  }

  if (intent === "reopen-conversation") {
    await prisma.message.create({ data: { conversationId, senderType: "system", content: "Conversation reopened by support." } });
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: "open", lastMessageAt: new Date() } });
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

// ─── ICONS ───
const IconBack = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
  </svg>
);
const IconSend = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);
const IconChat = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

// ─── COMPONENT ───
export default function ConversationView() {
  const { conversation, messages: initialMessages } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [newMessage, setNewMessage] = useState("");
  const [liveMessages, setLiveMessages] = useState(initialMessages);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveMessages]);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/app/api/messages?conversationId=${conversation.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.messages && data.messages.length > liveMessages.length) {
            setLiveMessages(data.messages);
          }
        }
      } catch (err) { }
    }, 3000);
    return () => clearInterval(timer);
  }, [conversation.id, liveMessages.length]);

  const handleSend = useCallback(() => {
    if (!newMessage.trim()) return;
    setLiveMessages((prev: any) => [...prev, {
      id: `temp-${Date.now()}`, conversationId: conversation.id,
      senderType: "agent", content: newMessage.trim(),
      isRead: true, createdAt: new Date().toISOString(), agent: null,
    }]);
    fetcher.submit({ intent: "send-message", content: newMessage.trim() }, { method: "POST" });
    setNewMessage("");
    textareaRef.current?.focus();
  }, [newMessage, conversation.id, fetcher]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const isClosed = conversation.status === "closed";
  const initials = conversation.customerName.charAt(0).toUpperCase();

  const formatTime = (d: string) =>
    new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="cv-root">
      <TitleBar title="Chat" />
      <div className="cv-wrap">

        {/* ── Header ── */}
        <div className="cv-header">
          <div className="cv-header-left">
            <button className="cv-back-btn" onClick={() => navigate("/app/chat")}>
              <IconBack /> All Chats
            </button>
            <div className="cv-customer-avatar">{initials}</div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="cv-customer-name">{conversation.customerName}</div>
                <span className="cv-status-badge" style={{
                  background: isClosed ? "#f1f5f9" : "#fef3c7",
                  color: isClosed ? "#64748b" : "#d97706",
                }}>
                  {isClosed ? "Closed" : "Open"}
                </span>
              </div>
              <div className="cv-customer-email">{conversation.customerEmail || "No email provided"}</div>
            </div>
          </div>
          <div className="cv-header-right">
            {isClosed ? (
              <button className="cv-reopen-btn" onClick={() => fetcher.submit({ intent: "reopen-conversation" }, { method: "POST" })}>
                Reopen Chat
              </button>
            ) : (
              <button className="cv-close-btn" onClick={() => fetcher.submit({ intent: "close-conversation" }, { method: "POST" })}>
                Close Chat
              </button>
            )}
          </div>
        </div>

        {/* ── Layout ── */}
        <div className="cv-layout">

          {/* ── Chat Panel ── */}
          <div className="cv-chat-panel">
            <div className="cv-chat-panel-header">
              <div className="cv-panel-icon"><IconChat /></div>
              <div>
                <div className="cv-panel-title">Conversation</div>
                <div className="cv-panel-sub">Live chat support</div>
              </div>
              <div style={{ marginLeft: "auto", fontSize: "12px", color: "#94a3b8" }}>
                {liveMessages.length} messages
              </div>
            </div>

            <div className="cv-messages">
              <div className="cv-date-divider">Conversation started {formatDate(conversation.createdAt)}</div>

              {liveMessages.map((msg: any) => {
                if (msg.senderType === "system") {
                  return <div key={msg.id} className="cv-msg-system">{msg.content}</div>;
                }
                if (msg.senderType === "customer") {
                  return (
                    <div key={msg.id} className="cv-msg-customer">
                      <div className="cv-msg-avatar" style={{ background: "#eef2ff", color: "#6366f1" }}>{initials}</div>
                      <div>
                        <div className="cv-bubble-customer">{msg.content}</div>
                        <span className="cv-msg-time">{formatTime(msg.createdAt)}</span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={msg.id} className="cv-msg-agent">
                    <div className="cv-msg-avatar" style={{ background: "linear-gradient(135deg, #667eea, #6366f1)", color: "#fff" }}>A</div>
                    <div>
                      <div className="cv-bubble-agent">{msg.content}</div>
                      <span className="cv-msg-time cv-msg-time-right">{formatTime(msg.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {isClosed ? (
              <div className="cv-closed-banner">🔒 Conversation closed. Reopen it to reply.</div>
            ) : (
              <div className="cv-input-area">
                <textarea
                  ref={textareaRef}
                  className="cv-textarea"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Send a message..."
                  rows={2}
                />
                <button className="cv-send-btn" onClick={handleSend} disabled={!newMessage.trim()}>
                  <IconSend />
                </button>
              </div>
            )}
          </div>

          {/* ── Sidebar ── */}
          <div className="cv-sidebar">
            <div className="cv-sidebar-card">
              <div className="cv-sidebar-label">Customer Info</div>
              {[
                { key: "Name", val: conversation.customerName },
                { key: "Email", val: conversation.customerEmail || "Not provided" },
                { key: "Started", val: formatDate(conversation.createdAt) },
                { key: "Messages", val: liveMessages.length },
                { key: "Status", val: conversation.status },
              ].map((item, i) => (
                <div key={i} className="cv-info-row">
                  <div className="cv-info-key">{item.key}</div>
                  <div className="cv-info-val">{item.val}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
