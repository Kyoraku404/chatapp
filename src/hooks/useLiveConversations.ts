"use client";

// Live DM + group conversation lists for the signed-in user.
// - DMs: conversations where participants array-contains uid AND
//   hasMessages == true, ordered by server-authoritative lastMessageAt desc.
//   Empty/pending DMs (hasMessages == false or lastMessageAt == null) are
//   excluded server-side so the recipient never sees a conversation before
//   the first real message. (Composite index in firestore.indexes.json.)
// - Groups: groups where memberIds array-contains uid, newest first.
// - Titles resolve from public profiles (other participant / group name).
// - subtitle is ALWAYS the list preview (lastMessagePreview). The DM header
//   must use username/status/avatarUrl — never subtitle. See LiveApp.
// - Client re-sorts by lastMs desc (numeric millis, nulls last) because the
//   merged DM+group metas Map preserves insertion order and Firestore
//   updates don't reorder existing keys. Never sorts formatted strings.

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { firebaseDb } from "@/lib/firebaseClient";
import { getProfiles } from "@/lib/profiles";
import { subscribeReads, type ReadEntry } from "@/lib/readState";
import { normalizeUnreadCount, totalUnreadCounts } from "@/lib/unread";
import { formatRelative, toMillis } from "@/lib/live-model";
import type { DemoConversation } from "@/lib/demo";

export interface LiveConversations {
  dms: DemoConversation[];
  groups: DemoConversation[];
  loading: boolean;
  error: string | null;
  /** Total exact unread messages across RECENT (DMs + groups). */
  totalUnread: number;
}

interface RawConvo {
  id: string;
  kind: "dm" | "group";
  title: string;
  subtitle: string;
  otherUid?: string;
  username?: string;
  avatarUrl?: string | null;
  status?: string | null;
  lastMs: number | null;
}

// Temporary development diagnostics for the empty-RECENT investigation.
// Enable in the browser console with:
//   localStorage.setItem("rush_debug_sidebar", "1")
// then refresh. Logs: uid, snapshot sizes, per-document discovery fields,
// client-filter drops, and listener errors. Never logs tokens, credentials,
// emails, or message content.
function sidebarDebugEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("rush_debug_sidebar") === "1";
  } catch {
    return false;
  }
}
function sdbg(...args: unknown[]) {
  if (sidebarDebugEnabled()) console.debug("[rush:sidebar]", ...args);
}
function describeValue(v: unknown): string {
  if (v == null) return String(v);
  if (typeof v === "object") {
    const t = v as { toMillis?: unknown; seconds?: unknown };
    if (typeof t.toMillis === "function") {
      try {
        return `Timestamp(${(t as { toMillis(): number }).toMillis()})`;
      } catch {
        return "Timestamp(?)";
      }
    }
    if (typeof t.seconds === "number") return `Timestamp-like(seconds=${t.seconds})`;
    return `object(${Object.keys(v as Record<string, unknown>).join(",")})`;
  }
  if (typeof v === "string") return `string(${v.slice(0, 120)})`;
  return `${typeof v}(${String(v).slice(0, 80)})`;
}

export function useLiveConversations(uid: string | null): LiveConversations {
  const [raw, setRaw] = useState<RawConvo[]>([]);
  const [reads, setReads] = useState<Map<string, ReadEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setRaw([]);
      setLoading(false);
      return;
    }
    const db = firebaseDb();
    if (!db) {
      setError("Backend is not connected.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    let cancelled = false;
    sdbg("subscribe start", { uid });
    const metas = new Map<string, { kind: "dm" | "group"; data: Record<string, unknown> }>();

    const rebuild = async () => {
      const entries = [...metas.entries()];
      const others = entries.flatMap(([, m]) => {
        if (m.kind !== "dm") return [];
        const parts = (m.data.participants as string[] | undefined) ?? [];
        const other = parts.find((p) => p !== uid);
        return other ? [other] : [];
      });
      if (others.length > 0) await getProfiles(others).catch(() => undefined);
      if (cancelled) return;
      const { profileCacheGet } = await import("@/lib/profiles");
      const list: RawConvo[] = [];
      let droppedPending = 0;
      for (const [id, m] of entries) {
        const data = m.data;
        // Defense-in-depth: never surface empty DMs even if the server
        // query shape changes. hasMessages === false means pre-first-message.
        if (m.kind === "dm" && data.hasMessages === false) {
          droppedPending += 1;
          sdbg("client-drop pending (hasMessages===false)", { id });
          continue;
        }
        let title = m.kind === "group" ? String(data.name ?? "Group") : "Direct message";
        let otherUid: string | undefined;
        let username: string | undefined;
        let avatarUrl: string | null | undefined;
        let status: string | null | undefined;
        if (m.kind === "dm") {
          const parts = (data.participants as string[] | undefined) ?? [];
          otherUid = parts.find((p) => p !== uid);
          const p = otherUid ? profileCacheGet(otherUid) : undefined;
          if (p && p.displayName !== "Unknown user") title = p.displayName;
          else if (otherUid) title = `@${p?.username ?? "unknown"}`;
          username = p?.username;
          avatarUrl = p?.avatarUrl ?? null;
          status = p?.status ?? null;
        }
        list.push({
          id,
          kind: m.kind,
          title,
          subtitle: String((data.lastMessagePreview as string | undefined) ?? "No messages yet"),
          otherUid,
          username,
          avatarUrl,
          status,
          lastMs: toMillis(data.lastMessageAt),
        });
      }
      // Explicit numeric sort: most recent activity first, nulls last.
      list.sort((a, b) => (b.lastMs ?? -1) - (a.lastMs ?? -1));
      sdbg("rebuild", {
        snapshotEntries: entries.length,
        droppedPending,
        mapped: list.map((r) => ({ id: r.id, kind: r.kind, lastMs: r.lastMs })),
      });
      setRaw(list);
      setLoading(false);
    };

    const unsubReads = subscribeReads(
      uid,
      (m) => {
        if (!cancelled) setReads(m);
      },
      (e) => {
        if (!cancelled) setError(e.message);
      },
    );

    const watchGroups = () =>
      onSnapshot(
        query(
          collection(db, "groups"),
          where("memberIds", "array-contains", uid),
          orderBy("lastMessageAt", "desc"),
          limit(50),
        ),
        (snap) => {
          if (cancelled) return;
          sdbg("group snapshot", { size: snap.docs.length });
          for (const d of snap.docs) metas.set(d.id, { kind: "group", data: d.data() as Record<string, unknown> });
          const alive = new Set(snap.docs.map((d) => d.id));
          for (const key of [...metas.keys()]) {
            const m = metas.get(key)!;
            if (m.kind === "group" && !alive.has(key)) metas.delete(key);
          }
          void rebuild().catch((e: Error) => {
            if (!cancelled) setError(e.message);
          });
        },
        (e) => {
          if (!cancelled) {
            setError(e.message);
            setLoading(false);
          }
        },
      );

    // DMs exclude empties server-side: hasMessages == true.
    // Legacy docs without the field are backfilled by POST /api/dm/open,
    // POST /api/dm/send, and POST /api/dm/backfill; until then they stay
    // hidden rather than leaking a pre-message conversation to the
    // recipient. Requires the composite index in firestore.indexes.json
    // (participants CONTAINS + hasMessages ASC + lastMessageAt DESC).
    const watchDms = () =>
      onSnapshot(
        query(
          collection(db, "conversations"),
          where("participants", "array-contains", uid),
          where("hasMessages", "==", true),
          orderBy("lastMessageAt", "desc"),
          limit(50),
        ),
        (snap) => {
          if (cancelled) return;
          sdbg("dm snapshot", {
            size: snap.docs.length,
            docs: snap.docs.map((d) => {
              const data = d.data() as Record<string, unknown>;
              return {
                id: d.id,
                participants: data.participants,
                hasMessages: `${typeof data.hasMessages}(${String(data.hasMessages)})`,
                lastMessageAt: describeValue(data.lastMessageAt),
                lastMessagePreview: describeValue(data.lastMessagePreview),
                lastMessageSenderId: describeValue(data.lastMessageSenderId),
              };
            }),
          });
          for (const d of snap.docs) metas.set(d.id, { kind: "dm", data: d.data() as Record<string, unknown> });
          const alive = new Set(snap.docs.map((d) => d.id));
          for (const key of [...metas.keys()]) {
            const m = metas.get(key)!;
            if (m.kind === "dm" && !alive.has(key)) metas.delete(key);
          }
          void rebuild().catch((e: Error) => {
            if (!cancelled) setError(e.message);
          });
        },
        (e) => {
          if (!cancelled) {
            const msg = e instanceof Error ? e.message : String(e);
            const code =
              typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "unknown";
            sdbg("dm listener ERROR", { code, message: msg });
            // A missing composite index kills realtime discovery entirely
            // (empty RECENT, no incoming DMs). Surface the fix, not silence.
            const missingIndex =
              /failed-precondition|requires an index|composite index|index.*building/i.test(msg);
            setError(
              missingIndex
                ? `Conversation index missing or still building — run "firebase deploy --only firestore:indexes" and retry. (${msg})`
                : msg,
            );
            setLoading(false);
          }
        },
      );

    const unsubDm = watchDms();
    const unsubGroups = watchGroups();

    return () => {
      cancelled = true;
      unsubReads();
      unsubDm();
      unsubGroups();
    };
  }, [uid]);

  const { dms, groups, totalUnread } = useMemo(() => {
    const toUi = (r: RawConvo): DemoConversation => {
      // Exact server-maintained counter. Missing entry (pre-counter
      // conversation, or never touched) reads as 0 — never fake unread.
      const unread = normalizeUnreadCount(reads.get(r.id)?.unreadCount);
      return {
        id: r.id,
        kind: r.kind,
        title: r.title,
        subtitle: r.subtitle,
        unread,
        lastAt: formatRelative(r.lastMs),
        ref: { scope: r.kind, id: r.id, otherUid: r.otherUid },
        username: r.username,
        avatarUrl: r.avatarUrl ?? null,
        status: r.status ?? null,
      };
    };
    // raw is already sorted by lastMs desc; keep per-kind order stable.
    const dmList = raw.filter((r) => r.kind === "dm").map(toUi);
    const groupList = raw.filter((r) => r.kind === "group").map(toUi);
    return {
      dms: dmList,
      groups: groupList,
      totalUnread: totalUnreadCounts([...dmList, ...groupList].map((c) => c.unread)),
    };
  }, [raw, reads]);

  return { dms, groups, loading, error, totalUnread };
}
