"use client";

// Live RUSH shell: 100% Firestore-backed, zero fixtures.
// Same Signal Flow visuals as preview mode; every control is wired:
// + New opens real creation flows, lists subscribe live, messages send and
// arrive in realtime, read state is per-user, spaces/channels/invites work.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MobileNav } from '@/components/chat/MobileNav';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import Link from "next/link";
import { Phone, Video, Palette } from 'lucide-react';
import { doc, onSnapshot } from "firebase/firestore";
import { BrandMark } from "@/components/BrandMark";
import { Avatar } from "@/components/Presence";
import { ConversationRiver } from "@/components/chat/ConversationRiver";
import { MessageList } from "@/components/chat/MessageList";
import { VoiceCallPanel } from '@/components/chat/VoiceCallPanel';
import { Composer, type ComposerAttachment } from "@/components/chat/Composer";
import { EmptyConversation, InlineError, RiverSkeleton } from "@/components/chat/States";
import { Modal } from "@/components/Modal";
import { NewConversationModal } from "@/components/NewConversationModal";
import { CreateGroupModal } from "@/components/CreateGroupModal";
import { CreateSpaceModal, JoinSpaceModal, CreateChannelModal } from "@/components/SpaceModals";
import { InviteButton } from "@/components/InviteButton";
import { BlockButton } from "@/components/BlockButton";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useLiveConversations } from "@/hooks/useLiveConversations";
import { useLiveMessages } from "@/hooks/useLiveMessages";
import { useVoiceCall } from '@/hooks/useVoiceCall';
import { useChannels, useSpaceMembers, useSpaces } from "@/hooks/useSpaces";
import { firebaseDb } from "@/lib/firebaseClient";
import { channelMessageCollection, messageCollection } from "@/lib/transport";
import { markConversationRead } from "@/lib/readState";
import { uploadAttachment } from "@/lib/uploads";
import { getProfiles, profileCacheGet, profileCachePrime, type PublicProfile } from "@/lib/profiles";
import { normalizeFilterText } from "@/lib/sidebar";
import { blockDocId } from "@/lib/blocking";
import { canCreateInvite, canManageChannels } from "@/lib/permissions";
import { formatUnreadCount } from "@/lib/unread";
import type { DemoConversation, DemoMessage } from "@/lib/demo";
import type { SpaceRole } from "@/lib/types";

type Rail = "chats" | "groups" | "spaces";
type Sel =
  | { kind: "dm"; id: string; otherUid?: string }
  | { kind: "group"; id: string }
  | { kind: "channel"; spaceId: string; channelId: string };

/** Derive the other participant from a deterministic dm_<a>_<b> id. */
function otherUidFromDmId(conversationId: string, uid: string): string | null {
  const m = /^dm_(.+?)_(.+)$/.exec(conversationId);
  if (!m) return null;
  const [, a, b] = m;
  if (a === uid) return b ?? null;
  if (b === uid) return a ?? null;
  return null;
}
type ModalKind = null | "new-dm" | "new-group" | "space-menu" | "new-space" | "join-space" | "new-channel";

const selKey = (s: Sel | null) =>
  !s ? "" : s.kind === "channel" ? `channel:${s.spaceId}:${s.channelId}` : `${s.kind}:${s.id}`;

export function LiveApp() {
  useMobileViewport();
  const auth = useAuthUser();
  const uid = auth.user?.uid ?? null;
  const [ownProfile, setOwnProfile] = useState<PublicProfile | null>(null);
  useEffect(() => {
    const db = firebaseDb(); if (!uid || !db) return;
    return onSnapshot(doc(db, "users", uid), snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      const next = { uid, displayName: String(data.displayName ?? "You"), username: String(data.username ?? ""), avatarUrl: (data.avatarUrl as string | null | undefined) ?? null, status: typeof data.status === "string" ? data.status : null };
      profileCachePrime(next); setOwnProfile(next);
    });
  }, [uid]);
  const voice = useVoiceCall(uid);
  const [rail, setRail] = useState<Rail>("chats");
  const [sel, setSel] = useState<Sel | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [replyTo, setReplyTo] = useState<DemoMessage | null>(null);
  const [filter, setFilter] = useState("");
  const [showContext, setShowContext] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);

  const convos = useLiveConversations(uid);

  // Sidebar-path migration (NOT the send flow): pre-existing DMs that
  // contain real messages but predate the hasMessages visibility gate are
  // invisible to the hasMessages==true discovery query until published.
  // Run the caller's backfill once per login so a refresh alone makes the
  // working DM appear in RECENT — no search, no +New, no manual open.
  // Fire-and-forget; listener errors/success still surface via convos.
  const backfilled = useRef(false);
  useEffect(() => {
    if (!uid || backfilled.current) return;
    backfilled.current = true;
    fetch("/api/dm/backfill", { method: "POST" })
      .then((r) => r.json().catch(() => ({})))
      .then((b) => {
        try {
          if (typeof localStorage !== "undefined" && localStorage.getItem("rush_debug_sidebar") === "1")
            console.debug("[rush:sidebar] backfill", b);
        } catch {
          // diagnostics only
        }
      })
      .catch(() => undefined);
  }, [uid]);

  const { spaces, loading: spacesLoading, error: spacesError } = useSpaces(uid);
  const { channels } = useChannels(rail === "spaces" || sel?.kind === "channel" ? (activeSpaceId ?? (sel?.kind === "channel" ? sel.spaceId : null)) : null);

  const spaceId = sel?.kind === "channel" ? sel.spaceId : activeSpaceId;
  const { members } = useSpaceMembers(spaceId);
  const myRole: SpaceRole | null =
    spaces.find((s) => s.id === spaceId)?.role ?? null;

  // Deep links: /app?dm=<id>, /app?space=<id>&channel=<id> (from invites,
  // public profiles, creation flows).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const dm = p.get("dm");
    const space = p.get("space");
    const channel = p.get("channel");
    if (dm) {
      setRail("chats");
      setSel({ kind: "dm", id: dm });
      setMobileView("chat");
    } else if (space) {
      setRail("spaces");
      setActiveSpaceId(space);
      if (channel) {
        setSel({ kind: "channel", spaceId: space, channelId: channel });
        setMobileView("chat");
      }
    }
  }, []);

  // Message collection for the current selection.
  const getCol = useCallback(() => {
    if (!sel) return null;
    try {
      if (sel.kind === "dm") return messageCollection("dm", sel.id);
      if (sel.kind === "group") return messageCollection("group", sel.id);
      return channelMessageCollection(sel.spaceId, sel.channelId);
    } catch {
      return null;
    }
  }, [sel]);
  const readKey = useMemo(() => {
    if (!sel) return "";
    return sel.kind === "channel" ? `${sel.spaceId}_${sel.channelId}` : sel.id;
  }, [sel]);
  const recipient = sel?.kind === 'dm' ? (convos.dms.find(c => c.id === sel.id)?.ref?.otherUid ?? sel.otherUid ?? (uid ? otherUidFromDmId(sel.id, uid) : null)) : null;
  const live = useLiveMessages(uid, getCol, selKey(sel), recipient);
  const acknowledge = useCallback(async (ids: string[], state: 'delivered' | 'read') => {
    if (sel?.kind !== 'dm') return;
    for (let i = 0; i < ids.length; i += 25) {
      const res = await fetch('/api/dm/receipts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: sel.id, ids: ids.slice(i, i + 25), state }) });
      if (!res.ok) throw new Error('Receipt acknowledgement failed.');
    }
  }, [sel]);
  useEffect(() => {
    const ids = live.messages.filter(m => !m.own && m.status === 'sent').map(m => m.id);
    if (ids.length) void acknowledge(ids, 'delivered').catch(() => undefined);
  }, [live.messages, acknowledge]);
  const lastMarked = useRef('');
  const receiptRequests = useRef(new Set<string>());
  const onSeen = useCallback((ids: string[]) => {
    if (!uid || !sel) return;
    const unreadIds = live.messages.filter(m => ids.includes(m.id) && !m.own && m.status !== 'read' && !receiptRequests.current.has(m.id)).map(m => m.id);
    if (sel.kind === 'dm' && unreadIds.length) {
      unreadIds.forEach(id => receiptRequests.current.add(id));
      void acknowledge(unreadIds, 'read').catch(() => undefined).finally(() => unreadIds.forEach(id => receiptRequests.current.delete(id)));
    }
    const latest = live.messages.filter(m => !m.pending && !m.failed).at(-1);
    const key = uid + ':' + readKey + ':' + latest?.id;
    if (latest && ids.includes(latest.id) && lastMarked.current !== key) {
      lastMarked.current = key;
      void markConversationRead(uid, readKey, latest.id).catch(() => { if (lastMarked.current === key) lastMarked.current = ''; });
    }
  }, [uid, sel, acknowledge, live.messages, readKey]);

  // Group member profiles for header/context.
  const [groupMembers, setGroupMembers] = useState<{ uid: string; name: string; username: string }[]>([]);
  useEffect(() => {
    if (groupMembers.length === 0) return;
    const refresh = window.setInterval(() => {
      void getProfiles(groupMembers.map(m => m.uid)).then(profiles => {
        setGroupMembers(previous => previous.map(member => {
          const profile = profiles.get(member.uid);
          return profile ? { ...member, name: profile.displayName, username: profile.username } : member;
        }));
      }).catch(() => undefined);
    }, 20_000);
    return () => window.clearInterval(refresh);
  }, [groupMembers]);
  useEffect(() => {
    if (sel?.kind !== "group") {
      setGroupMembers([]);
      return;
    }
    const db = firebaseDb();
    if (!db) return;
    const unsub = onSnapshot(
      doc(db, "groups", sel.id),
      (snap) => {
        const ids = ((snap.data()?.memberIds as string[] | undefined) ?? []).slice(0, 50);
        void getProfiles(ids)
          .then((m) => setGroupMembers(ids.map((id) => ({ uid: id, name: m.get(id)?.displayName ?? "Unknown", username: m.get(id)?.username ?? "" }))))
          .catch(() => undefined);
      },
      () => undefined,
    );
    return unsub;
  }, [sel]);

  // Own block edge for the open DM (reverse edges are private to the blocker).
  const [blocked, setBlocked] = useState(false);
  const activeDmEarly = sel?.kind === "dm" ? (convos.dms.find((c) => c.id === sel.id) ?? null) : null;
  const dmOther = sel?.kind === "dm"
    ? (activeDmEarly?.ref?.otherUid ?? sel.otherUid ?? (uid ? otherUidFromDmId(sel.id, uid) : null))
    : null;
  useEffect(() => {
    if (!uid || !dmOther) {
      setBlocked(false);
      return;
    }
    const db = firebaseDb();
    if (!db) return;
    const unsub = onSnapshot(
      doc(db, "blocks", blockDocId(uid, dmOther)),
      (snap) => setBlocked(snap.exists()),
      () => undefined,
    );
    return unsub;
  }, [uid, dmOther]);

  async function handleSend(text: string, attachment: ComposerAttachment | null) {
    if (!uid || !sel) throw new Error("Not connected.");
    await live.send(text, { replyTo, attachment });
  }

  async function handleUpload(file: File, onProgress?: (percent: number) => void): Promise<ComposerAttachment> {
    if (!sel) throw new Error("Open a conversation first.");
    const scope = sel.kind === "dm" ? "dm" : sel.kind === "group" ? "group" : "space";
    const scopeId = sel.kind === "channel" ? sel.spaceId : sel.id;
    return uploadAttachment(scope, scopeId, file, onProgress);
  }

  function openNew() {
    if (rail === "chats") setModal("new-dm");
    else if (rail === "groups") setModal("new-group");
    else setModal("space-menu");
  }

  function openConversation(id: string, other?: { uid: string; displayName: string; username: string; avatarUrl?: string | null; status?: string | null }) {
    setRail("chats");
    setSel({ kind: "dm", id, otherUid: other?.uid });
    if (other) {
      void import("@/lib/profiles").then(({ profileCachePrime }) => {
        profileCachePrime({
          uid: other.uid,
          displayName: other.displayName,
          username: other.username,
          avatarUrl: other.avatarUrl ?? null,
          status: other.status ?? null,
        });
      }).catch(() => undefined);
    }
    setMobileView("chat");
    setModal(null);
  }

  // normalizeFilterText also strips invisible format chars (zero-width
  // space etc.) that render as an empty box but match nothing.
  const q = normalizeFilterText(filter);
  const visibleDms = q
    ? convos.dms.filter((c) => c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q))
    : convos.dms;
  const visibleGroups = q
    ? convos.groups.filter((c) => c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q))
    : convos.groups;

  // Temporary render-pipeline diagnostics (same flag as [rush:sidebar]):
  // proves exactly which stage turns mapped conversations into rows.
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("rush_debug_sidebar") === "1") {
      console.debug("[rush:render]", {
        mappedDmCount: convos.dms.length,
        mappedGroupCount: convos.groups.length,
        rail,
        searchLength: filter.length,
        searchCodes: [...filter].map((ch) => ch.codePointAt(0)),
        normalizedQuery: q,
        afterSearchDmCount: visibleDms.length,
        afterSearchGroupCount: visibleGroups.length,
        finalRowsCount: (rail === "chats" ? visibleDms : visibleGroups).length,
        loading: convos.loading,
        loadError: convos.error,
      });
    }
  } catch {
    // diagnostics only
  }

  const activeDm = activeDmEarly;
  const activeGroup = sel?.kind === "group" ? (convos.groups.find((c) => c.id === sel.id) ?? null) : null;
  const activeSpace = spaces.find((s) => s.id === (sel?.kind === "channel" ? sel.spaceId : activeSpaceId)) ?? null;
  const activeChannel = sel?.kind === "channel" ? (channels.find((c) => c.id === sel.channelId) ?? null) : null;

  // Pending-DM identity: the conversation is filtered from the list until
  // the first message, but the header must still show the USER. Resolve
  // from the primed profile cache (NewConversationModal primes on open).
  const pendingProfile = sel?.kind === "dm" && !activeDm && dmOther ? profileCacheGet(dmOther) : undefined;
  useEffect(() => {
    if (sel?.kind === "dm" && !activeDm && dmOther && !profileCacheGet(dmOther)) {
      void getProfiles([dmOther]).catch(() => undefined);
    }
  }, [sel, activeDm, dmOther]);

  // Header identity (never message data):
  // - DM: other user's displayName + @username [+ status]. Preview text
  //   (lastMessagePreview) belongs ONLY in the sidebar list (subtitle).
  // - Group/channel: existing titles/topics (out of scope for this fix).
  const dmUsername = activeDm?.username ?? pendingProfile?.username;
  const dmStatus = activeDm?.status ?? pendingProfile?.status;
  const headerTitle =
    activeDm?.title ?? pendingProfile?.displayName ?? activeGroup?.title ?? (activeChannel ? `# ${activeChannel.name}` : activeSpace?.name ?? "Conversation");
  const headerSub =
    sel?.kind === "dm"
      ? (dmUsername ? `@${dmUsername}${dmStatus ? ` · ${dmStatus}` : ""}` : (dmStatus ?? "Direct message"))
      : (activeGroup?.subtitle ?? (activeChannel ? activeChannel.topic || activeSpace?.description || "" : ""));
  const headerAvatar =
    sel?.kind === "dm" ? (activeDm?.avatarUrl ?? pendingProfile?.avatarUrl ?? null) : null;

  const railBtn = (id: Rail, label: string, icon: React.ReactNode, badge?: React.ReactNode) => (
    <button
      onClick={() => {
        setRail(id);
        setSel(null);
        setMobileView("list");
      }}
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

  // Global unread: exact total across RECENT (DMs + groups), realtime via
  // the reads listener. 1–9 exact, 10+ as "9+", hidden at 0.
  const totalBadge = formatUnreadCount(convos.totalUnread);
  const chatsBadge = totalBadge != null && (
    <span className="unread-badge absolute -right-1.5 -top-1.5" aria-label={`${convos.totalUnread} unread messages`}>
      {totalBadge}
    </span>
  );
  const avatarBadge = totalBadge != null && (
    <span className="unread-badge absolute -bottom-1 -right-1 ring-2 ring-white" aria-hidden="true">
      {totalBadge}
    </span>
  );

  if (auth.status === "loading") {
    return (
      <div className="grid h-dvh place-items-center bg-paper">
        <RiverSkeleton />
      </div>
    );
  }

  if (auth.status === "guest" || !uid) {
    return (
      <div className="grid h-dvh place-items-center bg-paper px-4">
        <div className="max-w-xs text-center">
          <BrandMark />
          <h1 className="font-display mt-4 text-xl font-bold">You&apos;re signed out</h1>
          <p className="mt-1 text-sm text-ink-500">Log in to load your conversations.</p>
          <Link href="/login" className="mt-4 inline-block rounded-2xl bg-rush-600 px-5 py-2.5 text-sm font-semibold text-white">
            Log in
          </Link>
        </div>
      </div>
    );
  }

  const conversationPane = sel ? (
    <>
      <header className="flex items-center gap-3 border-b border-ink-100 bg-paper/90 px-4 py-3 backdrop-blur md:px-6">
        {sel.kind === "dm" && dmUsername ? <Link href={`/u/${dmUsername}?dm=${encodeURIComponent(sel.id)}`} aria-label={`View ${headerTitle}'s profile`}><Avatar name={headerTitle} size={36} src={headerAvatar} /></Link> : <Avatar name={headerTitle} size={36} src={headerAvatar} />}
        <div className="min-w-0 flex-1">
          <h2 className="font-display truncate text-base font-semibold">{sel.kind === "dm" && dmUsername ? <Link href={`/u/${dmUsername}?dm=${encodeURIComponent(sel.id)}`} className="hover:underline">{headerTitle}</Link> : headerTitle}</h2>
          <p className="truncate text-xs text-ink-500">{headerSub || "Direct message"}</p>
        </div>
        {sel.kind === 'dm' && dmOther && <button onClick={() => void voice.start(sel.id, dmOther)} disabled={blocked || Boolean(voice.call) || voice.phase !== 'idle'} aria-label={`Voice call ${headerTitle}`} title="Voice call" className="grid h-9 w-9 place-items-center rounded-xl border border-ink-200 bg-white text-ink-600 hover:border-ink-300 disabled:opacity-40"><Phone size={17} strokeWidth={1.8} /></button>}
        {sel.kind === 'dm' && dmOther && <button onClick={() => void voice.start(sel.id, dmOther, 'video')} disabled={blocked || Boolean(voice.call) || voice.phase !== 'idle'} aria-label={`Video call ${headerTitle}`} title="Video call" className="grid h-9 w-9 place-items-center rounded-xl border border-ink-200 bg-white text-ink-600 hover:border-ink-300 disabled:opacity-40"><Video size={17} strokeWidth={1.8} /></button>}
        <button
          onClick={() => setShowContext((s) => !s)}
          aria-expanded={showContext}
          className="rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold hover:border-ink-300"
        >
          Info
        </button>
      </header>
      <MessageList
        key={selKey(sel)}
        onSeen={onSeen}
        messages={live.messages}
        loading={live.loading}
        error={live.error}
        hasMore={live.hasMore}
        loadingMore={live.loadingMore}
        onLoadMore={live.loadMore}
        onRetry={(id) => void live.retry(id).catch(() => undefined)}
        onReply={setReplyTo}
        onEdit={(id, content) => live.editMessage(id, content)}
        onDelete={(id) => live.deleteMessage(id)}
      />
      <Composer
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        onSend={handleSend}
        onUploadFile={handleUpload}
      />
    </>
  ) : (
    <EmptyConversation onStart={openNew} />
  );

  const riverContent =
    rail === "spaces" ? (
      <div className="river-scroll flex-1 overflow-y-auto p-3">
        {spacesError && (
          <div className="mb-2">
            <InlineError message={spacesError} />
          </div>
        )}
        {spacesLoading && <RiverSkeleton />}
        {!spacesLoading && spaces.length === 0 && !spacesError && (
          <div className="p-6 text-center text-sm text-ink-500">
            <p className="font-semibold text-ink-900">No spaces yet.</p>
            <p className="mt-1">Create one or join with an invite link.</p>
          </div>
        )}
        {spaces.map((s) => {
          const open = (activeSpaceId ?? (sel?.kind === "channel" ? sel.spaceId : null)) === s.id;
          return (
            <section key={s.id} className="mb-3 rounded-2xl border border-ink-100 bg-white p-3 shadow-card">
              <button
                onClick={() => {
                  setActiveSpaceId(s.id);
                  setShowContext(false);
                }}
                aria-expanded={open}
                className="flex w-full items-center justify-between text-left"
              >
                <span>
                  <span className="font-display block text-sm font-semibold">{s.name}</span>
                  <span className="block text-[11px] text-ink-400">
                    {s.visibility === "PUBLIC" ? "Public space" : "Private space"} · {s.role.toLowerCase()}
                  </span>
                </span>
              </button>
              {open && (
                <SpaceChannels
                  spaceId={s.id}
                  activeChannelId={sel?.kind === "channel" && sel.spaceId === s.id ? sel.channelId : null}
                  onSelect={(channelId) => {
                    setSel({ kind: "channel", spaceId: s.id, channelId });
                    setMobileView("chat");
                  }}
                />
              )}
            </section>
          );
        })}
      </div>
    ) : (
      <div className="min-h-0 flex-1">
        <ConversationRiver
          conversations={(rail === "chats" ? visibleDms : visibleGroups) as DemoConversation[]}
          activeId={sel && sel.kind !== "channel" ? sel.id : ""}
          onSelect={(id) => {
            setSel({ kind: rail === "chats" ? "dm" : "group", id });
            setMobileView("chat");
          }}
          filter={filter}
          onFilter={setFilter}
          loading={convos.loading}
          loadError={convos.error}
        />
        {(convos.loading) && <RiverSkeleton />}
        {convos.error && (
          <div className="px-3 pb-2">
            <InlineError message={convos.error} />
          </div>
        )}
      </div>
    );

  return (
    <div className="chat-shell flex h-dvh flex-col bg-paper text-ink-900">
      <a href="#conversation" className="sr-only focus:not-sr-only focus:absolute focus:p-2">Skip to conversation</a>

      {/* ── Desktop / tablet shell ─────────────────────────── */}
      <div className="hidden min-h-0 flex-1 md:flex">
        <nav aria-label="RUSH sections" className="flex w-[68px] shrink-0 flex-col items-center gap-2 border-r border-ink-100 bg-paper py-3">
          <Link href="/" aria-label="RUSH home"><BrandMark compact /></Link>
          <div className="my-1 h-px w-8 bg-ink-100" aria-hidden="true" />
          {railBtn("chats", "Chats", (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></svg>
          ), chatsBadge)}
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
            <Link href="/profile" aria-label={`Your profile${totalBadge != null ? `, ${convos.totalUnread} unread messages` : ""}`} className="relative inline-flex">
              <Avatar name={ownProfile?.displayName ?? "You"} size={40} src={ownProfile?.avatarUrl} />
              {avatarBadge}
            </Link>
          </div>
        </nav>

        <div className="flex w-[320px] shrink-0 flex-col border-r border-ink-100 bg-paper">
          <div className="flex items-center justify-between px-4 pb-1 pt-4">
            <h1 className="font-display text-lg font-bold capitalize tracking-tight">{rail}</h1>
            <button
              onClick={openNew}
              className="rounded-xl bg-ink-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink-800"
            >
              + New
            </button>
          </div>
          {riverContent}
        </div>

        <main id="conversation" className="flex min-w-0 flex-1 flex-col bg-paper">
          {conversationPane}
        </main>

        {showContext && sel && (
          <ContextPanel
            sel={sel}
            uid={uid}
            title={headerTitle}
            subtitle={headerSub}
            avatarSrc={headerAvatar}
            dmOther={dmOther}
            blocked={blocked}
            onBlocked={setBlocked}
            groupMembers={groupMembers}
            space={activeSpace}
            members={members}
            myRole={myRole}
            onNewChannel={() => setModal("new-channel")}
            onClose={() => setShowContext(false)}
          />
        )}
      </div>

      {/* ── Mobile view-stack + bottom tabs ────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        {mobileView === "list" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-4 pb-1 pt-4">
              <BrandMark />
              <div className="flex items-center gap-2">
                <button
                  onClick={openNew}
                  aria-label={`New ${rail === "chats" ? "conversation" : rail === "groups" ? "group" : "space"}`}
                  className="min-h-11 rounded-xl bg-ink-900 px-4 py-2 text-xs font-semibold text-white"
                >
                  + New
                </button>
                <Link href="/profile" aria-label={`Your profile${totalBadge != null ? `, ${convos.totalUnread} unread messages` : ""}`} className="relative grid h-11 w-11 place-items-center">
                  <Avatar name={ownProfile?.displayName ?? "You"} size={36} src={ownProfile?.avatarUrl} />
                  {avatarBadge}
                </Link>
              </div>
            </div>
            <div className="mobile-list-heading">
              <h1>{rail}</h1>
              <Link href="/settings#appearance" aria-label="Choose a theme"><Palette size={20} strokeWidth={1.7} /></Link>
            </div>
            <div className="min-h-0 flex-1">{riverContent}</div>
          </div>
        ) : sel ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="flex items-center gap-2 border-b border-ink-100 px-3 py-2.5">
              <button onClick={() => setMobileView("list")} aria-label="Back to conversations" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl hover:bg-white">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
              </button>
              {sel.kind === "dm" && dmUsername ? <Link href={`/u/${dmUsername}?dm=${encodeURIComponent(sel.id)}`} aria-label={`View ${headerTitle}'s profile`}><Avatar name={headerTitle} size={32} src={headerAvatar} /></Link> : <Avatar name={headerTitle} size={32} src={headerAvatar} />}
              <div className="min-w-0 flex-1">
                <h2 className="font-display truncate text-base font-semibold">{sel.kind === "dm" && dmUsername ? <Link href={`/u/${dmUsername}?dm=${encodeURIComponent(sel.id)}`} className="hover:underline">{headerTitle}</Link> : headerTitle}</h2>
                <p className="truncate text-xs text-ink-500">{headerSub || "Direct message"}</p>
              </div>
              {sel.kind === 'dm' && dmOther && <button onClick={() => void voice.start(sel.id, dmOther)} disabled={blocked || Boolean(voice.call) || voice.phase !== 'idle'} aria-label={`Voice call ${headerTitle}`} title="Voice call" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-600 disabled:opacity-40"><Phone size={19} strokeWidth={1.8} /></button>}
              {sel.kind === 'dm' && dmOther && <button onClick={() => void voice.start(sel.id, dmOther, 'video')} disabled={blocked || Boolean(voice.call) || voice.phase !== 'idle'} aria-label={`Video call ${headerTitle}`} title="Video call" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-600 disabled:opacity-40"><Video size={19} strokeWidth={1.8} /></button>}
            </header>
            <MessageList
        key={selKey(sel)}
        onSeen={onSeen}
              messages={live.messages}
              loading={live.loading}
              error={live.error}
              hasMore={live.hasMore}
              loadingMore={live.loadingMore}
              onLoadMore={live.loadMore}
              onRetry={(id) => void live.retry(id).catch(() => undefined)}
              onReply={setReplyTo}
              onEdit={(id, content) => live.editMessage(id, content)}
              onDelete={(id) => live.deleteMessage(id)}
            />
            <Composer replyTo={replyTo} onClearReply={() => setReplyTo(null)} onSend={handleSend} onUploadFile={handleUpload} />
          </div>
        ) : null}
        {mobileView === 'list' && <MobileNav active={rail} unread={convos.totalUnread} onSelect={id => { setRail(id); setSel(null); setMobileView('list'); }} />}
      </div>

      <VoiceCallPanel voice={voice} uid={uid} />

      {/* ── Modals ─────────────────────────────────────────── */}
      {modal === "new-dm" && (
        <NewConversationModal uid={uid} onClose={() => setModal(null)} onOpened={openConversation} />
      )}
      {modal === "new-group" && (
        <CreateGroupModal
          uid={uid}
          onClose={() => setModal(null)}
          onCreated={(id) => {
            setModal(null);
            setRail("groups");
            setSel({ kind: "group", id });
            setMobileView("chat");
          }}
        />
      )}
      {modal === "space-menu" && (
        <Modal title="Spaces" subtitle="Create a community or join with an invite." onClose={() => setModal(null)}>
          <div className="space-y-2">
            <button
              onClick={() => setModal("new-space")}
              className="w-full rounded-2xl bg-rush-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rush-700"
            >
              Create a space
            </button>
            <button
              onClick={() => setModal("join-space")}
              className="w-full rounded-2xl border border-ink-200 px-4 py-2.5 text-sm font-semibold hover:bg-paper"
            >
              Join with invite link
            </button>
          </div>
        </Modal>
      )}
      {modal === "new-space" && (
        <CreateSpaceModal
          onClose={() => setModal(null)}
          onCreated={(id) => {
            setModal(null);
            setRail("spaces");
            setActiveSpaceId(id);
            window.dispatchEvent(new Event("rush:spaces-changed"));
          }}
        />
      )}
      {modal === "join-space" && (
        <JoinSpaceModal
          onClose={() => setModal(null)}
          onJoined={(id) => {
            setModal(null);
            setRail("spaces");
            setActiveSpaceId(id);
            window.dispatchEvent(new Event("rush:spaces-changed"));
          }}
        />
      )}
      {modal === "new-channel" && spaceId && (
        <CreateChannelModal
          spaceId={spaceId}
          onClose={() => setModal(null)}
          onCreated={(channelId) => {
            setModal(null);
            setSel({ kind: "channel", spaceId, channelId });
          }}
        />
      )}
    </div>
  );
}

function SpaceChannels({
  spaceId,
  activeChannelId,
  onSelect,
}: {
  spaceId: string;
  activeChannelId: string | null;
  onSelect: (channelId: string) => void;
}) {
  const { channels, loading } = useChannels(spaceId);
  if (loading) return <p className="px-2 py-2 text-xs text-ink-400">Loading channels…</p>;
  if (channels.length === 0) return <p className="px-2 py-2 text-xs text-ink-400">No channels yet.</p>;
  return (
    <ul className="mt-2 space-y-0.5">
      {channels.map((ch) => (
        <li key={ch.id}>
          <button
            onClick={() => onSelect(ch.id)}
            aria-current={activeChannelId === ch.id || undefined}
            className={`w-full rounded-xl px-2 py-1.5 text-left text-sm ${
              activeChannelId === ch.id ? "bg-ink-900 font-semibold text-white" : "text-ink-600 hover:bg-paper"
            }`}
          >
            # {ch.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ContextPanel({
  sel,
  uid,
  title,
  subtitle,
  avatarSrc,
  dmOther,
  blocked,
  onBlocked,
  groupMembers,
  space,
  members,
  myRole,
  onNewChannel,
  onClose,
}: {
  sel: Sel;
  uid: string;
  title: string;
  subtitle: string;
  avatarSrc?: string | null;
  dmOther: string | null;
  blocked: boolean;
  onBlocked: (b: boolean) => void;
  groupMembers: { uid: string; name: string; username: string }[];
  space: { id: string; name: string; description: string } | null;
  members: { uid: string; displayName: string; username: string; role: SpaceRole }[];
  myRole: SpaceRole | null;
  onNewChannel: () => void;
  onClose: () => void;
}) {
  return (
    <aside aria-label="Conversation info" className="hidden w-[260px] shrink-0 flex-col overflow-y-auto border-l border-ink-100 bg-white p-4 xl:flex">
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-ink-400">About</h3>
      <div className="mt-3 flex items-center gap-3">
        <Avatar name={title} size={44} src={avatarSrc ?? null} />
        <div className="min-w-0">
          <p className="font-display truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-ink-500">{subtitle || "Direct message"}</p>
        </div>
      </div>

      {sel.kind === "dm" && dmOther && (
        <div className="mt-4">
          {blocked && (
            <p role="status" className="mb-2 rounded-xl bg-rush-50 px-3 py-2 text-xs text-rush-700">
              You blocked this user. Unblock to message again.
            </p>
          )}
          <BlockButton uid={uid} otherUid={dmOther} blocked={blocked} onChanged={onBlocked} />
        </div>
      )}

      {sel.kind === "group" && (
        <>
          <h3 className="mt-6 text-[11px] font-semibold uppercase tracking-widest text-ink-400">
            Members ({groupMembers.length})
          </h3>
          <ul className="mt-2 space-y-2 text-sm">
            {groupMembers.map((m) => (
              <li key={m.uid} className="flex items-center gap-2">
                <Avatar name={m.name} size={28} />
                {m.username ? <Link href={`/u/${m.username}`} className="truncate hover:underline">{m.name}{m.uid === uid ? " (you)" : ""}</Link> : <span className="truncate">{m.name}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {sel.kind === "channel" && space && (
        <>
          <h3 className="mt-6 text-[11px] font-semibold uppercase tracking-widest text-ink-400">
            Members ({members.length})
          </h3>
          <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-sm">
            {members.map((m) => (
              <li key={m.uid} className="flex items-center gap-2">
                <Avatar name={m.displayName} size={28} />
                <Link href={`/u/${m.username}`} className="min-w-0 flex-1 truncate hover:underline">{m.displayName}{m.uid === uid ? " (you)" : ""}</Link>
                <span className="text-[10px] font-semibold uppercase text-ink-400">{m.role}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-2">
            {myRole && canCreateInvite(myRole) && <InviteButton spaceId={space.id} />}
            {myRole && canManageChannels(myRole) && (
              <button
                onClick={onNewChannel}
                className="w-full rounded-xl border border-ink-200 px-3 py-2 text-xs font-semibold hover:bg-paper"
              >
                + New channel
              </button>
            )}
          </div>
        </>
      )}

      <button onClick={onClose} className="mt-6 rounded-xl border border-ink-200 px-3 py-2 text-xs font-semibold hover:bg-paper">
        Close panel
      </button>
    </aside>
  );
}
