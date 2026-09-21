export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2" aria-label="RUSH by OCN">
      <span
        aria-hidden="true"
        className="grid h-9 w-9 place-items-center rounded-2xl bg-rush-600 text-white shadow-rush-pop"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="font-display block text-xl font-bold tracking-tight text-ink-900">
            RUSH
          </span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-400">
            by OCN
          </span>
        </span>
      )}
    </span>
  );
}
