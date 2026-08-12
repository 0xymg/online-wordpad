import { en, type Dictionary } from "./en";

export type { Dictionary };

export const LOCALES = ["en", "zh", "tr", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

// Only English ships in the initial bundle — it is the default locale and the
// synchronous fallback, so `getDictionary` never returns undefined. The other
// dictionaries (~20 KB each) are code-split behind dynamic import() and fetched
// on demand when the locale is, or becomes, one of them.
const DICTIONARY_LOADERS: Record<Locale, () => Promise<Dictionary>> = {
  en: () => Promise.resolve(en),
  tr: () => import("./tr").then((m) => m.tr),
  zh: () => import("./zh").then((m) => m.zh),
  fr: () => import("./fr").then((m) => m.fr),
};

const loadedDictionaries: Partial<Record<Locale, Dictionary>> = { en };
const pendingLoads: Partial<Record<Locale, Promise<Dictionary>>> = {};
const dictionaryListeners = new Set<() => void>();

/** Notifies when a lazily loaded dictionary becomes available. */
export function subscribeDictionaries(listener: () => void): () => void {
  dictionaryListeners.add(listener);
  return () => { dictionaryListeners.delete(listener); };
}

/**
 * Kick off (or join) the load of a locale's dictionary. Resolves with the
 * dictionary once cached; a failed chunk load rejects and clears the pending
 * slot so a later attempt can retry.
 */
export function loadDictionary(locale: Locale): Promise<Dictionary> {
  const loaded = loadedDictionaries[locale];
  if (loaded) return Promise.resolve(loaded);
  let pending = pendingLoads[locale];
  if (!pending) {
    pending = DICTIONARY_LOADERS[locale]().then(
      (dict) => {
        loadedDictionaries[locale] = dict;
        delete pendingLoads[locale];
        for (const listener of dictionaryListeners) listener();
        return dict;
      },
      (err) => {
        delete pendingLoads[locale];
        throw err;
      }
    );
    pendingLoads[locale] = pending;
  }
  return pending;
}

/** Native language names, for the language picker. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  tr: "Türkçe",
  fr: "Français",
};

/** BCP-47 tag used for <html lang> and locale-aware formatting. */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: "en",
  zh: "zh-CN",
  tr: "tr",
  fr: "fr",
};

/** Names the locale cookie, and the legacy localStorage entry it replaced. */
export const LOCALE_KEY = "wordpad-locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Match a BCP-47 tag to a supported locale: exact first, then the primary
 * subtag, so "zh-Hans-CN" and "fr-CA" still resolve. Returns null when nothing
 * matches, leaving the caller to fall back to English.
 */
export function matchLocale(tag: string | undefined | null): Locale | null {
  if (!tag) return null;
  const lower = tag.toLowerCase();
  if (isLocale(lower)) return lower;
  const primary = lower.split("-")[0];
  return isLocale(primary) ? primary : null;
}

/**
 * The locale to start in: a previous explicit choice wins, otherwise the
 * browser's language list is walked in priority order, otherwise English.
 */
export function detectLocale(stored?: string | null): Locale {
  const explicit = matchLocale(stored);
  if (explicit) return explicit;

  if (typeof navigator !== "undefined") {
    const candidates = navigator.languages?.length
      ? navigator.languages
      : [navigator.language];
    for (const tag of candidates) {
      const match = matchLocale(tag);
      if (match) return match;
    }
  }
  return DEFAULT_LOCALE;
}

/**
 * Synchronous read of the active dictionary. Falls back to English while a
 * lazily loaded dictionary is still in flight, so callers never see undefined;
 * subscribe via `subscribeDictionaries` to re-read once the real one arrives.
 */
export function getDictionary(locale: Locale): Dictionary {
  return loadedDictionaries[locale] ?? en;
}
