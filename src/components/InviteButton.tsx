"use client";

// Space invite creation (POST /api/invites, MODERATOR+ enforced server-side).
// Renders the full bearer link; the code alone is useless without the space.

import { useState } from "react";
import { InlineError } from "@/components/chat/States";

export function InviteButton({ spaceId }: { spaceId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId, ttlHours: 168 }),
      });
      const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      if (!res.ok || !body.code) throw new Error(body.error || "Could not create invite.");
      setLink(`${window.location.origin}/join?space=${encodeURIComponent(spaceId)}&code=${encodeURIComponent(body.code)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create invite.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed — select the link manually.");
    }
  }

  if (link) {
    return (
      <div className="rounded-2xl bg-paper p-3">
        <p className="text-xs font-semibold text-ink-700">Invite link (expires in 7 days)</p>
        <p className="mt-1 break-all text-xs text-ink-500">{link}</p>
        <div className="mt-2 flex gap-2">
          <button onClick={copy} className="rounded-xl bg-ink-900 px-3 py-1.5 text-xs font-semibold text-white">
            {copied ? "Copied!" : "Copy link"}
          </button>
          <button
            onClick={() => {
              setLink(null);
              setCopied(false);
            }}
            className="rounded-xl border border-ink-200 px-3 py-1.5 text-xs font-semibold"
          >
            New link
          </button>
        </div>
        {error && (
          <div className="mt-2">
            <InlineError message={error} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={create}
        disabled={busy}
        className="w-full rounded-xl bg-rush-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rush-700 disabled:opacity-60"
      >
        {busy ? "Creating…" : "Create invite link"}
      </button>
      {error && (
        <div className="mt-2">
          <InlineError message={error} />
        </div>
      )}
    </div>
  );
}
