import type { DemoMessage } from './demo';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export function messageStatus(pending: boolean, failed: boolean, delivered: boolean, read: boolean): MessageStatus {
  if (pending) return 'sending';
  if (read) return 'read';
  if (delivered) return 'delivered';
  return failed ? 'failed' : 'sent';
}

/** A server echo always occupies the same React key as its optimistic row. */
export function reconcileMessages(live: DemoMessage[], pending: DemoMessage[]): DemoMessage[] {
  const byId = new Map(pending.map(m => [m.id, m]));
  for (const m of live) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0) || a.id.localeCompare(b.id));
}

export function sameMessageRun(a: DemoMessage, b: DemoMessage): boolean {
  return a.own === b.own && (a.senderId ?? a.sender) === (b.senderId ?? b.sender)
    && (a.createdAtMs != null && b.createdAtMs != null ? Math.abs(b.createdAtMs - a.createdAtMs) < 300000 : a.at === b.at);
}
