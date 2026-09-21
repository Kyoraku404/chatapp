"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { firebaseAuth, isFirebaseConfigured } from "@/lib/firebaseClient";
import { validateDisplayName } from "@/lib/validation";
import { validateUsernameInput } from "@/lib/usernames";
import { BrandMark } from "@/components/BrandMark";

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const configured = isFirebaseConfigured();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const uv = validateUsernameInput(username);
    if (!uv.ok) return setError(uv.error);
    const dnErr = validateDisplayName(displayName);
    if (dnErr) return setError(dnErr);
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    const auth = firebaseAuth();
    if (!auth) {
      setError("Firebase is not configured yet. See docs/firebase-setup.md.");
      return;
    }
    setBusy(true);
    try {
      // Profile creation is authoritative in POST /api/profile (Admin SDK
      // transaction reserves usernames/{name} + users/{uid} atomically).
      // No client-direct profile write: rules require username ==
      // usernameLower and the reservation, so the API is the only path.
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: displayName.trim() });
      const idToken = await cred.user.getIdToken();
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          username: uv.value,
          displayName: displayName.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not create profile.");
      }
      await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-4">
      <main className="w-full max-w-sm rounded-3xl border border-ink-200 bg-white p-8 shadow-card">
        <BrandMark />
        <h1 className="font-display mt-6 text-2xl font-bold tracking-tight">Claim your username</h1>
        <p className="mt-1 text-sm text-ink-500">One handle across chats, groups, and spaces.</p>
        {!configured && (
          <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            Demo mode: Firebase env vars are missing, so sign-up is disabled.
          </p>
        )}
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div>
            <label htmlFor="displayName" className="text-xs font-semibold text-ink-700">Display name</label>
            <input id="displayName" required value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm" placeholder="Ada Rush" maxLength={40} />
          </div>
          <div>
            <label htmlFor="username" className="text-xs font-semibold text-ink-700">Username</label>
            <input id="username" required value={username} onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm" placeholder="adarush" maxLength={20} autoComplete="username" />
          </div>
          <div>
            <label htmlFor="email" className="text-xs font-semibold text-ink-700">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm" placeholder="you@example.com" autoComplete="email" />
          </div>
          <div>
            <label htmlFor="password" className="text-xs font-semibold text-ink-700">Password</label>
            <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm" placeholder="6+ characters" autoComplete="new-password" />
          </div>
          {error && <p role="alert" className="text-sm text-rush-700">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full rounded-2xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-60">
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-ink-500">
          Have an account? <Link href="/login" className="font-semibold text-rush-700">Log in</Link>
        </p>
      </main>
    </div>
  );
}
