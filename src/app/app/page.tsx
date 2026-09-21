"use client";

import { useEffect, useMemo, useState } from "react";
import { MobileNav } from '@/components/chat/MobileNav';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { Avatar, PresenceDot } from "@/components/Presence";
import { ConversationRiver } from "@/components/chat/ConversationRiver";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";
import { EmptyConversation } from "@/components/chat/States";
import {
  DEMO_CONVERSATIONS,
  demoMessagesFor,
  type DemoConversation,
  type DemoMessage,
} from "@/lib/demo";
import { isFirebaseConfigured } from "@/lib/firebaseClient";
import { formatUnreadCount, totalUnreadCounts } from "@/lib/unread";
import { LiveApp } from "@/app/app/LiveApp";

type Rail = "chats" | "groups" | "spaces";

const SPACES = [
  { id: "sp-ocn", name: "OCN Developers", channels: ["# general", "# projects", "# help", "# off-topic"], unread: 5 },
  { id: "sp-dc", name: "Design club", channels: ["# critiques", "# inspo"], unread: 0 },
];

export default function AppPage() {
  useMobileViewport();
  const [rail, setRail] = useState<Rail>("chats");
  const [activeId, setActiveId] = useState<string>("c-crew");
  const [filter, setFilter] = useState("");
  const [replyTo, setReplyTo] = useState<DemoMessage | null>(null);
  const [messages, setMessages] = useState<DemoMessage[]>(() => demoMessagesFor("c-crew"));
  const [showContext, setShowContext] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  // Demo fixtures (src/lib/demo.ts) are development-only and must never be
  // mistaken for production data. They render ONLY when Firebase is
  // unconfigured, or when ?demo=1 is explicitly passed. With a live backend
  // and no ?demo flag, the shell renders an honest "live mode" state and no
  // sample conversations. Read client-side via location.search (not
  // useSearchParams) so the static prerender is unaffected.
  const [demoMode, setDemoMode] = useState(true);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setDemoMode(!isFirebaseConfigured() || params.get("demo") === "1");
  }, []);

  useEffect(() => {
    setMessages(demoMode ? demoMessagesFor(activeId) : []);
    setReplyTo(null);
  }, [activeId, demoMode]);

  const conversations: DemoConversation[] = useMemo(() => {
    if (!demoMode) return [];
    const base =
      rail === "chats"
        ? DEMO_CONVERSATIONS.filter((c) => c.kind === "dm")
        : rail === "groups"
          ? DEMO_CONVERSATIONS.filter((c) => c.kind === "group")
          : DEMO_CONVERSATIONS.filter((c) => c.kind === "channel");
    const q = filter.trim().toLowerCase();
    if (!q) return base;
    return DEMO_CONVERSATIONS.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q) ||
        c.space?.toLowerCase().includes(q),
    );
  }, [rail, filter, demoMode]);

  const active = demoMode ? (DEMO_CONVERSATIONS.find((c) => c.id === activeId) ?? null) : null;

  function send(text: string) {
    // Local preview only: no server or recipient delivery claims.
    if (!demoMode) return;
    const msg: DemoMessage = {
      id: `local-${crypto.randomUUID()}`,
      sender: "You",
      own: true,
      content: text,
      at: "now",
      entrance: "outgoing",
      replyTo: replyTo ? { sender: replyTo.sender, preview: replyTo.content.slice(0, 80) } : undefined,
    };
    setMessages((m) => [...m, msg]);
  }

  function retry(id: string) {
    setMessages(m => m.map(x => x.id === id ? { ...x, failed: false } : x));
  }

  const railBtn = (id: Rail, label: string, icon: React.ReactNode, badge?: React.ReactNode) => (
    <button
      onClick={() => setRail(id)}
      aria-pressed={rail === id}
      title={label}
      aria-label={label}
      className={`relative grid h-11 w-11 place-items-center rounded-2xl transition-colors ${
        rail === id ? "bg-rush-600 text-white shadow-rush-pop" : "text-ink-500 hover:bg-white"
      }`}
    >
      {icon}
      {badge}
    </button>
  );

  // Preview-mode global badge (fixtures carry real counts for design QA).
  const demoTotal = totalUnreadCounts(DEMO_CONVERSATIONS.map((c) => c.unread));
  const demoTotalBadge = formatUnreadCount(demoTotal);

  // Live backend + no ?demo flag → the real Firestore-backed shell.
  // Preview fixtures below render ONLY for design validation.
  if (!demoMode) return <LiveApp />;

  return (
    <div className="chat-shell flex h-dvh flex-col bg-paper text-ink-900">
      <a href="#conversation" className="sr-only focus:not-sr-only focus:absolute focus:p-2">Skip to conversation</a>

      {/* ── Desktop / tablet shell ─────────────────────────── */}
      <div className="hidden min-h-0 flex-1 md:flex">
        {/* Pulse rail */}
        <nav aria-label="RUSH sections" className="flex w-[68px] shrink-0 flex-col items-center gap-2 border-r border-ink-100 bg-paper py-3">
          <Link href="/" aria-label="RUSH home"><BrandMark compact /></Link>
          <div className="my-1 h-px w-8 bg-ink-100" aria-hidden="true" />
          {railBtn("chats", "Chats", (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></svg>
          ), demoTotalBadge != null && (
            <span className="unread-badge absolute -right-1.5 -top-1.5" aria-label={`${demoTotal} unread messages`}>
              {demoTotalBadge}
            </span>
          ))}
          {railBtn("groups", "Groups", (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          ))}
          {railBtn("spaces", "Spaces", (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" /></svg>
          ))}
          <div className="mt-auto flex flex-col items-center gap-3">
            <Link href="/settings" aria-label="Settings" className="grid h-11 w-11 place-items-center rounded-2xl text-ink-500 hover:bg-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
            </Link>
            <Link href="/profile" aria-label={`Your profile${demoTotalBadge != null ? `, ${demoTotal} unread messages` : ""}`} className="relative inline-flex">
              <Avatar name="You" presence="online" size={40} />
              {demoTotalBadge != null && (
                <span className="unread-badge absolute -bottom-1 -right-1 ring-2 ring-white" aria-hidden="true">
                  {demoTotalBadge}
                </span>
              )}
            </Link>
          </div>
        </nav>

        {/* Conversation river */}
        <div className="flex w-[320px] shrink-0 flex-col border-r border-ink-100 bg-paper">
          <div className="flex items-center justify-between px-4 pb-1 pt-4">
            <h1 className="font-display text-lg font-bold capitalize tracking-tight">{rail}</h1>
            <button className="rounded-xl bg-ink-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink-800">
              + New
            </button>
          </div>
          <p role="status" className="mx-3 mb-1 rounded-xl bg-ink-900 px-3 py-2 text-[11px] leading-relaxed text-ink-100">
            Preview data — connect Firebase to go live.
          </p>
          {rail === "spaces" ? (
            <div className="river-scroll flex-1 overflow-y-auto p-3">
              {SPACES.map((s) => (
                <section key={s.id} className="mb-3 rounded-2xl border border-ink-100 bg-white p-3 shadow-card">
                  <header className="flex items-center justify-between">
                    <h2 className="font-display text-sm font-semibold">{s.name}</h2>
                    {s.unread > 0 && (
                      <span className="rounded-full bg-rush-600 px-2 py-0.5 text-[11px] font-bold text-white">{s.unread}</span>
                    )}
                  </header>
                  <ul className="mt-2 space-y-0.5">
                    {s.channels.map((ch) => (
                      <li key={ch}>
                        <button
                          onClick={() => setActiveId("c-ocn-general")}
                          className="w-full rounded-xl px-2 py-1.5 text-left text-sm text-ink-600 hover:bg-paper"
                        >
                          {ch}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <div className="min-h-0 flex-1">
              <ConversationRiver
                conversations={conversations}
                activeId={activeId}
                onSelect={setActiveId}
                filter={filter}
                onFilter={setFilter}
              />
            </div>
          )}
        </div>

        {/* Conversation pane */}
        <main id="conversation" className="flex min-w-0 flex-1 flex-col bg-paper">
          {active ? (
            <>
              <header className="flex items-center gap-3 border-b border-ink-100 bg-paper/90 px-4 py-3 backdrop-blur md:px-6">
                <Avatar name={active.title} presence={active.presence} size={36} />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display truncate text-base font-semibold">{active.title}</h2>
                  <p className="flex items-center gap-1.5 text-xs text-ink-500">
                    <PresenceDot state={active.presence ?? "offline"} size="sm" />
                    {active.presence === "online" ? "Online now" : active.subtitle}
                  </p>
                </div>
                <button
                  onClick={() => setShowContext((s) => !s)}
                  aria-expanded={showContext}
                  className="rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold hover:border-ink-300"
                >
                  Info
                </button>
              </header>
              <MessageList key={activeId} messages={messages} onRetry={retry} onReply={setReplyTo} />
              <Composer replyTo={replyTo} onClearReply={() => setReplyTo(null)} onSend={async (text) => { send(text); }} attachDisabledReason="Attachments need a connected backend." />
            </>
          ) : (
            <EmptyConversation onStart={() => setRail("chats")} />
          )}
        </main>

        {/* Context rail */}
        {showContext && active && (
          <aside aria-label="Conversation info" className="hidden w-[260px] shrink-0 flex-col border-l border-ink-100 bg-white p-4 xl:flex">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-ink-400">About</h3>
            <div className="mt-3 flex items-center gap-3">
              <Avatar name={active.title} presence={active.presence} size={44} />
              <div>
                <p className="font-display text-sm font-semibold">{active.title}</p>
                <p className="text-xs text-ink-500">{active.subtitle}</p>
              </div>
            </div>
            <h3 className="mt-6 text-[11px] font-semibold uppercase tracking-widest text-ink-400">Members</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {["Maya Chen", "Theo Marsh", "Priya Nair", "You"].map((m) => (
                <li key={m} className="flex items-center gap-2">
                  <Avatar name={m} size={28} />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
            <button onClick={() => setShowContext(false)} className="mt-6 rounded-xl border border-ink-200 px-3 py-2 text-xs font-semibold hover:bg-paper">
              Close panel
            </button>
          </aside>
        )}
      </div>

      {/* ── Mobile view-stack + bottom tabs ────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        {mobileView === "list" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-4 pb-1 pt-4">
              <BrandMark />
              <Link href="/profile" aria-label="Your profile"><Avatar name="You" presence="online" size={36} /></Link>
            </div>
            <div className="min-h-0 flex-1">
              <ConversationRiver
                conversations={conversations}
                activeId={activeId}
                onSelect={(id) => { setActiveId(id); setMobileView("chat"); }}
                filter={filter}
                onFilter={setFilter}
              />
            </div>
          </div>
        ) : active ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="flex items-center gap-2 border-b border-ink-100 px-3 py-2.5">
              <button onClick={() => setMobileView("list")} aria-label="Back to conversations" className="grid h-10 w-10 place-items-center rounded-xl hover:bg-white">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
              </button>
              <Avatar name={active.title} presence={active.presence} size={32} />
              <h2 className="font-display truncate text-base font-semibold">{active.title}</h2>
            </header>
            <MessageList key={activeId} messages={messages} onRetry={retry} onReply={setReplyTo} />
            <Composer replyTo={replyTo} onClearReply={() => setReplyTo(null)} onSend={async (text) => { send(text); }} attachDisabledReason="Attachments need a connected backend." />
          </div>
        ) : null}
        <MobileNav active={rail} unread={demoTotal} onSelect={id => { setRail(id); setMobileView('list'); }} />
      </div>
    </div>
  );
}
