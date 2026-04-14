import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";

// ─── LOADER: Get messages for a conversation ───
// Used by: polling from admin dashboard & widget
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId");

  if (!conversationId) {
    return json({ error: "conversationId required" }, { status: 400 });
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    include: { agent: true },
  });

  return json({ messages });
};

// ─── ACTION: Create messages from widget or admin ───
export const action = async ({ request }: ActionFunctionArgs) => {
  const body = await request.json();
  const { intent } = body;

  // ── Customer starts a new conversation ──
  if (intent === "start-conversation") {
    const { shopDomain, customerName, customerEmail, message, metadata } = body;

    // Find the shop
    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
    });

    if (!shop) {
      return json({ error: "Shop not found" }, { status: 404 });
    }

    if (!shop.chatEnabled) {
      return json({ error: "Chat is disabled for this shop" }, { status: 403 });
    }

    // Create conversation + first message
    const conversation = await prisma.conversation.create({
      data: {
        shopId: shop.id,
        customerName: customerName || "Visitor",
        customerEmail: customerEmail || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        messages: {
          create: {
            senderType: "customer",
            content: message,
          },
        },
      },
      include: { messages: true },
    });

    return json({
      success: true,
      conversationId: conversation.id,
      welcomeMessage: shop.welcomeMessage,
    });
  }

  // ── Customer sends a message in existing conversation ──
  if (intent === "send-message") {
    const { conversationId, content, senderType } = body;

    if (!conversationId || !content) {
      return json({ error: "conversationId and content required" }, { status: 400 });
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderType: senderType || "customer",
        content: content.trim(),
      },
    });

    // Update conversation timestamp and reopen if closed
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        status: "open",
      },
    });

    return json({ success: true, message });
  }

  // ── Get shop config (widget loads this on init) ──
  if (intent === "get-config") {
    const { shopDomain } = body;

    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
    });

    if (!shop) {
      return json({ error: "Shop not found" }, { status: 404 });
    }

    return json({
      chatEnabled: shop.chatEnabled,
      welcomeMessage: shop.welcomeMessage,
      brandColor: shop.brandColor,
      position: shop.position,
      offlineMessage: shop.offlineMessage,
    });
  }

  // ── Poll for new messages (widget uses this) ──
  if (intent === "poll-messages") {
    const { conversationId, lastMessageId } = body;

    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        ...(lastMessageId ? { id: { gt: lastMessageId } } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    return json({ messages });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};
