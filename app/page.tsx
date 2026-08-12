import type { Metadata } from "next";
import LandingClient from "./LandingClient";
import { en } from "@/lib/i18n/en";

export const metadata: Metadata = {
  title: "WordPad Online: Free Word Processor in Your Browser | EDTRpad",
  description:
    "Microsoft removed WordPad from Windows. EDTRpad is the free online replacement: rich text, tables, images, .docx export, offline. No download, no account.",
  keywords: [
    "online wordpad",
    "wordpad online",
    "free wordpad",
    "wordpad removed windows 11",
    "wordpad replacement",
    "wordpad alternative",
    "wordpad in browser",
    "online word processor",
    "free online word processor",
    "online word editor",
    "online text editor",
    "word alternative",
    "microsoft word alternative",
    "browser word processor",
    "free online wordpad",
    "rich text editor online",
    "online document editor",
    "no install word processor",
    "word editor online no download",
    "open docx online",
    "docx editor online",
  ],
  openGraph: {
    title: "Windows took WordPad away. Here it is, in your browser.",
    description:
      "EDTRpad is the free online WordPad replacement: rich text, tables, images, .docx export, offline. No download, no account.",
    type: "website",
    url: "https://wordpad.info",
    siteName: "EDTRpad",
  },
  twitter: {
    card: "summary_large_image",
    title: "Windows took WordPad away. Here it is, in your browser.",
    description:
      "EDTRpad is the free online WordPad replacement: rich text, tables, images, .docx export, offline. No download, no account.",
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
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  description:
    "Free online word processor that replaces the WordPad Microsoft removed from Windows. Rich text, tables, images, page breaks, .docx import and export, exact print margins, and full offline support. No download, no account.",
  featureList: [
    "Rich text formatting (bold, italic, underline, strikethrough)",
    "Font families, font sizes, text color, highlight color",
    "Bulleted and numbered lists",
    "Tables from a visual grid picker",
    "Paste, resize, crop, rotate, flip and align images",
    "Real page breaks on screen and in print",
    "Opens .docx, .txt and .html files",
    "Exports Word (.docx), HTML, and plain text",
    "Works fully offline as a Progressive Web App",
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
