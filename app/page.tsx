import type { Metadata } from "next";
import LandingClient from "./LandingClient";
import { en } from "@/lib/i18n/en";

export const metadata: Metadata = {
  title: "Online Word Processor with a Slash Menu: Free Word Alternative | EDTRpad",
  description:
    "A free online Word and WordPad alternative with a Notion-style slash menu. Type / for tables, images, headings and export. No download, no account, ready in a second.",
  keywords: [
    "online word processor",
    "free online word processor",
    "word alternative",
    "microsoft word alternative",
    "free word processor",
    "browser word processor",
    "online word editor",
    "online text editor",
    "rich text editor online",
    "online document editor",
    "word editor online no download",
    "no install word processor",
    "open docx online",
    "docx editor online",
    "wordpad alternative",
    "wordpad online",
    "online wordpad",
    "free wordpad",
    "wordpad replacement",
    "wordpad removed windows 11",
  ],
  openGraph: {
    title: "The online word processor that's already open.",
    description:
      "A free online Word and WordPad alternative with a Notion-style slash menu. Type / for tables, images, headings and export. No download, no account, ready in a second.",
    type: "website",
    url: "https://wordpad.info",
    siteName: "EDTRpad",
  },
  twitter: {
    card: "summary_large_image",
    title: "The online word processor that's already open.",
    description:
      "A free online Word and WordPad alternative with a Notion-style slash menu. Type / for tables, images, headings and export. No download, no account, ready in a second.",
  },
  alternates: {
    canonical: "https://wordpad.info",
  },
};

const jsonLdSoftwareApp = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "EDTRpad",
  alternateName: ["Online WordPad", "WordPad Online", "Free WordPad Replacement"],
  url: "https://wordpad.info",
  applicationCategory: "WordProcessor",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  description:
    "Free online word processor and Word alternative that runs in your browser. Rich text, tables, images, page breaks, .docx import and export, and exact print margins. No download, no account.",
  featureList: [
    "Slash command menu",
    "Document variables that fill themselves in ([[name]], [[email]], [[today]])",
    "Date variables in any format, e.g. [[today::DD.MM.YYYY]]",
    "Rich text formatting (bold, italic, underline, strikethrough)",
    "Font families, font sizes, text color, highlight color",
    "Bulleted and numbered lists",
    "Tables from a visual grid picker",
    "Paste, resize, crop, rotate, flip and align images",
    "Real page breaks on screen and in print",
    "Opens .docx, .txt and .html files",
    "Exports Word (.docx), HTML, and plain text",
    "Print with exact page margins (0.5 cm to 2 cm)",
    "Autosave on every keystroke",
    "Unlimited undo and redo",
  ],
  screenshot: "https://wordpad.info/opengraph-image",
};

/* Both the on-page FAQ and this schema read from the English dictionary, so
   the JSON-LD answers always match the rendered ones exactly. */
const faqs = [
  { q: en.faq.q1, a: en.faq.a1 },
  { q: en.faq.q2, a: en.faq.a2 },
  { q: en.faq.q3, a: en.faq.a3 },
  { q: en.faq.q4, a: en.faq.a4 },
  { q: en.faq.q5, a: en.faq.a5 },
  { q: en.faq.q6, a: en.faq.a6 },
  { q: en.faq.q7, a: en.faq.a7 },
  { q: en.faq.q8, a: en.faq.a8 },
  { q: en.faq.q9, a: en.faq.a9 },
  { q: en.faq.q10, a: en.faq.a10 },
  { q: en.faq.q11, a: en.faq.a11 },
  { q: en.faq.q12, a: en.faq.a12 },
];

const jsonLdFaq = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.a,
    },
  })),
};

const jsonLdHowTo = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to use EDTRpad, the online WordPad",
  description:
    "How to write, format, and export documents with EDTRpad, a free browser-based word processor.",
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: en.landing.howStep1Title,
      text: en.landing.howStep1Desc,
      url: "https://wordpad.info/pad",
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: en.landing.howStep2Title,
      text: en.landing.howStep2Desc,
      url: "https://wordpad.info/pad",
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: en.landing.howStep3Title,
      text: en.landing.howStep3Desc,
      url: "https://wordpad.info/pad",
    },
  ],
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSoftwareApp) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFaq) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdHowTo) }}
      />
      <LandingClient />
    </>
  );
}
