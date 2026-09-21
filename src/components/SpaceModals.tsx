"use client";

// Space creation / joining / channel creation. Creation and joining go
// through the Admin API routes (membership docs are Admin-only per rules);
// the invite-code flow reuses POST /api/invites + /api/invites/redeem.

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { InlineError } from "@/components/chat/States";

export function CreateSpaceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (spaceId: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (name.trim().length < 2) {
      setError("Give the space a name (2+ characters).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), visibility }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error || "Could not create space.");
      onCreated(body.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create space.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New space" subtitle="A home for a community, with channels." onClose={onClose}>
      <label htmlFor="space-name" className="text-xs font-semibold text-ink-700">Space name</label>
      <input
        id="space-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. OCN Developers"
        maxLength={40}
        className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm placeholder:text-ink-400"
      />
      <label htmlFor="space-desc" className="mt-3 block text-xs font-semibold text-ink-700">
        Description <span className="font-normal text-ink-400">(optional)</span>
      </label>
      <input
        id="space-desc"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What is this space about?"
        maxLength={140}
        className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm placeholder:text-ink-400"
      />
      <fieldset className="mt-3">
        <legend className="text-xs font-semibold text-ink-700">Visibility</legend>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(["PRIVATE", "PUBLIC"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisibility(v)}
              aria-pressed={visibility === v}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                visibility === v ? "border-rush-600 bg-rush-50 text-rush-700" : "border-ink-200 text-ink-600"
              }`}
            >
              {v === "PRIVATE" ? "Private" : "Public"}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-400">
          {visibility === "PRIVATE"
            ? "Only people you invite can find and join."
            : "Anyone signed in can read; only invited members can write."}
        </p>
      </fieldset>
      {error && (
        <div className="mt-2">
          <InlineError message={error} />
        </div>
      )}
      <button
        onClick={create}
        disabled={busy}
        className="mt-4 w-full rounded-2xl bg-rush-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rush-700 disabled:opacity-60"
      >
        {busy ? "Creating…" : "Create space"}
      </button>
    </Modal>
  );
}

export function JoinSpaceModal({
  onClose,
  onJoined,
  initialCode = "",
}: {
  onClose: () => void;
  onJoined: (spaceId: string) => void;
  initialCode?: string;
}) {
  const [code, setCode] = useState(initialCode);
  const [spaceIdInput, setSpaceIdInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Paste an invite code first.");
      return;
    }
    // Codes may arrive as a full link: /join?space=X&code=Y.
    const link = /[?&]space=([^&]+).*?[?&]code=([^&]+)/.exec(trimmed);
    const sid = link?.[1]
      ? decodeURIComponent(link[1])
      : spaceIdInput.trim() || null;
    const inviteCode = link?.[2] ? decodeURIComponent(link[2]) : trimmed;
    if (!sid) {
      setError("Paste the full invite link, or add the space ID below.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invites/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: sid, code: inviteCode }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Could not join space.");
      onJoined(sid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join space.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Join a space" subtitle="Paste the invite link you received." onClose={onClose}>
      <label htmlFor="join-code" className="text-xs font-semibold text-ink-700">Invite link or code</label>
      <input
        id="join-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="https://…/join?space=…&code=…"
        autoComplete="off"
        className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm placeholder:text-ink-400"
      />
      <label htmlFor="join-space" className="mt-3 block text-xs font-semibold text-ink-700">
        Space ID <span className="font-normal text-ink-400">(only needed for a bare code)</span>
      </label>
      <input
        id="join-space"
        value={spaceIdInput}
        onChange={(e) => setSpaceIdInput(e.target.value)}
        placeholder="e.g. abc123…"
        autoComplete="off"
        className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm placeholder:text-ink-400"
      />
      {error && (
        <div className="mt-2">
          <InlineError message={error} />
        </div>
      )}
      <button
        onClick={join}
        disabled={busy}
        className="mt-4 w-full rounded-2xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-60"
      >
        {busy ? "Joining…" : "Join space"}
      </button>
    </Modal>
  );
}

export function CreateChannelModal({
  spaceId,
  onClose,
  onCreated,
}: {
  spaceId: string;
  onClose: () => void;
  onCreated: (channelId: string) => void;
}) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const clean = name.trim().toLowerCase().replace(/\s+/g, "-");
    if (clean.length < 2) {
      setError("Give the channel a name (2+ characters).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/spaces/${encodeURIComponent(spaceId)}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean, topic: topic.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error || "Could not create channel.");
      onCreated(body.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create channel.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="New channel" subtitle="Channels organize a space by topic." onClose={onClose}>
      <label htmlFor="channel-name" className="text-xs font-semibold text-ink-700">Channel name</label>
      <input
        id="channel-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. projects"
        maxLength={30}
        className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm placeholder:text-ink-400"
      />
      <label htmlFor="channel-topic" className="mt-3 block text-xs font-semibold text-ink-700">
        Topic <span className="font-normal text-ink-400">(optional)</span>
      </label>
      <input
        id="channel-topic"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="What is this channel for?"
        maxLength={120}
        className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm placeholder:text-ink-400"
      />
      {error && (
        <div className="mt-2">
          <InlineError message={error} />
        </div>
      )}
      <button
        onClick={create}
        disabled={busy}
        className="mt-4 w-full rounded-2xl bg-rush-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rush-700 disabled:opacity-60"
      >
        {busy ? "Creating…" : "Create channel"}
      </button>
    </Modal>
  );
}
