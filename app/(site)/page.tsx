import { SOCIAL_IMAGE } from "@/lib/landing-seo";
import type { Metadata } from "next";
import LandingClient from "@/app/LandingClient";
import LandingStructuredData from "@/app/components/LandingStructuredData";
import { LANDING_LANGUAGES } from "@/lib/landing-seo";

export const metadata: Metadata = {
  title: { absolute: "Online Word Processor with a Slash Menu: Free Word Alternative | EDTRpad" },
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
    images: [SOCIAL_IMAGE],
    title: "The online word processor that's already open.",
    description:
      "A free online Word and WordPad alternative with a Notion-style slash menu. Type / for tables, images, headings and export. No download, no account, ready in a second.",
    type: "website",
    url: "https://wordpad.info",
    siteName: "EDTRpad",
  },
  twitter: {
    images: [SOCIAL_IMAGE.url],
    card: "summary_large_image",
    title: "The online word processor that's already open.",
    description:
      "A free online Word and WordPad alternative with a Notion-style slash menu. Type / for tables, images, headings and export. No download, no account, ready in a second.",
  },
  alternates: {
    canonical: "https://wordpad.info",
    languages: LANDING_LANGUAGES,
  },
};

export default function LandingPage() {
  return (
    <>
      <LandingStructuredData locale="en" />
      <LandingClient />
    </>
  );
}
