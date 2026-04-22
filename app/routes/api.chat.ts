import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";

// ─── PUBLIC API: No Shopify auth ───
// This endpoint is called by the chat widget on the storefront.
// Customers are NOT authenticated Shopify users, so this must be public.

// ── GET: Fetch config or messages ──
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  // Get shop chat config
  if (action === "config") {
    const shopDomain = url.searchParams.get("shop");
    if (!shopDomain) {
      return json({ error: "shop param required" }, { status: 400 });
    }

    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
    });

    if (!shop || !shop.chatEnabled) {
      return json({ enabled: false });
    }

    return json({
      enabled: true,
      welcomeMessage: shop.welcomeMessage,
      brandColor: shop.brandColor,
      position: shop.position,
      offlineMessage: shop.offlineMessage,
    });
  }

  // Poll messages for a conversation
  if (action === "messages") {
    const conversationId = url.searchParams.get("conversationId");
    if (!conversationId) {
      return json({ error: "conversationId required" }, { status: 400 });
    }

    const after = url.searchParams.get("after"); // ISO date string

    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        ...(after ? { createdAt: { gt: new Date(after) } } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    return json({ messages });
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

// ── POST: Customer sends messages ──
export const action = async ({ request }: ActionFunctionArgs) => {
  // Add basic rate limiting headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const body = await request.json();
  const { intent } = body;

  // ── Start a new conversation ──
  if (intent === "start") {
    const { shopDomain, customerName, customerEmail, message, pageUrl } = body;

    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
    });

    if (!shop || !shop.chatEnabled) {
      return json({ error: "Chat not available" }, { status: 403, headers });
    }

    const conversation = await prisma.conversation.create({
      data: {
        shopId: shop.id,
        customerName: customerName || "Visitor",
        customerEmail: customerEmail || null,
        metadata: JSON.stringify({ pageUrl: pageUrl || "" }),
        messages: {
          create: {
            senderType: "customer",
            content: message,
          },
        },
      },
      include: { messages: true },
    });

    // Also create a welcome message from the system
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: "system",
        content: shop.welcomeMessage,
      },
    });

    return json(
      {
        conversationId: conversation.id,
        welcomeMessage: shop.welcomeMessage,
      },
      { headers },
    );
  }

  // ── Send a message in existing conversation ──
  if (intent === "message") {
    const { conversationId, content } = body;

    if (!conversationId || !content?.trim()) {
      return json(
        { error: "conversationId and content required" },
        { status: 400, headers },
      );
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderType: "customer",
        content: content.trim(),
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), status: "open" },
    });

    return json({ success: true, message }, { headers });
  }
  // ── Save push subscription ──
  if (intent === "subscribe-push") {
    const { conversationId, subscription } = body;
    if (!conversationId || !subscription) {
      return json({ error: "Missing data" }, { status: 400, headers });
    }

    await prisma.pushSubscription.create({
      data: {
        conversationId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });

    return json({ success: true }, { headers });
  }


  return json({ error: "Unknown intent" }, { status: 400, headers });
};
