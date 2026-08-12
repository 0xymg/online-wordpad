"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { LOCALE_TAGS, getDictionary, isLocale, type Dictionary, type Locale } from "@/lib/i18n";
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

  return <>{children}</>;
}

function useLocaleValue(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocaleSnapshot, getServerLocaleSnapshot);
}

/** The active dictionary: `const t = useT(); t.menu.file` */
export function useT(): Dictionary {
  return getDictionary(useLocaleValue());
}

export function useLocale(): { locale: Locale; setLocale: (l: Locale) => void } {
  const locale = useLocaleValue();
  const setLocale = useCallback((next: Locale) => setStoredLocale(next), []);
  return { locale, setLocale };
}

export { isLocale };
