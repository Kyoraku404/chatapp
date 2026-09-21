// Per-user read state: users/{uid}/reads/{convKey}
// { lastReadAt, lastReadMessageId, unreadCount }.
// Owner-only per firestore.rules. `convKey` is the conversation/group doc id,
// or `${spaceId}_${channelId}` for space channels.
//
// unreadCount is incremented server-authoritatively when someone ELSE sends
// (DM send transaction / groups touch) and cleared to 0 here when the owner
// opens the conversation. Conversations created before counters existed have
// no unreadCount field — subscribers MUST treat that as 0 (never fake).

import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import { normalizeUnreadCount } from "./unread";

export interface ReadEntry {
  /** lastReadAt as millis, or null when never recorded. */
  lastReadAtMs: number | null;
  /** Exact unread messages (legacy-safe: missing field reads as 0). */
  unreadCount: number;
}

/**
 * Pure path builder so the owner-scoping rule is unit-testable: the client
 * can only ever address its OWN read docs (firestore.rules enforces
 * uid() == userId; increments for OTHER users happen exclusively via the
 * session-verified Admin API routes, never from a client).
 */
export function readsDocPath(uid: string, convKey: string): string {
  if (!uid || !convKey || convKey.includes("/") || convKey === "." || convKey === "..")
    throw new Error("Invalid read-state reference.");
  return `users/${uid}/reads/${convKey}`;
}

export async function markConversationRead(
  uid: string,
  convKey: string,
  lastReadMessageId?: string,
): Promise<void> {
  const db = firebaseDb();
  if (!db) throw new Error("Firestore is not configured.");
  // Opening a conversation marks it fully read: bump lastReadAt AND clear
  // the counter in one merge (idempotent across tabs/rapid switching).
  await setDoc(
    doc(db, "users", uid, "reads", convKey),
    { lastReadAt: serverTimestamp(), unreadCount: 0, ...(lastReadMessageId ? { lastReadMessageId } : {}) },
    { merge: true },
  );
}

/** Live map of convKey -> read entry for the signed-in user. */
export function subscribeReads(
  uid: string,
  onUpdate: (reads: Map<string, ReadEntry>) => void,
  onError?: (e: Error) => void,
): () => void {
  const db = firebaseDb();
  if (!db) throw new Error("Firestore is not configured.");
  return onSnapshot(
    collection(db, "users", uid, "reads"),
    (snap) => {
      const m = new Map<string, ReadEntry>();
      for (const d of snap.docs) {
        const data = d.data() as {
          lastReadAt?: { toMillis?: () => number };
          unreadCount?: unknown;
        };
        const t = data.lastReadAt;
        m.set(d.id, {
          lastReadAtMs: t && typeof t.toMillis === "function" ? t.toMillis() : null,
          unreadCount: normalizeUnreadCount(data.unreadCount),
        });
      }
      onUpdate(m);
    },
    (e) => onError?.(e as Error),
  );
}
