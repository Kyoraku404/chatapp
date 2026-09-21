import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, verifySession, SESSION_COOKIE_NAME } from "@/lib/firebaseAdmin";

// POST /api/groups/touch { groupId, preview? }
// Refreshes a group's list ordering after a member sends a message.
// Group docs are owner-writable only per firestore.rules, so non-owner
// members cannot updateDoc lastMessageAt themselves — this Admin route
// verifies membership first and touches ONLY the preview fields, plus the
// per-user unread counters (recipients +1, sender cleared) that drive the
// realtime sidebar badges. The message itself is already sent client-side;
// if this touch fails the badges catch up on the next successful send.
export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Server is not configured." }, { status: 503 });
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { groupId, preview } = (await req.json().catch(() => ({}))) as {
    groupId?: string;
    preview?: string;
  };
  if (!groupId) return NextResponse.json({ error: "Missing group." }, { status: 400 });
  const snap = await db.doc(`groups/${groupId}`).get();
  if (!snap.exists) return NextResponse.json({ error: "Group not found." }, { status: 404 });
  const memberIds = (snap.data()?.memberIds as string[] | undefined) ?? [];
  if (!memberIds.includes(uid)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  await db.doc(`groups/${groupId}`).update({
    lastMessageAt: FieldValue.serverTimestamp(),
    lastMessagePreview: String(preview ?? "").slice(0, 120),
  });
  // Recipient counters (+1 for every member except the sender; sender
  // cleared). Membership was verified above, so no client can forge another
  // user's count. Chunked to respect the 500-write batch limit.
  const recipients = [...new Set(memberIds)].filter((m) => typeof m === "string" && m && m !== uid);
  const CHUNK = 400;
  for (let i = 0; i < recipients.length; i += CHUNK) {
    const batch = db.batch();
    for (const memberId of recipients.slice(i, i + CHUNK)) {
      batch.set(
        db.doc(`users/${memberId}/reads/${groupId}`),
        { unreadCount: FieldValue.increment(1) },
        { merge: true },
      );
    }
    await batch.commit();
  }
  await db.doc(`users/${uid}/reads/${groupId}`).set(
    { unreadCount: 0, lastReadAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return NextResponse.json({ ok: true });
}
