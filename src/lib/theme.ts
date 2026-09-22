// RUSH theme system (visual only — no backend/auth/messaging impact).
//
// Four themes: `ember` (default warm light), `carbon-green` and
// `carbon-pink` (premium graphite + subtle woven carbon texture), and
// `dark-samurai` (near-black violet charcoal + restrained crimson accent).
// Persistence is localStorage-only for V1 so the choice survives
// refresh, browser restart, and logout/login on the same device.

export const THEME_STORAGE_KEY = "rush-theme";

export type ThemeId = "ember" | "carbon-green" | "carbon-pink" | "dark-samurai";

export const THEMES: { id: ThemeId; label: string; blurb: string }[] = [
  { id: "ember", label: "Ember", blurb: "Warm light · ember red" },
  { id: "carbon-green", label: "Carbon Green", blurb: "Graphite · sage accent" },
  { id: "carbon-pink", label: "Carbon Pink", blurb: "Graphite · vivid pink" },
  { id: "dark-samurai", label: "Dark Samurai", blurb: "Blackened steel · crimson" },
];

export const DEFAULT_THEME: ThemeId = "ember";

const DARK_THEMES: readonly ThemeId[] = ["carbon-green", "carbon-pink", "dark-samurai"];

export function isDarkTheme(theme: ThemeId): boolean {
  return (DARK_THEMES as readonly string[]).includes(theme);
}

export function isThemeId(v: unknown): v is ThemeId {
  return v === "ember" || v === "carbon-green" || v === "carbon-pink" || v === "dark-samurai";
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
    // Informs native controls/scrollbars; all non-Ember themes are dark.
    root.style.colorScheme = isDarkTheme(theme) ? "dark" : "light";
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', theme === 'ember' ? '#D92D20' : theme === 'dark-samurai' ? '#100F14' : '#121516');
  } catch {
    // DOM unavailable (SSR) — no-op.
  }
}
