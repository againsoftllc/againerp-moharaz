import type { ResolvedThemeMode } from "./types";

const THEME_ATTR = "data-theme";

/** Apply resolved mode to `<html>` — class, attribute, color-scheme (admin only). */
export function applyThemeToDocument(mode: ResolvedThemeMode, root: HTMLElement = document.documentElement): void {
  const isDark = mode === "dark";
  root.classList.add("admin-site");
  root.classList.remove("storefront-site");
  root.classList.toggle("dark", isDark);
  root.setAttribute(THEME_ATTR, mode);
  root.style.colorScheme = mode;
  if (typeof document !== "undefined" && document.body) {
    document.body.classList.remove("storefront-site");
  }
}

/** Storefront — lock document to light (strip dark class, mark html/body). */
export function forceStorefrontLightTheme(root: HTMLElement = document.documentElement): void {
  root.classList.remove("dark", "admin-site");
  root.classList.add("storefront-site");
  root.setAttribute(THEME_ATTR, "light");
  root.style.colorScheme = "light";
  if (typeof document !== "undefined" && document.body) {
    document.body.classList.add("storefront-site");
  }
}

export function clearStorefrontSiteMarkers(root: HTMLElement = document.documentElement): void {
  root.classList.remove("storefront-site");
  if (typeof document !== "undefined" && document.body) {
    document.body.classList.remove("storefront-site");
  }
}

export function readStoredThemePreference(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("againerp-theme");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { preference?: string } };
    return parsed.state?.preference ?? null;
  } catch {
    return null;
  }
}

export function readLegacyAppStorePreference(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("againerp-prototype");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { theme?: string } };
    return parsed.state?.theme ?? null;
  } catch {
    return null;
  }
}

/** Inline script for layout `<head>` — admin-only app; respects saved theme preference. */
export const THEME_INIT_SCRIPT = `(function(){
  var r=document.documentElement;
  r.classList.remove('storefront-site');
  r.classList.add('admin-site');
  r.style.backgroundColor='';
  if(document.body){
    document.body.classList.remove('storefront-site');
    document.body.style.backgroundColor='';
    document.body.style.color='';
  }
  var stored=null;
  try{var raw=localStorage.getItem('againerp-theme');if(raw){var j=JSON.parse(raw);stored=j.state&&j.state.preference;}}catch(e){}
  var sys=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
  var mode=stored==='dark'?'dark':stored==='light'?'light':sys?'dark':'light';
  r.classList.toggle('dark',mode==='dark');
  r.setAttribute('data-theme',mode);
  r.style.colorScheme=mode;
})();`;
