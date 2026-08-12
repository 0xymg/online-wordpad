import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, LOCALE_TAGS, detectLocale, type Locale } from "./index";

// The active locale lives outside React so components can read it with
// useSyncExternalStore: the server snapshot is always English (which is what
// crawlers and the initial HTML get) and the client resolves the real locale on
// subscribe, without a setState-inside-an-effect round trip.

let current: Locale | null = null;
const listeners = new Set<() => void>();

function read(): Locale {
  if (current !== null) return current;
  let stored: string | null = null;
  try { stored = localStorage.getItem(LOCALE_STORAGE_KEY); } catch {}
  current = detectLocale(stored);
  return current;
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getLocaleSnapshot(): Locale {
  return read();
}

export function getServerLocaleSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

export function setStoredLocale(next: Locale): void {
  if (current === next) return;
  current = next;
  try { localStorage.setItem(LOCALE_STORAGE_KEY, next); } catch {}
  document.documentElement.lang = LOCALE_TAGS[next];
  for (const listener of listeners) listener();
}
