"use client";

// Block / unblock a DM counterpart. Writes go directly to Firestore with the
// deterministic doc id enforced by firestore.rules ({blocker}_{blocked}).
// Blocking is private: only the blocker can read their own edges.

import { useState } from "react";
import { deleteDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "@/lib/firebaseClient";
import { blockDocId } from "@/lib/blocking";

export function BlockButton({
  uid,
  otherUid,
  blocked,
  onChanged,
}: {
  uid: string;
  otherUid: string;
  blocked: boolean;
  onChanged: (blocked: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const db = firebaseDb();
    if (!db) {
      setError("Backend is not connected.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ref = doc(db, "blocks", blockDocId(uid, otherUid));
      if (blocked) {
        await deleteDoc(ref);
        onChanged(false);
      } else {
        await setDoc(ref, { blockerId: uid, blockedId: otherUid, createdAt: serverTimestamp() });
        onChanged(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update block.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={toggle}
        disabled={busy}
        className={`w-full rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
          blocked
            ? "border-ink-200 text-ink-700 hover:bg-paper"
            : "border-rush-300 text-rush-700 hover:bg-rush-50"
        }`}
      >
        {busy ? "Working…" : blocked ? "Unblock user" : "Block user"}
      </button>
      {error && <p role="alert" className="mt-1 text-xs text-rush-700">{error}</p>}
    </div>
  );
}
