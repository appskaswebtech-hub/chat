import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "crypto";
import prisma from "../db.server";

/**
 * Shopify App Proxy Route
 *
 * Shopify proxies storefront requests:
 *   your-store.myshopify.com/apps/chat/* → your-app.com/proxy/*
 *
 * Shopify adds these query params for verification:
 *   shop, timestamp, signature, path_prefix, logged_in_customer_id, etc.
 */

// ─── Verify Shopify Proxy Signature ───
function verifyProxySignature(query: URLSearchParams): boolean {
  const signature = query.get("signature");
  if (!signature) return false;

  const secret = process.env.SHOPIFY_API_SECRET || "";

  // Build the query string without signature, sorted alphabetically
  const params: string[] = [];
  query.forEach((value, key) => {
    if (key !== "signature") {
      params.push(`${key}=${value}`);
    }
  });
  params.sort();
  const message = params.join("");

  const computed = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");

  return computed === signature;
}

// ─── GET: Config & Messages ───
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const query = url.searchParams;

  // Verify request is from Shopify
  if (!verifyProxySignature(query)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopDomain = query.get("shop") || "";
  const action = query.get("action");

  // ── Get widget config ──
  if (action === "config") {
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

  // ── Poll messages ──
  if (action === "messages") {
    const conversationId = query.get("conversationId");
    if (!conversationId) {
      return json({ error: "conversationId required" }, { status: 400 });
    }

    const after = query.get("after");

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { status: true },
    });

    if (!conversation) {
      return json({ error: "Conversation not found", status: "not_found" }, { status: 404 });
    }

    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        ...(after ? { createdAt: { gt: new Date(after) } } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        senderType: true,
        content: true,
        createdAt: true,
      },
    });

    return json({ messages, status: conversation.status });
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

// ─── POST: Start conversation & send messages ───
export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const query = url.searchParams;

  // Verify request is from Shopify
  if (!verifyProxySignature(query)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopDomain = query.get("shop") || "";

  // Parse body - proxy sends form data or JSON
  let body: any;
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    body = await request.json();
  } else {
    const formData = await request.formData();
    body = Object.fromEntries(formData);
  }

  const { intent } = body;

  // ── Start new conversation ──
  if (intent === "start") {
    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
    });

    if (!shop || !shop.chatEnabled) {
      return json({ error: "Chat not available" }, { status: 403 });
    }

    const conversation = await prisma.conversation.create({
      data: {
        shopId: shop.id,
        customerName: body.customerName || "Visitor",
        customerEmail: body.customerEmail || null,
        metadata: JSON.stringify({
          pageUrl: body.pageUrl || "",
          customerId: query.get("logged_in_customer_id") || null,
        }),
        messages: {
          create: {
            senderType: "customer",
            content: body.message,
          },
        },
      },
    });

    // Send welcome message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: "system",
        content: shop.welcomeMessage,
      },
    });

    return json({
      conversationId: conversation.id,
      welcomeMessage: shop.welcomeMessage,
    });
  }

  // ── Send message ──
  if (intent === "message") {
    const { conversationId, content } = body;

    if (!conversationId || !content?.trim()) {
      return json({ error: "conversationId and content required" }, { status: 400 });
    }

    // Verify conversation belongs to this shop
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        shop: { domain: shopDomain },
      },
    });

    if (!conversation) {
      return json({ error: "Conversation not found" }, { status: 404 });
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

    return json({ success: true, message });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};
