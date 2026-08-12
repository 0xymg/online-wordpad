import { DEFAULT_LOCALE, LOCALE_KEY, LOCALE_TAGS, detectLocale, type Locale } from "./index";

// The active locale lives outside React so components can read it with
// useSyncExternalStore: the server snapshot is always English (which is what
// crawlers and the initial HTML get) and the client resolves the real locale on
// subscribe, without a setState-inside-an-effect round trip.
//
// The choice is persisted in a cookie rather than localStorage. Two reasons that
// matter for this site: a cookie can be scoped to `.wordpad.info`, so the
// language survives the apex ↔ www hop that localStorage (per-origin) loses; and
// it travels with every request, so rendering the right language on the server
// later needs no change to how it is stored. Values written by the old
// localStorage version are migrated on first read.

let current: Locale | null = null;
const listeners = new Set<() => void>();

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // a year — a language choice is not a session preference

function readCookie(): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${LOCALE_KEY}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(value: Locale): void {
  const { hostname, protocol } = window.location;
  // Share the cookie across wordpad.info and www.wordpad.info; on localhost and
  // preview hosts a domain attribute would be rejected, so leave it host-only.
  const domain = /(^|\.)wordpad\.info$/.test(hostname) ? "; domain=.wordpad.info" : "";
  const secure = protocol === "https:" ? "; secure" : "";
  document.cookie =
    `${LOCALE_KEY}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax${domain}${secure}`;
}

function read(): Locale {
  if (current !== null) return current;
  let stored: string | null = null;
  try { stored = readCookie(); } catch {}
  if (!stored) {
    // Legacy value from the localStorage version — carry it over once.
    try {
      stored = localStorage.getItem(LOCALE_KEY);
      if (stored) {
        writeCookie(detectLocale(stored));
        localStorage.removeItem(LOCALE_KEY);
      }
    } catch {}
  }
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
  try { writeCookie(next); } catch {}
  document.documentElement.lang = LOCALE_TAGS[next];
  for (const listener of listeners) listener();
}
