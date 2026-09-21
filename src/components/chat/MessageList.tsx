import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MessageRow } from './MessageRow';
import { sameMessageRun } from '@/lib/message-lifecycle';
import { ArrowDown } from 'lucide-react';
import { InlineError } from "@/components/chat/States";
import type { DemoMessage } from "@/lib/demo";

export function MessageList({
  messages,
  onSeen,
  onRetry,
  onReply,
  onEdit,
  onDelete,
  onLoadMore,
  hasMore,
  loadingMore,
  loading,
  error,
}: {
  messages: DemoMessage[];
  onSeen?: (ids: string[]) => void;
  onRetry?: (id: string) => void;
  onReply?: (m: DemoMessage) => void;
  onEdit?: (id: string, content: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  loading?: boolean;
  error?: string | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const previous = useRef<{ last?: string; height: number }>({ height: 0 });
  const [newMessages, setNewMessages] = useState(false);
  const smooth = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' as const : 'smooth' as const;
  const latest = () => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth() }); setNewMessages(false); };
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || loading) return;
    const last = messages.at(-1)?.id;
    if (last !== previous.current.last) {
      if (nearBottom.current) el.scrollTo({ top: el.scrollHeight, behavior: previous.current.last ? smooth() : 'auto' });
      else setNewMessages(true);
    }
    previous.current = { last, height: el.scrollHeight };
  }, [messages, loading]);
  useEffect(() => {
    const el = scroller.current;
    if (!el || !onSeen || loading) return;
    const visible = new Set<string>();
    const notify = () => { if (document.visibilityState === 'visible' && document.hasFocus() && el.clientHeight > 0 && visible.size) onSeen([...visible]); };
    const observer = new IntersectionObserver(entries => {
      for (const e of entries) {
        const id = (e.target as HTMLElement).dataset.messageId!;
        if (e.isIntersecting) visible.add(id); else visible.delete(id);
      }
      notify();
    }, { root: el, threshold: 0.6 });
    el.querySelectorAll('[data-message-id]').forEach(node => observer.observe(node));
    document.addEventListener('visibilitychange', notify);
    window.addEventListener('focus', notify);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', notify); window.removeEventListener('focus', notify); };
  }, [messages, loading, onSeen]);

  const callbacks = useRef({ onReply, onRetry, onEdit, onDelete });
  callbacks.current = { onReply, onRetry, onEdit, onDelete };
  const actions = useMemo(() => ({
    reply: (m: DemoMessage) => callbacks.current.onReply?.(m),
    retry: (id: string) => callbacks.current.onRetry?.(id),
    edit: onEdit ? (id: string, content: string) => callbacks.current.onEdit!(id, content) : undefined,
    remove: onDelete ? (id: string) => callbacks.current.onDelete!(id) : undefined,
  }), [Boolean(onEdit), Boolean(onDelete)]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={scroller} onScroll={() => { const el = scroller.current; if (el) { nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90; if (nearBottom.current) setNewMessages(false); } }} className="river-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8" role="log" aria-label="Messages" aria-live="polite">
      <div className="mx-auto max-w-3xl">
        {onLoadMore && hasMore && (
          <div className="mb-4 text-center">
            <button
              onClick={onLoadMore}
              disabled={loadingMore}
              className="rounded-xl border border-ink-200 bg-white px-4 py-1.5 text-xs font-semibold text-ink-600 hover:border-ink-300 disabled:opacity-60"
            >
              {loadingMore ? "Loading…" : "Load older messages"}
            </button>
          </div>
        )}
        {loading && (
          <div className="space-y-2 py-4" role="status" aria-label="Loading messages">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-2xl bg-ink-100" />
            ))}
          </div>
        )}
        {error && (
          <div className="mb-2">
            <InlineError message={error} />
          </div>
        )}
        {messages.map((m, i) => <MessageRow key={m.id} m={m} actions={actions} startRun={!messages[i - 1] || !sameMessageRun(messages[i - 1]!, m)} endRun={!messages[i + 1] || !sameMessageRun(m, messages[i + 1]!)} />)}
        {messages.length === 0 && !loading && (
          <p className="py-10 text-center text-sm text-ink-500">
            No messages yet. Say hi — the first message is the hardest.
          </p>
        )}
        <div ref={bottomRef} />
        {newMessages && <button className="new-messages" onClick={latest}><ArrowDown size={14} aria-hidden="true" /> New messages</button>}
      </div>
    </div>
  );
}
