"use client";

import { useRouter } from "next/navigation";
import { Direction } from "radix-ui";
import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_LOCALE, LOCALE_TAGS, getDictionary, isLocale, loadDictionary, subscribeDictionaries,
  type Dictionary, type Locale,
} from "@/lib/i18n";
import {
  getLocaleSnapshot, getServerLocaleSnapshot, setStoredLocale, subscribeLocale,
} from "@/lib/i18n/store";

type FixedLocale = { locale: Locale; dictionary: Dictionary };
const FixedLocaleContext = createContext<FixedLocale | null>(null);

/** URL-specific pages use the same dictionary on the server and client.
 * Other pages retain browser detection and the shared language preference. */
export function I18nProvider({ children, fixedLocale, dictionary }: {
  children: React.ReactNode;
  fixedLocale?: Locale;
  dictionary?: Dictionary;
}) {
  const fixed = fixedLocale && dictionary ? { locale: fixedLocale, dictionary } : null;
  return (
    <FixedLocaleContext.Provider value={fixed}>
      <LocaleEffects>{children}</LocaleEffects>
    </FixedLocaleContext.Provider>
  );
}

function LocaleEffects({ children }: { children: React.ReactNode }) {
  const locale = useLocaleValue();
  const fixed = useContext(FixedLocaleContext);

  useEffect(() => {
    document.documentElement.lang = LOCALE_TAGS[locale];
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    // Carry a URL's language into /pad when the visitor opens the editor.
    if (fixed) setStoredLocale(locale);
  }, [locale, fixed]);

  useEffect(() => {
    if (locale !== DEFAULT_LOCALE) loadDictionary(locale).catch(() => {});
  }, [locale]);

  return <Direction.Provider dir={locale === "ar" ? "rtl" : "ltr"}>{children}</Direction.Provider>;
}

function useLocaleValue(): Locale {
  const fixed = useContext(FixedLocaleContext);
  const detected = useSyncExternalStore(subscribeLocale, getLocaleSnapshot, getServerLocaleSnapshot);
  return fixed?.locale ?? detected;
}

export function useT(): Dictionary {
  const fixed = useContext(FixedLocaleContext);
  const locale = useLocaleValue();
  return useSyncExternalStore(
    subscribeDictionaries,
    () => fixed?.dictionary ?? getDictionary(locale),
    () => fixed?.dictionary ?? getDictionary(DEFAULT_LOCALE)
  );
}

export function useLocale(): { locale: Locale; setLocale: (l: Locale) => void } {
  const locale = useLocaleValue();
  const fixed = useContext(FixedLocaleContext);
  const router = useRouter();
  const setLocale = useCallback((next: Locale) => {
    setStoredLocale(next);
    // A localized URL must keep its advertised language. Switching languages
    // explicitly leaves that URL instead of swapping its indexable content.
    if (fixed && next !== fixed.locale) router.push("/");
  }, [fixed, router]);
  return { locale, setLocale };
}

export { isLocale };
