"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_LOCALE, LOCALE_TAGS, getDictionary, isLocale, loadDictionary, subscribeDictionaries,
  type Dictionary, type Locale,
} from "@/lib/i18n";
import {
  getLocaleSnapshot, getServerLocaleSnapshot, setStoredLocale, subscribeLocale,
} from "@/lib/i18n/store";

/**
 * Locale is resolved on the client, so the server-rendered HTML (and anything a
 * crawler sees) stays English while the visitor gets their own language after
 * hydration. An explicit choice is stored and always wins over the browser's
 * language list.
 *
 * There is no React context here: the locale lives in a module-level store, so
 * any client component can read it directly with `useT()`.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocaleValue();

  useEffect(() => {
    document.documentElement.lang = LOCALE_TAGS[locale];
  }, [locale]);

  // Non-English dictionaries are code-split; fetch the active one so `useT()`
  // consumers swap from the English fallback once it arrives. A failed chunk
  // load just leaves the UI in English.
  useEffect(() => {
    if (locale !== DEFAULT_LOCALE) loadDictionary(locale).catch(() => {});
  }, [locale]);

  return <>{children}</>;
}

function useLocaleValue(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocaleSnapshot, getServerLocaleSnapshot);
}

/**
 * The active dictionary: `const t = useT(); t.menu.file`
 *
 * Two subscriptions back this: the locale store (re-render on switch) and the
 * dictionary registry (re-render when a lazily loaded dictionary arrives).
 * Until the chunk lands, `getDictionary` serves English, so the return value
 * is always a complete Dictionary — never undefined, never partial.
 */
export function useT(): Dictionary {
  const locale = useLocaleValue();
  return useSyncExternalStore(
    subscribeDictionaries,
    () => getDictionary(locale),
    () => getDictionary(DEFAULT_LOCALE)
  );
}

export function useLocale(): { locale: Locale; setLocale: (l: Locale) => void } {
  const locale = useLocaleValue();
  const setLocale = useCallback((next: Locale) => setStoredLocale(next), []);
  return { locale, setLocale };
}

export { isLocale };
