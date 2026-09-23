"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { ProfileCard } from "@/components/ProfileCard";
import { useAuthUser } from "@/hooks/useAuthUser";
import type { PublicProfileView } from "@/lib/profileModel";

type Result = { profile: PublicProfileView; mutualSpaces: { id: string; name: string }[]; mutualGroups: { id: string; name: string }[]; canMessage: boolean };

export default function PublicProfilePage({ params, searchParams }: { params: { username: string }; searchParams: { dm?: string } }) {
  const username = decodeURIComponent(params.username).toLowerCase();
  const backHref = typeof searchParams.dm === "string" && /^dm_[A-Za-z0-9_-]{3,280}$/.test(searchParams.dm) ? `/app?dm=${encodeURIComponent(searchParams.dm)}` : "/app";
  const auth = useAuthUser();
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [messaging, setMessaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (auth.status === "loading") return;
    if (auth.status !== "authed") { setLoading(false); return; }
    let active = true;
    setLoading(true);
    fetch(`/api/profile/public?username=${encodeURIComponent(username)}`, { cache: "no-store" }).then(async r => {
      const body = await r.json(); if (!r.ok) throw new Error(body.error || "Profile unavailable.");
      if (active) setResult(body);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Profile unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [username, auth.status]);
  async function message() {
    if (!result) return;
    setMessaging(true); setError(null);
    try {
      const r = await fetch("/api/dm/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ otherUid: result.profile.uid }) });
      const body = await r.json(); if (!r.ok || !body.id) throw new Error(body.error || "Could not open conversation.");
      router.push(`/app?dm=${encodeURIComponent(body.id)}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not open conversation."); }
    finally { setMessaging(false); }
  }
  return <div className="min-h-screen bg-paper"><header className="standalone-safe-top mx-auto flex max-w-3xl items-center justify-between px-4 pb-5 sm:px-6"><Link href={backHref} aria-label="Back to RUSH"><BrandMark /></Link><Link href={backHref} className="profile-text-link">Back to conversation</Link></header>
    <main className="mx-auto max-w-2xl px-4 pb-20 sm:px-6">{loading ? <p role="status">Loading profile…</p> : auth.status !== "authed" ? <div className="rounded-3xl bg-white p-8 text-center shadow-card"><h1 className="font-display text-2xl font-bold">@{username}</h1><p className="my-4 text-sm text-ink-500">Log in to view this RUSH profile.</p><Link href="/login" className="profile-primary">Log in</Link></div> : result ? <><ProfileCard profile={result.profile} mutualSpaces={result.mutualSpaces} mutualGroups={result.mutualGroups} actions={result.profile.uid === auth.user?.uid ? <Link href="/profile" className="profile-primary">Edit profile</Link> : result.canMessage ? <button type="button" onClick={() => void message()} disabled={messaging} className="profile-primary disabled:opacity-50">{messaging ? "Opening…" : "Message"}</button> : undefined} />{error && <p role="alert" className="mt-3 text-sm text-rush-700">{error}</p>}</> : <p role="alert" className="rounded-2xl bg-white p-6 text-sm">{error || "Profile unavailable."}</p>}</main></div>;
}
