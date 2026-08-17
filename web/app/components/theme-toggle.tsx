"use client";

import { useEffect, useState } from "react";

/** Shared with the pre-paint script in layout.tsx. */
export const THEME_KEY = "cadence-theme";

/** Dark is the default and the approved brand context, so this only ever records
 *  a departure from it: anything other than a stored "light" means dark.
 *
 *  The `dark` class on <html> is the single source of truth — it drives both our
 *  tokens and CopilotKit's own chat styles (see globals.css) — so the toggle
 *  adds and removes exactly that and nothing else. */
export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  // layout.tsx has already applied the stored choice before first paint. Read
  // the class back instead of re-deriving it, so the button cannot disagree with
  // the page it is sitting on.
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // Private mode or blocked storage: the theme still switches for this
      // session, it just will not be remembered. Not worth failing over.
    }
    setDark(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="pill mono theme-toggle"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? "☀ light" : "☾ dark"}
    </button>
  );
}
