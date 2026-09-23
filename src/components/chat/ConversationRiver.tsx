import { useId } from 'react';
import { Search } from 'lucide-react';
import { Avatar } from "@/components/Presence";
import Link from "next/link";
import type { DemoConversation } from "@/lib/demo";
import { normalizeFilterText, resolveRiverEmptyState } from "@/lib/sidebar";
import { formatUnreadCount } from "@/lib/unread";

function KindGlyph({ kind }: { kind: DemoConversation["kind"] }) {
  if (kind === "group")
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  if (kind === "channel")
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
      </svg>
    );
  return null;
}

// Temporary render diagnostics for the empty-RECENT investigation. Enable
// with `localStorage.setItem("rush_debug_sidebar", "1")` then refresh.
// Stages: [rush:river] (received props) → [rush:river:rows] (pre-map count)
// → [rush:row] (per rendered row). Dev-only; remove after the browser
// confirmation run proves which stage drops the rows.
function riverDebugEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("rush_debug_sidebar") === "1";
  } catch {
    return false;
  }
}

export function ConversationRiver({
  conversations,
  activeId,
  onSelect,
  filter,
  onFilter,
  loading = false,
  loadError = null,
}: {
  conversations: DemoConversation[];
  activeId: string;
  onSelect: (id: string) => void;
  filter: string;
  onFilter: (q: string) => void;
  /** Listener not settled yet — suppresses the empty row (skeleton shows). */
  loading?: boolean;
  /** Firestore/index/permission failure — never rendered as "no matches". */
  loadError?: string | null;
}) {
  const searchId = useId();
  const dbg = riverDebugEnabled();
  if (dbg) {
    console.debug("[rush:river]", {
      receivedCount: conversations.length,
      ids: conversations.map((x) => x.id),
      kinds: conversations.map((x) => x.kind),
      filter,
      loading,
      loadError,
    });
  }
  const emptyState = resolveRiverEmptyState({
    loading,
    error: loadError,
    searchActive: normalizeFilterText(filter).length > 0,
    count: conversations.length,
  });
  const rows = conversations;
  if (dbg) console.debug("[rush:river:rows]", { rows: rows.length, emptyState });
  return (
    <div className="flex h-full flex-col">
      <div className="conversation-search">
        <Search size={18} aria-hidden="true" />
        <label htmlFor={searchId} className="sr-only">Search conversations</label>
        <input
          id={searchId}
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
          placeholder="Search chats, groups, spaces"
          className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm placeholder:text-ink-400"
        />
      </div>
      <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-ink-400" aria-hidden="true">
        Recent
      </div>
      <ul className="river-scroll flex-1 overflow-y-auto px-2 pb-4" role="listbox" aria-label="Conversations">
        {rows.map((c) => {
          if (dbg) console.debug("[rush:row]", c.id);
          const active = c.id === activeId;
          const badge = formatUnreadCount(c.unread);
          return (
            <li key={c.id} className="relative">
              <button
                role="option"
                aria-selected={active}
                onClick={() => onSelect(c.id)}
                className={`conversation-row relative mb-0.5 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
                  active ? "bg-ink-900 text-white" : "hover:bg-white"
                }`}
              >
                {c.unread > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-2 h-8 w-[3px] rounded-full bg-rush-500"
                  />
                )}
                <Avatar name={c.title} presence={c.presence} size={40} src={c.avatarUrl ?? null} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm font-semibold ${active ? "text-white" : "text-ink-900"}`}>
                      <span className={`mr-1 inline-flex align-[-2px] ${active ? "text-rush-400" : "text-ink-400"}`}>
                        <KindGlyph kind={c.kind} />
                      </span>
                      {c.title}
                    </span>
                    <span className={`shrink-0 text-[11px] ${active ? "text-ink-200" : "text-ink-400"}`}>{c.lastAt}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-xs ${c.unread > 0 ? "font-semibold" : ""} ${active ? "text-ink-200" : c.unread > 0 ? "text-ink-700" : "text-ink-500"}`}>{c.subtitle}</span>
                    {badge != null && (
                      <span key={badge} className="unread-badge shrink-0" aria-label={`${c.unread} unread messages`}>
                        {badge}
                      </span>
                    )}
                  </span>
                  {c.space && (
                    <span className={`truncate text-[11px] ${active ? "text-ink-300" : "text-ink-400"}`}>{c.space}</span>
                  )}
                </span>
              </button>
              {active && c.kind === "dm" && c.username && <Link href={`/u/${c.username}?dm=${encodeURIComponent(c.id)}`} className="absolute bottom-1 right-3 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-rush-400 hover:underline">View profile</Link>}
            </li>
          );
        })}
        {emptyState === "no-search-match" && (
          <li className="p-6 text-center text-sm text-ink-500">
            No conversations match. Try a different search.
          </li>
        )}
        {emptyState === "empty-inbox" && (
          <li className="p-6 text-center text-sm text-ink-500">
            <p className="font-semibold text-ink-900">No conversations yet.</p>
            <p className="mt-1">Start one with + New.</p>
          </li>
        )}
        {emptyState === "error" && (
          <li className="p-6 text-center text-sm" role="alert">
            <p className="font-semibold text-rush-700">Couldn&apos;t load conversations.</p>
            <p className="mt-1 break-words text-xs text-ink-500">{loadError}</p>
          </li>
        )}
      </ul>
    </div>
  );
}
