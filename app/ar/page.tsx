import type { Metadata } from "next";
import LandingClient from "@/app/LandingClient";
import LandingStructuredData from "@/app/components/LandingStructuredData";
import {
  ARABIC_LANDING_TITLE, ARABIC_LANDING_DESCRIPTION, LANDING_LANGUAGES, SITE_URL,
} from "@/lib/landing-seo";

export const metadata: Metadata = {
  title: { absolute: ARABIC_LANDING_TITLE },
  description: ARABIC_LANDING_DESCRIPTION,
  keywords: [
    "وورد أون لاين", "وورد اون لاين مجاني", "محرر نصوص عربي", "محرر نصوص أون لاين",
    "الكتابة بالعربية بدون تحميل", "بديل وورد مجاني", "وورد باد اون لاين",
    "فتح ملفات وورد اون لاين", "تحرير ملفات DOCX", "تصدير مستند PDF", "معالج نصوص عربي مجاني",
  ],
  alternates: { canonical: `${SITE_URL}/ar`, languages: LANDING_LANGUAGES },
  openGraph: {
    title: ARABIC_LANDING_TITLE,
    description: ARABIC_LANDING_DESCRIPTION,
    url: `${SITE_URL}/ar`,
    locale: "ar_SA",
    alternateLocale: ["en_US"],
    siteName: "EDTRpad",
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: "EDTRpad — محرر نصوص أون لاين" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    images: [`${SITE_URL}/opengraph-image`],
    title: ARABIC_LANDING_TITLE,
    description: ARABIC_LANDING_DESCRIPTION,
  },
};

export default function ArabicLandingPage() {
  return <><LandingStructuredData locale="ar" /><LandingClient /></>;
}
