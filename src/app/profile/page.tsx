"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { ProfileCard } from "@/components/ProfileCard";
import { useAuthUser } from "@/hooks/useAuthUser";
import { PROFILE_ACCENTS, type ProfileAccent, type ProfileEdit, type PublicProfileView } from "@/lib/profileModel";

type Draft = ProfileEdit & { avatarUrl: string | null; bannerUrl: string | null };
type Kind = "avatar" | "banner";
const toDraft = (p: PublicProfileView, privacy: { allowDMs: boolean; showMutualSpaces: boolean }): Draft => ({ username: p.username, displayName: p.displayName, bio: p.bio, status: p.status, profileAccent: p.profileAccent, links: p.links, avatarUrl: p.avatarUrl, bannerUrl: p.bannerUrl, ...privacy });

export default function ProfilePage() {
  const auth = useAuthUser();
  const [original, setOriginal] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [uid, setUid] = useState("");
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<Kind | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const staged = useRef<{ avatar?: string; banner?: string }>({});
  const request = useRef<XMLHttpRequest | null>(null);
  const dirty = Boolean(original && draft && JSON.stringify(original) !== JSON.stringify(draft));

  useEffect(() => {
    if (auth.status === "loading") return;
    if (auth.status !== "authed") { setLoading(false); return; }
    let active = true;
    fetch("/api/profile/me", { cache: "no-store" }).then(async r => {
      const body = await r.json(); if (!r.ok) throw new Error(body.error || "Could not load profile.");
      if (!active) return;
      const next = toDraft(body.profile, body.privacy);
      setUid(body.profile.uid); setCreatedAt(body.profile.createdAt); setOriginal(next); setDraft(next);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Could not load profile."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [auth.status]);
  useEffect(() => {
    if (!dirty) return;
    const warning = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warning); return () => window.removeEventListener("beforeunload", warning);
  }, [dirty]);
  function change<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(d => d ? { ...d, [key]: value } : d); setSuccess(false); }
  function discardUploads() {
    for (const id of Object.values(staged.current)) if (id) void fetch(`/api/attachments/upload?id=${id}`, { method: "DELETE" });
    staged.current = {};
  }
  function cancel() { request.current?.abort(); discardUploads(); setDraft(original); setError(null); setSuccess(false); }
  function guardNavigation(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!dirty) return;
    if (!window.confirm("Discard unsaved profile changes?")) { e.preventDefault(); return; }
    request.current?.abort(); discardUploads();
  }
  function remove(kind: Kind) {
    const id = staged.current[kind]; if (id) void fetch(`/api/attachments/upload?id=${id}`, { method: "DELETE" });
    delete staged.current[kind];
    setDraft(d => d ? { ...d, [`${kind}Url`]: null, [`${kind}UploadId`]: undefined, [`remove${kind === "avatar" ? "Avatar" : "Banner"}`]: true } : d);
    setSuccess(false);
  }
  function upload(file: File | undefined, kind: Kind) {
    if (!file || !uid) return;
    const max = kind === "avatar" ? 5 : 8;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) || file.size > max * 1024 * 1024) { setError(`${kind} must be an image under ${max} MB.`); return; }
    const form = new FormData(); form.set("file", file); form.set("scope", kind); form.set("scopeId", uid);
    const xhr = new XMLHttpRequest(); request.current = xhr; setUploading(kind); setProgress(0); setError(null);
    xhr.open("POST", "/api/attachments/upload");
    xhr.upload.onprogress = e => { if (e.lengthComputable) setProgress(Math.round(e.loaded * 100 / e.total)); };
    xhr.onload = () => {
      try {
        const result = JSON.parse(xhr.responseText);
        if (xhr.status !== 200 || !result.attachment?.url) throw new Error(result.error || "Upload failed. Try again.");
        const id = new URL(result.attachment.url, location.origin).searchParams.get("id");
        if (!id) throw new Error("Invalid upload response.");
        const prior = staged.current[kind]; if (prior) void fetch(`/api/attachments/upload?id=${prior}`, { method: "DELETE" });
        staged.current[kind] = id;
        setDraft(d => d ? { ...d, [`${kind}Url`]: result.attachment.url, [`${kind}UploadId`]: id, [`remove${kind === "avatar" ? "Avatar" : "Banner"}`]: false } : d);
      } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); }
      finally { setUploading(null); request.current = null; }
    };
    xhr.onerror = () => { setError("Upload failed. Check your connection and retry."); setUploading(null); request.current = null; };
    xhr.onabort = () => { setUploading(null); request.current = null; };
    xhr.send(form);
  }
  async function save() {
    if (!draft || !dirty || uploading) return;
    setSaving(true); setError(null); setSuccess(false);
    const { avatarUrl: _avatar, bannerUrl: _banner, ...payload } = draft;
    try {
      const r = await fetch("/api/profile/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await r.json(); if (!r.ok) throw new Error(result.error || "Could not save profile.");
      const next = toDraft(result.profile, result.privacy); staged.current = {}; setOriginal(next); setDraft(next); setCreatedAt(result.profile.createdAt); setSuccess(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save profile."); }
    finally { setSaving(false); }
  }
  const preview: PublicProfileView | null = draft ? { uid, username: draft.username, displayName: draft.displayName, bio: draft.bio, status: draft.status, profileAccent: draft.profileAccent, links: draft.links, avatarUrl: draft.avatarUrl, bannerUrl: draft.bannerUrl, createdAt, updatedAt: null } : null;
  return <div className="min-h-screen bg-paper">
    <header className="standalone-safe-top mx-auto flex max-w-6xl items-center justify-between px-4 pb-5 sm:px-6"><Link href="/app" onClick={guardNavigation} aria-label="Back to RUSH"><BrandMark /></Link><div className="flex gap-3"><Link href="/settings" onClick={guardNavigation} className="profile-text-link">Settings</Link>{original && <Link href={`/u/${original.username}`} onClick={guardNavigation} className="profile-text-link">View profile</Link>}</div></header>
    <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6"><p className="text-xs font-bold uppercase tracking-widest text-rush-600">Your space</p><h1 className="font-display text-3xl font-bold">Edit profile</h1><p className="mb-6 mt-1 text-sm text-ink-500">Make your RUSH profile feel like you.</p>
      {loading ? <p role="status">Loading profile…</p> : auth.status !== "authed" ? <Link href="/login">Log in to edit your profile</Link> : !draft || !preview ? <p role="alert">{error || "Profile unavailable."}</p> : <div className="profile-editor-grid">
        <div className="rounded-3xl border border-ink-200 bg-white p-5 shadow-card sm:p-7"><div className="mb-5 flex items-center justify-between"><h2 className="font-display text-lg font-bold">Profile details</h2><span className="text-xs text-ink-400">{dirty ? "Unsaved changes" : "Up to date"}</span></div>
          <div className="grid gap-4 sm:grid-cols-2"><label className="profile-field">Display name<input value={draft.displayName} maxLength={40} onChange={e => change("displayName", e.target.value)} /></label><label className="profile-field">Username<input value={draft.username} maxLength={20} autoCapitalize="none" onChange={e => change("username", e.target.value)} /><small>Your unique @name and profile link.</small></label></div>
          <label className="profile-field mt-4">Bio<textarea value={draft.bio} maxLength={160} rows={3} onChange={e => change("bio", e.target.value)} /><small>{draft.bio.length}/160</small></label>
          <label className="profile-field mt-4">Custom status<input value={draft.status} maxLength={80} placeholder="What are you up to?" onChange={e => change("status", e.target.value)} /></label>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">{(["avatar", "banner"] as const).map(kind => <div key={kind} className="rounded-2xl border border-ink-200 p-4"><p className="text-sm font-semibold capitalize">{kind}</p><p className="mb-3 text-xs text-ink-500">Image up to {kind === "avatar" ? 5 : 8} MB</p><label className="profile-upload">{uploading === kind ? `Uploading ${progress}%` : `Choose ${kind}`}<input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,image/gif" disabled={Boolean(uploading)} onChange={e => { upload(e.target.files?.[0], kind); e.target.value = ""; }} /></label><button type="button" className="ml-3 text-xs font-semibold text-ink-500" onClick={() => remove(kind)} disabled={Boolean(uploading)}>Remove</button>{uploading === kind && <progress value={progress} max={100} className="mt-3 w-full" />}</div>)}</div>
          <fieldset className="mt-6"><legend className="text-sm font-semibold">Profile accent</legend><div className="mt-2 flex flex-wrap gap-2">{(Object.keys(PROFILE_ACCENTS) as ProfileAccent[]).map(accent => <button type="button" key={accent} onClick={() => change("profileAccent", accent)} aria-pressed={draft.profileAccent === accent} className={`profile-accent-choice ${draft.profileAccent === accent ? "selected" : ""}`}><span style={{ background: PROFILE_ACCENTS[accent] }} />{accent}</button>)}</div></fieldset>
          <fieldset className="mt-6"><legend className="text-sm font-semibold">Links</legend><p className="text-xs text-ink-500">Up to three HTTPS links.</p>{draft.links.map((link, i) => <div key={i} className="mt-2 flex gap-2"><input aria-label={`Link ${i + 1} label`} placeholder="Label" maxLength={32} className="profile-input w-1/3" value={link.label} onChange={e => change("links", draft.links.map((v, n) => n === i ? { ...v, label: e.target.value } : v))} /><input aria-label={`Link ${i + 1} URL`} placeholder="https://" maxLength={300} type="url" className="profile-input min-w-0 flex-1" value={link.url} onChange={e => change("links", draft.links.map((v, n) => n === i ? { ...v, url: e.target.value } : v))} /><button type="button" aria-label={`Remove link ${i + 1}`} onClick={() => change("links", draft.links.filter((_, n) => n !== i))}>×</button></div>)}{draft.links.length < 3 && <button type="button" className="profile-text-link mt-2" onClick={() => change("links", [...draft.links, { label: "", url: "" }])}>+ Add link</button>}</fieldset>
          <fieldset className="mt-6 space-y-2"><legend className="text-sm font-semibold">Privacy</legend><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.allowDMs} onChange={e => change("allowDMs", e.target.checked)} />Allow new direct messages</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.showMutualSpaces} onChange={e => change("showMutualSpaces", e.target.checked)} />Show shared Spaces and Groups</label></fieldset>
          {error && <p role="alert" className="mt-5 text-sm text-rush-700">{error}</p>}{success && <p role="status" className="mt-5 text-sm font-semibold text-green-700">Profile saved.</p>}
          <div className="mt-6 flex gap-3"><button type="button" onClick={() => void save()} disabled={!dirty || saving || Boolean(uploading)} className="rounded-xl bg-rush-600 px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button><button type="button" onClick={cancel} disabled={!dirty || saving} className="rounded-xl border border-ink-200 px-5 py-2.5 text-sm font-semibold disabled:opacity-50">Cancel</button></div>
        </div><aside><p className="mb-3 text-xs font-bold uppercase tracking-widest text-ink-500">Live preview</p><ProfileCard profile={preview} /></aside>
      </div>}
    </main></div>;
}
