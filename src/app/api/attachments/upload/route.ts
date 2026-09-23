import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminDb, verifySession, SESSION_COOKIE_NAME } from "@/lib/firebaseAdmin";
import { canAccessAttachment, type AttachmentScope } from "@/lib/attachmentAccess";
import { r2Config, PutObjectCommand, DeleteObjectCommand } from "@/lib/r2";
import { validateUpload } from "@/lib/validation";

export const runtime = "nodejs";

function looksLike(type: string, bytes: Uint8Array) {
  const has = (...values: number[]) => values.every((v, i) => bytes[i] === v);
  if (type === "image/jpeg") return has(0xff, 0xd8, 0xff);
  if (type === "image/png") return has(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (type === "image/gif") return has(0x47, 0x49, 0x46, 0x38);
  if (type === "image/webp") return has(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (type === "video/mp4" || type === "video/quicktime") return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  if (type === "video/webm") return has(0x1a, 0x45, 0xdf, 0xa3);
  if (type === "application/pdf") return has(0x25, 0x50, 0x44, 0x46);
  return false;
}

export async function POST(req: Request) {
  const db = adminDb();
  const r2 = r2Config();
  if (!db || !r2) return NextResponse.json({ error: "Media uploads are not configured yet." }, { status: 503 });
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return NextResponse.json({ error: "Sign in again to upload." }, { status: 401 });
  const declaredLength = Number(req.headers.get("content-length"));
  if (!req.headers.get("content-length")) return NextResponse.json({ error: "Upload size is required." }, { status: 411 });
  if (declaredLength > 51 * 1024 * 1024) return NextResponse.json({ error: "File is too large." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const scope = form?.get("scope");
  const scopeId = form?.get("scopeId");
  if (!(file instanceof File) || !["dm", "group", "space", "avatar", "banner"].includes(String(scope)) || typeof scopeId !== "string")
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  if ((scope === "avatar" || scope === "banner") && scopeId !== uid)
    return NextResponse.json({ error: "You can only upload your own profile media." }, { status: 403 });
  if ((scope === "avatar" || scope === "banner") && (!file.type.startsWith("image/") || file.size > (scope === "avatar" ? 5 : 8) * 1024 * 1024))
    return NextResponse.json({ error: scope === "avatar" ? "Avatar must be an image under 5 MB." : "Banner must be an image under 8 MB." }, { status: 400 });
  const error = validateUpload(file.type, file.size);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!await canAccessAttachment(db, uid, scope as AttachmentScope, scopeId))
    return NextResponse.json({ error: "You cannot upload to this chat." }, { status: 403 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLike(file.type, bytes)) return NextResponse.json({ error: "File content does not match its type." }, { status: 400 });
  const id = randomUUID();
  // The deployed R2 gateway already permits avatars/{uid}/{randomKey}.
  // Keep profile image kinds distinct in trusted metadata, not in the key.
  const storagePath = scope === "avatar" || scope === "banner" ? `avatars/${uid}/${id}` : `attachments/${scope}/${scopeId}/${id}`;
  try {
    await r2.client.send(new PutObjectCommand({ Bucket: r2.bucket, Key: storagePath, Body: bytes, ContentType: file.type }));
    try {
      await db.doc(`r2Uploads/${id}`).set({ storagePath, scope, scopeId, ownerId: uid, contentType: file.type, sizeBytes: bytes.length, createdAt: new Date(), used: false });
    } catch (e) {
      await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: storagePath })).catch(() => undefined);
      throw e;
    }
    // Reclaim abandoned previews as new uploads arrive. Sent media is never touched.
    const stale = await db.collection("r2Uploads").where("used", "==", false)
      .where("createdAt", "<", new Date(Date.now() - 24 * 60 * 60 * 1000)).limit(5).get().catch(() => null);
    for (const item of stale?.docs ?? []) {
      const old = item.data();
      if (typeof old.storagePath !== "string" || (!old.storagePath.startsWith("attachments/") && !old.storagePath.startsWith("avatars/"))) continue;
      const claimed = await db.runTransaction(async tx => {
        const fresh = await tx.get(item.ref);
        if (!fresh.exists || fresh.data()?.used || fresh.data()?.deleting) return false;
        tx.update(item.ref, { deleting: true });
        return true;
      }).catch(() => false);
      if (!claimed) continue;
      await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: old.storagePath }))
        .then(() => item.ref.delete())
        .catch(() => item.ref.update({ deleting: false }).catch(() => undefined));
    }
    return NextResponse.json({ attachment: { storagePath, contentType: file.type, sizeBytes: bytes.length, url: `/api/attachments/media?id=${id}` } });
  } catch {
    return NextResponse.json({ error: "Could not save the file. Please retry." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const db = adminDb();
  const r2 = r2Config();
  if (!db || !r2) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[a-f0-9-]{36}$/.test(id)) return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  const ref = db.doc(`r2Uploads/${id}`);
  const data = await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    const value = snapshot.data();
    if (!value || value.ownerId !== uid || value.used || value.deleting) return null;
    tx.update(ref, { deleting: true });
    return value;
  });
  if (!data) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  try {
    await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: data.storagePath }));
    await ref.delete();
  } catch {
    await ref.update({ deleting: false }).catch(() => undefined);
    return NextResponse.json({ error: "Could not remove upload." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
