import { describe, expect, it, beforeEach } from "vitest";
import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY, isDarkTheme, isThemeId, parseTheme } from "./theme";

function installFakeStorage() {
  const store = new Map<string, string>();
  const fake = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  (globalThis as unknown as Record<string, unknown>).localStorage = fake;
  return fake;
}

function installFakeDocument() {
  const dataset: Record<string, string> = {};
  const style: Record<string, string> = {};
  (globalThis as unknown as Record<string, unknown>).document = {
    documentElement: { dataset, style },
  };
  return { dataset, style };
}

describe("theme ids", () => {
  it("accepts the four themes, rejects anything else", () => {
    expect(isThemeId("ember")).toBe(true);
    expect(isThemeId("carbon-green")).toBe(true);
    expect(isThemeId("carbon-pink")).toBe(true);
    expect(isThemeId("dark-samurai")).toBe(true);
    expect(isThemeId("matrix")).toBe(false);
    expect(isThemeId(null)).toBe(false);
    expect(THEMES.map((t) => t.id)).toEqual(["ember", "carbon-green", "carbon-pink", "dark-samurai"]);
  });
  it("classifies dark themes for color-scheme", () => {
    expect(isDarkTheme("ember")).toBe(false);
    expect(isDarkTheme("carbon-green")).toBe(true);
    expect(isDarkTheme("carbon-pink")).toBe(true);
    expect(isDarkTheme("dark-samurai")).toBe(true);
  });
  it("defaults to Ember", () => {
    expect(DEFAULT_THEME).toBe("ember");
    expect(parseTheme("carbon-green")).toBe("carbon-green");
    expect(parseTheme("carbon-pink")).toBe("carbon-pink");
    expect(parseTheme("dark-samurai")).toBe("dark-samurai");
    expect(parseTheme("nope")).toBe("ember");
    expect(parseTheme(null)).toBe("ember");
  });
});

describe("theme persistence (localStorage, V1)", () => {
  beforeEach(() => {
    installFakeStorage();
    installFakeDocument();
  });

  it("reads the stored theme and falls back to Ember", async () => {
    const { getStoredTheme, setStoredTheme } = await import("./theme");
    const ls = (globalThis as unknown as Record<string, { getItem(k: string): string | null; clear(): void; setItem(k: string, v: string): void }>).localStorage;
    ls.clear();
    expect(getStoredTheme()).toBe("ember");
    setStoredTheme("carbon-green");
    expect(ls.getItem(THEME_STORAGE_KEY)).toBe("carbon-green");
    expect(getStoredTheme()).toBe("carbon-green");
    setStoredTheme("carbon-pink");
    expect(getStoredTheme()).toBe("carbon-pink");
    ls.setItem(THEME_STORAGE_KEY, "hacker");
    expect(getStoredTheme()).toBe("ember");
  });

  it("applyThemeAttribute sets data-theme without throwing", async () => {
    const { applyThemeAttribute } = await import("./theme");
    const doc = (globalThis as unknown as { document: { documentElement: { dataset: Record<string, string> } } }).document;
    applyThemeAttribute("carbon-green");
    expect(doc.documentElement.dataset.theme).toBe("carbon-green");
    applyThemeAttribute("ember");
    expect(doc.documentElement.dataset.theme).toBe("ember");
  });
});
