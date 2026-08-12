import { en, type Dictionary } from "./en";
import { tr } from "./tr";
import { zh } from "./zh";
import { fr } from "./fr";

export type { Dictionary };

export const LOCALES = ["en", "zh", "tr", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const DICTIONARIES: Record<Locale, Dictionary> = { en, zh, tr, fr };

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

export const LOCALE_STORAGE_KEY = "wordpad-locale";

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

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}
