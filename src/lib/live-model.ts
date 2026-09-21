// Formatting + timestamp helpers shared by the live hooks.
// Live Firestore data maps into the river/message UI shapes (see the
// live-only optional fields on DemoConversation/DemoMessage in demo.ts)
// so components stay identical between preview and live modes.

export function formatRelative(ms: number | null | undefined, now = Date.now()): string {  if (ms == null) return "";
  const d = Math.max(0, now - ms);
  const min = Math.floor(d / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return new Date(ms).toLocaleDateString();
}

export function formatTime(ms: number | null | undefined): string {
  if (ms == null) return "";
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function toMillis(ts: unknown): number | null {
  if (ts == null) return null;
  if (typeof ts === "number") return ts;
  if (typeof (ts as { toMillis?: unknown }).toMillis === "function")
    return (ts as { toMillis(): number }).toMillis();
  const s = (ts as { seconds?: unknown }).seconds;
  if (typeof s === "number") return s * 1000;
  return null;
}
