"use client";

// Prefix search over RUSH users by username.
// Honest Firestore search: orderBy(usernameLower) + startAt/endAt bounds,
// capped at USER_SEARCH_LIMIT. Requires a live backend + signed-in user
// (users docs are readable to signed-in users per firestore.rules).

import { useCallback, useRef, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { endAt, startAt } from "firebase/firestore";
import { firebaseDb } from "@/lib/firebaseClient";
import { USER_SEARCH_LIMIT, normalizeSearchPrefix, prefixBounds } from "@/lib/search";
import type { PublicProfile } from "@/lib/profiles";

export interface UserHit extends PublicProfile {
  bio?: string;
}

export function useUserSearch(selfUid: string | null) {
  const [hits, setHits] = useState<UserHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const search = useCallback(
    async (raw: string) => {
      const prefix = normalizeSearchPrefix(raw);
      const mySeq = ++seq.current;
      if (prefix.length < 1) {
        setHits([]);
        setError(null);
        return;
      }
      const db = firebaseDb();
      if (!db) {
        setError("Backend is not connected.");
        return;
      }
      setSearching(true);
      setError(null);
      try {
        const { start, end } = prefixBounds(prefix);
        const q = query(
          collection(db, "users"),
          orderBy("usernameLower"),
          startAt(start),
          endAt(end),
          limit(USER_SEARCH_LIMIT + 1),
        );
        const snap = await getDocs(q);
        if (mySeq !== seq.current) return; // stale response
        const out: UserHit[] = [];
        for (const d of snap.docs) {
          if (d.id === selfUid) continue;
          const data = d.data();
          out.push({
            uid: d.id,
            displayName: String(data.displayName ?? "Unknown user"),
            username: String(data.username ?? "unknown"),
            avatarUrl: (data.avatarUrl as string | null | undefined) ?? null,
            bio: typeof data.bio === "string" ? data.bio : undefined,
          });
          if (out.length >= USER_SEARCH_LIMIT) break;
        }
        setHits(out);
      } catch (e) {
        if (mySeq !== seq.current) return;
        setError(e instanceof Error ? e.message : "Search failed.");
        setHits([]);
      } finally {
        if (mySeq === seq.current) setSearching(false);
      }
    },
    [selfUid],
  );

  return { hits, searching, error, search };
}
