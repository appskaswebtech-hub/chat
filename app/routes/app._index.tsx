import { useEffect } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
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
  Divider,
  InlineGrid,
  ProgressBar,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// ─── LOADER: Fetch analytics data ───
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  let shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop) {
    shop = await prisma.shop.create({
      data: { domain: shopDomain, name: shopDomain },
    });
  }

  const now = new Date();

  // Today start
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  // This week start (Monday)
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);

  // This month start
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Last 7 days for chart
  const last7Days = new Date(now);
  last7Days.setDate(now.getDate() - 6);
  last7Days.setHours(0, 0, 0, 0);

  // ── Total stats ──
  const totalConversations = await prisma.conversation.count({
    where: { shopId: shop.id },
  });


  const openConversations = await prisma.conversation.count({
    where: { shopId: shop.id, status: "open" },
  });

  const closedConversations = await prisma.conversation.count({
    where: { shopId: shop.id, status: "closed" },
  });

  const totalMessages = await prisma.message.count({
    where: { conversation: { shopId: shop.id } },
  });

  // ── Today stats ──
  const todayConversations = await prisma.conversation.count({
    where: { shopId: shop.id, createdAt: { gte: todayStart } },
  });

  const todayMessages = await prisma.message.count({
    where: {
      conversation: { shopId: shop.id },
      createdAt: { gte: todayStart },
    },
  });

  // ── This week stats ──
  const weekConversations = await prisma.conversation.count({
    where: { shopId: shop.id, createdAt: { gte: weekStart } },
  });

  const weekMessages = await prisma.message.count({
    where: {
      conversation: { shopId: shop.id },
      createdAt: { gte: weekStart },
    },
  });

  // ── This month stats ──
  const monthConversations = await prisma.conversation.count({
    where: { shopId: shop.id, createdAt: { gte: monthStart } },
  });

  // ── Customer vs Agent messages ──
  const customerMessages = await prisma.message.count({
    where: { conversation: { shopId: shop.id }, senderType: "customer" },
  });

  const agentMessages = await prisma.message.count({
    where: { conversation: { shopId: shop.id }, senderType: "agent" },
  });

  // ── Unread messages ──
  const unreadMessages = await prisma.message.count({
    where: {
      conversation: { shopId: shop.id },
      senderType: "customer",
      isRead: false,
    },
  });

  // ── Daily conversations for last 7 days ──
  const dailyData = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(now);
    dayStart.setDate(now.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const count = await prisma.conversation.count({
      where: {
        shopId: shop.id,
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    });

    const msgCount = await prisma.message.count({
      where: {
        conversation: { shopId: shop.id },
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    });

    dailyData.push({
      date: dayStart.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      shortDay: dayStart.toLocaleDateString("en-US", { weekday: "short" }),
      conversations: count,
      messages: msgCount,
    });
  }

  // ── Recent conversations ──
  const recentConversations = await prisma.conversation.findMany({
    where: { shopId: shop.id },
    orderBy: { lastMessageAt: "desc" },
    take: 5,
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: {
          messages: { where: { isRead: false, senderType: "customer" } },
        },
      },
    },
  });

  // ── Average messages per conversation ──
  const avgMessages =
    totalConversations > 0
      ? Math.round(totalMessages / totalConversations)
      : 0;

  // ── Resolution rate ──
  const resolutionRate =
    totalConversations > 0
      ? Math.round((closedConversations / totalConversations) * 100)
      : 0;

  return json({
    shop,
    stats: {
      totalConversations,
      openConversations,
      closedConversations,
      totalMessages,
      todayConversations,
      todayMessages,
      weekConversations,
      weekMessages,
      monthConversations,
      customerMessages,
      agentMessages,
      unreadMessages,
      avgMessages,
      resolutionRate,
    },
    dailyData,
    recentConversations,
  });
};

// ─── COMPONENT ───
export default function AppIndex() {
  const { shop, stats, dailyData, recentConversations } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const maxConvos = Math.max(...dailyData.map((d: any) => d.conversations), 1);
  const maxMsgs = Math.max(...dailyData.map((d: any) => d.messages), 1);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${diffDay}d ago`;
  };

  const getStatusBadge = (status: string) => {
    if (status === "open") return <Badge tone="attention">Open</Badge>;
    return <Badge>Closed</Badge>;
  };

  return (
    <Page>
      <TitleBar title="QuikChat Dashboard" />

      <BlockStack gap="500">
        {stats.unreadMessages > 0 && (
          <Card>
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="300" blockAlign="center">
                <Box
                  background="bg-fill-critical"
                  padding="200"
                  borderRadius="200"
                >
                  <Text as="span" variant="headingSm" tone="text-inverse">
                    {stats.unreadMessages}
                  </Text>
                </Box>
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  unread message{stats.unreadMessages !== 1 ? "s" : ""} waiting
                  for reply
                </Text>
              </InlineStack>
              <Button variant="primary" onClick={() => navigate("/app/chat")}>
                View Chats
              </Button>
            </InlineStack>
          </Card>
        )}

        {/* Today's Overview */}
        <Text as="h2" variant="headingMd">
          Today
        </Text>
        <InlineGrid columns={{ xs: 2, md: 4 }} gap="400">
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" tone="subdued">
                New Chats
              </Text>
              <Text as="p" variant="headingXl" fontWeight="bold">
                {stats.todayConversations}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" tone="subdued">
                Messages
              </Text>
              <Text as="p" variant="headingXl" fontWeight="bold">
                {stats.todayMessages}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" tone="subdued">
                Open Chats
              </Text>
              <InlineStack gap="200" blockAlign="center">
                <Text as="p" variant="headingXl" fontWeight="bold">
                  {stats.openConversations}
                </Text>
                {stats.openConversations > 0 && (
                  <Badge tone="attention">Active</Badge>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" tone="subdued">
                Unread
              </Text>
              <InlineStack gap="200" blockAlign="center">
                <Text as="p" variant="headingXl" fontWeight="bold">
                  {stats.unreadMessages}
                </Text>
                {stats.unreadMessages > 0 && (
                  <Badge tone="critical">Pending</Badge>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* Main Layout */}
        <Layout>
          {/* Left: Charts */}
          <Layout.Section>
            <BlockStack gap="400">
              {/* Last 7 Days Chart */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingSm">
                      Last 7 Days — Conversations
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {stats.weekConversations} this week
                    </Text>
                  </InlineStack>
                  <Divider />
                  <Box paddingBlockStart="200">
                    <InlineStack gap="200" align="space-between">
                      {dailyData.map((day: any, i: number) => (
                        <BlockStack key={i} gap="200" inlineAlign="center">
                          <Box
                            minHeight="120px"
                            width="100%"
                            position="relative"
                          >
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "flex-end",
                                height: "120px",
                                alignItems: "center",
                              }}
                            >
                              <Text as="p" variant="bodySm" fontWeight="bold">
                                {day.conversations}
                              </Text>
                              <div
                                style={{
                                  width: "32px",
                                  height: `${Math.max((day.conversations / maxConvos) * 100, 4)}px`,
                                  backgroundColor:
                                    day.conversations > 0
                                      ? shop.brandColor || "#4F46E5"
                                      : "#e5e7eb",
                                  borderRadius: "4px 4px 0 0",
                                  marginTop: "4px",
                                  transition: "height 0.3s ease",
                                }}
                              />
                            </div>
                          </Box>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {day.shortDay}
                          </Text>
                        </BlockStack>
                      ))}
                    </InlineStack>
                  </Box>
                </BlockStack>
              </Card>

              {/* Messages Chart */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingSm">
                      Last 7 Days — Messages
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {stats.weekMessages} this week
                    </Text>
                  </InlineStack>
                  <Divider />
                  <Box paddingBlockStart="200">
                    <InlineStack gap="200" align="space-between">
                      {dailyData.map((day: any, i: number) => (
                        <BlockStack key={i} gap="200" inlineAlign="center">
                          <Box minHeight="120px" width="100%">
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "flex-end",
                                height: "120px",
                                alignItems: "center",
                              }}
                            >
                              <Text as="p" variant="bodySm" fontWeight="bold">
                                {day.messages}
                              </Text>
                              <div
                                style={{
                                  width: "32px",
                                  height: `${Math.max((day.messages / maxMsgs) * 100, 4)}px`,
                                  backgroundColor:
                                    day.messages > 0 ? "#10b981" : "#e5e7eb",
                                  borderRadius: "4px 4px 0 0",
                                  marginTop: "4px",
                                  transition: "height 0.3s ease",
                                }}
                              />
                            </div>
                          </Box>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {day.shortDay}
                          </Text>
                        </BlockStack>
                      ))}
                    </InlineStack>
                  </Box>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          {/* Right: Stats Sidebar */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* All Time Stats */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    All Time
                  </Text>
                  <Divider />
                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Total Conversations
                      </Text>
                      <Text as="p" variant="bodySm" fontWeight="bold">
                        {stats.totalConversations}
                      </Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Total Messages
                      </Text>
                      <Text as="p" variant="bodySm" fontWeight="bold">
                        {stats.totalMessages}
                      </Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodySm" tone="subdued">
                        This Month
                      </Text>
                      <Text as="p" variant="bodySm" fontWeight="bold">
                        {stats.monthConversations}
                      </Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Avg Messages/Chat
                      </Text>
                      <Text as="p" variant="bodySm" fontWeight="bold">
                        {stats.avgMessages}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Resolution Rate */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Resolution Rate
                  </Text>
                  <Divider />
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Closed / Total
                      </Text>
                      <Text as="p" variant="bodySm" fontWeight="bold">
                        {stats.resolutionRate}%
                      </Text>
                    </InlineStack>
                    <ProgressBar
                      progress={stats.resolutionRate}
                      tone="primary"
                      size="small"
                    />
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodySm" tone="subdued">
                        {stats.closedConversations} closed
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {stats.openConversations} open
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Message Breakdown */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Message Breakdown
                  </Text>
                  <Divider />
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodySm" tone="subdued">
                        From Customers
                      </Text>
                      <Text as="p" variant="bodySm" fontWeight="bold">
                        {stats.customerMessages}
                      </Text>
                    </InlineStack>
                    {stats.totalMessages > 0 && (
                      <ProgressBar
                        progress={Math.round(
                          (stats.customerMessages / stats.totalMessages) * 100,
                        )}
                        tone="primary"
                        size="small"
                      />
                    )}
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodySm" tone="subdued">
                        From Support
                      </Text>
                      <Text as="p" variant="bodySm" fontWeight="bold">
                        {stats.agentMessages}
                      </Text>
                    </InlineStack>
                    {stats.totalMessages > 0 && (
                      <ProgressBar
                        progress={Math.round(
                          (stats.agentMessages / stats.totalMessages) * 100,
                        )}
                        tone="success"
                        size="small"
                      />
                    )}
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>

        {/* Recent Conversations */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">
                Recent Conversations
              </Text>
              <Button variant="plain" onClick={() => navigate("/app/chat")}>
                View all
              </Button>
            </InlineStack>
            <Divider />

            {recentConversations.length === 0 ? (
              <Box paddingBlock="400">
                <BlockStack gap="200" inlineAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">
                    No conversations yet. Chats will appear here once customers
                    start messaging.
                  </Text>
                </BlockStack>
              </Box>
            ) : (
              <BlockStack gap="300">
                {recentConversations.map((conv: any) => {
                  const lastMsg = conv.messages[0];
                  const unread = conv._count.messages;

                  return (
                    <Box key={conv.id}>
                      <InlineStack
                        align="space-between"
                        blockAlign="center"
                        gap="400"
                      >
                        <InlineStack gap="300" blockAlign="center">
                          <Avatar
                            initials={conv.customerName
                              .charAt(0)
                              .toUpperCase()}
                            size="sm"
                          />
                          <BlockStack gap="050">
                            <InlineStack gap="200" blockAlign="center">
                              <Text
                                as="span"
                                variant="bodySm"
                                fontWeight="semibold"
                              >
                                {conv.customerName}
                              </Text>
                              {getStatusBadge(conv.status)}
                              {unread > 0 && (
                                <Badge tone="critical">{unread}</Badge>
                              )}
                            </InlineStack>
                            {lastMsg && (
                              <Text as="p" variant="bodySm" tone="subdued">
                                {lastMsg.senderType === "agent" && "You: "}
                                {lastMsg.content.length > 50
                                  ? lastMsg.content.substring(0, 50) + "..."
                                  : lastMsg.content}
                              </Text>
                            )}
                          </BlockStack>
                        </InlineStack>

                        <InlineStack gap="200" blockAlign="center">
                          <Text as="span" variant="bodySm" tone="subdued">
                            {formatTime(conv.lastMessageAt)}
                          </Text>
                          <Button
                            size="slim"
                            onClick={() => navigate(`/app/chat/${conv.id}`)}
                          >
                            Open
                          </Button>
                        </InlineStack>
                      </InlineStack>
                      <Box paddingBlockStart="300">
                        <Divider />
                      </Box>
                    </Box>
                  );
                })}
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        {/* Quick Links */}
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Chat Support
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                View and reply to all customer conversations.
              </Text>
              <Button onClick={() => navigate("/app/chat")}>
                Open Chat Inbox
              </Button>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Widget Settings
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Customize your chat widget appearance and messages.
              </Text>
              <Button onClick={() => navigate("/app/chat-settings")}>
                Configure Widget
              </Button>
            </BlockStack>
          </Card>
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
