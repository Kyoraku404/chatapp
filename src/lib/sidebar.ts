// Sidebar empty-state resolution (pure, unit-tested).
// The RECENT list must never report "no matches" for a backend failure or
// for a genuine empty inbox. States:
// - loading:        listener not settled yet → skeleton, no empty row.
// - error:          Firestore/index/permission failure → error row (never
//   masquerades as an empty inbox).
// - no-search-match: non-empty search text, zero rows after filtering.
// - empty-inbox:    empty search, settled, no error, zero rows.
// - ready:          rows to render.

export type RiverEmptyState = "loading" | "error" | "no-search-match" | "empty-inbox" | "ready";

export function resolveRiverEmptyState(args: {
  loading: boolean;
  error: string | null;
  searchActive: boolean;
  count: number;
}): RiverEmptyState {
  if (args.count > 0) return "ready";
  if (args.loading) return "loading";
  if (args.error) return "error";
  if (args.searchActive) return "no-search-match";
  return "empty-inbox";
}

// Code points that render as an empty input but are NOT removed by
// String.trim() and match nothing: zero-width space, ZWNJ, ZWJ, word
// joiner, BOM. Compared numerically so no invisible literal can corrupt
// this source file. Stripped before every search comparison so only
// visible text can ever filter the list.
const INVISIBLE_CODE_POINTS = new Set([0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);

export function normalizeFilterText(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const cp = ch.codePointAt(0) ?? 0;
    if (INVISIBLE_CODE_POINTS.has(cp)) continue;
    out += ch;
  }
  return out.trim().toLowerCase();
}
