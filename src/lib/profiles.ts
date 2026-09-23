// Batched public-profile resolution with an in-memory cache.
// Only public fields are ever read (users docs are world-readable to
// signed-in users per firestore.rules). Never used for authorization.

import { doc, getDoc } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

export interface PublicProfile {
  uid: string;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  status?: string | null;
}

const cache = new Map<string, PublicProfile>();
const fetchedAt = new Map<string, number>();
const PROFILE_TTL_MS = 20_000;

export function profileCacheGet(uid: string): PublicProfile | undefined {
  return cache.get(uid);
}

export function profileCachePrime(p: PublicProfile): void {
  cache.set(p.uid, p);
  fetchedAt.set(p.uid, Date.now());
}

function fallback(uid: string): PublicProfile {
  return { uid, displayName: "Unknown user", username: "unknown", avatarUrl: null, status: null };
}

export async function getProfiles(uids: string[]): Promise<Map<string, PublicProfile>> {
  const out = new Map<string, PublicProfile>();
  const db = firebaseDb();
  const missing = [...new Set(uids.filter(Boolean))].filter((u) => !cache.has(u) || Date.now() - (fetchedAt.get(u) ?? 0) > PROFILE_TTL_MS);
  if (db && missing.length > 0) {
    // Bounded fan-out: one doc read per distinct unknown uid, then cached.
    const results = await Promise.all(
      missing.slice(0, 50).map(async (u) => {
        try {
          const snap = await getDoc(doc(db, "users", u));
          if (!snap.exists()) return fallback(u);
          const d = snap.data();
          return {
            uid: u,
            displayName: String(d.displayName ?? "Unknown user"),
            username: String(d.username ?? "unknown"),
            avatarUrl: (d.avatarUrl as string | null | undefined) ?? null,
            status: typeof d.status === "string" ? (d.status as string).slice(0, 120) : null,
          } satisfies PublicProfile;
        } catch {
          return fallback(u);
        }
      }),
    );
    for (const p of results) { cache.set(p.uid, p); fetchedAt.set(p.uid, Date.now()); }
  }
  for (const u of new Set(uids.filter(Boolean))) out.set(u, cache.get(u) ?? fallback(u));
  return out;
}
