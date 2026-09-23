import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminDb, verifySession, SESSION_COOKIE_NAME } from "@/lib/firebaseAdmin";
import { r2Config, PutObjectCommand, DeleteObjectCommand } from "@/lib/r2";
import { validateUpload } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = adminDb();
  const r2 = r2Config();
  if (!db || !r2) return NextResponse.json({ error: "Avatar uploads are not configured yet." }, { status: 503 });
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!req.headers.get("content-length")) return NextResponse.json({ error: "Upload size is required." }, { status: 411 });
  if (Number(req.headers.get("content-length")) > 9 * 1024 * 1024) return NextResponse.json({ error: "Image is too large." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.type.startsWith("image/")) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  const error = validateUpload(file.type, file.size);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const has = (...values: number[]) => values.every((v, i) => bytes[i] === v);
  const validBytes = file.type === "image/jpeg" ? has(0xff, 0xd8, 0xff)
    : file.type === "image/png" ? has(0x89, 0x50, 0x4e, 0x47)
    : file.type === "image/gif" ? has(0x47, 0x49, 0x46, 0x38)
    : file.type === "image/webp" ? has(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    : false;
  if (!validBytes) return NextResponse.json({ error: "Image content does not match its type." }, { status: 400 });
  const id = randomUUID();
  const path = `avatars/${uid}/${id}`;
  const avatarUrl = `/api/attachments/media?id=${id}`;
  const profileRef = db.doc(`users/${uid}`);
  const previous = (await profileRef.get()).data()?.avatarPath as string | undefined;
  try {
    await r2.client.send(new PutObjectCommand({ Bucket: r2.bucket, Key: path, Body: bytes, ContentType: file.type }));
    await db.doc(`r2Uploads/${id}`).set({ storagePath: path, scope: "avatar", scopeId: uid, ownerId: uid, contentType: file.type, sizeBytes: bytes.length, createdAt: new Date(), used: true });
    await profileRef.set({ avatarPath: path, avatarUrl }, { merge: true });
    if (previous?.startsWith(`avatars/${uid}/`)) {
      await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: previous })).catch(() => undefined);
      await db.doc(`r2Uploads/${previous.split("/").at(-1)}`).delete().catch(() => undefined);
    }
    return NextResponse.json({ avatarUrl });
  } catch {
    await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: path })).catch(() => undefined);
    await db.doc(`r2Uploads/${id}`).delete().catch(() => undefined);
    return NextResponse.json({ error: "Could not save avatar." }, { status: 500 });
  }
}

export async function DELETE() {
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const profileRef = db.doc(`users/${uid}`);
  const path = (await profileRef.get()).data()?.avatarPath as string | undefined;
  const r2 = path?.startsWith(`avatars/${uid}/`) ? r2Config() : null;
  if (path?.startsWith(`avatars/${uid}/`) && !r2) return NextResponse.json({ error: "Media cleanup is unavailable." }, { status: 503 });
  await profileRef.set({ avatarPath: null, avatarUrl: null }, { merge: true });
  if (path?.startsWith(`avatars/${uid}/`) && r2) {
    await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: path }));
    await db.doc(`r2Uploads/${path.split("/").at(-1)}`).delete();
  }
  return NextResponse.json({ ok: true });
}
