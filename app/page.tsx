import type { Metadata } from "next";
import LandingClient from "./LandingClient";

export const metadata: Metadata = {
  title: "EDTRpad: Online WordPad & Free Online Word Alternative | No Install",
  description:
    "Free online WordPad and Microsoft Word alternative. An online word processor in your browser: rich text, tables, images, export to Word (.docx), print. No install, no account.",
  keywords: [
    "online wordpad",
    "wordpad online",
    "free wordpad",
    "online word",
    "online microsoft word",
    "online word editor",
    "online word processor",
    "online text editor",
    "online editor",
    "word alternative",
    "microsoft word alternative",
    "office word alternative",
    "online office word",
    "online office",
    "online open office",
    "online microsoft word alternative",
    "microsoft word alternative online",
    "free online word processor",
    "word processor online free",
    "wordpad alternative",
    "wordpad in browser",
    "browser word processor",
    "free online wordpad",
    "rich text editor online",
    "online document editor",
    "no install word processor",
    "word editor online no download",
  ],
  openGraph: {
    title: "EDTRpad: Online WordPad & Free Online Word Alternative",
    description:
      "Free online WordPad & Microsoft Word alternative. Rich text, tables, images, export to Word (.docx). No install, no account.",
    type: "website",
    url: "https://wordpad.info",
    siteName: "EDTRpad",
  },
  twitter: {
    card: "summary_large_image",
    title: "EDTRpad: Online WordPad & Free Online Word Alternative",
    description:
      "Free online WordPad & Microsoft Word alternative. No install, no account required.",
  },
  alternates: {
    canonical: "https://wordpad.info",
  },
};

const faqs = [
  {
    q: "Do I need to create an account?",
    a: "No. You can open the editor and start typing immediately, no registration required. A free account is optional and lets you save multiple documents to the cloud and sync them across your devices.",
  },
  {
    q: "Are my documents saved?",
    a: "Yes. Without an account, your document is automatically saved to your browser's local storage on the current device. When you sign in, your documents and preferences are saved to your account and synced across devices.",
  },
  {
    q: "Can I export to Microsoft Word format?",
    a: "Yes. Use File → Export → Word (.docx) to download a .docx file compatible with Microsoft Word and Google Docs.",
  },
  {
    q: "Does it work offline?",
    a: "Yes. The editor is a Progressive Web App: after your first visit it opens and works fully offline, and you can install it from your browser like a desktop app.",
  },
  {
    q: "Can I open my existing Word or text files?",
    a: "Yes. Use File → Open (or Ctrl+O) to open .docx, .txt, and .html files directly in the editor, then export them back to Word (.docx) or Rich Text (.rtf) when you're done.",
  },
  {
    q: "Is it free?",
    a: "Yes. Every feature is free to use, with no paywalls, no premium tiers, and no subscription. An account is optional and also free.",
  },
  {
    q: "Is this an online Microsoft Word?",
    a: "No. EDTRpad is an independent online word processor and is not affiliated with Microsoft. It covers the everyday features people open Word for, and it reads and writes Word (.docx) files, so it works as a free online Word alternative.",
  },
  {
    q: "Can I use it instead of Office or OpenOffice?",
    a: "For everyday documents, yes. EDTRpad handles rich text, tables, images, and printing, and exports Word (.docx) and Rich Text (.rtf) files that Microsoft Office, OpenOffice, and LibreOffice all open. For heavy features like mail merge or tracked changes you still need a full office suite.",
  },
  {
    q: "What browsers are supported?",
    a: "Chrome, Edge, Firefox, and Safari. All modern browsers are supported. We recommend Chrome for best print quality.",
  },
];

const jsonLdWebApp = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "EDTRpad",
  alternateName: [
    "Online WordPad",
    "Online Word Editor",
    "Online Word Alternative",
    "Online Microsoft Word Alternative",
    "Online Office Word Editor",
    "Online Text Editor",
    "Free Word Processor Online",
  ],
  url: "https://wordpad.info",
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Any",
  browserRequirements: "Requires a modern browser (Chrome, Edge, Firefox, Safari)",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  description:
    "Free online WordPad and Microsoft Word alternative. A browser-based word processor with bold, italic, tables, images, export to Word (.docx) and RTF, and print support. No install, no account required.",
  featureList: [
    "Rich text formatting (bold, italic, underline, strikethrough, superscript, subscript)",
    "Font families, font sizes, text color, highlight color",
    "Insert tables with visual grid picker",
    "Insert, upload, resize, crop and rotate images",
    "Open .docx, .txt and .html files",
    "Page breaks with A4 page rendering",
    "Export to Word (.docx), Rich Text (.rtf), HTML, and plain text (.txt)",
    "Print with configurable page margins",
    "Unlimited undo and redo",
    "Emoji picker",
    "Slash command menu",
    "Auto-save to browser local storage or your free account",
  ],
  screenshot: "https://wordpad.info/opengraph-image",
};

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
  name: "How to use Online WordPad",
  description:
    "How to write, format, and export documents using Online WordPad, a free browser-based word processor.",
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "Open the editor",
      text: 'Click "Start Writing" and the editor opens instantly in your browser. No download or sign-up required.',
      url: "https://wordpad.info/pad",
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "Write and format",
      text: "Format text with the toolbar or type / for the command menu. Insert tables, images, and page breaks.",
      url: "https://wordpad.info/pad",
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "Export or print",
      text: "Download your document as .docx, .html, or .txt. Or print directly with your preferred page margins.",
      url: "https://wordpad.info/pad",
    },
  ],
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdWebApp) }}
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
