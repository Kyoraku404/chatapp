"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { BrandMark } from "@/components/BrandMark";
import { Avatar } from "@/components/Presence";
import { InlineError } from "@/components/chat/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { firebaseDb } from "@/lib/firebaseClient";

// Public profile: resolves usernameLower → users doc (signed-in readers per
// rules). Guests see the profile shell plus a login prompt; the message
// action opens/creates the real deterministic DM and jumps into /app.
export default function PublicProfilePage({ params }: { params: { username: string } }) {
  const username = decodeURIComponent(params.username).toLowerCase();
  const router = useRouter();
  const auth = useAuthUser();
  const [profile, setProfile] = useState<{ uid: string; displayName: string; bio: string; avatarUrl: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messaging, setMessaging] = useState(false);

  useEffect(() => {
    const db = firebaseDb();
    if (!db) {
      setError("Backend is not connected.");
      setLoading(false);
      return;
    }
    if (auth.status === "loading") return;
    if (auth.status !== "authed") {
      setLoading(false);
      return; // guests get the login prompt below
    }
    void getDocs(query(collection(db, "users"), where("usernameLower", "==", username), limit(1)))
      .then((snap) => {
        const d = snap.docs[0];
        if (!d) {
          setError(`No RUSH user named @${username} exists.`);
          return;
        }
        const data = d.data();
        setProfile({
          uid: d.id,
          displayName: String(data.displayName ?? "Unknown user"),
          bio: String(data.bio ?? ""),
          avatarUrl: (data.avatarUrl as string | null | undefined) ?? null,
        });
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [username, auth.status]);

  async function message() {
    if (!profile) return;
    setMessaging(true);
    setError(null);
    try {
      const res = await fetch("/api/dm/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otherUid: profile.uid }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error || "Could not open conversation.");
      router.push(`/app?dm=${encodeURIComponent(body.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open conversation.");
    } finally {
      setMessaging(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Link href="/" aria-label="RUSH home"><BrandMark /></Link>
        <Link href="/app" className="rounded-xl bg-rush-600 px-4 py-2 text-sm font-semibold text-white">Open RUSH</Link>
      </header>
      <main className="mx-auto max-w-3xl px-6 pb-16">
        <section className="rounded-3xl border border-ink-200 bg-white p-8 text-center shadow-card" aria-label="Public profile">
          {loading ? (
            <div className="mx-auto h-32 w-48 animate-pulse rounded-2xl bg-ink-100" role="status" aria-label="Loading profile" />
          ) : error ? (
            <>
              <h1 className="font-display mt-4 text-2xl font-bold">@{username}</h1>
              <div className="mx-auto mt-3 max-w-sm">
                <InlineError message={error} />
              </div>
            </>
          ) : auth.status !== "authed" ? (
            <>
              <div className="mx-auto w-fit"><Avatar name={username} size={80} src={null} /></div>
              <h1 className="font-display mt-4 text-2xl font-bold">@{username}</h1>
              <p className="mt-1 text-sm text-ink-500">Log in to see this profile and send a message.</p>
              <Link href="/login" className="mt-4 inline-block rounded-2xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white">
                Log in
              </Link>
            </>
          ) : profile ? (
            <>
              <div className="mx-auto w-fit">
                <Avatar name={profile.displayName} size={80} src={profile.avatarUrl} />
              </div>
              <h1 className="font-display mt-4 text-2xl font-bold">{profile.displayName}</h1>
              <p className="text-sm text-ink-500">@{username}</p>
              {profile.bio && <p className="mx-auto mt-2 max-w-sm text-sm text-ink-600">{profile.bio}</p>}
              <button
                onClick={() => void message()}
                disabled={messaging}
                className="mt-4 rounded-2xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-60"
              >
                {messaging ? "Opening…" : "Message"}
              </button>
            </>
          ) : null}
        </section>
      </main>
    </div>
  );
}
