import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminDb, verifySession, SESSION_COOKIE_NAME } from "@/lib/firebaseAdmin";
import { r2Config, DeleteObjectCommand } from "@/lib/r2";
import { attachmentId } from "@/lib/attachmentAccess";

export async function POST(req: Request) {
  const db = adminDb();
  const r2 = r2Config();
  if (!db || !r2) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { path, messageId } = await req.json().catch(() => ({})) as { path?: string; messageId?: string };
  if (!path || !messageId || !/^[A-Za-z0-9_-]{1,180}$/.test(messageId) || !/^((conversations|groups)\/[A-Za-z0-9_-]+\/messages|spaces\/[A-Za-z0-9_-]+\/channels\/[A-Za-z0-9_-]+\/messages)$/.test(path))
    return NextResponse.json({ error: "Invalid message." }, { status: 400 });
  const m = (await db.doc(`${path}/${messageId}`).get()).data();
  if (!m || m.senderId !== uid || !m.deletedAt) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const id = attachmentId(String(m.attachment?.storagePath ?? ""));
  if (!id) return NextResponse.json({ ok: true });
  const uploadRef = db.doc(`r2Uploads/${id}`);
  const upload = (await uploadRef.get()).data();
  if (!upload || upload.ownerId !== uid || upload.messageId !== messageId || upload.storagePath !== m.attachment.storagePath)
    return NextResponse.json({ error: "Invalid attachment." }, { status: 403 });
  await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: upload.storagePath }));
  await uploadRef.delete();
  return NextResponse.json({ ok: true });
}
