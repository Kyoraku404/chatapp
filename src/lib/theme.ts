// RUSH theme system (visual only — no backend/auth/messaging impact).
//
// Six themes: `ember` (default warm light), `glass` (frosted light), `dark-glass` (layered midnight glass), `carbon-green` and
// `carbon-pink` (premium graphite + subtle woven carbon texture), and
// `dark-samurai` (near-black violet charcoal + restrained crimson accent).
// Persistence is localStorage-only for V1 so the choice survives
// refresh, browser restart, and logout/login on the same device.

export const THEME_STORAGE_KEY = "rush-theme";

export type ThemeId = "ember" | "glass" | "dark-glass" | "carbon-green" | "carbon-pink" | "dark-samurai";

export const THEMES: { id: ThemeId; label: string; blurb: string }[] = [
  { id: "ember", label: "Ember", blurb: "Soft ivory · warm red" },
  { id: "glass", label: "Glass", blurb: "Frosted light · iris blue" },
  { id: "dark-glass", label: "Dark Glass", blurb: "Midnight glass · electric ice" },
  { id: "carbon-green", label: "Carbon Green", blurb: "Deep forest · sage" },
  { id: "carbon-pink", label: "Carbon Pink", blurb: "Smoked plum · rose" },
  { id: "dark-samurai", label: "Dark Samurai", blurb: "Obsidian · crimson" },
];

export const DEFAULT_THEME: ThemeId = "ember";

const DARK_THEMES: readonly ThemeId[] = ["dark-glass", "carbon-green", "carbon-pink", "dark-samurai"];

export function isDarkTheme(theme: ThemeId): boolean {
  return (DARK_THEMES as readonly string[]).includes(theme);
}

export function isThemeId(v: unknown): v is ThemeId {
  return v === "ember" || v === "glass" || v === "dark-glass" || v === "carbon-green" || v === "carbon-pink" || v === "dark-samurai";
}

export function parseTheme(v: unknown): ThemeId {
  return isThemeId(v) ? v : DEFAULT_THEME;
}

/** Read the persisted theme without touching the DOM (safe for SSR). */
export function getStoredTheme(): ThemeId {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_THEME;
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

/** Persist the theme choice (localStorage only, V1). */
export function setStoredTheme(theme: ThemeId): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private-mode storage may throw — theme still applies for the session.
  }
}

/** Apply the theme to <html data-theme="…"> + color-scheme for form controls. */
export function applyThemeAttribute(theme: ThemeId): void {
  try {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.dataset.theme = theme;
    // Informs native controls/scrollbars.
    root.style.colorScheme = isDarkTheme(theme) ? "dark" : "light";
    const background = theme === 'ember' ? '#F8F6F3' : theme === 'glass' ? '#e9efff' : theme === 'dark-glass' ? '#080e1c' : theme === 'dark-samurai' ? '#101114' : theme === 'carbon-pink' ? '#1B131B' : '#101916';
    root.style.backgroundColor = background;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', background);
  } catch {
    // DOM unavailable (SSR) — no-op.
  }
}
