"use client";

// Live spaces for the signed-in user.
// - Memberships resolve via collectionGroup("members") where userId == uid
//   (index in firestore.indexes.json; each doc readable by its owner).
// - Space docs, channels (orderBy sortOrder), and member lists subscribe live.
// - Unread is intentionally absent for channels: channel docs carry no
//   activity watermark, and we refuse to fake one.

import { useEffect, useState } from "react";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { firebaseDb } from "@/lib/firebaseClient";
import { getProfiles, type PublicProfile } from "@/lib/profiles";
import type { SpaceRole } from "@/lib/types";

export interface LiveSpace {
  id: string;
  name: string;
  description: string;
  visibility: "PRIVATE" | "PUBLIC";
  role: SpaceRole;
}

export interface LiveChannel {
  id: string;
  name: string;
  topic: string;
  sortOrder: number;
}

export interface SpaceMember extends PublicProfile {
  role: SpaceRole;
}

export function useSpaces(uid: string | null) {
  const [spaces, setSpaces] = useState<LiveSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setSpaces([]);
      setLoading(false);
      return;
    }
    const db = firebaseDb();
    if (!db) {
      setError("Backend is not connected.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    async function loadFromServer() {
      try {
        const response = await fetch("/api/spaces", { cache: "no-store" });
        const body = (await response.json()) as { spaces?: LiveSpace[]; error?: string };
        if (!response.ok || !body.spaces) throw new Error(body.error || "Could not load spaces.");
        if (cancelled) return;
        setSpaces(body.spaces);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load spaces.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    function refreshIfVisible() {
      if (document.visibilityState === "visible") void loadFromServer();
    }
    function startServerFallback() {
      if (fallbackTimer) return;
      void loadFromServer();
      fallbackTimer = setInterval(refreshIfVisible, 10000);
      window.addEventListener("focus", refreshIfVisible);
      window.addEventListener("rush:spaces-changed", loadFromServer);
    }
    const unsub = onSnapshot(
      query(collectionGroup(db, "members"), where("userId", "==", uid), orderBy("joinedAt", "desc")),
      (snap) => {
        if (cancelled) return;
        void (async () => {
          const out: LiveSpace[] = [];
          for (const m of snap.docs) {
            const md = m.data();
            const spaceId = String(md.spaceId ?? m.ref.parent.parent?.id ?? "");
            if (!spaceId) continue;
            try {
              const s = await getDoc(doc(db, "spaces", spaceId));
              if (!s.exists() || cancelled) continue;
              const sd = s.data();
              out.push({
                id: s.id,
                name: String(sd.name ?? "Space"),
                description: String(sd.description ?? ""),
                visibility: sd.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE",
                role: (md.role as SpaceRole) ?? "MEMBER",
              });
            } catch {
              // Unreadable space (left/kicked): skip honestly.
            }
          }
          if (!cancelled) {
            setSpaces(out);
            setLoading(false);
          }
        })().catch((e: Error) => {
          if (!cancelled) {
            setError(e.message);
            setLoading(false);
          }
        });
      },
      (e) => {
        if (!cancelled) {
          if (e.code === "permission-denied") startServerFallback();
          else {
            setError(e.message);
            setLoading(false);
          }
        }
      },
    );
    return () => {
      cancelled = true;
      unsub();
      if (fallbackTimer) clearInterval(fallbackTimer);
      window.removeEventListener("focus", refreshIfVisible);
      window.removeEventListener("rush:spaces-changed", loadFromServer);
    };
  }, [uid]);

  return { spaces, loading, error };
}

export function useChannels(spaceId: string | null) {
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!spaceId) {
      setChannels([]);
      setLoading(false);
      return;
    }
    const db = firebaseDb();
    if (!db) {
      setError("Backend is not connected.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      query(collection(db, "spaces", spaceId, "channels"), orderBy("sortOrder")),
      (snap) => {
        setChannels(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: String(data.name ?? "channel"),
              topic: String(data.topic ?? ""),
              sortOrder: Number(data.sortOrder ?? 0),
            };
          }),
        );
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
    return unsub;
  }, [spaceId]);

  return { channels, loading, error };
}

export function useSpaceMembers(spaceId: string | null) {
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!spaceId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    const db = firebaseDb();
    if (!db) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const unsub = onSnapshot(
      collection(db, "spaces", spaceId, "members"),
      (snap) => {
        if (cancelled) return;
        void (async () => {
          const rows = snap.docs.map((d) => ({
            uid: String((d.data().userId as string | undefined) ?? d.id),
            role: ((d.data().role as SpaceRole | undefined) ?? "MEMBER") as SpaceRole,
          }));
          const profiles = await getProfiles(rows.map((r) => r.uid)).catch(() => new Map());
          if (cancelled) return;
          setMembers(
            rows.map((r) => ({
              uid: r.uid,
              role: r.role,
              displayName: profiles.get(r.uid)?.displayName ?? "Unknown user",
              username: profiles.get(r.uid)?.username ?? "unknown",
              avatarUrl: profiles.get(r.uid)?.avatarUrl ?? null,
            })),
          );
          setLoading(false);
        })();
      },
      () => {
        if (!cancelled) setLoading(false);
      },
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [spaceId]);

  return { members, loading };
}
