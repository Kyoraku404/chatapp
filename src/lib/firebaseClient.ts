// Firebase web client — lazy + build-safe.
// Returns null when env config is absent (e.g. fresh checkout, CI build),
// so `next build` never crashes without secrets.

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getDatabase, type Database } from "firebase/database";

function config() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || undefined,
  };
}

export function isFirebaseConfigured(): boolean {
  const c = config();
  return Boolean(c.apiKey && c.projectId && c.appId);
}

let app: FirebaseApp | null = null;

export function firebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  if (!isFirebaseConfigured()) return null;
  if (app) return app;
  app = getApps().length ? getApps()[0]! : initializeApp(config());
  return app;
}

export function firebaseAuth(): Auth | null {
  const a = firebaseApp();
  return a ? getAuth(a) : null;
}

export function firebaseDb(): Firestore | null {
  const a = firebaseApp();
  return a ? getFirestore(a) : null;
}

export function firebaseStorage(): FirebaseStorage | null {
  const a = firebaseApp();
  return a ? getStorage(a) : null;
}

export function firebaseRtdb(): Database | null {
  const a = firebaseApp();
  if (!a) return null;
  if (!process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL) return null;
  return getDatabase(a);
}

export function useEmulators(): boolean {
  return process.env.NEXT_PUBLIC_USE_EMULATORS === "1";
}
