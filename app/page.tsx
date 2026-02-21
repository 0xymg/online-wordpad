import type { Metadata } from "next";
import Link from "next/link";
import { TextB }               from "@phosphor-icons/react/dist/ssr/TextB";
import { Table }               from "@phosphor-icons/react/dist/ssr/Table";
import { ImageSquare }         from "@phosphor-icons/react/dist/ssr/ImageSquare";
import { Article }             from "@phosphor-icons/react/dist/ssr/Article";
import { Export }              from "@phosphor-icons/react/dist/ssr/Export";
import { Printer }             from "@phosphor-icons/react/dist/ssr/Printer";
import { Clock }               from "@phosphor-icons/react/dist/ssr/Clock";
import { Smiley }              from "@phosphor-icons/react/dist/ssr/Smiley";
import { Lock }                from "@phosphor-icons/react/dist/ssr/Lock";
import ToolbarPreviewClient from "./components/ToolbarPreviewClient";

export const metadata: Metadata = {
  title: "Online WordPad — Free Browser Word Processor | No Install Required",
  description:
    "Online WordPad is a free, browser-based word processor. Rich text editing, tables, images, page breaks, export to DOCX/HTML/TXT, and print — all without installing anything.",
  keywords: [
    "online word processor",
    "browser word processor",
    "free online wordpad",
    "online text editor",
    "no install word processor",
    "rich text editor online",
    "online document editor",
  ],
  openGraph: {
    title: "Online WordPad — Free Browser Word Processor",
    description:
      "Rich text editing, tables, images, export and print — directly in your browser. No install, no login.",
    type: "website",
    url: "https://wordpad.online",
  },
  twitter: {
    card: "summary_large_image",
    title: "Online WordPad — Free Browser Word Processor",
    description: "Rich text editing in your browser. No install, no login.",
  },
  alternates: {
    canonical: "https://wordpad.online",
  },
};

const features = [
  {
    Icon: TextB,
    title: "Rich Text Editing",
    desc: "Bold, italic, underline, strikethrough, font families, sizes, text & highlight colors — everything you expect from a word processor.",
  },
  {
    Icon: Table,
    title: "Tables",
    desc: "Insert tables with a visual grid picker. Add/remove rows and columns, resize cells, full keyboard navigation.",
  },
  {
    Icon: ImageSquare,
    title: "Images",
    desc: "Paste or upload images. Resize, crop, rotate, flip and align them within the document.",
  },
  {
    Icon: Article,
    title: "Page Breaks",
    desc: "Insert real page breaks that work on screen and in print. Pages render as A4 paper.",
  },
  {
    Icon: Export,
    title: "Export",
    desc: "Save as Word (.docx), HTML, or plain text (.txt). Your document, your format.",
  },
  {
    Icon: Printer,
    title: "Print",
    desc: "Print with exact margins. Set 0.5 cm to 2 cm page margins and get exactly that on paper.",
  },
  {
    Icon: Clock,
    title: "Undo / Redo",
    desc: "Full history with unlimited undo and redo steps. Keyboard shortcuts Ctrl+Z / Ctrl+Y.",
  },
  {
    Icon: Smiley,
    title: "Emoji",
    desc: "Insert emoji anywhere in your document with a searchable emoji picker.",
  },
];

const faqs = [
  {
    q: "Do I need to create an account?",
    a: "No. Online WordPad works without any registration or login. Open the editor and start typing immediately.",
  },
  {
    q: "Are my documents saved?",
    a: "Your document is automatically saved to your browser's local storage. It persists across page refreshes on the same device. No data is sent to any server.",
  },
  {
    q: "Can I export to Microsoft Word format?",
    a: "Yes. Use File → Export → Word (.docx) to download a .docx file compatible with Microsoft Word and Google Docs.",
  },
  {
    q: "Does it work offline?",
    a: "Once the page is loaded, editing works completely offline. Fonts and some resources may require an internet connection on first load.",
  },
  {
    q: "Is it free?",
    a: "Yes, completely free. No ads, no paywalls, no premium tiers.",
  },
  {
    q: "What browsers are supported?",
    a: "Chrome, Edge, Firefox, and Safari — all modern browsers are supported. We recommend Chrome for best print quality.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-6 flex items-center justify-between h-14">
          <span className="text-lg font-bold tracking-tight">
            Online <span className="text-blue-600">WordPad</span>
          </span>
          <nav className="hidden sm:flex items-center gap-6 text-sm text-gray-600">
            <a href="#features" className="hover:text-gray-900 transition-colors">Features</a>
            <a href="#faq" className="hover:text-gray-900 transition-colors">FAQ</a>
          </nav>
          <Link
            href="/pad"
            className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Open Editor
          </Link>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="mx-auto max-w-5xl px-6 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 bg-slate-100 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-full mb-6">
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
            Free · No account · Works in your browser
          </div>
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight leading-tight mb-6">
            The word processor
            <br />
            <span className="text-sky-500">that lives in your browser</span>
          </h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            Online WordPad gives you rich text editing, tables, images, and printing
            — without installing anything or creating an account.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/pad"
              className="w-full sm:w-auto bg-slate-800 hover:bg-slate-900 text-white text-base font-semibold px-8 py-3.5 rounded-xl transition-colors shadow-md shadow-slate-200"
            >
              Start Writing — It&apos;s Free
            </Link>
            <a
              href="#features"
              className="w-full sm:w-auto text-gray-600 hover:text-gray-900 text-base font-medium px-8 py-3.5 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors"
            >
              See Features
            </a>
          </div>
        </section>

        {/* ── Editor Preview ── */}
        <section className="mx-auto max-w-5xl px-6 pb-20">
          <div className="rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
            {/* Browser chrome */}
            <div className="bg-gray-100 px-4 py-2.5 flex items-center gap-2 border-b border-gray-200">
              <span className="w-3 h-3 rounded-full bg-red-400" />
              <span className="w-3 h-3 rounded-full bg-yellow-400" />
              <span className="w-3 h-3 rounded-full bg-green-400" />
              <span className="ml-3 flex-1 bg-white rounded text-xs text-gray-400 px-3 py-1 max-w-xs">
                wordpad.online/pad
              </span>
            </div>
            {/* Real Toolbar — pointer-events-none, decorative */}
            <ToolbarPreviewClient />
            {/* Fake page */}
            <div className="bg-gray-50 p-6 flex justify-center">
              <div className="bg-white w-full max-w-lg rounded shadow-md p-8 space-y-3 text-sm text-gray-800 min-h-[220px]">
                <h2 className="text-xl font-bold">Meeting Notes — Q3 Planning</h2>
                <p className="text-gray-500 text-xs">September 2024 · Confidential</p>
                <p>
                  <strong>Attendees:</strong> Alice, Bob, Carol
                </p>
                <p>The team agreed on the following action items for the upcoming quarter:</p>
                <ul className="list-disc pl-5 space-y-1 text-gray-700">
                  <li>Finalize product roadmap by <u>Oct 1</u></li>
                  <li>Schedule bi-weekly syncs with design team</li>
                  <li>Complete migration to new infrastructure</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="bg-gray-50 py-20">
          <div className="mx-auto max-w-5xl px-6">
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Everything you need to write</h2>
              <p className="text-gray-500 text-lg max-w-xl mx-auto">
                A full-featured word processor that runs entirely in your browser.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="bg-white rounded-xl p-5 border border-gray-100 hover:shadow-md transition-shadow"
                >
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-3">
                    <f.Icon size={22} weight="duotone" className="text-slate-600" />
                  </div>
                  <h3 className="font-semibold mb-1.5">{f.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="py-20">
          <div className="mx-auto max-w-5xl px-6">
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">No setup. No friction.</h2>
              <p className="text-gray-500 text-lg max-w-xl mx-auto">
                Three steps stand between you and a finished document.
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-8">
              {[
                { step: "1", title: "Open", desc: 'Click "Start Writing" and the editor opens instantly. No download, no sign-up.' },
                { step: "2", title: "Write", desc: "Format text, insert tables and images, add page breaks, and structure your document." },
                { step: "3", title: "Export or Print", desc: "Download as .docx, .html, or .txt — or print with pixel-perfect margins." },
              ].map((s) => (
                <div key={s.step} className="text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-700 text-white text-xl font-bold flex items-center justify-center mx-auto mb-4">
                    {s.step}
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
                  <p className="text-gray-500 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Privacy callout ── */}
        <section className="bg-blue-600 py-16">
          <div className="mx-auto max-w-5xl px-6 text-center flex flex-col items-center gap-4">
            <Lock size={36} weight="duotone" className="text-blue-200" />
            <h2 className="text-3xl font-bold text-white">Your data never leaves your device</h2>
            <p className="text-blue-100 text-lg max-w-2xl mx-auto">
              Online WordPad has no backend server, no database, and no user accounts.
              Your document is stored in your browser&apos;s local storage. We never see your content.
            </p>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="py-20">
          <div className="mx-auto max-w-3xl px-6">
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Frequently Asked Questions</h2>
            </div>
            <div className="space-y-4">
              {faqs.map((faq) => (
                <details
                  key={faq.q}
                  className="group border border-gray-200 rounded-xl overflow-hidden"
                >
                  <summary className="flex items-center justify-between p-5 cursor-pointer font-medium hover:bg-gray-50 transition-colors list-none">
                    {faq.q}
                    <span className="ml-4 text-gray-400 group-open:rotate-45 transition-transform text-xl leading-none">+</span>
                  </summary>
                  <div className="px-5 pb-5 text-gray-500 leading-relaxed border-t border-gray-100 pt-4">
                    {faq.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="bg-gray-50 py-20">
          <div className="mx-auto max-w-5xl px-6 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to start writing?</h2>
            <p className="text-gray-500 text-lg mb-8 max-w-xl mx-auto">
              No account required. No download. Just open the editor and start.
            </p>
            <Link
              href="/pad"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-base font-semibold px-10 py-4 rounded-xl transition-colors shadow-md shadow-blue-100"
            >
              Open Online WordPad
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-10">
        <div className="mx-auto max-w-5xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <span>
            © {new Date().getFullYear()} Online WordPad · Free &amp; Open Source
          </span>
          <div className="flex items-center gap-6">
            <Link href="/pad" className="hover:text-gray-600 transition-colors">Editor</Link>
            <a href="/llms.txt" className="hover:text-gray-600 transition-colors">llms.txt</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
