"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { TextB, Files, Command, Printer, Lock, CloudArrowUp, Check, Lightning } from "./components/icons";
import ToolbarPreviewClient from "./components/ToolbarPreviewClient";
import { useT, useLocale } from "./components/I18nProvider";
import { LOCALES, LOCALE_NAMES, type Dictionary } from "@/lib/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* The feature cards and FAQ read their copy from the dictionary, so the icons
   and order live here while the words come from the active locale. */
function featureList(t: Dictionary) {
  return [
    { Icon: Command, title: t.features.f1Title, desc: t.features.f1Desc },
    { Icon: TextB,   title: t.features.f2Title, desc: t.features.f2Desc },
    { Icon: Files,   title: t.features.f3Title, desc: t.features.f3Desc },
    { Icon: Printer, title: t.features.f4Title, desc: t.features.f4Desc },
  ];
}

function faqList(t: Dictionary) {
  return [
    { q: t.faq.q1, a: t.faq.a1 },
    { q: t.faq.q2, a: t.faq.a2 },
    { q: t.faq.q3, a: t.faq.a3 },
    { q: t.faq.q4, a: t.faq.a4 },
    { q: t.faq.q5, a: t.faq.a5 },
    { q: t.faq.q6, a: t.faq.a6 },
    { q: t.faq.q7, a: t.faq.a7 },
    { q: t.faq.q8, a: t.faq.a8 },
    { q: t.faq.q9, a: t.faq.a9 },
    { q: t.faq.q10, a: t.faq.a10 },
    { q: t.faq.q11, a: t.faq.a11 },
    { q: t.faq.q12, a: t.faq.a12 },
  ];
}

/* Demo-strip chips: each inserts its command into the hero editor through the
   window event ToolbarPreview listens for. /export has nothing to export in the
   preview, so it opens the real editor instead (rendered as a link below). */
const DEMO_CHIPS: Array<{ label: string; command: string }> = [
  { label: "/heading", command: "h1" },
  { label: "/table", command: "table" },
  { label: "/image", command: "image" },
  { label: "/list", command: "bullet" },
  { label: "/divider", command: "divider" },
  { label: "/pagebreak", command: "page_break" },
];

/* Scroll the hero editor into view, then (once the scroll has settled) tell the
   lazy ToolbarPreview chunk to focus and, optionally, run a command. */
function heroCommand(command: string) {
  if (typeof window === "undefined") return;
  document.getElementById("hero-editor")?.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent("edtr-hero", { detail: { command } }));
  }, 280);
}

/* Copy carries [[…]] tokens that should render as keyboard-key chips
   (slash-menu paragraph 3). */
function renderKbd(text: string): ReactNode {
  return text.split(/(\[\[[^\]]+\]\])/).map((part, i) =>
    part.startsWith("[[") && part.endsWith("]]") ? (
      <kbd
        key={i}
        className="mx-0.5 inline-block border border-[var(--pad-border-strong)] px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--pad-ink)]"
      >
        {part.slice(2, -2)}
      </kbd>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

/* Copy carries **bold** spans inline (friction paragraph, account bullets), so
   the emphasis lives in the translation string and renders as <strong> here. */
function renderEmphasis(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-[var(--pad-ink)]">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

/* Renders "item · item · item" lines (hero microcopy, trust bar, use cases)
   from a list, so the separator never has to live inside the translations. */
function DotSeparated({ items, className }: { items: string[]; className?: string }) {
  return (
    <span className={className}>
      {items.map((item, i) => (
        <Fragment key={item}>
          {i > 0 && <span aria-hidden className="mx-2 text-[var(--pad-ink-50)]">·</span>}
          <span className="whitespace-nowrap">{item}</span>
        </Fragment>
      ))}
    </span>
  );
}

/* The credit line puts the two brand names in different positions depending on
   the language, so the translation carries {project} and {by} placeholders and
   the styling is applied to whatever lands in those slots. */
function renderCredit(template: string): ReactNode {
  return template.split(/(\{project\}|\{by\})/).map((part, i) => {
    if (part === "{project}") {
      return (
        <span key={i} className="font-brand font-bold tracking-tight text-[var(--pad-ink)]">
          Project EDTR
        </span>
      );
    }
    if (part === "{by}") {
      return (
        <a
          key={i}
          href="https://ymg.digital"
          target="_blank"
          rel="noopener"
          className="font-medium text-[var(--pad-ink)] transition-opacity hover:opacity-70"
        >
          ymg.digital
        </a>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export default function LandingClient() {
  const t = useT();
  const { locale, setLocale } = useLocale();

  return (
    <div className="pad-marketing min-h-screen font-sans">
      {/* ── Announcement banner ── */}
      <div className="border-b border-[var(--pad-border)] text-[13px]">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-6 py-2 text-center">
          <span className="inline-flex items-center gap-2">
            <span className="border border-[var(--pad-border-strong)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--pad-ink-70)]">
              {t.landing.announcementNew}
            </span>
            <span className="text-[var(--pad-ink-70)]">
              {t.landing.announcementText}
            </span>
          </span>
          <Link href="/signup" className="whitespace-nowrap font-medium underline underline-offset-4 decoration-[var(--pad-border-strong)] hover:decoration-current">
            {t.landing.announcementCta}
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
            <a href="#slash-menu" className="transition-colors hover:text-[var(--pad-ink)]">{t.landing.navSlash}</a>
            <a href="#features" className="transition-colors hover:text-[var(--pad-ink)]">{t.landing.navFeatures}</a>
            <a href="#comparison" className="transition-colors hover:text-[var(--pad-ink)]">{t.landing.navVs}</a>
            <a href="#faq" className="transition-colors hover:text-[var(--pad-ink)]">{t.landing.navFaq}</a>
            <Link href="/guides" className="transition-colors hover:text-[var(--pad-ink)]">{t.landing.navGuides}</Link>
          </nav>
          <Link
            href="/pad"
            className="bg-[var(--pad-ink)] px-4 py-2 text-[13px] font-semibold text-[var(--pad-bg)] transition-opacity hover:opacity-90"
          >
            {t.landing.openEditor}
          </Link>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="relative overflow-hidden px-6 pb-16 pt-20 sm:pt-28">
          <div className="pad-hero-glow" aria-hidden />
          <div className="relative mx-auto max-w-4xl text-center">
            <h1 className="pad-display text-[clamp(2.25rem,6.5vw,4rem)]">
              {t.landing.heroTitle}
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-[var(--pad-ink-70)] sm:text-xl">
              {t.landing.heroSubtitle}
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/pad"
                className="w-full bg-[var(--pad-ink)] px-8 py-3.5 text-base font-semibold text-[var(--pad-bg)] transition-opacity hover:opacity-90 sm:w-auto"
              >
                {t.landing.heroCtaPrimary}
              </Link>
              <Link
                href="/pad"
                className="w-full border border-[var(--pad-border-strong)] px-8 py-3.5 text-base font-medium text-[var(--pad-ink-70)] transition-colors hover:border-[var(--pad-ink)] hover:text-[var(--pad-ink)] sm:w-auto"
              >
                {t.landing.heroCtaSecondary}
              </Link>
            </div>
            <p className="mt-6 text-[13px] text-[var(--pad-ink-50)]">
              {t.landing.heroMicrocopy}
            </p>
          </div>

          {/* ── Live editor preview ── */}
          <div id="hero-editor" className="relative mx-auto mt-16 max-w-5xl scroll-mt-24">
            {/* text-gray-900 matters: the surrounding page is cream-on-dark and
                the preview's icons inherit currentColor. */}
            <div
              className="preview-animated-shadow light overflow-hidden border border-[var(--pad-border-strong)] text-gray-900"
              style={{ colorScheme: "light" }}
            >
              {/* Browser chrome */}
              <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-100 px-4 py-2.5">
                <span className="size-3 rounded-full bg-[#ff5f57]" />
                <span className="size-3 rounded-full bg-[#febc2e]" />
                <span className="size-3 rounded-full bg-[#28c840]" />
                <span className="ml-3 max-w-xs flex-1 bg-white px-3 py-1 text-xs text-gray-400">
                  wordpad.info/pad
                </span>
              </div>
              {/* Real Toolbar + a real, typeable ProseMirror page */}
              <ToolbarPreviewClient />
            </div>
          </div>
        </section>

        {/* ── Trust bar ── */}
        <section className="border-y border-[var(--pad-border)]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-y-2 px-6 py-5 text-center text-sm text-[var(--pad-ink-70)]">
            <DotSeparated items={t.landing.trustItems} />
          </div>
        </section>

        {/* ── Slash menu: the heart of the page ── */}
        <section id="slash-menu" className="scroll-mt-16 px-6 py-24">
          <div className="mx-auto max-w-3xl">
            <div className="mx-auto flex size-14 items-center justify-center border border-[var(--pad-border)] bg-[var(--pad-surface)]">
              <Command size={26} weight="duotone" />
            </div>
            <h2 className="pad-display mt-6 text-center text-[clamp(2rem,5vw,3rem)]">
              {t.landing.slashTitle}
            </h2>
            <div className="mt-8 space-y-5 leading-relaxed text-[var(--pad-ink-70)]">
              <p>{t.landing.slashP1}</p>
              <p>{t.landing.slashP2}</p>
              <p>{renderKbd(t.landing.slashP3)}</p>
            </div>

            {/* Demo strip: each chip inserts its thing into the hero editor. */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              {DEMO_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => heroCommand(chip.command)}
                  className="border border-[var(--pad-border-strong)] px-4 py-2 font-mono text-sm text-[var(--pad-ink-70)] transition-colors hover:border-[var(--pad-ink)] hover:text-[var(--pad-ink)]"
                >
                  {chip.label}
                </button>
              ))}
              <Link
                href="/pad"
                className="border border-[var(--pad-border-strong)] px-4 py-2 font-mono text-sm text-[var(--pad-ink-50)] transition-colors hover:border-[var(--pad-ink)] hover:text-[var(--pad-ink)]"
              >
                /export
              </Link>
            </div>
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => heroCommand("focus")}
                className="font-medium underline underline-offset-4 decoration-[var(--pad-border-strong)] transition-colors hover:decoration-current"
              >
                {t.landing.slashTryLink}
              </button>
            </div>
          </div>
        </section>

        {/* ── Friction ── */}
        <section className="border-t border-[var(--pad-border)] px-6 py-24">
          <div className="mx-auto max-w-3xl">
            <div className="mx-auto flex size-14 items-center justify-center border border-[var(--pad-border)] bg-[var(--pad-surface)]">
              <Lightning size={26} weight="duotone" />
            </div>
            <h2 className="pad-display mt-6 text-center text-[clamp(2rem,5vw,3rem)]">
              {t.landing.frictionTitle}
            </h2>
            <div className="mt-8 space-y-5 leading-relaxed text-[var(--pad-ink-70)]">
              <p>{t.landing.frictionP1}</p>
              <p>{renderEmphasis(t.landing.frictionP2)}</p>
              <p>{t.landing.frictionP3}</p>
            </div>
            <div className="mt-8 text-center">
              <Link
                href="/pad"
                className="font-medium underline underline-offset-4 decoration-[var(--pad-border-strong)] transition-colors hover:decoration-current"
              >
                {t.landing.frictionCta}
              </Link>
            </div>
          </div>
        </section>

        {/* ── Comparison table ── */}
        <section id="comparison" className="border-t border-[var(--pad-border)] px-6 py-24">
          <div className="mx-auto max-w-4xl">
            <h2 className="pad-display text-center text-[clamp(2rem,5vw,3rem)]">
              {t.landing.compareTitle}
            </h2>
            <div className="mt-12 overflow-x-auto border border-[var(--pad-border)]">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--pad-border)]">
                    <th scope="col" className="px-4 py-3 text-left font-medium text-[var(--pad-ink-50)]">
                      <span className="sr-only">{t.landing.compareTitle}</span>
                    </th>
                    {t.landing.compareCols.map((col, i) => (
                      <th
                        key={col}
                        scope="col"
                        className={
                          i === 0
                            ? "bg-[var(--pad-surface)] px-4 py-3 text-left font-bold"
                            : "px-4 py-3 text-left font-medium text-[var(--pad-ink-70)]"
                        }
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--pad-border)]">
                  {t.landing.compareRows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row" className="px-4 py-3 text-left font-medium text-[var(--pad-ink-70)]">
                        {row.label}
                      </th>
                      {row.cells.map((cell, i) => (
                        <td
                          key={i}
                          className={
                            i === 0
                              ? "bg-[var(--pad-surface)] px-4 py-3 font-semibold"
                              : "px-4 py-3 text-[var(--pad-ink-50)]"
                          }
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-center text-xs text-[var(--pad-ink-50)]">
              {t.landing.compareCaption}
            </p>
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="border-t border-[var(--pad-border)] px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="pad-display text-[clamp(2rem,5vw,3rem)]">{t.landing.featuresTitle}</h2>
            </div>
            {/* gap-px divider grid — the border color shows through the gaps. */}
            <div className="mt-14 grid gap-px overflow-hidden border border-[var(--pad-border)] bg-[var(--pad-border)] sm:grid-cols-2">
              {featureList(t).map((f) => (
                <div
                  key={f.title}
                  className="bg-[var(--pad-bg)] p-8 transition-colors hover:bg-[var(--pad-surface)]"
                >
                  <div className="mb-4 flex size-10 items-center justify-center border border-[var(--pad-border)] bg-[var(--pad-surface-2)]">
                    <f.Icon size={20} weight="duotone" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-[var(--pad-ink-50)]">{f.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-center text-sm text-[var(--pad-ink-50)]">
              <span className="font-medium text-[var(--pad-ink-70)]">{t.landing.featuresAlsoLabel}</span>
              <DotSeparated items={t.landing.featuresAlsoItems} />
            </div>
          </div>
        </section>

        {/* ── Privacy ── */}
        <section id="privacy" className="border-t border-[var(--pad-border)] px-6 py-24">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
            <div className="flex size-14 items-center justify-center border border-[var(--pad-border)] bg-[var(--pad-surface)]">
              <Lock size={26} weight="duotone" />
            </div>
            <h2 className="pad-display text-[clamp(2rem,5vw,3rem)]">{t.landing.privacyTitle}</h2>
            <p className="text-lg leading-relaxed text-[var(--pad-ink-70)]">
              {t.landing.privacyP1}
            </p>
            <p className="leading-relaxed text-[var(--pad-ink-70)]">
              {t.landing.privacyP2}
            </p>
            <p className="text-sm leading-relaxed text-[var(--pad-ink-50)]">
              {t.landing.privacyP3}
            </p>
          </div>
        </section>

        {/* ── Accounts ── */}
        <section className="border-t border-[var(--pad-border)] px-6 py-24">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <div className="flex size-14 items-center justify-center border border-[var(--pad-border)] bg-[var(--pad-surface)]">
              <CloudArrowUp size={26} weight="duotone" />
            </div>
            <h2 className="pad-display mt-5 text-[clamp(2rem,5vw,3rem)]">{t.landing.accountsTitle}</h2>
            <p className="mt-5 text-lg leading-relaxed text-[var(--pad-ink-70)]">
              {t.landing.accountsIntro}
            </p>
            <ul className="mt-6 space-y-3 text-left leading-relaxed text-[var(--pad-ink-70)]">
              {[t.landing.accountsB1, t.landing.accountsB2, t.landing.accountsB3].map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <Check size={18} className="mt-1 shrink-0 text-[var(--pad-ink)]" />
                  <span>{renderEmphasis(b)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row">
              <Link
                href="/signup"
                className="bg-[var(--pad-ink)] px-8 py-3.5 text-base font-semibold text-[var(--pad-bg)] transition-opacity hover:opacity-90"
              >
                {t.landing.accountsCta}
              </Link>
              <Link
                href="/pad"
                className="text-sm text-[var(--pad-ink-50)] underline underline-offset-4 decoration-[var(--pad-border-strong)] transition-colors hover:text-[var(--pad-ink)] hover:decoration-current"
              >
                {t.landing.accountsSkip}
              </Link>
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="border-t border-[var(--pad-border)] px-6 py-24">
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="pad-display text-[clamp(2rem,5vw,3rem)]">{t.landing.howTitle}</h2>
            </div>
            <div className="mt-14 grid gap-10 sm:grid-cols-3">
              {[
                { step: "1", title: t.landing.howStep1Title, desc: t.landing.howStep1Desc },
                { step: "2", title: t.landing.howStep2Title, desc: t.landing.howStep2Desc },
                { step: "3", title: t.landing.howStep3Title, desc: t.landing.howStep3Desc },
              ].map((s) => (
                <div key={s.step}>
                  <div className="mb-4 flex size-11 items-center justify-center border border-[var(--pad-border-strong)] text-lg font-semibold">
                    {s.step}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{s.title}</h3>
                  <p className="leading-relaxed text-[var(--pad-ink-50)]">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Use cases ── */}
        <section className="border-t border-[var(--pad-border)] px-6 py-24">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="pad-display text-[clamp(2rem,5vw,3rem)]">{t.landing.useCasesTitle}</h2>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              {t.landing.useCases.map((useCase) => (
                <span
                  key={useCase}
                  className="border border-[var(--pad-border-strong)] px-4 py-2 text-sm text-[var(--pad-ink-70)]"
                >
                  {useCase}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── WordPad section (supporting, SEO) ── */}
        <section className="border-t border-[var(--pad-border)] px-6 py-24">
          <div className="mx-auto max-w-3xl">
            <h2 className="pad-display text-center text-[clamp(2rem,5vw,3rem)]">
              {t.landing.goneTitle}
            </h2>
            <div className="mt-8 space-y-5 leading-relaxed text-[var(--pad-ink-70)]">
              <p>{t.landing.goneP1}</p>
              <p>{t.landing.goneP2}</p>
            </div>
            <div className="mt-8 text-center">
              <Link
                href="/pad"
                className="font-medium underline underline-offset-4 decoration-[var(--pad-border-strong)] transition-colors hover:decoration-current"
              >
                {t.landing.goneCta}
              </Link>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="border-t border-[var(--pad-border)] px-6 py-24">
          <div className="mx-auto max-w-3xl">
            <h2 className="pad-display text-center text-[clamp(2rem,5vw,3rem)]">{t.landing.faqTitle}</h2>
            <div className="mt-12 divide-y divide-[var(--pad-border)] border-y border-[var(--pad-border)]">
              {faqList(t).map((faq) => (
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
            <h2 className="pad-display text-[clamp(2rem,5vw,3.25rem)]">{t.landing.ctaTitle}</h2>
            <Link
              href="/pad"
              className="mt-9 inline-block bg-[var(--pad-ink)] px-10 py-4 text-base font-semibold text-[var(--pad-bg)] transition-opacity hover:opacity-90"
            >
              {t.landing.ctaButton}
            </Link>
            <p className="mt-5 text-[13px] text-[var(--pad-ink-50)]">
              {t.landing.ctaMicrocopy}
            </p>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--pad-border)] px-6 py-12">
        {/* Two blocks: brand on the left, both link groups together on the right. */}
        <div className="mx-auto flex max-w-6xl flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <span className="font-brand leading-none">
              <span className="text-lg font-bold tracking-tight text-[var(--pad-ink)]">EDTR</span>
              <span className="text-sm font-semibold tracking-wider text-[var(--pad-ink-50)]">PAD</span>
            </span>
            <p className="mt-2 text-sm text-[var(--pad-ink-50)]">
              {t.landing.footerTagline}
            </p>
            <div className="mt-4">
              <Select value={locale} onValueChange={(v) => setLocale(v as typeof locale)}>
                <SelectTrigger
                  size="sm"
                  aria-label={t.locale.label}
                  className="h-8 w-[140px] border-[var(--pad-border)] bg-transparent px-2 text-[13px] shadow-none"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  {LOCALES.map((code) => (
                    <SelectItem key={code} value={code} className="text-[13px]">
                      {LOCALE_NAMES[code]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-10 sm:flex-row sm:gap-20">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pad-ink-50)]">
              EDTRpad
            </h3>
            <div className="mt-3 flex flex-col gap-2 text-sm text-[var(--pad-ink-50)]">
              <Link href="/pad" className="transition-colors hover:text-[var(--pad-ink)]">{t.landing.footerEditor}</Link>
              <Link href="/guides" className="transition-colors hover:text-[var(--pad-ink)]">{t.landing.footerGuides}</Link>
              <Link href="/guides/wordpad-alternative" className="transition-colors hover:text-[var(--pad-ink)]">{t.landing.footerWordAlt}</Link>
              <Link href="/guides/wordpad-online" className="transition-colors hover:text-[var(--pad-ink)]">{t.landing.footerWordpadOnline}</Link>
              <Link href="/guides/export-to-word-docx-online" className="transition-colors hover:text-[var(--pad-ink)]">{t.landing.footerOpenDocx}</Link>
              <a href="/llms.txt" className="transition-colors hover:text-[var(--pad-ink)]">llms.txt</a>
            </div>
          </div>
          <div>
            <h3 className="text-sm text-[var(--pad-ink)]">
              {t.landing.footerMoreFrom} <span className="font-brand font-bold tracking-tight">Project EDTR</span>
            </h3>
            <div className="mt-3 flex flex-col gap-2 text-sm text-[var(--pad-ink-50)]">
              <a
                href="https://edtr.md"
                target="_blank"
                rel="noopener"
                className="transition-colors hover:text-[var(--pad-ink)]"
              >
                {t.landing.footerMd}
              </a>
              <a
                href="https://edtr.plus"
                target="_blank"
                rel="noopener"
                className="transition-colors hover:text-[var(--pad-ink)]"
              >
                {t.landing.footerPlus}
              </a>
            </div>
          </div>
          </div>
        </div>
        <div className="mx-auto mt-10 max-w-6xl border-t border-[var(--pad-border)] pt-6 text-sm text-[var(--pad-ink-50)]">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <span>
              {t.landing.footerCopyright(new Date().getFullYear())}{" "}
              {t.landing.footerTrademark}
            </span>
            <span className="whitespace-nowrap">{renderCredit(t.landing.footerCredit)}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
