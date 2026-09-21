import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, verifySession, SESSION_COOKIE_NAME } from "@/lib/firebaseAdmin";

// POST /api/spaces { name, description?, visibility? }
// Creates the space AND the owner's OWNER membership atomically (Admin SDK).
// Membership docs are Admin-only per firestore.rules, so creation must live here.
export async function POST(req: Request) {
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Server is not configured." }, { status: 503 });
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { name, description, visibility } = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    visibility?: string;
  };
  const cleanName = (name ?? "").trim().slice(0, 40);
  if (cleanName.length < 2)
    return NextResponse.json({ error: "Space name must be at least 2 characters." }, { status: 400 });
  const vis = visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE";
  const slug =
    cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "space";

  const spaceRef = db.collection("spaces").doc();
  const memberRef = spaceRef.collection("members").doc(uid);
  const generalRef = spaceRef.collection("channels").doc();
  const batch = db.batch();
  batch.set(spaceRef, {
    name: cleanName,
    slug: `${slug}-${spaceRef.id.slice(0, 6).toLowerCase()}`,
    description: (description ?? "").trim().slice(0, 140),
    ownerId: uid,
    visibility: vis,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(memberRef, {
    userId: uid,
    spaceId: spaceRef.id,
    role: "OWNER",
    joinedAt: FieldValue.serverTimestamp(),
  });
  batch.set(generalRef, {
    spaceId: spaceRef.id,
    name: "general",
    topic: "General discussion",
    sortOrder: 0,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return NextResponse.json({ ok: true, id: spaceRef.id });
}
