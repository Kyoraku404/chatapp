"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  signInWithEmailAndPassword,
  type Auth,
} from "firebase/auth";
import { firebaseAuth, isFirebaseConfigured } from "@/lib/firebaseClient";
import { BrandMark } from "@/components/BrandMark";

async function mintSession(idToken: string, auth: Auth) {
  void auth;
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error("Could not create session.");
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-paper"><p className="text-sm text-ink-500">Loading…</p></div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const configured = isFirebaseConfigured();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const auth = firebaseAuth();
    if (!auth) {
      setError("Firebase is not configured yet. See docs/firebase-setup.md.");
      return;
    }
    setBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const idToken = await cred.user.getIdToken();
      await mintSession(idToken, auth);
      router.push(params.get("next") || "/app");
      router.refresh();
    } catch {
      setError("Sign-in failed. Check your email and password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-4">
      <main className="w-full max-w-sm rounded-3xl border border-ink-200 bg-white p-8 shadow-card">
        <BrandMark />
        <h1 className="font-display mt-6 text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-ink-500">Log in to rush back into the conversation.</p>
        {!configured && (
          <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            Demo mode: Firebase env vars are missing, so sign-in is disabled. Fill in
            .env.local per docs/firebase-setup.md.
          </p>
        )}
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div>
            <label htmlFor="email" className="text-xs font-semibold text-ink-700">Email</label>
            <input
              id="email" type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="text-xs font-semibold text-ink-700">Password</label>
            <input
              id="password" type="password" required autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm"
              placeholder="••••••••"
            />
          </div>
          {error && <p role="alert" className="text-sm text-rush-700">{error}</p>}
          <button
            type="submit" disabled={busy}
            className="w-full rounded-2xl bg-rush-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rush-700 disabled:opacity-60"
          >
            {busy ? "Logging in…" : "Log in"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-ink-500">
          New to RUSH? <Link href="/signup" className="font-semibold text-rush-700">Create an account</Link>
        </p>
      </main>
    </div>
  );
}
