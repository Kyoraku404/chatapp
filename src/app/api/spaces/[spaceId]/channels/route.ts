import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, verifySession, SESSION_COOKIE_NAME } from "@/lib/firebaseAdmin";
import { canManageChannels } from "@/lib/permissions";

// POST /api/spaces/:spaceId/channels { name, topic? }
// ADMIN+ only (verified server-side against the membership doc).
// Channel docs are Admin-only per firestore.rules.
export async function POST(req: Request, { params }: { params: { spaceId: string } }) {
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Server is not configured." }, { status: 503 });
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { spaceId } = params;
  if (!spaceId) return NextResponse.json({ error: "Missing space." }, { status: 400 });

  const member = await db.doc(`spaces/${spaceId}/members/${uid}`).get();
  if (!member.exists || !canManageChannels(member.data()?.role))
    return NextResponse.json({ error: "Only space admins can create channels." }, { status: 403 });

  const { name, topic } = (await req.json().catch(() => ({}))) as {
    name?: string;
    topic?: string;
  };
  const clean = (name ?? "").trim().toLowerCase().replace(/\s+/g, "-").slice(0, 30);
  if (clean.length < 2 || !/^[a-z0-9-_]+$/.test(clean))
    return NextResponse.json({ error: "Channel name must be 2+ characters (letters, numbers, - _)." }, { status: 400 });

  const existing = await db.collection(`spaces/${spaceId}/channels`).get().catch(() => null);
  const taken = new Set((existing?.docs ?? []).map((d) => String(d.data().name ?? "")));
  if (taken.has(clean)) return NextResponse.json({ error: "A channel with that name exists." }, { status: 409 });

  const ref = db.collection(`spaces/${spaceId}/channels`).doc();
  await ref.set({
    spaceId,
    name: clean,
    topic: (topic ?? "").trim().slice(0, 120),
    sortOrder: existing?.size ?? 0,
    createdAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ ok: true, id: ref.id });
}
