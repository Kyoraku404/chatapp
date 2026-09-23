import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, verifySession, SESSION_COOKIE_NAME } from "@/lib/firebaseAdmin";
import { dmConversationId, classifyDmDoc } from "@/lib/dm";
import { canDirectMessage } from "@/lib/blocking";
import { canReceiveDm } from "@/lib/profilePrivacy";

// POST /api/dm/open { otherUid }
// Deterministic + idempotent: same pair always resolves to the same doc.
// Verifies session server-side; checks block edges via Admin SDK.
// Creates a PENDING empty DM (hasMessages=false, lastMessageAt=null) so the
// sender can compose immediately, but live lists filter hasMessages==true,
// so the recipient never sees it before the first real message.
// Never sets lastMessageAt at creation — activity timestamps are written
// only by POST /api/dm/send on successful message creation.
export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Server is not configured." }, { status: 503 });
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { otherUid } = (await req.json().catch(() => ({}))) as { otherUid?: string };
  if (!otherUid || otherUid === uid)
    return NextResponse.json({ error: "Invalid user." }, { status: 400 });

  let id: string;
  try {
    id = dmConversationId(uid, otherUid);
  } catch {
    return NextResponse.json({ error: "Invalid user." }, { status: 400 });
  }

  // The target must be a real account: never create conversations (or leak
  // block decisions) for phantom uids.
  try {
    await getAuth().getUser(otherUid);
  } catch {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // Block check: any edge between the two users forbids new DMs.
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

  const ref = db.doc(`conversations/${id}`);
  const snap = await ref.get();
  if (!snap.exists) {
    if (!await canReceiveDm(db, otherUid)) return NextResponse.json({ error: "This user is not accepting new direct messages." }, { status: 403 });
    const [a, b] = [uid, otherUid].sort();
    await ref.set({
      kind: "dm",
      participants: [a, b],
      createdAt: FieldValue.serverTimestamp(),
      lastMessageAt: null,
      lastMessagePreview: "",
      lastMessageSenderId: null,
      hasMessages: false,
      messageCount: 0,
    });
    return NextResponse.json({ ok: true, id, pending: true });
  }

  // Backfill legacy docs that predate hasMessages (single source of truth:
  // classifyDmDoc in lib/dm.ts). Truth comes from a limit(1) subcollection
  // read, never from metadata alone.
  const data = snap.data() ?? {};
  const msgs = await ref.collection("messages").limit(1).get().catch(() => null);
  const decision = classifyDmDoc(data, !!msgs && !msgs.empty);
  if (decision.action === "publish") {
    await ref.set(
      {
        hasMessages: true,
        ...(decision.needsTimestamp ? { lastMessageAt: FieldValue.serverTimestamp() } : {}),
      },
      { merge: true },
    );
  } else if (decision.action === "reset-to-pending") {
    await ref.set(
      { lastMessagePreview: "", lastMessageSenderId: null, lastMessageAt: null, hasMessages: false },
      { merge: true },
    );
  }
  return NextResponse.json({ ok: true, id });
}
