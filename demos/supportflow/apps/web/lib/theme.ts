export type ThemeChoice = "light" | "dark" | "system";
export const THEME_KEY = "sf-theme";

/**
 * Runs before first paint (inlined in <head>) so the page never flashes the wrong theme.
 * Kept dependency-free and tolerant of blocked storage.
 */
export const themeScript = `(function(){try{var c=localStorage.getItem("${THEME_KEY}");var d=c==="dark"||(c!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}})();`;

export function readThemeChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const dark =
    choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage blocked: the choice lasts for this page view.
  }
}
