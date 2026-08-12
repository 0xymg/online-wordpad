import type { Metadata } from "next";
import Link from "next/link";
import { TextB }               from "@phosphor-icons/react/dist/ssr/TextB";
import { Table }               from "@phosphor-icons/react/dist/ssr/Table";
import { ImageSquare }         from "@phosphor-icons/react/dist/ssr/ImageSquare";
import { Article }             from "@phosphor-icons/react/dist/ssr/Article";
import { Export }              from "@phosphor-icons/react/dist/ssr/Export";
import { Printer }             from "@phosphor-icons/react/dist/ssr/Printer";
import { Clock }               from "@phosphor-icons/react/dist/ssr/Clock";
import { Lock }                from "@phosphor-icons/react/dist/ssr/Lock";
import { Command }             from "@phosphor-icons/react/dist/ssr/Command";
import { CloudArrowUp }        from "@phosphor-icons/react/dist/ssr/CloudArrowUp";
import { Files }               from "@phosphor-icons/react/dist/ssr/Files";
import { Moon }                from "@phosphor-icons/react/dist/ssr/Moon";
import { MagnifyingGlass }     from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import ToolbarPreviewClient from "./components/ToolbarPreviewClient";

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

const features = [
  {
    Icon: CloudArrowUp,
    title: "Accounts & Cloud Sync",
    desc: "Create a free account to save your documents to the cloud and pick up where you left off on any device. No account needed to start.",
  },
  {
    Icon: Files,
    title: "Multiple Documents",
    desc: "With a free account, manage all your work from a built-in sidebar: create, rename, organize into folders, and switch documents without leaving the editor.",
  },
  {
    Icon: Moon,
    title: "Dark Mode",
    desc: "Switch between light and dark themes for comfortable writing day or night. Your theme and layout preferences sync with your account.",
  },
  {
    Icon: TextB,
    title: "Rich Text Editing",
    desc: "Bold, italic, underline, strikethrough, font families, sizes, text and highlight colors. Everything you expect from a text editor.",
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
    Icon: MagnifyingGlass,
    title: "Find & Replace",
    desc: "Search your document and replace text in one place. Every match is highlighted. Press Ctrl+F to open.",
  },
  {
    Icon: Article,
    title: "Page Breaks",
    desc: "Insert real page breaks that work on screen and in print. Pages render as A4 paper.",
  },
  {
    Icon: Export,
    title: "Import & Export",
    desc: "Open .docx, .txt, and .html files. Save as Word (.docx), Rich Text (.rtf), HTML, or plain text (.txt) with formatting included.",
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
    Icon: Command,
    title: "Command Menu",
    desc: "Type / anywhere in the document to open a command menu. Insert headings, lists, tables, images, emoji, and more without touching the toolbar.",
  },
];

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
    <div className="pad-marketing min-h-screen font-sans">
      {/* ── Announcement banner ── */}
      <div className="border-b border-[var(--pad-border)] text-[13px]">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-6 py-2 text-center">
          <span className="inline-flex items-center gap-2">
            <span className="rounded-full border border-[var(--pad-border-strong)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--pad-ink-70)]">
              New
            </span>
            <span className="text-[var(--pad-ink-70)]">
              Accounts are here. Save and sync your documents across devices.
            </span>
          </span>
          <Link href="/signup" className="whitespace-nowrap font-medium underline underline-offset-4 decoration-[var(--pad-border-strong)] hover:decoration-current">
            Sign up free →
          </Link>
        </div>
      </div>

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b border-[var(--pad-border)] bg-[var(--pad-bg)]/85 backdrop-blur-md">
        {/* Nav is absolutely centered: with justify-between it would sit
            wherever the logo and the CTA leave room, which is not the middle. */}
        <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <span className="font-brand leading-none">
            <span className="text-2xl font-bold tracking-tight">EDTR</span>
            <span className="text-lg font-semibold tracking-wider text-[var(--pad-ink-50)]">PAD</span>
          </span>
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 text-[13px] text-[var(--pad-ink-50)] sm:flex">
            <a href="#features" className="transition-colors hover:text-[var(--pad-ink)]">Features</a>
            <a href="#how" className="transition-colors hover:text-[var(--pad-ink)]">How it works</a>
            <a href="#privacy" className="transition-colors hover:text-[var(--pad-ink)]">Privacy</a>
            <a href="#faq" className="transition-colors hover:text-[var(--pad-ink)]">FAQ</a>
            <Link href="/guides" className="transition-colors hover:text-[var(--pad-ink)]">Guides</Link>
          </nav>
          <Link
            href="/pad"
            className="rounded-full bg-[var(--pad-ink)] px-4 py-2 text-[13px] font-semibold text-[var(--pad-bg)] transition-opacity hover:opacity-90"
          >
            Open editor →
          </Link>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="relative overflow-hidden px-6 pb-16 pt-20 sm:pt-28">
          <div className="pad-hero-glow" aria-hidden />
          <div className="relative mx-auto max-w-4xl text-center">
            <h1 className="pad-display text-[clamp(2.75rem,8vw,4.75rem)]">
              Just write.
              <br />
              Right in your browser.
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-[var(--pad-ink-70)] sm:text-xl">
              A free online WordPad and Word alternative. Rich text, tables, images,
              and printing, without installing anything or creating an account.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/pad"
                className="w-full rounded-full bg-[var(--pad-ink)] px-8 py-3.5 text-base font-semibold text-[var(--pad-bg)] transition-opacity hover:opacity-90 sm:w-auto"
              >
                Start writing →
              </Link>
              <a
                href="#features"
                className="w-full rounded-full border border-[var(--pad-border-strong)] px-8 py-3.5 text-base font-medium text-[var(--pad-ink-70)] transition-colors hover:border-[var(--pad-ink)] hover:text-[var(--pad-ink)] sm:w-auto"
              >
                See features
              </a>
            </div>
          </div>

          {/* ── Editor Preview ── */}
          <div className="relative mx-auto mt-16 max-w-5xl">
            {/* text-gray-900 matters: the surrounding page is cream-on-dark and
                the preview's icons inherit currentColor. */}
            <div
              className="preview-animated-shadow light overflow-hidden rounded-2xl border border-[var(--pad-border-strong)] text-gray-900"
              style={{ colorScheme: "light" }}
            >
              {/* Browser chrome */}
              <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-100 px-4 py-2.5">
                <span className="size-3 rounded-full bg-[#ff5f57]" />
                <span className="size-3 rounded-full bg-[#febc2e]" />
                <span className="size-3 rounded-full bg-[#28c840]" />
                <span className="ml-3 max-w-xs flex-1 rounded bg-white px-3 py-1 text-xs text-gray-400">
                  wordpad.info/pad
                </span>
              </div>
              {/* Real Toolbar — pointer-events-none, decorative */}
              <ToolbarPreviewClient />
              {/* Fake page */}
              <div className="flex justify-center bg-gray-50 p-6">
                <div className="min-h-[220px] w-full max-w-lg space-y-3 rounded bg-white p-8 text-sm text-gray-800 shadow-md">
                  <h2 className="text-xl font-bold">Meeting Notes: Q3 Planning</h2>
                  <p className="text-xs text-gray-500">September 2024 · Confidential</p>
                  <p>
                    <strong>Attendees:</strong> Alice, Bob, Carol
                  </p>
                  <p>The team agreed on the following action items for the upcoming quarter:</p>
                  <ul className="list-disc space-y-1 pl-5 text-gray-700">
                    <li>Finalize product roadmap by <u>Oct 1</u></li>
                    <li>Schedule bi-weekly syncs with design team</li>
                    <li>Complete migration to new infrastructure</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* ── Hero subtext (SEO) ── */}
          <p className="mx-auto mt-12 max-w-3xl text-center text-[15px] leading-relaxed text-[var(--pad-ink-50)]">
            Online WordPad is a free browser-based online text editor for everyday writing tasks: drafting documents, taking notes, writing reports, or composing letters. It works as a lightweight online Word in the spirit of classic desktop editors like WordPad, and requires no software installation.
          </p>
        </section>

        {/* ── Trust strip ── */}
        <section className="border-y border-[var(--pad-border)]">
          <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-[var(--pad-border)] px-6 sm:grid-cols-4">
            {[
              { k: "0", v: "downloads needed" },
              { k: "5", v: "export formats" },
              { k: "∞", v: "undo history" },
              { k: "$0", v: "no subscription" },
            ].map((s) => (
              <div key={s.v} className="px-4 py-6 text-center">
                <div className="pad-display text-2xl">{s.k}</div>
                <div className="mt-1 text-xs text-[var(--pad-ink-50)]">{s.v}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="pad-display text-[clamp(2rem,5vw,3rem)]">Everything you need to write</h2>
              <p className="mt-4 text-lg text-[var(--pad-ink-70)]">
                A full-featured word processor that runs entirely in your browser.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-[var(--pad-ink-50)]">
                Unlike plain text editors, Online WordPad supports rich formatting: bold, italic, font families, font sizes, text color, and highlight color. You can insert tables, images, and page breaks. Documents export as Word (.docx), HTML, or plain text (.txt).
              </p>
            </div>
            {/* gap-px divider grid — keep the feature count divisible by both 2
                and 3, or the empty cells in the last row show as dark blocks. */}
            <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-[var(--pad-border)] bg-[var(--pad-border)] sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="bg-[var(--pad-bg)] p-6 transition-colors hover:bg-[var(--pad-surface)]"
                >
                  <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-[var(--pad-border)] bg-[var(--pad-surface-2)]">
                    <f.Icon size={20} weight="duotone" />
                  </div>
                  <h3 className="mb-1.5 font-semibold">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-[var(--pad-ink-50)]">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        {/* ── Word alternative (SEO) ── */}
        <section id="word-alternative" className="border-t border-[var(--pad-border)] px-6 py-24">
          <div className="mx-auto max-w-3xl">
            <h2 className="pad-display text-center text-[clamp(2rem,5vw,3rem)]">
              A free online Word alternative
            </h2>
            <div className="mt-8 space-y-5 leading-relaxed text-[var(--pad-ink-70)]">
              <p>
                If you searched for an online Microsoft Word to write a quick document, EDTRpad
                covers the essentials without a license or a download. The online editor opens in
                seconds, reads and writes Word (.docx) files, and prints on A4 paper with proper
                margins.
              </p>
              <p>
                It also works as an online office word editor for people who use OpenOffice or
                LibreOffice at home: open your document in the browser on any computer, make your
                edits, and export it back to Word or Rich Text format. Nothing to install on
                machines you do not own.
              </p>
              <p>
                To be clear about the trade-off: this is not a full online office suite. There is
                no mail merge, no tracked changes, and no spreadsheet. For letters, notes, reports,
                homework, and forms, that focus is exactly what keeps it fast.
              </p>
            </div>
          </div>
        </section>

        <section id="how" className="border-t border-[var(--pad-border)] px-6 py-24">
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="pad-display text-[clamp(2rem,5vw,3rem)]">How to use Online WordPad</h2>
              <p className="mt-4 text-lg text-[var(--pad-ink-70)]">
                Open, write, export. That&apos;s the whole flow.
              </p>
            </div>
            <div className="mt-14 grid gap-10 sm:grid-cols-3">
              {[
                { step: "1", title: "Open", desc: 'Click "Start writing" and the editor opens instantly. No download, no sign-up.' },
                { step: "2", title: "Write", desc: "Format text, insert tables and images, add page breaks, and structure your document." },
                { step: "3", title: "Export or print", desc: "Download as .docx, .html, or .txt. Or print with exact margins." },
              ].map((s) => (
                <div key={s.step}>
                  <div className="mb-4 flex size-11 items-center justify-center rounded-full border border-[var(--pad-border-strong)] text-lg font-semibold">
                    {s.step}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{s.title}</h3>
                  <p className="leading-relaxed text-[var(--pad-ink-50)]">{s.desc}</p>
                </div>
              ))}
            </div>
            <p className="mx-auto mt-12 max-w-3xl text-center text-sm leading-relaxed text-[var(--pad-ink-50)]">
              You can begin writing immediately after opening the editor. Your content is saved automatically after every change. Use File &gt; Export to save as .docx, .html, or .txt at any time. Press Ctrl+P or use File &gt; Print to print with your preferred page margins.
            </p>
          </div>
        </section>

        {/* ── Privacy callout ── */}
        <section id="privacy" className="border-t border-[var(--pad-border)] px-6 py-24">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-[var(--pad-border)] bg-[var(--pad-surface)]">
              <Lock size={26} weight="duotone" />
            </div>
            <h2 className="pad-display text-[clamp(2rem,5vw,3rem)]">Private by default</h2>
            <p className="text-lg leading-relaxed text-[var(--pad-ink-70)]">
              No account needed: your documents are stored in your browser&apos;s local storage and never
              leave your device. We don&apos;t see your content.
            </p>
            <p className="text-sm leading-relaxed text-[var(--pad-ink-50)]">
              Open the website, start typing, and your work is saved automatically on your device. If you
              choose to create a free account, your documents sync to your private cloud space so you can
              continue on any device. They are never shared or used for anything else.
            </p>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="border-t border-[var(--pad-border)] px-6 py-24">
          <div className="mx-auto max-w-3xl">
            <h2 className="pad-display text-center text-[clamp(2rem,5vw,3rem)]">Common questions</h2>
            <div className="mt-12 divide-y divide-[var(--pad-border)] border-y border-[var(--pad-border)]">
              {faqs.map((faq) => (
                <details key={faq.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium transition-colors hover:text-[var(--pad-ink)]">
                    {faq.q}
                    <span className="text-xl leading-none text-[var(--pad-ink-50)] transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <div className="pb-5 leading-relaxed text-[var(--pad-ink-50)]">{faq.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="border-t border-[var(--pad-border)] px-6 py-24">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="pad-display text-[clamp(2rem,5vw,3.25rem)]">Ready to start writing?</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-[var(--pad-ink-70)]">
              No account required. No download. Just open the editor and start.
            </p>
            <Link
              href="/pad"
              className="mt-9 inline-block rounded-full bg-[var(--pad-ink)] px-10 py-4 text-base font-semibold text-[var(--pad-bg)] transition-opacity hover:opacity-90"
            >
              Open Online WordPad →
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--pad-border)] px-6 py-12">
        <div className="mx-auto grid max-w-6xl gap-8 sm:grid-cols-3">
          <div>
            <span className="font-brand leading-none">
              <span className="text-lg font-bold tracking-tight text-[var(--pad-ink)]">EDTR</span>
              <span className="text-sm font-semibold tracking-wider text-[var(--pad-ink-50)]">PAD</span>
            </span>
            <p className="mt-2 text-sm text-[var(--pad-ink-50)]">
              A free online WordPad and Word alternative.
            </p>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pad-ink-50)]">
              EDTRpad
            </h3>
            <div className="mt-3 flex flex-col gap-2 text-sm text-[var(--pad-ink-50)]">
              <Link href="/pad" className="transition-colors hover:text-[var(--pad-ink)]">Editor</Link>
              <Link href="/guides" className="transition-colors hover:text-[var(--pad-ink)]">Guides</Link>
              <a href="/llms.txt" className="transition-colors hover:text-[var(--pad-ink)]">llms.txt</a>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pad-ink-50)]">
              More from EDTR
            </h3>
            <div className="mt-3 flex flex-col gap-2 text-sm text-[var(--pad-ink-50)]">
              <a
                href="https://edtr.md"
                target="_blank"
                rel="noopener"
                className="transition-colors hover:text-[var(--pad-ink)]"
              >
                EDTR.md — Markdown editor
              </a>
              <a
                href="https://edtr.plus"
                target="_blank"
                rel="noopener"
                className="transition-colors hover:text-[var(--pad-ink)]"
              >
                EDTR.plus
              </a>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-10 max-w-6xl border-t border-[var(--pad-border)] pt-6 text-sm text-[var(--pad-ink-50)]">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <span>© {new Date().getFullYear()} EDTRpad · Free Online WordPad</span>
            <span>
              Part of project EDTR, brought to you by{" "}
              <a
                href="https://ymg.digital"
                target="_blank"
                rel="noopener"
                className="font-medium text-[var(--pad-ink)] transition-opacity hover:opacity-70"
              >
                ymg.digital
              </a>
            </span>
          </div>
          <p className="mt-6 text-xs leading-relaxed">
            Disclaimer: without an account, EDTRpad stores your document in your browser local storage. If you clear your browser cache or storage, your document will be lost. Please export important files regularly. EDTRpad is an independent project and is not affiliated with Microsoft or the Microsoft WordPad application.
          </p>
        </div>
      </footer>
    </div>
    </>
  );
}
