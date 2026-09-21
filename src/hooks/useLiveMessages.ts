"use client";

// Live message subscription for one conversation/channel.
// - Subscribes to the newest PAGE_SIZE messages (orderBy createdAt desc);
//   "Load older" pages backwards with startAfter — history is never
//   subscribed wholesale.
// - Display order is ascending; optimistic rows sit at the end until the
//   server echo (matched by doc id) replaces them — never duplicates.
// - Send failures mark the optimistic row failed with retry; nothing is
//   ever shown as delivered without backend confirmation.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  doc,
  type CollectionReference,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { messageStatus, reconcileMessages } from "@/lib/message-lifecycle";
import {
  loadOlderMessages,
  sendMessage,
  sendDmMessage,
  subscribeMessages,
  type OutgoingMessage,
} from "@/lib/transport";
import { getProfiles } from "@/lib/profiles";
import { formatTime, toMillis } from "@/lib/live-model";
import type { DemoMessage } from "@/lib/demo";

export interface LiveMessages {
  messages: DemoMessage[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  send: (text: string, opts?: { replyTo?: DemoMessage | null; attachment?: OutgoingMessage["attachment"] & { url: string } | null }) => Promise<void>;
  retry: (tempId: string) => Promise<void>;
  editMessage: (id: string, content: string) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
}

interface Pending {
  tempId: string;
  createdAtMs: number;
  scope: string;
  confirmedId: string | null;
  failed: boolean;
  text: string;
  replyTo: DemoMessage | null;
  attachment: (OutgoingMessage["attachment"] & { url: string }) | null;
}

function docToUi(
  d: QueryDocumentSnapshot<DocumentData>,
  uid: string,
  names: Map<string, { displayName: string; avatarUrl?: string | null }>,
): DemoMessage {
  const data = d.data();
  const senderId = String(data.senderId ?? "");
  const deleted = data.deletedAt != null;
  const reply = (data.replyTo as { messageId?: string; senderId?: string; preview?: string } | null) ?? null;
  const attachment = (data.attachment as { url?: string; contentType?: string } | null) ?? null;
  const ms = toMillis(data.createdAt);
  const senderName = senderId === uid ? "You" : (names.get(senderId)?.displayName ?? "Unknown user");
  const replySenderId = String(reply?.senderId ?? "");
  return {
    id: d.id,
    createdAtMs: ms ?? 0,
    status: messageStatus(d.metadata.hasPendingWrites, false, Boolean(data.deliveredAt), Boolean(data.readAt)),
    pending: d.metadata.hasPendingWrites,
    sender: senderName,
    senderId,
    senderAvatarUrl: senderId === uid ? null : (names.get(senderId)?.avatarUrl ?? null),
    own: senderId === uid,
    content: deleted ? "" : String(data.content ?? ""),
    at: formatTime(ms),
    replyTo: reply ? { sender: names.get(replySenderId)?.displayName ?? "Someone", preview: String(reply.preview ?? "") } : undefined,
    edited: data.editedAt != null,
    deleted,
    attachmentUrl: attachment?.url ?? null,
    attachmentType: attachment?.contentType ?? null,
  };
}

export function useLiveMessages(
  uid: string | null,
  getCol: () => CollectionReference<DocumentData> | null,
  convKey: string,
  dmOther?: string | null,
): LiveMessages {
  const [docs, setDocs] = useState<QueryDocumentSnapshot<DocumentData>[]>([]);
  const [docsScope, setDocsScope] = useState('');
  const [names, setNames] = useState<Map<string, { displayName: string; avatarUrl?: string | null }>>(new Map());
  const [pendings, setPendings] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const inFlight = useRef(new Set<string>());
  const groupTouched = useRef(new Set<string>());
  const animated = useRef(new Set<string>());
  const oldest = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const currentScope = useRef('');
  currentScope.current = uid + ':' + convKey;

  useEffect(() => {
    setDocs([]);
    setDocsScope(uid + ':' + convKey);
    animated.current = new Set();
    setHasMore(false);
    setLoadingMore(false);
    oldest.current = null;
    if (!uid) {
      setLoading(false);
      return;
    }
    const col = getCol();
    if (!col) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    let cancelled = false;
    const unsub = subscribeMessages(
      col,
      (page, direction) => {
        if (cancelled) return;
        setDocs(prev => {
          const known = new Set(prev.map(d => d.id));
          if (direction === 'live') for (const d of page) if (!known.has(d.id)) animated.current.add(d.id);
          const merged = new Map(prev.map(d => [d.id, d]));
          for (const d of page) merged.set(d.id, d);
          return [...merged.values()];
        });
        if (!oldest.current) {
          oldest.current = page[page.length - 1] ?? null;
          setHasMore(page.length >= 25);
        }
        setLoading(false);
        const senders = [...new Set(page.map((d) => String((d.data().senderId as string | undefined) ?? "")))].filter(
          (s) => s && s !== uid,
        );
        const replySenders = [
          ...new Set(
            page.map((d) => String(((d.data().replyTo as { senderId?: string } | null)?.senderId ?? ""))),
          ),
        ].filter((s) => s && s !== uid);
        void getProfiles([...new Set([...senders, ...replySenders])])
          .then((m) => {
            if (cancelled) return;
            const nm = new Map<string, { displayName: string; avatarUrl?: string | null }>();
            for (const [k, v] of m) nm.set(k, { displayName: v.displayName, avatarUrl: v.avatarUrl ?? null });
            setNames(nm);
          })
          .catch(() => undefined);
      },
      (e) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
      unsub();
    };
    // getCol identity changes per conversation; convKey pins the subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, convKey]);

  // Drop optimistic rows once their server echo arrives.
  useEffect(() => {
    if (pendings.length === 0) return;
    const ids = new Set(docs.filter(d => !d.metadata.hasPendingWrites).map((d) => d.id));
    setPendings((prev) => prev.filter((p) => !ids.has(p.tempId)));
  }, [docs, pendings.length]);

  const loadMore = useCallback(() => {
    const col = getCol();
    const tail = oldest.current;
    if (!col || !tail || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    const scope = currentScope.current;
    loadOlderMessages(col, tail)
      .then((older) => {
        if (scope !== currentScope.current) return;
        oldest.current = older[older.length - 1] ?? tail;
        setHasMore(older.length >= 25);
        setDocs(prev => [...new Map([...prev, ...older].map(d => [d.id, d])).values()]);
      })
      .catch((e: Error) => { if (scope === currentScope.current) setError(e.message); })
      .finally(() => { if (scope === currentScope.current) setLoadingMore(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convKey, loadingMore]);

  const dispatch = useCallback(async (p: Pending) => {
    const col = getCol();
    if (!col || !uid) throw new Error('Not connected.');
    if (inFlight.current.has(p.tempId)) return;
    inFlight.current.add(p.tempId);
    setPendings(prev => prev.map(x => x.tempId === p.tempId ? { ...x, failed: false } : x));
    const msg: OutgoingMessage = {
      clientId: p.tempId,
      content: p.text.trim() || (p.attachment ? 'Shared an attachment' : ''),
      type: p.attachment ? (p.attachment.contentType.startsWith('image/') ? 'IMAGE' : 'FILE') : 'TEXT',
      replyTo: p.replyTo?.senderId ? { messageId: p.replyTo.id, senderId: p.replyTo.senderId, preview: p.replyTo.content.slice(0,80) } : null,
      attachment: p.attachment,
    };
    try {
      if (convKey.startsWith('dm:')) {
        if (!dmOther) throw new Error('Conversation is not ready yet.');
        await sendDmMessage(convKey.slice(3), dmOther, msg.content, msg);
      } else await sendMessage(col, uid, msg);
      setPendings(prev => prev.map(x => x.tempId === p.tempId ? { ...x, confirmedId: p.tempId } : x));
      if (convKey.startsWith('group:') && !groupTouched.current.has(p.tempId)) {
        groupTouched.current.add(p.tempId);
        // Preserve existing best-effort group metadata update, including retries.
        void fetch('/api/groups/touch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupId: convKey.slice(6), preview: msg.content.slice(0, 120) }) }).catch(() => undefined);
      }
    } catch (e) {
      setPendings(prev => prev.map(x => x.tempId === p.tempId ? { ...x, failed: true } : x));
      throw e;
    } finally { inFlight.current.delete(p.tempId); }
  }, [getCol, uid, convKey, dmOther]);

  const send = useCallback(async (text: string, opts?: { replyTo?: DemoMessage | null; attachment?: (OutgoingMessage['attachment'] & { url: string }) | null }) => {
    const col = getCol();
    if (!col || !uid) throw new Error('Not connected.');
    const p: Pending = { tempId: doc(col).id, scope: uid + ':' + convKey, createdAtMs: Date.now(), confirmedId: null, failed: false, text, replyTo: opts?.replyTo ?? null, attachment: opts?.attachment ?? null };
    animated.current.add(p.tempId);
    setPendings(prev => [...prev, p]);
    await dispatch(p);
  }, [getCol, uid, convKey, dispatch]);

  const retrySend = useCallback(async (id: string) => {
    const p = pendings.find(x => x.tempId === id && x.scope === uid + ':' + convKey);
    if (p?.failed) await dispatch(p);
  }, [pendings, dispatch, uid, convKey]);

  const editMessage = useCallback(
    async (id: string, content: string) => {
      const col = getCol();
      if (!col || !uid) throw new Error("Not connected.");
      const existing = docs.find((d) => d.id === id);
      const senderId = String((existing?.data().senderId as string | undefined) ?? "");
      const { editOwnMessage } = await import("@/lib/transport");
      await editOwnMessage(col, id, senderId, uid, content);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid, convKey, docs],
  );

  const deleteMessage = useCallback(
    async (id: string) => {
      const col = getCol();
      if (!col || !uid) throw new Error("Not connected.");
      const existing = docs.find((d) => d.id === id);
      const senderId = String((existing?.data().senderId as string | undefined) ?? "");
      const { deleteOwnMessage } = await import("@/lib/transport");
      await deleteOwnMessage(col, id, senderId, uid);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid, convKey, docs],
  );

  const messages = useMemo<DemoMessage[]>(() => {
    if (docsScope !== uid + ':' + convKey) return [];
    const live = docs.map(d => {
      const m = docToUi(d, uid ?? '', names);
      if (animated.current.has(d.id)) m.entrance = m.own ? 'outgoing' : 'incoming';
      return m;
    });
    const opts: DemoMessage[] = pendings.filter(p => p.scope === uid + ':' + convKey).map((p) => ({
      id: p.tempId,
      createdAtMs: p.createdAtMs,
      entrance: 'outgoing',
      status: p.failed ? 'failed' : p.confirmedId ? 'sent' : 'sending',
      sender: "You",
      senderId: uid ?? "",
      own: true,
      content: p.text,
      at: "now",
      replyTo: p.replyTo ? { sender: p.replyTo.sender, preview: p.replyTo.content.slice(0, 80) } : undefined,
      pending: !p.failed && !p.confirmedId,
      failed: p.failed,
      attachmentUrl: p.attachment?.url ?? null,
      attachmentType: p.attachment?.contentType ?? null,
    }));
    // Attach retry affordance via failed flag; MessageList calls onRetry.
    return reconcileMessages(live, opts);
  }, [docs, names, pendings, uid, convKey, docsScope]);

  return { messages, loading, error, hasMore, loadingMore, loadMore, send, retry: retrySend, editMessage, deleteMessage };
}
