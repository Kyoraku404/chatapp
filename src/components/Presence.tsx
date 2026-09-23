import clsx from "clsx";
import type { PresenceState } from "@/lib/types";

const DOT: Record<PresenceState, string> = {
  online: "bg-green-600",
  idle: "bg-amber-500",
  dnd: "bg-rush-600",
  offline: "bg-ink-300",
};

export function PresenceDot({
  state,
  size = "md",
  pulse = false,
  label,
}: {
  state: PresenceState;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  label?: string;
}) {
  const px = size === "sm" ? "h-2 w-2" : size === "lg" ? "h-3.5 w-3.5" : "h-2.5 w-2.5";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        role="img"
        aria-label={label ?? `Presence: ${state}`}
        className={clsx(
          "inline-block rounded-full ring-2 ring-white",
          DOT[state],
          px,
          pulse && state === "online" && "animate-pulse-dot",
        )}
      />
    </span>
  );
}

export function Avatar({
  name,
  presence,
  size = 40,
  src,
}: {
  name: string;
  presence?: PresenceState;
  size?: number;
  /** Free-tier avatar URL (Firestore users/{uid}.avatarUrl). Initials fallback. */
  src?: string | null;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const clean = typeof src === "string" ? src.trim() : "";
  const hasSrc =
    clean.length > 0 &&
    (/^https:\/\//i.test(clean) || /^http:\/\/(localhost|127\.0\.0\.1)/i.test(clean) || /^\/api\/attachments\/media\?id=[a-f0-9-]{36}$/.test(clean));
  return (
    <span className="relative inline-flex shrink-0" aria-hidden={presence ? undefined : true}>
      {hasSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={clean}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          className="rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          className="rush-avatar grid place-items-center rounded-full bg-ink-800 font-display font-semibold text-white"
          style={{ width: size, height: size, fontSize: size * 0.36 }}
          aria-label={presence ? undefined : name}
        >
          {initials || "?"}
        </span>
      )}
      {presence && (
        <span className="absolute -bottom-0.5 -right-0.5">
          <PresenceDot state={presence} size="sm" />
        </span>
      )}
    </span>
  );
}
