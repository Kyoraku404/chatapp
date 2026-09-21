import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, verifySession, SESSION_COOKIE_NAME } from "@/lib/firebaseAdmin";
import { generateInviteCode, inviteStatus } from "@/lib/invites";
import { canCreateInvite } from "@/lib/permissions";

// POST /api/invites { spaceId, maxUses?, ttlHours? } -> { code }
// Requires MODERATOR+. Join via POST /api/invites/redeem { code }.
export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Server is not configured." }, { status: 503 });
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { spaceId, maxUses, ttlHours } = (await req.json().catch(() => ({}))) as {
    spaceId?: string;
    maxUses?: number;
    ttlHours?: number;
  };
  if (!spaceId) return NextResponse.json({ error: "Missing spaceId." }, { status: 400 });

  const member = await db.doc(`spaces/${spaceId}/members/${uid}`).get();
  if (!member.exists || !canCreateInvite(member.data()?.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const code = generateInviteCode(8);
  const expiresAt =
    typeof ttlHours === "number" && ttlHours > 0
      ? new Date(Date.now() + ttlHours * 3600 * 1000)
      : null;
  await db.doc(`spaces/${spaceId}/invites/${code}`).set({
    code,
    spaceId,
    creatorId: uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    maxUses: typeof maxUses === "number" ? Math.min(Math.max(1, maxUses), 1000) : null,
    uses: 0,
    revokedAt: null,
  });
  return NextResponse.json({ ok: true, code, expiresAt });
}

export async function GET(req: Request) {
  // Redeem-preview: GET /api/invites?spaceId=&code= -> validity without joining.
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Server is not configured." }, { status: 503 });
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const url = new URL(req.url);
  const spaceId = url.searchParams.get("spaceId");
  const code = url.searchParams.get("code");
  if (!spaceId || !code) return NextResponse.json({ error: "Missing params." }, { status: 400 });
  const snap = await db.doc(`spaces/${spaceId}/invites/${code}`).get();
  if (!snap.exists) return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  const data = snap.data()!;
  const status = inviteStatus({
    expiresAt: data.expiresAt?.seconds ? { seconds: data.expiresAt.seconds } : data.expiresAt ?? null,
    maxUses: data.maxUses ?? null,
    uses: data.uses ?? 0,
    revokedAt: data.revokedAt ?? null,
  });
  if (!status.ok) return NextResponse.json({ error: `Invite ${status.reason}.` }, { status: 410 });
  return NextResponse.json({ ok: true, spaceId });
}
