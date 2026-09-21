"use client";

// Settings → Appearance → Theme preview cards. Each card visibly previews
// its own material (Ember warm light, carbon graphite + weave + accent,
// blackened Samurai steel + crimson) using fixed preview styles (NOT the
// live theme tokens), so all four options are recognizable at once.
// Clicking applies immediately + persists.

import { THEMES, type ThemeId } from "@/lib/theme";
import { useTheme } from "@/components/ThemeProvider";

function PreviewArt({ id }: { id: ThemeId }) {
  if (id === "ember") {
    return (
      <span aria-hidden="true" className="block rounded-xl border border-ink-200 bg-paper p-2">
        <span className="flex items-center gap-1.5">
          <span className="grid h-5 w-5 place-items-center rounded-md bg-rush-600 text-[9px] font-bold text-white">R</span>
          <span className="h-1.5 w-10 rounded-full bg-ink-900" />
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-rush-500" />
        </span>
        <span className="mt-2 block rounded-lg border border-ink-100 bg-white px-2 py-1 text-[9px] text-ink-900">
          Hey — are we still on for tonight?
        </span>
        <span className="ml-auto mt-1 block w-fit rounded-lg rounded-tr-sm bg-rush-600 px-2 py-1 text-[9px] text-white">
          Yes. Rushing over.
        </span>
      </span>
    );
  }
  const ownBg = id === "carbon-green" ? "#2b7e57" : id === "carbon-pink" ? "#b03363" : "#a8343c";
  const accentDot = id === "carbon-green" ? "#3ba776" : id === "carbon-pink" ? "#e14e86" : "#b8363f";
  const bg = id === "carbon-green" ? "#121516" : id === "carbon-pink" ? "#141315" : "#100f14";
  // Samurai is flat blackened steel (no weave); carbons show the weave.
  const weave =
    id === "dark-samurai"
      ? undefined
      : "repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 4px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 4px), repeating-linear-gradient(45deg, rgba(0,0,0,0.3) 0 1px, transparent 1px 3px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.3) 0 1px, transparent 1px 3px)";
  return (
    <span
      aria-hidden="true"
      className="block rounded-xl border p-2"
      style={{
        backgroundColor: bg,
        ...(weave
          ? {
              backgroundImage: weave,
              backgroundSize: "8px 8px, 8px 8px, 6px 6px, 6px 6px",
            }
          : {}),
        borderColor: "#2a3336",
      }}
    >
      <span className="flex items-center gap-1.5">
        <span
          className="grid h-5 w-5 place-items-center rounded-md text-[9px] font-bold text-white"
          style={{ background: accentDot }}
        >
          R
        </span>
        <span className="h-1.5 w-10 rounded-full" style={{ background: "#eef3f0" }} />
        <span className="ml-auto h-1.5 w-1.5 rounded-full" style={{ background: accentDot }} />
      </span>
      <span
        className="mt-2 block rounded-lg border px-2 py-1 text-[9px]"
        style={{ background: "#242d30", borderColor: "#2a3336", color: "#eef3f0" }}
      >
        Engine warm. Lobby in five?
      </span>
      <span
        className="ml-auto mt-1 block w-fit rounded-lg rounded-tr-sm px-2 py-1 text-[9px] text-white"
        style={{ background: ownBg }}
      >
        On my way.
      </span>
    </span>
  );
}

export function ThemeCards() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label="Theme">
      {THEMES.map((t) => {
        const active = theme === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            aria-pressed={active}
            aria-label={`${t.label}${active ? " (active)" : ""}`}
            data-active={active}
            className="theme-preview p-2.5"
            style={{ background: "var(--surface)", borderColor: active ? "var(--accent)" : "var(--border)" }}
          >
            <PreviewArt id={t.id} />
            <span className="mt-2 flex items-center justify-between gap-2">
              <span>
                <span className="block text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                  {t.label}
                </span>
                <span className="block text-[11px]" style={{ color: "var(--muted)" }}>
                  {t.blurb}
                </span>
              </span>
              {active ? (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                  style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
                >
                  Active
                </span>
              ) : (
                <span
                  className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                  style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                >
                  Use
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
