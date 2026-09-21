import { memo, useState } from 'react';
import { Avatar } from '@/components/Presence';
import { MessageStatus } from './MessageStatus';
import type { DemoMessage } from '@/lib/demo';
type Actions = { reply: (m: DemoMessage) => void; retry: (id: string) => void; edit?: (id: string, content: string) => Promise<void>; remove?: (id: string) => Promise<void> };
export const MessageRow = memo(function MessageRow({ m, startRun, endRun, actions }: { m: DemoMessage; startRun: boolean; endRun: boolean; actions: Actions }) {
  const own = m.own;
  const { reply: onReply, retry: onRetry, edit: onEdit, remove: onDelete } = actions;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function saveEdit(m: DemoMessage) {
    if (!onEdit || !draft.trim()) return;
    setEditBusy(true);
    setEditError(null);
    try {
      await onEdit(m.id, draft.trim());
      setEditingId(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Could not save edit.");
    } finally {
      setEditBusy(false);
    }
  }

  return <div className={`flex gap-2.5 ${startRun ? 'mt-4' : 'mt-1'} ${own ? 'flex-row-reverse' : ''}`}>
    {!own && <div className="w-8 shrink-0">{startRun && <Avatar name={m.sender} size={32} src={m.senderAvatarUrl ?? null} />}</div>}
    <div className={`flex min-w-0 max-w-[78%] flex-col ${own ? 'items-end' : 'items-start'}`}>
      {!own && startRun && <span className="mb-1 px-1 text-xs font-semibold text-ink-500">{m.sender}</span>}
                  <div key={m.id} data-message-id={!m.pending && !m.failed ? m.id : undefined} className={`group relative max-w-full ${m.entrance ? `message-enter-${m.entrance}` : ""}`}>
                    {m.replyTo && (
                      <div className={`mb-1 truncate rounded-lg border-l-2 border-rush-400 bg-ink-50 px-2 py-1 text-xs text-ink-500 ${own ? "text-right" : ""}`}>
                        <span className="font-semibold">{m.replyTo.sender}:</span> {m.replyTo.preview}
                      </div>
                    )}
                    {m.deleted ? (
                      <div className="rounded-2xl border border-dashed border-ink-200 px-3.5 py-2 text-[13px] italic text-ink-400">
                        This message was deleted.
                      </div>
                    ) : editingId === m.id ? (
                      <div className="rounded-2xl border border-rush-300 bg-white p-2">
                        <label htmlFor={`edit-${m.id}`} className="sr-only">Edit message</label>
                        <textarea
                          id={`edit-${m.id}`}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          rows={2}
                          maxLength={4000}
                          className="w-full resize-none bg-transparent text-[14px] text-ink-900 outline-none"
                        />
                        {editError && <p role="alert" className="text-xs text-rush-700">{editError}</p>}
                        <div className="mt-1 flex justify-end gap-1.5">
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-ink-500 hover:bg-ink-100"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveEdit(m)}
                            disabled={editBusy || !draft.trim()}
                            className="rounded-lg bg-ink-900 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            {editBusy ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`rounded-2xl px-3.5 py-2 text-[14.5px] leading-[1.55] ${
                          own
                            ? "rounded-tr-md bg-rush-600 text-white shadow-rush-pop"
                            : "rounded-tl-md border border-ink-100 bg-white text-ink-900 shadow-card"
                        } ${m.pending ? "opacity-70" : ""} ${m.failed ? "border-rush-300 bg-rush-50 !text-ink-900" : ""}`}
                      >
                        {m.attachmentUrl && m.attachmentType?.startsWith("image/") && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.attachmentUrl}
                            alt="Shared image"
                            className="mb-1.5 max-h-64 rounded-xl"
                            loading="lazy"
                          />
                        )}
                        {m.attachmentUrl && !m.attachmentType?.startsWith("image/") && (
                          <a
                            href={m.attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`mb-1 block text-[13px] font-semibold underline ${own ? "text-white" : "text-rush-700"}`}
                          >
                            View attachment
                          </a>
                        )}
                        {m.content}{" "}
                        {m.edited && <span className={`text-[11px] ${own ? "text-rush-100" : "text-ink-400"}`}>(edited)</span>}
                      </div>
                    )}
                    <div className={`mt-0.5 flex items-center gap-2 px-1 text-[11px] text-ink-500 ${own ? "justify-end" : ""}`}>
                      {endRun && <span>{m.at}</span>}
                      {m.own && !m.deleted && m.status && <MessageStatus status={m.status} />}
                      {m.failed && (
                        <button aria-label="Retry failed message" onClick={() => onRetry?.(m.id)} className="font-semibold text-rush-700 underline">
                          Retry
                        </button>
                      )}
                      {!m.pending && !m.failed && !m.deleted && (
                        <>
                          <button
                            onClick={() => onReply?.(m)}
                            className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                          >
                            Reply
                          </button>
                          {m.own && onEdit && (
                            <button
                              onClick={() => {
                                setEditingId(m.id);
                                setDraft(m.content);
                                setEditError(null);
                              }}
                              className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                            >
                              Edit
                            </button>
                          )}
                          {m.own && onDelete && (
                            confirmDelete === m.id ? (
                              <span className="inline-flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    setConfirmDelete(null);
                                    void onDelete(m.id).catch(() => undefined);
                                  }}
                                  className="font-semibold text-rush-700"
                                >
                                  Confirm
                                </button>
                                <button onClick={() => setConfirmDelete(null)}>Cancel</button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setConfirmDelete(m.id)}
                                className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                              >
                                Delete
                              </button>
                            )
                          )}
                        </>
                      )}
                    </div>
                  </div>
    </div>
  </div>;
}, (a,b) => a.startRun === b.startRun && a.endRun === b.endRun && a.actions === b.actions && JSON.stringify(a.m) === JSON.stringify(b.m));
