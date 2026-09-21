import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { validateDisplayName } from "@/lib/validation";
import { validateUsernameInput } from "@/lib/usernames";

// POST /api/profile { idToken, username, displayName }
// Server-side username reservation in a transaction (prevents races):
//   usernames/{name} must not exist -> create it + users/{uid} atomically.
export async function POST(req: Request) {
  const db = adminDb();
  if (!db)
    return NextResponse.json({ error: "Server is not configured." }, { status: 503 });
  const { idToken, username, displayName } = (await req.json().catch(() => ({}))) as {
    idToken?: string;
    username?: string;
    displayName?: string;
  };
  if (!idToken || !username || !displayName)
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });

  const uv = validateUsernameInput(username);
  if (!uv.ok) return NextResponse.json({ error: uv.error }, { status: 400 });
  const dnErr = validateDisplayName(displayName);
  if (dnErr) return NextResponse.json({ error: dnErr }, { status: 400 });

  let uid: string;
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }

  const nameRef = db.doc(`usernames/${uv.value}`);
  const userRef = db.doc(`users/${uid}`);
  try {
    await db.runTransaction(async (tx) => {
      const [nameSnap, userSnap] = await Promise.all([tx.get(nameRef), tx.get(userRef)]);
      if (nameSnap.exists) {
        // Same user re-claiming their own name is fine (idempotent).
        if (nameSnap.data()?.uid !== uid) throw new Error("USERNAME_TAKEN");
      }
      if (userSnap.exists && userSnap.data()?.usernameLower && userSnap.data()?.usernameLower !== uv.value) {
        throw new Error("USERNAME_LOCKED");
      }
      tx.set(nameRef, { uid, createdAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(
        userRef,
        {
          uid,
          username: uv.value,
          usernameLower: uv.value,
          displayName: displayName.trim(),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "USERNAME_TAKEN")
      return NextResponse.json({ error: "That username is taken." }, { status: 409 });
    if (msg === "USERNAME_LOCKED")
      return NextResponse.json({ error: "Username is set and cannot be changed in V1." }, { status: 409 });
    return NextResponse.json({ error: "Could not reserve username." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, username: uv.value });
}
