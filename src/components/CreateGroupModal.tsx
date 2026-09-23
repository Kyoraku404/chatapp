"use client";

// Create a private group: name + member picker (real user search), then a
// client-direct create allowed by firestore.rules (ownerId == self, self in
// memberIds). Membership later changes go through the Admin API.

import { useState } from "react";
import Link from "next/link";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "@/lib/firebaseClient";
import { Modal } from "@/components/Modal";
import { Avatar } from "@/components/Presence";
import { useUserSearch, type UserHit } from "@/hooks/useUserSearch";
import { InlineError } from "@/components/chat/States";

export function CreateGroupModal({
  uid,
  onClose,
  onCreated,
}: {
  uid: string;
  onClose: () => void;
  onCreated: (groupId: string) => void;
}) {
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [members, setMembers] = useState<UserHit[]>([]);
  const { hits, searching, search } = useUserSearch(uid);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Give the group a name (2+ characters).");
      return;
    }
    const db = firebaseDb();
    if (!db) {
      setError("Backend is not connected.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const memberIds = [...new Set([uid, ...members.map((m) => m.uid)])];
      const ref = await addDoc(collection(db, "groups"), {
        kind: "group",
        name: trimmed.slice(0, 40),
        ownerId: uid,
        memberIds,
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        lastMessagePreview: "Group created",
      });
      onCreated(ref.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create group.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New group" subtitle="Name it, add people, start talking." onClose={onClose}>
      <label htmlFor="group-name" className="text-xs font-semibold text-ink-700">
        Group name
      </label>
      <input
        id="group-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Design crew"
        maxLength={40}
        className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm placeholder:text-ink-400"
      />
      {members.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Selected members">
          {members.map((m) => (
            <span key={m.uid} className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 py-1 pl-1 pr-2 text-xs font-semibold">
              <Avatar name={m.displayName} size={20} />@{m.username}
              <button
                onClick={() => setMembers((prev) => prev.filter((x) => x.uid !== m.uid))}
                aria-label={`Remove ${m.displayName}`}
                className="rounded-full px-1 text-ink-500 hover:text-ink-900"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <label htmlFor="group-search" className="mt-3 block text-xs font-semibold text-ink-700">
        Add people
      </label>
      <input
        id="group-search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          void search(e.target.value);
        }}
        placeholder="Search by username"
        autoComplete="off"
        className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm placeholder:text-ink-400"
      />
      <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto">
        {searching && <li className="py-2 text-center text-sm text-ink-500">Searching…</li>}
        {hits
          .filter((h) => !members.some((m) => m.uid === h.uid))
          .map((h) => (
            <li key={h.uid} className="flex items-center gap-1">
              <button
                onClick={() => setMembers((prev) => [...prev, h])}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-paper"
              >
                <Avatar name={h.displayName} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{h.displayName}</span>
                  <span className="block truncate text-xs text-ink-500">@{h.username}</span>
                </span>
                <span className="text-xs font-semibold text-rush-700">Add</span>
              </button>
              <Link href={`/u/${h.username}`} className="shrink-0 rounded-xl px-2 py-2 text-xs font-semibold text-rush-700 hover:bg-paper">Profile</Link>
            </li>
          ))}
      </ul>
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
        {busy ? "Creating…" : `Create group${members.length > 0 ? ` with ${members.length + 1} people` : ""}`}
      </button>
    </Modal>
  );
}
