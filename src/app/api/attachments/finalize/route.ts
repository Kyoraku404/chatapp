import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminDb, verifySession, SESSION_COOKIE_NAME } from "@/lib/firebaseAdmin";
import { attachmentId } from "@/lib/attachmentAccess";

export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { path, messageId } = await req.json().catch(() => ({})) as { path?: string; messageId?: string };
  if (!path || !messageId || !/^[A-Za-z0-9_-]{1,180}$/.test(messageId) || !/^((groups\/[A-Za-z0-9_-]+\/messages)|(spaces\/[A-Za-z0-9_-]+\/channels\/[A-Za-z0-9_-]+\/messages))$/.test(path))
    return NextResponse.json({ error: "Invalid message." }, { status: 400 });
  const message = await db.doc(`${path}/${messageId}`).get();
  const m = message.data();
  if (!m || m.senderId !== uid || m.deletedAt) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const uploadId = attachmentId(String(m.attachment?.storagePath ?? ""));
  if (!uploadId) return NextResponse.json({ error: "Invalid attachment." }, { status: 400 });
  const uploadRef = db.doc(`r2Uploads/${uploadId}`);
  const scope = path.startsWith("groups/") ? "group" : "space";
  const scopeId = path.split("/")[1];
  const valid = await db.runTransaction(async tx => {
    const upload = await tx.get(uploadRef);
    const u = upload.data();
    if (!u || u.ownerId !== uid || u.scope !== scope || u.scopeId !== scopeId || u.storagePath !== m.attachment.storagePath || u.contentType !== m.attachment.contentType || u.sizeBytes !== m.attachment.sizeBytes || u.deleting || (u.used && u.messageId !== messageId)) return false;
    if (!u.used) tx.update(uploadRef, { used: true, messageId, messagePath: `${path}/${messageId}` });
    return true;
  });
  if (!valid) return NextResponse.json({ error: "Attachment does not match message." }, { status: 403 });
  return NextResponse.json({ ok: true });
}
