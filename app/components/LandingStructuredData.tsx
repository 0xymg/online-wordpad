import { en } from "@/lib/i18n/en";
import { ar } from "@/lib/i18n/ar";
import { ARABIC_LANDING_DESCRIPTION, SITE_URL } from "@/lib/landing-seo";

/** Structured answers and steps share their source with the visible copy. */
export default function LandingStructuredData({ locale }: { locale: "en" | "ar" }) {
  const t = locale === "ar" ? ar : en;
  const url = locale === "ar" ? `${SITE_URL}/ar` : SITE_URL;
  const inLanguage = locale === "ar" ? "ar-SA" : "en";
  const faqs = [
    [t.faq.q1, t.faq.a1], [t.faq.q2, t.faq.a2], [t.faq.q3, t.faq.a3],
    [t.faq.q4, t.faq.a4], [t.faq.q5, t.faq.a5], [t.faq.q6, t.faq.a6],
    [t.faq.q7, t.faq.a7], [t.faq.q8, t.faq.a8], [t.faq.q9, t.faq.a9],
    [t.faq.q10, t.faq.a10], [t.faq.q11, t.faq.a11], [t.faq.q12, t.faq.a12],
  ];
  const schemas = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "@id": `${url}#application`,
      name: "EDTRpad",
      alternateName: locale === "ar"
        ? ["محرر نصوص أون لاين", "وورد باد أون لاين", "بديل وورد مجاني"]
        : ["Online WordPad", "WordPad Online", "Free WordPad Replacement"],
      url,
      inLanguage,
      applicationCategory: "ProductivityApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description: locale === "ar" ? ARABIC_LANDING_DESCRIPTION : t.help.aboutBody,
      featureList: [
        t.landing.navSlash, t.landing.navVariables, t.toolbar.insertTable,
        t.toolbar.insertImage, t.file.exportDocx, t.file.exportPdf, t.file.print,
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      url: `${url}#faq`,
      inLanguage,
      mainEntity: faqs.map(([q, a]) => ({
        "@type": "Question", name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      "@id": `${url}#how-to`,
      name: t.landing.howTitle,
      description: t.landing.heroSubtitle,
      inLanguage,
      step: [
        [t.landing.howStep1Title, t.landing.howStep1Desc],
        [t.landing.howStep2Title, t.landing.howStep2Desc],
        [t.landing.howStep3Title, t.landing.howStep3Desc],
      ].map(([name, text], i) => ({
        "@type": "HowToStep", position: i + 1, name, text, url: `${SITE_URL}/pad`,
      })),
    },
  ];

  return schemas.map((schema) => (
    <script key={schema["@id"]} type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
  ));
}
