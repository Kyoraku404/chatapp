import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, verifySession, SESSION_COOKIE_NAME } from "@/lib/firebaseAdmin";

// Read memberships through the authenticated server when a collection-group
// listener is denied by the deployed Firestore rules.
export async function GET() {
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Server is not configured." }, { status: 503 });
  const uid = await verifySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  if (!uid) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const memberships = await db.collectionGroup("members").where("userId", "==", uid).orderBy("joinedAt", "desc").get();
    const spaces = await Promise.all(memberships.docs.map(async (member) => {
      if (member.ref.parent.parent?.parent.id !== "spaces") return null;
      const spaceId = String(member.get("spaceId") ?? member.ref.parent.parent?.id ?? "");
      if (!spaceId) return null;
      const space = await db.collection("spaces").doc(spaceId).get();
      if (!space.exists) return null;
      const data = space.data()!;
      return {
        id: space.id,
        name: String(data.name ?? "Space"),
        description: String(data.description ?? ""),
        visibility: data.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE",
        role: member.get("role") ?? "MEMBER",
      };
    }));
    return NextResponse.json({ spaces: spaces.filter(Boolean) });
  } catch (error) {
    console.error("Could not list spaces", error);
    return NextResponse.json({ error: "Could not load spaces." }, { status: 500 });
  }
}

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
