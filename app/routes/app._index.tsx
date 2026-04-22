import { useEffect, useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import dashboardStyles from "../styles/dashboard.css?url";

export const links = () => [{ rel: "stylesheet", href: dashboardStyles }];

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

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1); weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalConversations, openConversations, closedConversations, totalMessages,
    todayConversations, todayMessages, weekConversations, weekMessages,
    monthConversations, customerMessages, agentMessages, unreadMessages,
  ] = await Promise.all([
    prisma.conversation.count({ where: { shopId: shop.id } }),
    prisma.conversation.count({ where: { shopId: shop.id, status: "open" } }),
    prisma.conversation.count({ where: { shopId: shop.id, status: "closed" } }),
    prisma.message.count({ where: { conversation: { shopId: shop.id } } }),
    prisma.conversation.count({ where: { shopId: shop.id, createdAt: { gte: todayStart } } }),
    prisma.message.count({ where: { conversation: { shopId: shop.id }, createdAt: { gte: todayStart } } }),
    prisma.conversation.count({ where: { shopId: shop.id, createdAt: { gte: weekStart } } }),
    prisma.message.count({ where: { conversation: { shopId: shop.id }, createdAt: { gte: weekStart } } }),
    prisma.conversation.count({ where: { shopId: shop.id, createdAt: { gte: monthStart } } }),
    prisma.message.count({ where: { conversation: { shopId: shop.id }, senderType: "customer" } }),
    prisma.message.count({ where: { conversation: { shopId: shop.id }, senderType: "agent" } }),
    prisma.message.count({ where: { conversation: { shopId: shop.id }, senderType: "customer", isRead: false } }),
  ]);

  const dailyData = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(now); dayStart.setDate(now.getDate() - i); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setHours(23, 59, 59, 999);
    const [count, msgCount] = await Promise.all([
      prisma.conversation.count({ where: { shopId: shop.id, createdAt: { gte: dayStart, lte: dayEnd } } }),
      prisma.message.count({ where: { conversation: { shopId: shop.id }, createdAt: { gte: dayStart, lte: dayEnd } } }),
    ]);
    dailyData.push({
      shortDay: dayStart.toLocaleDateString("en-US", { weekday: "short" }),
      conversations: count,
      messages: msgCount,
    });
  }

  const recentConversations = await prisma.conversation.findMany({
    where: { shopId: shop.id },
    orderBy: { lastMessageAt: "desc" },
    take: 5,
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { messages: { where: { isRead: false, senderType: "customer" } } } },
    },
  });

  const avgMessages = totalConversations > 0 ? Math.round(totalMessages / totalConversations) : 0;
  const resolutionRate = totalConversations > 0 ? Math.round((closedConversations / totalConversations) * 100) : 0;

  return json({
    shop,
    stats: {
      totalConversations, openConversations, closedConversations, totalMessages,
      todayConversations, todayMessages, weekConversations, weekMessages,
      monthConversations, customerMessages, agentMessages, unreadMessages,
      avgMessages, resolutionRate,
    },
    dailyData,
    recentConversations,
  });
};

// ─── ICONS ───
const IconChat = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const IconMsg = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
  </svg>
);
const IconOpen = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const IconUnread = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);
const IconTrend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
  </svg>
);
const IconArrow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
);

// ─── ANIMATED COUNTER ───
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = Math.ceil(value / (800 / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= value) { setDisplay(value); clearInterval(timer); }
      else setDisplay(start);
    }, 16);
    return () => clearInterval(timer);
  }, [value]);
  return <>{display}</>;
}

// ─── SPARKLINE ───
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const w = 80, h = 32;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} style={{ opacity: 0.45 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── BAR CHART ───
function BarChart({ data, color }: { data: { shortDay: string; value: number }[]; color: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", height: "140px", padding: "0 8px" }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", height: "100%" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", width: "100%" }}>
            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, marginBottom: "4px" }}>{d.value > 0 ? d.value : ""}</span>
            <div style={{
              width: "100%", maxWidth: "36px",
              height: `${Math.max((d.value / max) * 100, 4)}%`,
              background: d.value > 0 ? `linear-gradient(180deg, ${color}bb, ${color})` : "#f1f5f9",
              borderRadius: "6px 6px 0 0",
              transition: `height 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.05}s`,
              boxShadow: d.value > 0 ? `0 4px 12px ${color}30` : "none",
            }} />
          </div>
          <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 500 }}>{d.shortDay}</span>
        </div>
      ))}
    </div>
  );
}

// ─── SECTION HEADING ───
function SectionHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="qc-section-heading">
      <div className="qc-section-heading-title">{title}</div>
      {sub && <div className="qc-section-heading-sub">{sub}</div>}
    </div>
  );
}

function SidebarLabel({ children }: { children: string }) {
  return <div className="qc-section-label">{children}</div>;
}

// ─── COMPONENT ───
export default function AppIndex() {
  const { shop, stats, dailyData, recentConversations } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const formatTime = (dateStr: string) => {
    const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
    return `${Math.floor(diffMin / 1440)}d ago`;
  };

  const convSparkline = dailyData.map((d: any) => d.conversations);
  const msgSparkline = dailyData.map((d: any) => d.messages);

  const statCards = [
    {
      label: "New Chats", value: stats.todayConversations, icon: <IconChat />,
      gradient: "linear-gradient(135deg, #e8eaf6 0%, #dde1f5 100%)",
      iconBg: "#c5caf0", iconColor: "#4f46e5", textColor: "#1e1b4b", subColor: "#6366f1",
      sparkline: convSparkline, sparkColor: "#6366f1", badge: null,
    },
    {
      label: "Messages", value: stats.todayMessages, icon: <IconMsg />,
      gradient: "linear-gradient(135deg, #e6f7f1 0%, #d1f0e6 100%)",
      iconBg: "#a7e0cc", iconColor: "#059669", textColor: "#064e3b", subColor: "#10b981",
      sparkline: msgSparkline, sparkColor: "#10b981", badge: null,
    },
    {
      label: "Open Chats", value: stats.openConversations, icon: <IconOpen />,
      gradient: "linear-gradient(135deg, #fef3e2 0%, #fde8c8 100%)",
      iconBg: "#fcd59a", iconColor: "#d97706", textColor: "#451a03", subColor: "#f59e0b",
      sparkline: convSparkline, sparkColor: "#f59e0b",
      badge: stats.openConversations > 0 ? "Active" : null,
    },
    {
      label: "Unread", value: stats.unreadMessages, icon: <IconUnread />,
      gradient: "linear-gradient(135deg, #fce8e8 0%, #fad5d5 100%)",
      iconBg: "#f5b0b0", iconColor: "#dc2626", textColor: "#450a0a", subColor: "#ef4444",
      sparkline: msgSparkline, sparkColor: "#ef4444",
      badge: stats.unreadMessages > 0 ? "Pending" : null,
    },
  ];

  const avatarColors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
  const avatarBgs = ["#eef2ff", "#f0fdf4", "#fffbeb", "#fef2f2", "#f5f3ff"];

  return (
    <div className="qc-root">
      <TitleBar title="QuikChat Dashboard" />
      <div className="qc-container">

        {/* ── Unread Banner ── */}
        {stats.unreadMessages > 0 && (
          <div className="qc-banner">
            <div className="qc-banner-circle-1" />
            <div className="qc-banner-circle-2" />
            <div style={{ display: "flex", alignItems: "center", gap: "16px", zIndex: 1 }}>
              <div className="qc-banner-count">{stats.unreadMessages}</div>
              <div>
                <div className="qc-banner-title">Unread messages waiting</div>
                <div className="qc-banner-sub">Customers are waiting for your reply</div>
              </div>
            </div>
            <button className="qc-banner-btn" onClick={() => navigate("/app/chat")}>View Chats →</button>
          </div>
        )}

        {/* ── Page Header ── */}
        <div className="qc-page-header">
          <div>
            <div className="qc-page-title">Dashboard</div>
            <div className="qc-page-subtitle">Today's overview</div>
          </div>
          <div className="qc-date-chip">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
        </div>

        {/* ── Stat Cards ── */}
        <div className="qc-stat-grid">
          {statCards.map((card, i) => (
            <div key={i} className="qc-stat-card" style={{ background: card.gradient }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
                <div style={{ background: card.iconBg, borderRadius: "12px", width: "44px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center", color: card.iconColor }}>
                  {card.icon}
                </div>
                {card.badge && (
                  <span className="qc-badge" style={{ background: "rgba(255,255,255,0.6)", color: card.iconColor }}>
                    {card.badge}
                  </span>
                )}
              </div>
              <div style={{ color: card.textColor, fontSize: "34px", fontWeight: 800, lineHeight: 1, marginBottom: "5px", letterSpacing: "-0.03em" }}>
                <AnimatedNumber value={card.value} />
              </div>
              <div style={{ color: card.subColor, fontSize: "13px", fontWeight: 600, marginBottom: "14px" }}>{card.label}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Sparkline data={card.sparkline} color={card.sparkColor} />
                <div className="qc-trend-label" style={{ color: card.subColor, opacity: 0.7 }}>
                  <IconTrend /><span>7d</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Charts + Sidebar ── */}
        <div className="qc-charts-layout">
          <div className="qc-charts-col">
            <div className="qc-card" style={{ padding: "24px" }}>
              <div className="qc-chart-header">
                <SectionHeading title="Conversations" sub="Last 7 days" />
                <span className="qc-chart-pill" style={{ background: "#f0f0ff", color: "#6366f1" }}>{stats.weekConversations} this week</span>
              </div>
              <BarChart data={dailyData.map((d: any) => ({ shortDay: d.shortDay, value: d.conversations }))} color="#6366f1" />
            </div>
            <div className="qc-card" style={{ padding: "24px" }}>
              <div className="qc-chart-header">
                <SectionHeading title="Messages" sub="Last 7 days" />
                <span className="qc-chart-pill" style={{ background: "#f0fdf4", color: "#10b981" }}>{stats.weekMessages} this week</span>
              </div>
              <BarChart data={dailyData.map((d: any) => ({ shortDay: d.shortDay, value: d.messages }))} color="#10b981" />
            </div>
          </div>

          <div className="qc-sidebar-col">
            <div className="qc-card" style={{ padding: "20px" }}>
              <SidebarLabel>All Time</SidebarLabel>
              {[
                { label: "Total Conversations", value: stats.totalConversations },
                { label: "Total Messages", value: stats.totalMessages },
                { label: "This Month", value: stats.monthConversations },
                { label: "Avg Messages / Chat", value: stats.avgMessages },
              ].map((item, i, arr) => (
                <div key={i} className="qc-stat-row" style={{ borderBottom: i < arr.length - 1 ? "1px solid #f8fafc" : "none" }}>
                  <span className="qc-stat-row-label">{item.label}</span>
                  <span className="qc-stat-row-value">{item.value}</span>
                </div>
              ))}
            </div>

            <div className="qc-card" style={{ padding: "20px" }}>
              <SidebarLabel>Resolution Rate</SidebarLabel>
              <div style={{ marginBottom: "12px" }}>
                <span className="qc-big-number">{stats.resolutionRate}</span>
                <span className="qc-big-number-unit">%</span>
              </div>
              <div className="qc-progress-bar" style={{ marginBottom: "10px" }}>
                <div className="qc-progress-fill" style={{ width: `${stats.resolutionRate}%`, background: "linear-gradient(90deg, #667eea, #764ba2)" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", color: "#10b981", fontWeight: 600 }}>✓ {stats.closedConversations} closed</span>
                <span style={{ fontSize: "12px", color: "#f59e0b", fontWeight: 600 }}>● {stats.openConversations} open</span>
              </div>
            </div>

            <div className="qc-card" style={{ padding: "20px" }}>
              <SidebarLabel>Message Breakdown</SidebarLabel>
              {[
                { label: "From Customers", value: stats.customerMessages, bar: "linear-gradient(90deg, #667eea, #764ba2)" },
                { label: "From Support", value: stats.agentMessages, bar: "linear-gradient(90deg, #10b981, #34d399)" },
              ].map((item, i) => (
                <div key={i} style={{ marginBottom: i === 0 ? "16px" : 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span className="qc-stat-row-label">{item.label}</span>
                    <span className="qc-stat-row-value" style={{ fontSize: "13px" }}>{item.value}</span>
                  </div>
                  <div className="qc-progress-bar">
                    <div className="qc-progress-fill" style={{ width: stats.totalMessages > 0 ? `${Math.round((item.value / stats.totalMessages) * 100)}%` : "0%", background: item.bar }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Recent Conversations ── */}
        <div className="qc-card" style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "6px" }}>
                <div style={{ flex: 1, height: "1px", background: "linear-gradient(90deg, transparent, #e2e8f0)" }} />
                <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>Recent Conversations</div>
                <div style={{ flex: 1, height: "1px", background: "linear-gradient(90deg, #e2e8f0, transparent)" }} />
              </div>
              <div style={{ fontSize: "12px", color: "#94a3b8" }}>Latest customer interactions</div>
            </div>
            <button className="qc-btn-ghost" onClick={() => navigate("/app/chat")}>View all <IconArrow /></button>
          </div>
          {recentConversations.length === 0 ? (
            <div className="qc-empty">
              <div className="qc-empty-icon">💬</div>
              <div className="qc-empty-title">No conversations yet</div>
              <div className="qc-empty-sub">Chats will appear here once customers start messaging</div>
            </div>
          ) : (
            recentConversations.map((conv: any, i: number) => {
              const lastMsg = conv.messages[0];
              const unread = conv._count.messages;
              const ci = i % avatarColors.length;
              return (
                <div key={conv.id} className="qc-conv-row">
                  <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1, minWidth: 0 }}>
                    <div className="qc-avatar" style={{ background: avatarBgs[ci], color: avatarColors[ci] }}>
                      {conv.customerName.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                        <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>{conv.customerName}</span>
                        <span className="qc-badge" style={{ background: conv.status === "open" ? "#fef3c7" : "#f1f5f9", color: conv.status === "open" ? "#d97706" : "#64748b" }}>{conv.status}</span>
                        {unread > 0 && <span className="qc-badge" style={{ background: "#fef2f2", color: "#ef4444" }}>{unread} new</span>}
                      </div>
                      {lastMsg && (
                        <div style={{ fontSize: "13px", color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "400px" }}>
                          {lastMsg.senderType === "agent" && <span style={{ color: "#6366f1", fontWeight: 600 }}>You: </span>}
                          {lastMsg.content.length > 60 ? lastMsg.content.substring(0, 60) + "..." : lastMsg.content}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                    <span style={{ fontSize: "12px", color: "#cbd5e1" }}>{formatTime(conv.lastMessageAt)}</span>
                    <button className="qc-open-btn" onClick={() => navigate(`/app/chat/${conv.id}`)}>Open →</button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Quick Links ── */}
        <div className="qc-quicklinks-grid">
          {[
            { title: "Chat Support", desc: "View and reply to all customer conversations.", action: () => navigate("/app/chat"), label: "Open Chat Inbox", gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" },
            { title: "Widget Settings", desc: "Customize your chat widget appearance and messages.", action: () => navigate("/app/chat-settings"), label: "Configure Widget", gradient: "linear-gradient(135deg, #10b981 0%, #34d399 100%)" },
          ].map((card, i) => (
            <div key={i} className="qc-card qc-quicklink-card">
              <div>
                <div className="qc-quicklink-title">{card.title}</div>
                <div className="qc-quicklink-desc">{card.desc}</div>
              </div>
              <button className="qc-btn-primary" style={{ background: card.gradient, flexShrink: 0, marginLeft: "16px" }} onClick={card.action}>
                {card.label}
              </button>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
