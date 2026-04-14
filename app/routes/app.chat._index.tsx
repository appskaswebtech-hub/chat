import { useEffect, useState, useCallback } from "react";
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
  EmptyState,
  Spinner,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// ─── LOADER: Fetch all conversations for this shop ───
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Ensure shop record exists
  let shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop) {
    shop = await prisma.shop.create({
      data: { domain: shopDomain, name: shopDomain },
    });
  }

  const conversations = await prisma.conversation.findMany({
    where: { shopId: shop.id },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1, // last message for preview
      },
      _count: {
        select: {
          messages: { where: { isRead: false, senderType: "customer" } },
        },
      },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  return json({ shop, conversations });
};

// ─── ACTION: Handle conversation status updates ───
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "close-conversation") {
    const conversationId = formData.get("conversationId") as string;
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "closed" },
    });
    return json({ success: true });
  }

  if (intent === "reopen-conversation") {
    const conversationId = formData.get("conversationId") as string;
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "open" },
    });
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

// ─── COMPONENT ───
export default function ChatDashboard() {
  const { shop, conversations } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const [filter, setFilter] = useState("open");

  const filteredConversations = conversations.filter(
    (c: any) => c.status === filter,
  );

  const openCount = conversations.filter((c: any) => c.status === "open").length;
  const closedCount = conversations.filter((c: any) => c.status === "closed").length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge tone="attention">Open</Badge>;
      case "assigned":
        return <Badge tone="info">Assigned</Badge>;
      case "closed":
        return <Badge>Closed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

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

  return (
    <Page>
      <TitleBar title="Chat Support" />

      <BlockStack gap="400">
        {/* Stats Bar */}
        <InlineStack gap="400">
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">
                Open Chats
              </Text>
              <Text as="p" variant="headingLg" fontWeight="bold">
                {openCount}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">
                Closed
              </Text>
              <Text as="p" variant="headingLg" fontWeight="bold">
                {closedCount}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">
                Total
              </Text>
              <Text as="p" variant="headingLg" fontWeight="bold">
                {conversations.length}
              </Text>
            </BlockStack>
          </Card>
        </InlineStack>

        {/* Filter Tabs */}
        <Card>
          <InlineStack gap="200">
            <Button
              variant={filter === "open" ? "primary" : "secondary"}
              onClick={() => setFilter("open")}
            >
              Open ({openCount})
            </Button>
            <Button
              variant={filter === "closed" ? "primary" : "secondary"}
              onClick={() => setFilter("closed")}
            >
              Closed ({closedCount})
            </Button>
          </InlineStack>
        </Card>

        {/* Conversation List */}
        <Layout>
          <Layout.Section>
            {filteredConversations.length === 0 ? (
              <Card>
                <EmptyState
                  heading="No conversations yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    When customers start chatting on your store, conversations
                    will appear here.
                  </p>
                </EmptyState>
              </Card>
            ) : (
              <BlockStack gap="300">
                {filteredConversations.map((conversation: any) => {
                  const lastMessage = conversation.messages[0];
                  const unreadCount = conversation._count.messages;

                  return (
                    <Card key={conversation.id}>
                      <Box
                        paddingBlockStart="100"
                        paddingBlockEnd="100"
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="400" blockAlign="center">
                            <Avatar
                              initials={conversation.customerName
                                .charAt(0)
                                .toUpperCase()}
                              size="md"
                            />
                            <BlockStack gap="100">
                              <InlineStack gap="200" blockAlign="center">
                                <Text as="span" variant="headingSm" fontWeight="bold">
                                  {conversation.customerName}
                                </Text>
                                {getStatusBadge(conversation.status)}
                                {unreadCount > 0 && (
                                  <Badge tone="critical">
                                    {unreadCount} new
                                  </Badge>
                                )}
                              </InlineStack>

                              {conversation.customerEmail && (
                                <Text as="p" variant="bodySm" tone="subdued">
                                  {conversation.customerEmail}
                                </Text>
                              )}

                              {lastMessage && (
                                <Text as="p" variant="bodySm" tone="subdued">
                                  {lastMessage.senderType === "agent" && "You: "}
                                  {lastMessage.content.length > 80
                                    ? lastMessage.content.substring(0, 80) + "..."
                                    : lastMessage.content}
                                </Text>
                              )}
                            </BlockStack>
                          </InlineStack>

                          <InlineStack gap="200" blockAlign="center">
                            <Text as="span" variant="bodySm" tone="subdued">
                              {formatTime(conversation.lastMessageAt)}
                            </Text>
                            <Button
                              onClick={() =>
                                navigate(`/app/chat/${conversation.id}`)
                              }
                            >
                              Open Chat
                            </Button>
                          </InlineStack>
                        </InlineStack>
                      </Box>
                    </Card>
                  );
                })}
              </BlockStack>
            )}
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
