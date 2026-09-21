import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, verifySession, SESSION_COOKIE_NAME } from "@/lib/firebaseAdmin";
import { classifyDmDoc } from "@/lib/dm";
import { sanitizePreview } from "@/lib/validation";

// POST /api/dm/backfill
// One-time, safe migration for DM docs that predate (or bypassed) the
// hasMessages visibility gate. Session-verified; only touches conversations
// the caller participates in; never deletes history.
//
// For each of the caller's DM docs with hasMessages !== true:
// - messages exist   → publish (hasMessages=true; stamp lastMessageAt only
//   when null; repair an empty preview from the latest message so the
//   recipient's RECENT shows real text)
// - no messages but phantom preview/sender/timestamp → reset to pending
//   (stay hidden until the first real message; never fabricate)
// - clean pending/empty → untouched
//
// Run once per account after deploying the hasMessages query + index, or
// delete known-empty dev/test docs instead (see report).
export async function POST() {
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Server is not configured." }, { status: 503 });
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const snap = await db
    .collection("conversations")
    .where("participants", "array-contains", uid)
    .limit(100)
    .get()
    .catch(() => null);
  if (!snap) return NextResponse.json({ error: "Could not list conversations." }, { status: 500 });

  let published = 0;
  let reset = 0;
  let untouched = 0;
  const batch = db.batch();
  let writes = 0;

  for (const d of snap.docs) {
    const data = d.data() ?? {};
    if ((data.participants as string[] | undefined)?.includes(uid) !== true) {
      untouched += 1;
      continue;
    }
    const one = await d.ref.collection("messages").limit(1).get().catch(() => null);
    const hasMessage = !!one && !one.empty;
    const decision = classifyDmDoc(data, hasMessage);
    if (decision.action === "publish") {
      const update: Record<string, unknown> = { hasMessages: true };
      if (decision.needsTimestamp) update.lastMessageAt = FieldValue.serverTimestamp();
      if (typeof data.lastMessagePreview !== "string" || data.lastMessagePreview.length === 0) {
        const latest = await d.ref
          .collection("messages")
          .orderBy("createdAt", "desc")
          .limit(1)
          .get()
          .catch(() => null);
        const content = String(latest?.docs[0]?.data()?.content ?? "");
        if (content.trim()) {
          update.lastMessagePreview = sanitizePreview(content.trim());
          const sender = String(latest?.docs[0]?.data()?.senderId ?? "");
          if (sender) update.lastMessageSenderId = sender;
        }
      }
      batch.set(d.ref, update, { merge: true });
      writes += 1;
      published += 1;
    } else if (decision.action === "reset-to-pending") {
      batch.set(
        d.ref,
        { lastMessagePreview: "", lastMessageSenderId: null, lastMessageAt: null, hasMessages: false },
        { merge: true },
      );
      writes += 1;
      reset += 1;
    } else {
      untouched += 1;
    }
    if (writes >= 400) break; // stay well under the 500-write batch limit
  }

  if (writes > 0) await batch.commit();
  return NextResponse.json({ ok: true, published, reset, untouched });
}
