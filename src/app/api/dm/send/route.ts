import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, verifySession, SESSION_COOKIE_NAME } from "@/lib/firebaseAdmin";
import { dmConversationId } from "@/lib/dm";
import { canDirectMessage } from "@/lib/blocking";
import { sanitizePreview, validateMessageContent } from "@/lib/validation";
import { extractMentionCandidates } from "@/lib/mentions";
import { attachmentId } from "@/lib/attachmentAccess";
import { canReceiveDm } from "@/lib/profilePrivacy";

// POST /api/dm/send { conversationId, otherUid, content, replyTo?, attachment? }
// Server-authoritative DM write: creates the deterministic parent on first
// message and updates lastMessageAt/lastMessagePreview/lastMessageSenderId/
// hasMessages/messageCount atomically in one Admin transaction, so both
// participants' orderBy(lastMessageAt desc) lists move the conversation to
// the top without refresh. The same transaction bumps the recipient's
// users/{uid}/reads unreadCount (+1) and clears the sender's (0), driving
// the realtime sidebar badges. Verifies session + both block directions.
export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Server is not configured." }, { status: 503 });
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    conversationId?: string;
    clientId?: string;
    otherUid?: string;
    content?: string;
    replyTo?: { messageId?: string; senderId?: string; preview?: string } | null;
    attachment?: { storagePath?: string; contentType?: string; sizeBytes?: number } | null;
  };
  const { conversationId, otherUid } = body;
  const content = typeof body.content === "string" ? body.content : "";
  if (!conversationId || !otherUid || otherUid === uid)
    return NextResponse.json({ error: "Invalid conversation." }, { status: 400 });

  let expected: string;
  try {
    expected = dmConversationId(uid, otherUid);
  } catch {
    return NextResponse.json({ error: "Invalid conversation." }, { status: 400 });
  }
  if (conversationId !== expected)
    return NextResponse.json({ error: "Conversation does not match participants." }, { status: 400 });

  const contentErr = validateMessageContent(content);
  if (contentErr) return NextResponse.json({ error: contentErr }, { status: 400 });

  try {
    await getAuth().getUser(otherUid);
  } catch {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const blocks = await db
    .collection("blocks")
    .where("blockerId", "in", [uid, otherUid])
    .get()
    .catch(() => null);
  const edges = (blocks?.docs ?? []).map((d) => d.data() as { blockerId: string; blockedId: string });
  const relevant = edges.filter(
    (b) =>
      (b.blockerId === uid && b.blockedId === otherUid) ||
      (b.blockerId === otherUid && b.blockedId === uid),
  );
  if (!canDirectMessage(uid, otherUid, relevant))
    return NextResponse.json({ error: "You can't message this user." }, { status: 403 });

  const trimmed = content.trim();
  const preview = sanitizePreview(trimmed);
  const mentions = extractMentionCandidates(trimmed);
  const replyTo =
    body.replyTo && typeof body.replyTo.messageId === "string" && typeof body.replyTo.senderId === "string"
      ? {
          messageId: body.replyTo.messageId.slice(0, 100),
          senderId: body.replyTo.senderId.slice(0, 128),
          preview: String(body.replyTo.preview ?? "").slice(0, 80),
        }
      : null;
  const attachment = body.attachment ? {
    storagePath: String(body.attachment.storagePath ?? ""),
    contentType: String(body.attachment.contentType ?? ""),
    sizeBytes: Number(body.attachment.sizeBytes ?? 0),
  } : null;
  const uploadId = attachment ? attachmentId(attachment.storagePath) : null;
  if (attachment && (!uploadId || !attachment.storagePath.startsWith(`attachments/dm/${conversationId}/`)))
    return NextResponse.json({ error: "Invalid attachment." }, { status: 400 });

  const convoRef = db.doc(`conversations/${conversationId}`);
  if (!(await convoRef.get()).exists && !await canReceiveDm(db, otherUid))
    return NextResponse.json({ error: "This user is not accepting new direct messages." }, { status: 403 });
  if (body.clientId != null && (typeof body.clientId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(body.clientId)))
    return NextResponse.json({ error: 'Invalid message ID.' }, { status: 400 });
  const msgRef = body.clientId ? convoRef.collection("messages").doc(body.clientId) : convoRef.collection("messages").doc();
  const uploadRef = uploadId ? db.doc(`r2Uploads/${uploadId}`) : null;
  // Per-user unread counters for the sidebar badges. Recipient +1, sender
  // reset to 0 (sending means you have seen the thread tip). Both writes
  // are Admin-side inside this same transaction: no client can set another
  // user's count, and metadata + message + counters stay consistent.
  const recipientReadsRef = db.doc(`users/${otherUid}/reads/${conversationId}`);
  const senderReadsRef = db.doc(`users/${uid}/reads/${conversationId}`);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(convoRef);
      const existing = await tx.get(msgRef);
      if (existing.exists) {
        if (existing.data()?.senderId !== uid) throw new Error('NOT_PARTICIPANT');
        return; // Lost HTTP responses and retries must not increment unread twice.
      }
      if (uploadRef && attachment) {
        const upload = await tx.get(uploadRef);
        const metadata = upload.data();
        if (!upload.exists || metadata?.ownerId !== uid || metadata?.scope !== "dm" || metadata?.scopeId !== conversationId || metadata?.storagePath !== attachment.storagePath || metadata?.contentType !== attachment.contentType || metadata?.sizeBytes !== attachment.sizeBytes || metadata?.used || metadata?.deleting)
          throw new Error("INVALID_ATTACHMENT");
        tx.update(uploadRef, { used: true, messageId: msgRef.id, messagePath: msgRef.path });
      }
      if (!snap.exists) {
        const [a, b] = [uid, otherUid].sort();
        tx.set(convoRef, {
          kind: "dm",
          participants: [a, b],
          createdAt: FieldValue.serverTimestamp(),
          lastMessageAt: FieldValue.serverTimestamp(),
          lastMessagePreview: preview,
          lastMessageSenderId: uid,
          hasMessages: true,
          messageCount: 1,
        });
      } else {
        const data = snap.data() ?? {};
        const parts = (data.participants as string[] | undefined) ?? [];
        if (!parts.includes(uid) || !parts.includes(otherUid))
          throw new Error("NOT_PARTICIPANT");
        tx.update(convoRef, {
          lastMessageAt: FieldValue.serverTimestamp(),
          lastMessagePreview: preview,
          lastMessageSenderId: uid,
          hasMessages: true,
          messageCount: FieldValue.increment(1),
        });
      }
      tx.set(msgRef, {
        senderId: uid,
        content: trimmed,
        type: "TEXT",
        createdAt: FieldValue.serverTimestamp(),
        editedAt: null,
        deletedAt: null,
        replyTo,
        attachment,
        mentions,
      });
      tx.set(recipientReadsRef, { unreadCount: FieldValue.increment(1) }, { merge: true });
      tx.set(
        senderReadsRef,
        { unreadCount: 0, lastReadAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INVALID_ATTACHMENT")
      return NextResponse.json({ error: "Attachment expired or invalid. Please upload again." }, { status: 400 });
    if (e instanceof Error && e.message === "NOT_PARTICIPANT")
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    return NextResponse.json({ error: "Message could not be sent." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: msgRef.id, conversationId, preview });
}
