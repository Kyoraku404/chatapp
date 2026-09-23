import { Readable } from "node:stream";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminDb, verifySession, SESSION_COOKIE_NAME } from "@/lib/firebaseAdmin";
import { canAccessAttachment, type AttachmentScope } from "@/lib/attachmentAccess";
import { r2Config, GetObjectCommand } from "@/lib/r2";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const db = adminDb();
  const r2 = r2Config();
  if (!db || !r2) return new Response(null, { status: 503 });
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return new Response(null, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response(null, { status: 400 });
  const snap = await db.doc(`r2Uploads/${id}`).get();
  if (!snap.exists) return new Response(null, { status: 404 });
  const data = snap.data()!;
  const scope = data.scope as AttachmentScope;
  const scopeId = data.scopeId as string;
  if (!data.used && data.ownerId !== uid) return new Response(null, { status: 403 });
  if (!await canAccessAttachment(db, uid, scope, scopeId)) return new Response(null, { status: 403 });
  if (data.used && scope !== "avatar") {
    if (typeof data.messagePath !== "string") return new Response(null, { status: 404 });
    const message = (await db.doc(data.messagePath).get()).data();
    if (!message || message.deletedAt || message.attachment?.storagePath !== data.storagePath)
      return new Response(null, { status: 404 });
  }
  const range = req.headers.get("range");
  if (range && !/^bytes=\d+-\d*$/.test(range)) return new Response(null, { status: 416 });
  try {
    const object = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: data.storagePath, ...(range ? { Range: range } : {}) }));
    if (!object.Body) return new Response(null, { status: 404 });
    const stream = Readable.toWeb(object.Body as Readable) as ReadableStream;
    return new Response(stream, {
      status: object.ContentRange ? 206 : 200,
      headers: {
        "Content-Type": data.contentType,
        "Content-Disposition": data.contentType === "application/pdf" ? "attachment" : "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Accept-Ranges": "bytes",
        ...(object.ContentLength != null ? { "Content-Length": String(object.ContentLength) } : {}),
        ...(object.ContentRange ? { "Content-Range": object.ContentRange } : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: "Media unavailable." }, { status: 404 });
  }
}
