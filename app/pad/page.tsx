import Editor from "../components/Editor";

export const metadata = {
  title: "Online WordPad Editor — Free Word Processor in Your Browser",
  description:
    "Open the free online word processor instantly. Bold, tables, images, export to Word (.docx) and RTF. No install, no login required. The best online WordPad alternative.",
  keywords: [
    "online wordpad editor",
    "free word processor browser",
    "online word editor",
    "online microsoft word alternative",
    "word processor no download",
    "browser word editor",
  ],
  alternates: {
    canonical: "https://wordpad.info/pad",
  },
  openGraph: {
    title: "EDTRpad Editor — Free Online WordPad",
    description: "Write and format documents in your browser. Export to Word (.docx), RTF, HTML, or TXT. No install.",
    url: "https://wordpad.info/pad",
    type: "website" as const,
    siteName: "EDTRpad",
  },
  twitter: {
    card: "summary_large_image" as const,
    title: "EDTRpad Editor — Free Online WordPad",
    description: "Write and format documents in your browser. No install, no login.",
  },
};

export default function PadPage() {
  return <Editor />;
}
