import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, verifySession, SESSION_COOKIE_NAME } from "@/lib/firebaseAdmin";
import { inviteStatus } from "@/lib/invites";
import { shouldCreateMembership } from "@/lib/authz";

// POST /api/invites/redeem { spaceId, code }
// Atomic + idempotent: existing membership is a no-op; uses counter
// increments transactionally so maxUses cannot be overshot.
export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Server is not configured." }, { status: 503 });
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { spaceId, code } = (await req.json().catch(() => ({}))) as {
    spaceId?: string;
    code?: string;
  };
  if (!spaceId || !code) return NextResponse.json({ error: "Missing params." }, { status: 400 });

  const inviteRef = db.doc(`spaces/${spaceId}/invites/${code}`);
  const memberRef = db.doc(`spaces/${spaceId}/members/${uid}`);
  try {
    const result = await db.runTransaction(async (tx) => {
      const [inviteSnap, memberSnap] = await Promise.all([tx.get(inviteRef), tx.get(memberRef)]);
      if (!inviteSnap.exists) return { error: "Invite not found.", status: 404 } as const;
      const d = inviteSnap.data()!;
      const status = inviteStatus({
        expiresAt: d.expiresAt?.seconds ? { seconds: d.expiresAt.seconds } : (d.expiresAt ?? null),
        maxUses: d.maxUses ?? null,
        uses: d.uses ?? 0,
        revokedAt: d.revokedAt ?? null,
      });
      if (!status.ok) return { error: `Invite ${status.reason}.`, status: 410 } as const;
      if (!shouldCreateMembership(memberSnap.exists ? (memberSnap.data()?.role ?? null) : null)) {
        return { joined: false, already: true } as const; // idempotent no-op
      }
      tx.set(memberRef, {
        userId: uid,
        spaceId,
        role: "MEMBER",
        joinedAt: FieldValue.serverTimestamp(),
      });
      tx.update(inviteRef, { uses: FieldValue.increment(1) });
      return { joined: true, already: false } as const;
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ error: "Could not join space." }, { status: 500 });
  }
}
