import { useEffect, useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate, useRevalidator } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import chatStyles from "../styles/chat-index.css?url";

export const links = () => [{ rel: "stylesheet", href: chatStyles }];

// ─── LOADER ───
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  let shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop) {
    shop = await prisma.shop.create({ data: { domain: shopDomain, name: shopDomain } });
  }

  const conversations = await prisma.conversation.findMany({
    where: { shopId: shop.id },
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { messages: { where: { isRead: false, senderType: "customer" } } } },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  return json({ shop, conversations });
};

// ─── ACTION ───
export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const conversationId = formData.get("conversationId") as string;

  if (intent === "close-conversation") {
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: "closed" } });
    return json({ success: true });
  }
  if (intent === "reopen-conversation") {
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: "open" } });
    return json({ success: true });
  }
  return json({ error: "Unknown intent" }, { status: 400 });
};

// ─── ICONS ───
const IconOpen = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const IconClosed = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconTotal = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const IconArrow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
);

// ─── COMPONENT ───
export default function ChatDashboard() {
  const { shop, conversations } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();
  const [filter, setFilter] = useState("open");

  useEffect(() => {
    const interval = setInterval(() => revalidate(), 5000);
    return () => clearInterval(interval);
  }, []);

  const openCount = conversations.filter((c: any) => c.status === "open").length;
  const closedCount = conversations.filter((c: any) => c.status === "closed").length;
  const filteredConversations = conversations.filter((c: any) => c.status === filter);

  const formatTime = (dateStr: string) => {
    const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
    return `${Math.floor(diffMin / 1440)}d ago`;
  };

  const avatarColors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
  const avatarBgs = ["#eef2ff", "#f0fdf4", "#fffbeb", "#fef2f2", "#f5f3ff", "#ecfeff"];

  const statCards = [
    { label: "Open Chats", value: openCount, icon: <IconOpen />, bg: "#eef2ff", color: "#6366f1", valueBg: "#6366f1" },
    { label: "Closed", value: closedCount, icon: <IconClosed />, bg: "#f0fdf4", color: "#10b981", valueBg: "#10b981" },
    { label: "Total", value: conversations.length, icon: <IconTotal />, bg: "#f8fafc", color: "#64748b", valueBg: "#64748b" },
  ];

  return (
    <div className="ci-root">
      <TitleBar title="Chat Support" />
      <div className="ci-container">

        {/* ── Header ── */}
        <div className="ci-page-header">
          <div>
            <div className="ci-page-title">Chat Support</div>
            <div className="ci-page-sub">Manage all customer conversations</div>
          </div>
          <div className="ci-live-badge">
            <span className="ci-live-dot" />
            Live updates
          </div>
        </div>

        {/* ── Stat Cards ── */}
        <div className="ci-stat-grid">
          {statCards.map((card, i) => (
            <div key={i} className="ci-stat-card" style={{ background: card.bg }}>
              <div className="ci-stat-icon" style={{ color: card.color, background: `${card.color}18` }}>
                {card.icon}
              </div>
              <div className="ci-stat-value" style={{ color: card.valueBg }}>{card.value}</div>
              <div className="ci-stat-label">{card.label}</div>
            </div>
          ))}
        </div>

        {/* ── Filter Tabs ── */}
        <div className="ci-tabs">
          <button
            className={`ci-tab ${filter === "open" ? "ci-tab-active" : ""}`}
            onClick={() => setFilter("open")}
          >
            Open
            <span className="ci-tab-count" style={{ background: filter === "open" ? "#6366f1" : "#e2e8f0", color: filter === "open" ? "#fff" : "#64748b" }}>
              {openCount}
            </span>
          </button>
          <button
            className={`ci-tab ${filter === "closed" ? "ci-tab-active" : ""}`}
            onClick={() => setFilter("closed")}
          >
            Closed
            <span className="ci-tab-count" style={{ background: filter === "closed" ? "#6366f1" : "#e2e8f0", color: filter === "closed" ? "#fff" : "#64748b" }}>
              {closedCount}
            </span>
          </button>
        </div>

        {/* ── Conversation List ── */}
        {filteredConversations.length === 0 ? (
          <div className="ci-empty">
            <div className="ci-empty-icon">💬</div>
            <div className="ci-empty-title">No {filter} conversations</div>
            <div className="ci-empty-sub">
              {filter === "open" ? "All caught up! No open chats right now." : "No closed conversations yet."}
            </div>
          </div>
        ) : (
          <div className="ci-list">
            {filteredConversations.map((conv: any, i: number) => {
              const lastMsg = conv.messages[0];
              const unread = conv._count.messages;
              const ci = i % avatarColors.length;

              return (
                <div key={conv.id} className="ci-card" onClick={() => navigate(`/app/chat/${conv.id}`)}>
                  <div className="ci-card-left">
                    <div className="ci-avatar" style={{ background: avatarBgs[ci], color: avatarColors[ci] }}>
                      {conv.customerName.charAt(0).toUpperCase()}
                    </div>
                    <div className="ci-card-info">
                      <div className="ci-card-name-row">
                        <span className="ci-card-name">{conv.customerName}</span>
                        <span className="ci-status-badge" style={{
                          background: conv.status === "open" ? "#fef3c7" : "#f1f5f9",
                          color: conv.status === "open" ? "#d97706" : "#64748b",
                        }}>
                          {conv.status}
                        </span>
                        {unread > 0 && (
                          <span className="ci-unread-badge">{unread} new</span>
                        )}
                      </div>
                      {conv.customerEmail && (
                        <div className="ci-card-email">{conv.customerEmail}</div>
                      )}
                      {lastMsg && (
                        <div className="ci-card-preview">
                          {lastMsg.senderType === "agent" && <span className="ci-you">You: </span>}
                          {lastMsg.content.length > 80 ? lastMsg.content.substring(0, 80) + "..." : lastMsg.content}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="ci-card-right">
                    <span className="ci-time">{formatTime(conv.lastMessageAt)}</span>
                    <button className="ci-open-btn" onClick={(e) => { e.stopPropagation(); navigate(`/app/chat/${conv.id}`); }}>
                      Open <IconArrow />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
