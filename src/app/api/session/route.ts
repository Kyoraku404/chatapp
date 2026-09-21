import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuth } from "firebase-admin/auth";
import { adminApp, SESSION_COOKIE_NAME } from "@/lib/firebaseAdmin";

// POST /api/session { idToken } -> sets HttpOnly session cookie.
// GET verifies liveness. DELETE clears the cookie.
export async function POST(req: Request) {
  const app = adminApp();
  if (!app)
    return NextResponse.json(
      { error: "Server auth is not configured." },
      { status: 503 },
    );
  const { idToken } = (await req.json().catch(() => ({}))) as { idToken?: string };
  if (!idToken) return NextResponse.json({ error: "Missing idToken." }, { status: 400 });
  try {
    const expiresIn = 5 * 24 * 60 * 60 * 1000; // 5 days
    const sessionCookie = await getAuth(app).createSessionCookie(idToken, { expiresIn });
    cookies().set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: expiresIn / 1000,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }
}

export async function DELETE() {
  cookies().delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
