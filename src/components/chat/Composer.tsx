"use client";

import { useRef, useState } from "react";
import type { DemoMessage } from "@/lib/demo";
import { InlineError } from "@/components/chat/States";

export interface ComposerAttachment {
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  url: string;
}

/**
 * The message outbox owns send progress and retry. Clearing the fixed-height
 * input immediately lets users compose the next message while it persists.
 */
export function Composer({
  replyTo,
  onClearReply,
  onSend,
  onUploadFile,
  attachDisabledReason,
}: {
  replyTo: DemoMessage | null;
  onClearReply: () => void;
  onSend: (text: string, attachment: ComposerAttachment | null) => Promise<void>;
  onUploadFile?: (file: File) => Promise<ComposerAttachment>;
  attachDisabledReason?: string;
}) {
  const [text, setText] = useState("");
  const submitLock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<ComposerAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    const v = text.trim();
    if ((!v && !attachment) || submitLock.current || uploading) return; // duplicate-send lock
    submitLock.current = true;
    setText('');
    setAttachment(null);
    onClearReply();
    setError(null);
    try {
      const request = onSend(v, attachment);
      queueMicrotask(() => { submitLock.current = false; });
      await request;

    } catch {
      // Failure and retained content are displayed on the optimistic bubble.
    } finally {
      submitLock.current = false;
    }
  }

  async function pick(file: File | undefined) {
    if (!file || !onUploadFile) return;
    setUploading(true);
    setError(null);
    try {
      setAttachment(await onUploadFile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const canAttach = Boolean(onUploadFile);

  return (
    <div className="chat-composer shrink-0 border-t border-ink-100 bg-paper/80 px-4 pb-4 pt-2 backdrop-blur md:px-8">
      <div className="mx-auto max-w-3xl">
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs">
            <span className="truncate text-ink-500">
              Replying to <span className="font-semibold text-ink-900">{replyTo.sender}</span>: {replyTo.content.slice(0, 80)}
            </span>
            <button onClick={onClearReply} aria-label="Cancel reply" className="ml-auto rounded-lg px-2 py-1 font-semibold text-ink-500 hover:bg-ink-100">
              ✕
            </button>
          </div>
        )}
        {attachment && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs">
            <span className="truncate font-semibold text-ink-900">
              {attachment.contentType.startsWith("image/") ? "Image attached" : "File attached"}
            </span>
            <span className="text-ink-400">{Math.round(attachment.sizeBytes / 1024)} KB</span>
            <button onClick={() => setAttachment(null)} aria-label="Remove attachment" className="ml-auto rounded-lg px-2 py-1 font-semibold text-ink-500 hover:bg-ink-100">
              ✕
            </button>
          </div>
        )}
        {error && (
          <div className="mb-2">
            <InlineError message={error} />
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex items-end gap-2 rounded-2xl border border-ink-200 bg-white p-2 shadow-card focus-within:border-rush-400"
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            className="sr-only"
            aria-hidden={!canAttach}
            tabIndex={canAttach ? 0 : -1}
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => canAttach && fileRef.current?.click()}
            disabled={!canAttach || uploading}
            aria-label={canAttach ? "Attach an image or PDF" : (attachDisabledReason ?? "Attachments unavailable")}
            title={canAttach ? "Attach an image or PDF" : (attachDisabledReason ?? "Attachments unavailable")}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-500 hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <label htmlFor="composer" className="sr-only">Write a message</label>
          <textarea
            id="composer"
            ref={boxRef}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={uploading ? "Uploading…" : "Message…"}
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent text-[14.5px] leading-relaxed outline-none placeholder:text-ink-400 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={(!text.trim() && !attachment) || uploading}
            aria-label="Send message"
            className="composer-send grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rush-600 text-white shadow-rush-pop hover:bg-rush-700 disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
