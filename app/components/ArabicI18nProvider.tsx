"use client";

import { ar } from "@/lib/i18n/ar";
import { I18nProvider } from "./I18nProvider";

// Import the Arabic dictionary inside the client boundary: its interpolation
// functions cannot be serialized as props from a Server Component.
export default function ArabicI18nProvider({ children }: { children: React.ReactNode }) {
  return <I18nProvider fixedLocale="ar" dictionary={ar}>{children}</I18nProvider>;
}
