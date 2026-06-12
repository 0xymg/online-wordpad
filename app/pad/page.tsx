import Editor from "../components/Editor";

export const metadata = {
  title: "Online WordPad Editor — Free Word Processor in Your Browser",
  description:
    "Open the free online word processor instantly. Bold, tables, images, export to Word (.docx). No install, no login required. The best online WordPad alternative.",
  keywords: [
    "online wordpad editor",
    "free word processor browser",
    "online word editor",
    "online microsoft word alternative",
    "word processor no download",
    "browser word editor",
  ],
  alternates: {
    canonical: "https://wordpad.online/pad",
  },
  openGraph: {
    title: "Online WordPad Editor — Free Word Processor",
    description: "Write and format documents in your browser. Export to Word (.docx), HTML, or TXT. No install.",
    url: "https://wordpad.online/pad",
    type: "website" as const,
    siteName: "Online WordPad",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image" as const,
    title: "Online WordPad Editor — Free Word Processor",
    description: "Write and format documents in your browser. No install, no login.",
    images: ["/og-image.png"],
  },
};

export default function PadPage() {
  return <Editor />;
}
