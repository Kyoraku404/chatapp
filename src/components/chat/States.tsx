export function EmptyConversation({ onStart }: { onStart: () => void }) {
  return (
    <div className="grid flex-1 place-items-center p-8 text-center">
      <div className="max-w-xs">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-ink-900 text-white" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
          </svg>
        </div>
        <h2 className="font-display mt-4 text-lg font-semibold">No conversation selected</h2>
        <p className="mt-1 text-sm text-ink-500">Pick a chat from the river — or start something new.</p>
        <button onClick={onStart} className="mt-4 rounded-2xl bg-rush-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rush-700">
          Start a chat
        </button>
      </div>
    </div>
  );
}

export function RiverSkeleton() {
  return (
    <div className="space-y-2 p-3" aria-hidden="true" role="status" aria-label="Loading conversations">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-2xl p-2">
          <div className="h-10 w-10 rounded-full bg-ink-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 rounded bg-ink-100" />
            <div className="h-2.5 w-1/2 rounded bg-ink-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <p role="alert" className="flex items-center gap-2 rounded-xl border border-rush-200 bg-rush-50 px-3 py-2 text-sm text-rush-700">
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-semibold underline">Retry</button>
      )}
    </p>
  );
}
