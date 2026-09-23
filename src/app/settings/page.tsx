"use client";

// Settings: profile shortcut, REAL blocked-users list (read own edges,
// delete to unblock — both owner-scoped per rules), appearance note
// (no controls, just the product truth), and logout that clears BOTH the
// HttpOnly session cookie and the Firebase client auth state.

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, deleteDoc, doc, onSnapshot, query, where } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { BrandMark } from "@/components/BrandMark";
import { Avatar } from "@/components/Presence";
import { ThemeCards } from "@/components/ThemeCards";
import { InlineError } from "@/components/chat/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { firebaseAuth, firebaseDb } from "@/lib/firebaseClient";
import { getProfiles } from "@/lib/profiles";

interface BlockedEntry {
  docId: string;
  blockedId: string;
  name: string;
  avatarUrl?: string | null;
}

export default function SettingsPage() {
  const auth = useAuthUser();
  const uid = auth.user?.uid ?? null;
  const [blocked, setBlocked] = useState<BlockedEntry[]>([]);
  const [blocksError, setBlocksError] = useState<string | null>(null);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const db = firebaseDb();
    if (!db) return;
    const unsub = onSnapshot(
      query(collection(db, "blocks"), where("blockerId", "==", uid)),
      (snap) => {
        void (async () => {
          const ids = snap.docs.map((d) => String((d.data().blockedId as string | undefined) ?? ""));
          const profiles = await getProfiles(ids).catch(() => new Map());
          setBlocked(
            snap.docs.map((d) => {
              const blockedId = String((d.data().blockedId as string | undefined) ?? "");
              const p = profiles.get(blockedId);
              return {
                docId: d.id,
                blockedId,
                name: p?.displayName ?? "Unknown user",
                avatarUrl: p?.avatarUrl ?? null,
              };
            }),
          );
        })();
      },
      (e) => setBlocksError(e.message),
    );
    return unsub;
  }, [uid]);

  async function unblock(docId: string) {
    const db = firebaseDb();
    if (!db) return;
    setUnblocking(docId);
    try {
      await deleteDoc(doc(db, "blocks", docId));
    } catch (e) {
      setBlocksError(e instanceof Error ? e.message : "Could not unblock.");
    } finally {
      setUnblocking(null);
    }
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/session", { method: "DELETE" });
      const authClient = firebaseAuth();
      if (authClient) await signOut(authClient).catch(() => undefined);
    } finally {
      window.location.href = "/";
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="standalone-safe-top mx-auto flex max-w-3xl items-center justify-between px-6 pb-5">
        <Link href="/app" aria-label="Back to RUSH"><BrandMark /></Link>
      </header>
      <main className="settings-page mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-ink-500">Make RUSH feel like you.</p>
        <div className="settings-sections mt-6">
          <section id="appearance" className="appearance-section rounded-3xl border border-ink-200 bg-white p-4 shadow-card sm:p-6" aria-label="Appearance">
            <h2 className="font-display text-base font-semibold">Appearance</h2>
            <p className="mt-1 text-sm text-ink-500">Choose your colors. See the change instantly.</p>
            <ThemeCards />
            <p className="mt-2 text-xs text-ink-400">Motion respects your system reduced-motion setting.</p>
          </section>
          <section className="rounded-3xl border border-ink-200 bg-white p-6 shadow-card" aria-label="Profile settings">
            <h2 className="font-display text-base font-semibold">Profile</h2>
            <p className="mt-1 text-sm text-ink-500">Edit your display name, bio, and avatar.</p>
            <Link href="/profile" className="mt-3 inline-block rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-white">Open profile</Link>
          </section>
          <section className="rounded-3xl border border-ink-200 bg-white p-6 shadow-card" aria-label="Privacy settings">
            <h2 className="font-display text-base font-semibold">Privacy & blocked users</h2>
            <p className="mt-1 text-sm text-ink-500">Blocked people can&apos;t open direct conversations with you. Your block list is private.</p>
            <div className="mt-3">
              {blocksError && <InlineError message={blocksError} />}
              {!uid && <p className="text-sm text-ink-500">Log in to manage blocks.</p>}
              {uid && blocked.length === 0 && !blocksError && (
                <p className="text-sm text-ink-500">Nobody blocked. Block someone from a conversation&apos;s Info panel.</p>
              )}
              <ul className="mt-1 space-y-1.5">
                {blocked.map((b) => (
                  <li key={b.docId} className="flex items-center gap-3 rounded-2xl bg-paper px-3 py-2">
                    <Avatar name={b.name} size={32} src={b.avatarUrl ?? null} />
                    <span className="flex-1 truncate text-sm font-semibold">{b.name}</span>
                    <button
                      onClick={() => void unblock(b.docId)}
                      disabled={unblocking === b.docId}
                      className="rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-ink-100 disabled:opacity-60"
                    >
                      {unblocking === b.docId ? "Working…" : "Unblock"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="rounded-3xl border border-ink-200 bg-white p-6 shadow-card" aria-label="Session">
            <h2 className="font-display text-base font-semibold">Session</h2>
            <button
              onClick={() => void logout()}
              disabled={loggingOut}
              className="mt-1 rounded-xl border border-rush-300 px-4 py-2 text-sm font-semibold text-rush-700 hover:bg-rush-50 disabled:opacity-60"
            >
              {loggingOut ? "Logging out…" : "Log out on this device"}
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}
