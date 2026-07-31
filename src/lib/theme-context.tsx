"use client";

/**
 * Light/dark/system appearance preference. The colour tokens for both
 * themes already exist in src/styles/tokens.css (`:root` / `.dark`) — this
 * context is the only piece that was missing: it toggles the `.dark` class
 * on <html> and persists the choice. See layout.tsx for the inline script
 * that applies the stored preference before first paint (no flash).
 */
import { createContext, useContext, useEffect, useState } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme-constants";

export type Theme = "light" | "dark" | "system";
export { THEME_STORAGE_KEY };

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function resolve(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function apply(theme: Theme) {
  const resolved = resolve(theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // Deferred to an effect deliberately, same reason as demo-user-context:
    // reading localStorage during the initial render would mismatch the
    // server-rendered markup. The inline script in layout.tsx already
    // applied the right class before paint, so this just syncs React state
    // to match — no visible flash.
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    const initial = stored ?? "system";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(initial);
    setResolvedTheme(resolve(initial));
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolvedTheme(apply("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    setResolvedTheme(apply(next));
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
