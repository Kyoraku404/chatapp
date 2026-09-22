"use client";

// Own profile: loads the real Firestore profile, edits displayName/bio
// (rules: displayName 1–40, bio ≤160, username immutable), and sets an
// avatar via a free https:// image URL stored as users/{uid}.avatarUrl.
// No Firebase Storage uploads (Spark plan has no Storage bucket).

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { BrandMark } from "@/components/BrandMark";
import { Avatar } from "@/components/Presence";
import { InlineError } from "@/components/chat/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { firebaseDb } from "@/lib/firebaseClient";
import { validateAvatarUrl, validateBio, validateDisplayName } from "@/lib/validation";

export default function ProfilePage() {
  const auth = useAuthUser();
  const uid = auth.user?.uid ?? null;
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarInput, setAvatarInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (auth.status !== "authed" || !uid) {
      if (auth.status !== "loading") setLoading(false);
      return;
    }
    const db = firebaseDb();
    if (!db) {
      setError("Backend is not connected.");
      setLoading(false);
      return;
    }
    void getDoc(doc(db, "users", uid))
      .then((snap) => {
        if (!snap.exists()) {
          setError("No profile found for this account.");
          return;
        }
        const d = snap.data();
        setDisplayName(String(d.displayName ?? ""));
        setUsername(String(d.username ?? ""));
        setBio(String(d.bio ?? ""));
        const current = (d.avatarUrl as string | null | undefined) ?? null;
        setAvatarUrl(current);
        setAvatarInput(current ?? "");
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [auth.status, uid]);

  async function save() {
    const dnErr = validateDisplayName(displayName);
    if (dnErr) {
      setError(dnErr);
      return;
    }
    const bioErr = validateBio(bio);
    if (bioErr) {
      setError(bioErr);
      return;
    }
    const db = firebaseDb();
    if (!db || !uid) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateDoc(doc(db, "users", uid), { displayName: displayName.trim(), bio: bio.trim() });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAvatar() {
    const db = firebaseDb();
    if (!db || !uid) {
      setError("Backend is not connected.");
      return;
    }
    const v = avatarInput.trim();
    if (!v) {
      setError("Paste an https:// image URL, or use Remove to go back to initials.");
      return;
    }
    const err = validateAvatarUrl(v);
    if (err) {
      setError(err);
      return;
    }
    setSavingAvatar(true);
    setError(null);
    setSaved(false);
    try {
      await updateDoc(doc(db, "users", uid), { avatarUrl: v });
      setAvatarUrl(v);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save avatar.");
    } finally {
      setSavingAvatar(false);
    }
  }

  async function removeAvatar() {
    const db = firebaseDb();
    if (!db || !uid) return;
    setSavingAvatar(true);
    setError(null);
    setSaved(false);
    try {
      await updateDoc(doc(db, "users", uid), { avatarUrl: null });
      setAvatarUrl(null);
      setAvatarInput("");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove avatar.");
    } finally {
      setSavingAvatar(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="standalone-safe-top mx-auto flex max-w-3xl items-center justify-between px-6 pb-5">
        <Link href="/app" aria-label="Back to RUSH"><BrandMark /></Link>
        <Link href="/settings" className="rounded-xl border border-ink-200 bg-white px-4 py-2 text-sm font-semibold hover:border-ink-300">
          Settings
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-6 pb-16">
        <section className="rounded-3xl border border-ink-200 bg-white p-8 shadow-card" aria-label="Your profile">
          {loading ? (
            <div className="h-32 animate-pulse rounded-2xl bg-ink-100" role="status" aria-label="Loading profile" />
          ) : auth.status !== "authed" ? (
            <div className="text-center">
              <h1 className="font-display text-2xl font-bold">You&apos;re signed out</h1>
              <Link href="/login" className="mt-3 inline-block rounded-2xl bg-rush-600 px-5 py-2.5 text-sm font-semibold text-white">
                Log in
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <Avatar name={displayName || "You"} size={72} src={avatarUrl} />
                <div>
                  <h1 className="font-display text-2xl font-bold tracking-tight">Your profile</h1>
                  <p className="mt-1 text-xs text-ink-500">
                    Free V1 avatars use an image URL — no uploads, no Storage needed.
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-ink-200 bg-paper p-4">
                <label htmlFor="profile-avatar" className="text-xs font-semibold text-ink-700">
                  Avatar image URL (https://)
                </label>
                <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="profile-avatar"
                    value={avatarInput}
                    onChange={(e) => setAvatarInput(e.target.value)}
                    placeholder="https://example.com/you.png"
                    inputMode="url"
                    autoComplete="off"
                    maxLength={2048}
                    className="min-w-0 flex-1 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm placeholder:text-ink-400"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => void saveAvatar()}
                      disabled={savingAvatar}
                      className="rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-60"
                    >
                      {savingAvatar ? "Saving…" : "Save avatar"}
                    </button>
                    {avatarUrl && (
                      <button
                        onClick={() => void removeAvatar()}
                        disabled={savingAvatar}
                        className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-ink-100 disabled:opacity-60"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs text-ink-400">
                  Paste any public https:// image link. Only the URL is stored in Firestore; initials stay as fallback.
                </p>
              </div>
              <div className="mt-6 space-y-3 text-sm">
                <div>
                  <label htmlFor="profile-name" className="text-xs font-semibold text-ink-700">Display name</label>
                  <input
                    id="profile-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={40}
                    className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2.5"
                  />
                </div>
                <div>
                  <span className="text-xs font-semibold text-ink-700">Username (permanent)</span>
                  <p className="mt-1 rounded-xl bg-paper px-3 py-2.5 font-semibold">@{username || "—"}</p>
                </div>
                <div>
                  <label htmlFor="profile-bio" className="text-xs font-semibold text-ink-700">Bio</label>
                  <textarea
                    id="profile-bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={160}
                    rows={2}
                    placeholder="Tell people who you are in 160 characters."
                    className="mt-1 w-full resize-none rounded-xl border border-ink-200 px-3 py-2.5"
                  />
                </div>
              </div>
              {error && (
                <div className="mt-3">
                  <InlineError message={error} />
                </div>
              )}
              {saved && !error && (
                <p role="status" className="mt-3 text-sm font-semibold text-green-700">Saved.</p>
              )}
              <button
                onClick={() => void save()}
                disabled={saving}
                className="mt-4 rounded-2xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save profile"}
              </button>
              <p className="mt-4 text-xs text-ink-400">
                Only avatar, display name, username, bio, and status are ever public.
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
