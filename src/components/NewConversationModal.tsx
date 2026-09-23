"use client";

// New conversation: search REAL RUSH users by username, select one, and open
// (or retrieve) the deterministic DM via POST /api/dm/open. No mock users.

import { useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { Avatar } from "@/components/Presence";
import { useUserSearch, type UserHit } from "@/hooks/useUserSearch";
import { InlineError } from "@/components/chat/States";

export function NewConversationModal({
  uid,
  onClose,
  onOpened,
}: {
  uid: string;
  onClose: () => void;
  onOpened: (conversationId: string, other: UserHit) => void;
}) {
  const [q, setQ] = useState("");
  const { hits, searching, error: searchError, search } = useUserSearch(uid);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  async function openDm(user: UserHit) {
    setOpening(user.uid);
    setOpenError(null);
    try {
      const res = await fetch("/api/dm/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otherUid: user.uid }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error || "Could not open conversation.");
      onOpened(body.id, user);
    } catch (e) {
      setOpenError(e instanceof Error ? e.message : "Could not open conversation.");
    } finally {
      setOpening(null);
    }
  }

  return (
    <Modal title="New conversation" subtitle="Find someone by username to start chatting." onClose={onClose}>
      <label htmlFor="user-search" className="text-xs font-semibold text-ink-700">
        Username
      </label>
      <input
        id="user-search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          void search(e.target.value);
        }}
        placeholder="e.g. adarush"
        autoComplete="off"
        className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm placeholder:text-ink-400"
      />
      <div className="mt-3 min-h-[120px]">
        {searchError && <InlineError message={searchError} onRetry={() => search(q)} />}
        {searching && <p className="py-4 text-center text-sm text-ink-500">Searching…</p>}
        {!searching && q.trim().length > 0 && hits.length === 0 && !searchError && (
          <p className="py-4 text-center text-sm text-ink-500">No RUSH users match “{q.trim()}”.</p>
        )}
        {!searching && q.trim().length === 0 && (
          <p className="py-4 text-center text-sm text-ink-500">Type at least one character to search.</p>
        )}
        <ul className="space-y-1">
          {hits.map((h) => (
            <li key={h.uid} className="flex items-center gap-1">
              <button
                onClick={() => openDm(h)}
                disabled={opening != null}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-paper disabled:opacity-60"
              >
                <Avatar name={h.displayName} size={36} src={h.avatarUrl ?? null} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-900">{h.displayName}</span>
                  <span className="block truncate text-xs text-ink-500">@{h.username}</span>
                </span>
                {opening === h.uid ? (
                  <span className="text-xs font-semibold text-ink-500">Opening…</span>
                ) : (
                  <span className="rounded-xl bg-ink-900 px-3 py-1.5 text-xs font-semibold text-white">Chat</span>
                )}
              </button>
              <Link href={`/u/${h.username}`} className="shrink-0 rounded-xl px-2 py-2 text-xs font-semibold text-rush-700 hover:bg-paper">Profile</Link>
            </li>
          ))}
        </ul>
        {openError && (
          <div className="mt-2">
            <InlineError message={openError} />
          </div>
        )}
      </div>
    </Modal>
  );
}
