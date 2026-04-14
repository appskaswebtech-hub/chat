import { useEffect, useState, useRef, useCallback } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Badge,
  Avatar,
  Button,
  TextField,
  Divider,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// ─── LOADER ───
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const conversationId = params.conversationId;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: { agent: true },
      },
      shop: true,
    },
  });

  if (!conversation) {
    throw new Response("Conversation not found", { status: 404 });
  }

  // Mark customer messages as read
  await prisma.message.updateMany({
    where: {
      conversationId: conversationId,
      senderType: "customer",
      isRead: false,
    },
    data: { isRead: true },
  });

  return json({ conversation, messages: conversation.messages });
};

// ─── ACTION ───
export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const conversationId = params.conversationId!;

  if (intent === "send-message") {
    const content = formData.get("content") as string;
    if (!content || content.trim() === "") {
      return json({ error: "Message cannot be empty" }, { status: 400 });
    }

    await prisma.message.create({
      data: {
        conversationId,
        senderType: "agent",
        content: content.trim(),
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    return json({ success: true });
  }

  if (intent === "close-conversation") {
    await prisma.message.create({
      data: {
        conversationId,
        senderType: "system",
        content: "This conversation has been closed by support. Thank you for chatting with us!",
      },
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "closed", lastMessageAt: new Date() },
    });
    return json({ success: true });
  }

  if (intent === "reopen-conversation") {
    await prisma.message.create({
      data: {
        conversationId,
        senderType: "system",
        content: "Conversation reopened by support.",
      },
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "open", lastMessageAt: new Date() },
    });
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

// ─── COMPONENT ───
export default function ConversationView() {
  const { conversation, messages: initialMessages } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [newMessage, setNewMessage] = useState("");
  const [liveMessages, setLiveMessages] = useState(initialMessages);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveMessages]);

  // Poll for new messages every 3s
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(
          `/app/api/messages?conversationId=${conversation.id}`,
        );
        if (res.ok) {
          const data = await res.json();
          if (data.messages && data.messages.length > liveMessages.length) {
            setLiveMessages(data.messages);
          }
        }
      } catch (err) {}
    }, 3000);
    return () => clearInterval(timer);
  }, [conversation.id, liveMessages.length]);

  const handleSend = useCallback(() => {
    if (!newMessage.trim()) return;

    setLiveMessages((prev: any) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        conversationId: conversation.id,
        senderType: "agent",
        content: newMessage.trim(),
        isRead: true,
        createdAt: new Date().toISOString(),
        agent: null,
      },
    ]);

    fetcher.submit(
      { intent: "send-message", content: newMessage.trim() },
      { method: "POST" },
    );
    setNewMessage("");
  }, [newMessage, conversation.id, fetcher]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const isClosed = conversation.status === "closed";

  const formatTime = (d: string) =>
    new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <Page
      backAction={{
        content: "All Chats",
        onAction: () => navigate("/app/chat"),
      }}
      title={conversation.customerName}
      subtitle={conversation.customerEmail || "No email provided"}
      titleMetadata={
        isClosed ? (
          <Badge>Closed</Badge>
        ) : (
          <Badge tone="attention">Open</Badge>
        )
      }
      primaryAction={
        isClosed
          ? {
              content: "Reopen",
              onAction: () =>
                fetcher.submit(
                  { intent: "reopen-conversation" },
                  { method: "POST" },
                ),
            }
          : {
              content: "Close Chat",
              destructive: true,
              onAction: () =>
                fetcher.submit(
                  { intent: "close-conversation" },
                  { method: "POST" },
                ),
            }
      }
    >
      <TitleBar title="Chat" />

      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {/* Messages */}
              <Box minHeight="400px" maxHeight="500px" overflowY="auto">
                <BlockStack gap="300">
                  <Box paddingBlockEnd="200">
                    <InlineStack align="center">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Conversation started{" "}
                        {formatDate(conversation.createdAt)}
                      </Text>
                    </InlineStack>
                  </Box>

                  {liveMessages.map((msg: any) => (
                    <Box key={msg.id} paddingBlockEnd="100">
                      {msg.senderType === "customer" ? (
                        <InlineStack align="start" gap="200">
                          <Avatar
                            initials={conversation.customerName
                              .charAt(0)
                              .toUpperCase()}
                            size="sm"
                          />
                          <Box
                            background="bg-surface-secondary"
                            padding="300"
                            borderRadius="200"
                          >
                            <BlockStack gap="100">
                              <Text as="p" variant="bodyMd">
                                {msg.content}
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {formatTime(msg.createdAt)}
                              </Text>
                            </BlockStack>
                          </Box>
                        </InlineStack>
                      ) : msg.senderType === "system" ? (
                        <InlineStack align="center">
                          <Text as="p" variant="bodySm" tone="subdued">
                            {msg.content}
                          </Text>
                        </InlineStack>
                      ) : (
                        <InlineStack align="end" gap="200">
                          <Box
                            background="bg-fill-info"
                            padding="300"
                            borderRadius="200"
                          >
                            <BlockStack gap="100">
                              <Text as="p" variant="bodyMd">
                                {msg.content}
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {formatTime(msg.createdAt)}
                              </Text>
                            </BlockStack>
                          </Box>
                        </InlineStack>
                      )}
                    </Box>
                  ))}

                  <div ref={chatEndRef} />
                </BlockStack>
              </Box>

              <Divider />

              {/* Input */}
              {isClosed ? (
                <Banner tone="info">
                  <p>This conversation is closed. Reopen it to reply.</p>
                </Banner>
              ) : (
                <InlineStack gap="200" blockAlign="end">
                  <Box width="100%">
                    <TextField
                      label=""
                      labelHidden
                      value={newMessage}
                      onChange={setNewMessage}
                      onKeyDown={handleKeyDown}
                      placeholder="Type your reply..."
                      multiline={2}
                      autoComplete="off"
                    />
                  </Box>
                  <Button
                    variant="primary"
                    onClick={handleSend}
                    disabled={!newMessage.trim()}
                  >
                    Send
                  </Button>
                </InlineStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Sidebar */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Customer Info
              </Text>
              <Divider />
              <BlockStack gap="200">
                <InlineStack gap="200">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Name:
                  </Text>
                  <Text as="span" variant="bodySm">
                    {conversation.customerName}
                  </Text>
                </InlineStack>
                <InlineStack gap="200">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Email:
                  </Text>
                  <Text as="span" variant="bodySm">
                    {conversation.customerEmail || "Not provided"}
                  </Text>
                </InlineStack>
                <InlineStack gap="200">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Started:
                  </Text>
                  <Text as="span" variant="bodySm">
                    {formatDate(conversation.createdAt)}
                  </Text>
                </InlineStack>
                <InlineStack gap="200">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Messages:
                  </Text>
                  <Text as="span" variant="bodySm">
                    {liveMessages.length}
                  </Text>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
