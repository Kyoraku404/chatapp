// Unread calculations + pagination helpers (pure, unit-tested).

export interface TimestampLike {
  toMillis(): number;
}
type AnyTs = { seconds?: number; nanoseconds?: number } | TimestampLike | number | null | undefined;

function toMillis(ts: AnyTs): number | null {
  if (ts == null) return null;
  if (typeof ts === "number") return ts;
  if (typeof (ts as TimestampLike).toMillis === "function")
    return (ts as TimestampLike).toMillis();
  const s = (ts as { seconds?: number }).seconds;
  if (typeof s === "number") return s * 1000;
  return null;
}

/** True when a conversation has activity newer than the user's lastReadAt. */
export function hasUnread(lastMessageAt: AnyTs, lastReadAt: AnyTs): boolean {
  const msg = toMillis(lastMessageAt);
  if (msg == null) return false;
  const read = toMillis(lastReadAt);
  if (read == null) return true;
  return msg > read;
}

/** Count messages (ascending by createdAt) newer than lastReadAt, capped. */
export function countUnread(
  messageTimes: AnyTs[],
  lastReadAt: AnyTs,
  cap = 99,
): number {
  const read = toMillis(lastReadAt);
  let n = 0;
  for (const t of messageTimes) {
    const ms = toMillis(t);
    if (ms == null) continue;
    if (read == null || ms > read) {
      n += 1;
      if (n >= cap) return cap;
    }
  }
  return n;
}

// ---------- Exact unread badges (per-user counters, V1) ----------
// Counts live in users/{uid}/reads/{convKey}.unreadCount, incremented
// server-authoritatively on send and cleared when the user opens the
// conversation. These pure helpers keep every display/transition rule in
// one unit-tested place; Firestore I/O lives in readState.ts + API routes.

/** Display cap: 1–9 render exactly, 10+ renders as "9+". */
export const UNREAD_DISPLAY_CAP = 9;

/**
 * Legacy-safe normalization: missing/corrupt/negative counts mean "none".
 * Pre-counter conversations have no unreadCount field — they MUST read as
 * 0, never as fake unread.
 */
export function normalizeUnreadCount(v: unknown): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : (v as number);
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

/** Badge label, or null when no badge should render (unreadCount === 0). */
export function formatUnreadCount(v: unknown): string | null {
  const n = normalizeUnreadCount(v);
  if (n <= 0) return null;
  if (n <= UNREAD_DISPLAY_CAP) return String(n);
  return `${UNREAD_DISPLAY_CAP}+`;
}

/** Total unread messages across a set of conversations (raw sum; cap at display). */
export function totalUnreadCounts(values: Iterable<unknown>): number {
  let total = 0;
  for (const v of values) total += normalizeUnreadCount(v);
  return total;
}

/**
 * Counter transition for one incoming message. The sender NEVER gains
 * unread from their own message; unit-level mirror of the server rule
 * (DM send tx / groups touch only increment recipients).
 */
export function nextUnreadOnSend(current: unknown, senderId: string, viewerUid: string): number {
  const n = normalizeUnreadCount(current);
  if (!senderId || !viewerUid || senderId === viewerUid) return n;
  return n + 1;
}

/** Counter transition for opening a conversation: always fully read. */
export function nextUnreadOnOpen(): number {
  return 0;
}

export interface PageCursor {
  limit: number;
  startAfterMillis?: number | null;
}

/** Clamp client pagination params to safe server bounds. */
export function normalizePage(limit: unknown, max = 50, def = 25): number {
  const n = typeof limit === "string" ? parseInt(limit, 10) : (limit as number);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(1, Math.floor(n)), max);
}
