// Firebase Admin SDK — server only. Lazy init; never throw at import time.
// Reads credentials from env (FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY).
// API routes must call requireAdmin() and verify the session cookie — never
// trust a userId supplied by the browser.

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let app: App | null = null;

export function isAdminConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
}

export function adminApp(): App | null {
  if (!isAdminConfigured()) return null;
  if (app) return app;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  app =
    getApps().length > 0
      ? getApps()[0]!
      : initializeApp({
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey,
          }),
        });
  return app;
}

/** Verify the HttpOnly session cookie, return the trusted uid. */
export async function verifySession(sessionCookie: string | undefined): Promise<string | null> {
  if (!sessionCookie) return null;
  const a = adminApp();
  if (!a) return null;
  try {
    const decoded = await getAuth(a).verifySessionCookie(sessionCookie, true);
    return decoded.uid;
  } catch {
    return null;
  }
}

export function adminDb() {
  const a = adminApp();
  return a ? getFirestore(a) : null;
}

export const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME || "rush_session";
