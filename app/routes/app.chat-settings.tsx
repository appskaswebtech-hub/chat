import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Button,
  TextField,
  Select,
  Checkbox,
  Banner,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// ─── LOADER ───
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  let shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });

  if (!shop) {
    shop = await prisma.shop.create({
      data: { domain: shopDomain, name: shopDomain },
    });
  }

  return json({ shop });
};

// ─── ACTION ───
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();

  const chatEnabled = formData.get("chatEnabled") === "true";
  const welcomeMessage = formData.get("welcomeMessage") as string;
  const brandColor = formData.get("brandColor") as string;
  const position = formData.get("position") as string;
  const offlineMessage = formData.get("offlineMessage") as string;
  const autoReply = formData.get("autoReply") as string;

  await prisma.shop.update({
    where: { domain: shopDomain },
    data: {
      chatEnabled,
      welcomeMessage: welcomeMessage || "Hi there! How can we help you?",
      brandColor: brandColor || "#4F46E5",
      position: position || "bottom-right",
      offlineMessage: offlineMessage || "We're offline right now. Leave a message!",
      autoReply: autoReply || null,
    },
  });

  return json({ success: true });
};

// ─── COMPONENT ───
export default function ChatSettings() {
  const { shop } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const [chatEnabled, setChatEnabled] = useState(shop.chatEnabled);
  const [welcomeMessage, setWelcomeMessage] = useState(shop.welcomeMessage);
  const [brandColor, setBrandColor] = useState(shop.brandColor);
  const [position, setPosition] = useState(shop.position);
  const [offlineMessage, setOfflineMessage] = useState(shop.offlineMessage);
  const [autoReply, setAutoReply] = useState(shop.autoReply || "");

  const isSaving = fetcher.state === "submitting";
  const saved = fetcher.data?.success;

  const handleSave = () => {
    fetcher.submit(
      {
        chatEnabled: String(chatEnabled),
        welcomeMessage,
        brandColor,
        position,
        offlineMessage,
        autoReply,
      },
      { method: "POST" },
    );
  };

  return (
    <Page>
      <TitleBar title="Chat Settings" />

      <BlockStack gap="400">
        {saved && (
          <Banner tone="success" onDismiss={() => {}}>
            <p>Settings saved successfully!</p>
          </Banner>
        )}

        <Layout>
          {/* General Settings */}
          <Layout.AnnotatedSection
            title="General"
            description="Enable or disable chat and set your welcome message."
          >
            <Card>
              <BlockStack gap="400">
                <Checkbox
                  label="Enable live chat on your store"
                  checked={chatEnabled}
                  onChange={setChatEnabled}
                />
                <TextField
                  label="Welcome Message"
                  value={welcomeMessage}
                  onChange={setWelcomeMessage}
                  multiline={3}
                  helpText="Shown to customers when they open the chat widget."
                  autoComplete="off"
                />
                <TextField
                  label="Offline Message"
                  value={offlineMessage}
                  onChange={setOfflineMessage}
                  multiline={2}
                  helpText="Shown when no support agents are online."
                  autoComplete="off"
                />
                <TextField
                  label="Auto Reply (optional)"
                  value={autoReply}
                  onChange={setAutoReply}
                  multiline={2}
                  helpText="Automatic response sent after a customer's first message. Leave empty to disable."
                  autoComplete="off"
                />
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>

          {/* Appearance Settings */}
          <Layout.AnnotatedSection
            title="Appearance"
            description="Customize how the chat widget looks on your store."
          >
            <Card>
              <BlockStack gap="400">
                <TextField
                  label="Brand Color"
                  value={brandColor}
                  onChange={setBrandColor}
                  helpText="Hex color for the chat button and header (e.g., #4F46E5)."
                  autoComplete="off"
                  prefix="#"
                />
                <Box>
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="span" variant="bodySm">
                      Preview:
                    </Text>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        backgroundColor: brandColor,
                        border: "2px solid #e5e7eb",
                      }}
                    />
                  </InlineStack>
                </Box>
                <Select
                  label="Widget Position"
                  options={[
                    { label: "Bottom Right", value: "bottom-right" },
                    { label: "Bottom Left", value: "bottom-left" },
                  ]}
                  value={position}
                  onChange={setPosition}
                />
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>

          {/* Installation Info */}
          <Layout.AnnotatedSection
            title="Installation"
            description="How the chat widget appears on your store."
          >
            <Card>
              <BlockStack gap="300">
                <Text as="p" variant="bodyMd">
                  The chat widget is automatically injected into your storefront
                  via a Theme App Extension. To manage it:
                </Text>
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd">
                    1. Go to your Shopify Admin → Online Store → Themes
                  </Text>
                  <Text as="p" variant="bodyMd">
                    2. Click "Customize" on your active theme
                  </Text>
                  <Text as="p" variant="bodyMd">
                    3. Click "App embeds" in the left sidebar
                  </Text>
                  <Text as="p" variant="bodyMd">
                    4. Toggle the Chat Widget embed on/off
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>
        </Layout>

        {/* Save Button */}
        <InlineStack align="end">
          <Button
            variant="primary"
            onClick={handleSave}
            loading={isSaving}
          >
            Save Settings
          </Button>
        </InlineStack>
      </BlockStack>
    </Page>
  );
}
