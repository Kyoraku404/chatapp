"use client";

// Signed-in Firebase user for live Firestore access.
// The login/signup pages persist client auth (browser local persistence),
// so onAuthStateChanged rehydrates silently on /app. The HttpOnly session
// cookie (middleware + Admin API routes) is a separate, parallel mechanism.

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseAuth, isFirebaseConfigured } from "@/lib/firebaseClient";

export interface AuthUser {
  uid: string;
  email: string | null;
}

export function useAuthUser(): {
  status: "loading" | "authed" | "guest";
  user: AuthUser | null;
  raw: User | null;
} {
  const [state, setState] = useState<{ status: "loading" | "authed" | "guest"; user: AuthUser | null; raw: User | null }>({
    status: "loading",
    user: null,
    raw: null,
  });

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setState({ status: "guest", user: null, raw: null });
      return;
    }
    const auth = firebaseAuth();
    if (!auth) {
      setState({ status: "guest", user: null, raw: null });
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) setState({ status: "authed", user: { uid: u.uid, email: u.email }, raw: u });
      else setState({ status: "guest", user: null, raw: null });
    });
    return unsub;
  }, []);

  return state;
}
