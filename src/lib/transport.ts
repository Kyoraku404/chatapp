// Realtime transport: Firestore listeners with pagination + stable ordering.
// Rules of the road:
//  - Never subscribe to entire history: initial limit 25, page older with
//    startAfter(oldestSnapshot), orderBy createdAt desc + flip for display.
//  - Server timestamps for ordering; local optimistic docs carry a clientId
//    so the listener echo can replace (not duplicate) the optimistic row.
//  - Sending state honesty: pending -> sent (server ack) | failed (catch+retry).

import {
  runTransaction,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import { sanitizePreview, validateMessageContent, validateMessageType } from "./validation";
import { extractMentionCandidates } from "./mentions";

export const PAGE_SIZE = 25;

export interface OutgoingMessage {
  clientId?: string;
  content: string;
  type?: "TEXT" | "IMAGE" | "FILE";
  replyTo?: { messageId: string; senderId: string; preview: string } | null;
  attachment?: {
    storagePath: string;
    contentType: string;
    sizeBytes: number;
    /** Renderable download URL (client-resolved at upload; informational). */
    url?: string;
  } | null;
}

export interface SendResult {
  ok: true;
  id: string;
  preview: string;
}

export function messageCollection(scope: "dm" | "group", conversationId: string) {
  const db = firebaseDb();
  if (!db) throw new Error("Firestore is not configured.");
  const root = scope === "dm" ? "conversations" : "groups";
  return collection(db, root, conversationId, "messages");
}

export function channelMessageCollection(spaceId: string, channelId: string) {
  const db = firebaseDb();
  if (!db) throw new Error("Firestore is not configured.");
  return collection(db, "spaces", spaceId, "channels", channelId, "messages");
}

export function subscribeMessages(
  col: ReturnType<typeof collection>,
  onPage: (docs: QueryDocumentSnapshot<DocumentData>[], direction: "initial" | "older" | "live") => void,
  onError: (e: Error) => void,
) {
  const q = query(col, orderBy("createdAt", "desc"), limit(PAGE_SIZE));
  let initial = true;
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      onPage(snap.docs, initial ? "initial" : "live");
      if (!snap.metadata.fromCache) initial = false;
    },
    (err) => onError(err as Error),
  );
}

export async function loadOlderMessages(
  col: ReturnType<typeof collection>,
  oldest: QueryDocumentSnapshot<DocumentData>,
  pageSize = PAGE_SIZE,
) {
  const q = query(col, orderBy("createdAt", "desc"), startAfter(oldest), limit(pageSize));
  const snap = await getDocs(q);
  return snap.docs;
}

export async function sendMessage(
  col: ReturnType<typeof collection>,
  senderId: string,
  msg: OutgoingMessage,
): Promise<SendResult> {
  const err = validateMessageContent(msg.content);
  if (err) throw new Error(err);
  const type = msg.type ?? "TEXT";
  if (!validateMessageType(type)) throw new Error("Unsupported message type.");
  const mentions = extractMentionCandidates(msg.content);
  const ref = msg.clientId ? doc(col, msg.clientId) : doc(col);
  await runTransaction(col.firestore, async tx => {
    const existing = await tx.get(ref);
    if (existing.exists()) {
      if (existing.data().senderId !== senderId) throw new Error('Message ID conflict.');
      return;
    }
    tx.set(ref, {
    senderId,
    content: msg.content.trim(),
    type,
    createdAt: serverTimestamp(),
    editedAt: null,
    deletedAt: null,
    replyTo: msg.replyTo ?? null,
    attachment: msg.attachment ?? null,
    mentions,
    });
  });
  return { ok: true, id: ref.id, preview: sanitizePreview(msg.content) };
}

/**
 * Server-authoritative DM send (POST /api/dm/send).
 * Creates the deterministic parent on first message and updates
 * lastMessageAt/lastMessagePreview/lastMessageSenderId/hasMessages
 * atomically in one Admin transaction, so both participants'
 * `orderBy(lastMessageAt desc)` lists move the conversation to the top
 * without refresh. Client-direct message writes must not be used for DMs.
 */
export async function sendDmMessage(
  conversationId: string,
  otherUid: string,
  content: string,
  opts?: {
    clientId?: string;
    replyTo?: { messageId: string; senderId: string; preview: string } | null;
    attachment?: { storagePath: string; contentType: string; sizeBytes: number; url?: string } | null;
  },
): Promise<SendResult> {
  const err = validateMessageContent(content);
  if (err) throw new Error(err);
  const res = await fetch("/api/dm/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId,
      otherUid,
      content,
      clientId: opts?.clientId,
      replyTo: opts?.replyTo ?? null,
      attachment: opts?.attachment ?? null,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; preview?: string; error?: string };
  if (!res.ok || !body.id) throw new Error(body.error || "Message could not be sent.");
  return { ok: true, id: body.id, preview: body.preview ?? sanitizePreview(content) };
}

export async function editOwnMessage(
  col: ReturnType<typeof collection>,
  messageId: string,
  senderId: string,
  currentSenderId: string,
  content: string,
) {
  if (senderId !== currentSenderId) throw new Error("You can only edit your own messages.");
  const err = validateMessageContent(content);
  if (err) throw new Error(err);
  const db = firebaseDb();
  if (!db) throw new Error("Firestore is not configured.");
  await updateDoc(doc(col, messageId), {
    content: content.trim(),
    editedAt: serverTimestamp(),
  });
}

export async function deleteOwnMessage(
  col: ReturnType<typeof collection>,
  messageId: string,
  senderId: string,
  currentSenderId: string,
) {
  if (senderId !== currentSenderId) throw new Error("You can only delete your own messages.");
  await updateDoc(doc(col, messageId), { deletedAt: serverTimestamp(), content: "" });
}
