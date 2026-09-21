"use client";

// ThemeProvider: owns the visual theme only. Reads the persisted choice
// from localStorage on mount (the inline head script already set
// data-theme pre-paint to avoid a flash), exposes `theme` + `setTheme`,
// and persists every change. No Firebase/auth/messaging involvement.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_THEME,
  applyThemeAttribute,
  getStoredTheme,
  setStoredTheme,
  type ThemeId,
} from "@/lib/theme";

const ThemeContext = createContext<{ theme: ThemeId; setTheme: (t: ThemeId) => void }>({
  theme: DEFAULT_THEME,
  setTheme: () => undefined,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  // Hydrate from storage after mount (pre-paint value already applied by
  // the inline script in layout.tsx, so this only syncs React state).
  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    applyThemeAttribute(stored);
  }, []);

  const setTheme = useCallback((t: ThemeId) => {
    setThemeState(t);
    setStoredTheme(t);
    applyThemeAttribute(t);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
