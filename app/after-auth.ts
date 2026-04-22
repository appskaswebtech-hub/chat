import prisma from "./db.server";

/**
 * Called after a merchant successfully installs/authenticates the app.
 * Add this to your shopify.server.ts authenticate config as an afterAuth hook.
 *
 * Usage in shopify.server.ts:
 *
 *   import { afterAuthHook } from "./after-auth";
 *
 *   const shopify = shopifyApp({
 *     ...
 *     hooks: {
 *       afterAuth: afterAuthHook,
 *     },
 *   });
 */
export async function afterAuthHook({ session }: { session: any }) {
  const shopDomain = session.shop;

  // Upsert shop record
  await prisma.shop.upsert({
    where: { domain: shopDomain },
    update: {
      name: shopDomain, // Can fetch actual shop name via Admin API
    },
    create: {
      domain: shopDomain,
      name: shopDomain,
      chatEnabled: true,
      welcomeMessage: "Hi there! How can we help you?",
      brandColor: "#4F46E5",
      position: "bottom-right",
    },
  });

  console.log(`[Auth] Shop registered: ${shopDomain}`);
}
