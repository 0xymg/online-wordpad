"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import {
  TextB, Table, ImageSquare, Article, Export, Printer, Clock, Lock,
  Command, CloudArrowUp, Files, Moon, MagnifyingGlass, Lightning,
} from "./components/icons";
import ToolbarPreviewClient from "./components/ToolbarPreviewClient";
import { useT, useLocale } from "./components/I18nProvider";
import { LOCALES, LOCALE_NAMES, type Dictionary } from "@/lib/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* The feature grid and FAQ read their copy from the dictionary, so the icons
   and order live here while the words come from the active locale. */
function featureList(t: Dictionary) {
  return [
    { Icon: CloudArrowUp,    title: t.features.accountsTitle,     desc: t.features.accountsDesc },
    { Icon: Files,           title: t.features.multiDocTitle,     desc: t.features.multiDocDesc },
    { Icon: Moon,            title: t.features.darkTitle,         desc: t.features.darkDesc },
    { Icon: TextB,           title: t.features.richTextTitle,     desc: t.features.richTextDesc },
    { Icon: Table,           title: t.features.tablesTitle,       desc: t.features.tablesDesc },
    { Icon: ImageSquare,     title: t.features.imagesTitle,       desc: t.features.imagesDesc },
    { Icon: MagnifyingGlass, title: t.features.findTitle,         desc: t.features.findDesc },
    { Icon: Article,         title: t.features.pageBreaksTitle,   desc: t.features.pageBreaksDesc },
    { Icon: Export,          title: t.features.importExportTitle, desc: t.features.importExportDesc },
    { Icon: Printer,         title: t.features.printTitle,        desc: t.features.printDesc },
    { Icon: Clock,           title: t.features.undoTitle,         desc: t.features.undoDesc },
    { Icon: Command,         title: t.features.commandTitle,      desc: t.features.commandDesc },
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
  ];
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
            <span className="rounded-full border border-[var(--pad-border-strong)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--pad-ink-70)]">
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
            <a href="#features" className="transition-colors hover:text-[var(--pad-ink)]">{t.landing.navFeatures}</a>
            <a href="#how" className="transition-colors hover:text-[var(--pad-ink)]">{t.landing.navHow}</a>
            <a href="#privacy" className="transition-colors hover:text-[var(--pad-ink)]">{t.landing.navPrivacy}</a>
            <a href="#faq" className="transition-colors hover:text-[var(--pad-ink)]">{t.landing.navFaq}</a>
            <Link href="/guides" className="transition-colors hover:text-[var(--pad-ink)]">{t.landing.navGuides}</Link>
          </nav>
          <Link
            href="/pad"
            className="rounded-full bg-[var(--pad-ink)] px-4 py-2 text-[13px] font-semibold text-[var(--pad-bg)] transition-opacity hover:opacity-90"
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
            <h1 className="pad-display text-[clamp(2.75rem,8vw,4.75rem)]">
              {t.landing.heroTitleLine1}
              <br />
              {t.landing.heroTitleLine2}
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-[var(--pad-ink-70)] sm:text-xl">
              {t.landing.heroSubtitle}
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/pad"
                className="w-full rounded-full bg-[var(--pad-ink)] px-8 py-3.5 text-base font-semibold text-[var(--pad-bg)] transition-opacity hover:opacity-90 sm:w-auto"
              >
                {t.landing.heroCtaPrimary}
              </Link>
              <a
                href="#features"
                className="w-full rounded-full border border-[var(--pad-border-strong)] px-8 py-3.5 text-base font-medium text-[var(--pad-ink-70)] transition-colors hover:border-[var(--pad-ink)] hover:text-[var(--pad-ink)] sm:w-auto"
              >
                {t.landing.heroCtaSecondary}
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
            {t.landing.heroSeoText}
          </p>
        </section>

        {/* ── Trust strip ── */}
        <section className="border-y border-[var(--pad-border)]">
          <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-[var(--pad-border)] px-6 sm:grid-cols-4">
            {[
              { k: "0", v: t.landing.statDownloads },
              { k: "5", v: t.landing.statFormats },
              { k: "∞", v: t.landing.statUndo },
              { k: "$0", v: t.landing.statPrice },
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
              <h2 className="pad-display text-[clamp(2rem,5vw,3rem)]">{t.landing.featuresTitle}</h2>
              <p className="mt-4 text-lg text-[var(--pad-ink-70)]">
                {t.landing.featuresSubtitle}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-[var(--pad-ink-50)]">
                {t.landing.featuresSeoText}
              </p>
            </div>
            {/* gap-px divider grid — keep the feature count divisible by both 2
                and 3, or the empty cells in the last row show as dark blocks. */}
            <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-[var(--pad-border)] bg-[var(--pad-border)] sm:grid-cols-2 lg:grid-cols-3">
              {/* Speed is the headline feature: a full-row card keeps the
                  12-card grid below divisible by both 2 and 3. */}
              <div className="bg-[var(--pad-bg)] p-6 transition-colors hover:bg-[var(--pad-surface)] sm:col-span-2 lg:col-span-3">
                <div className="flex items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--pad-border)] bg-[var(--pad-surface-2)]">
                    <Lightning size={20} weight="duotone" />
                  </div>
                  <div>
                    <h3 className="mb-1.5 font-semibold">{t.features.speedTitle}</h3>
                    <p className="max-w-2xl text-sm leading-relaxed text-[var(--pad-ink-50)]">{t.features.speedDesc}</p>
                  </div>
                </div>
              </div>
              {featureList(t).map((f) => (
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
              {t.landing.wordAltTitle}
            </h2>
            <div className="mt-8 space-y-5 leading-relaxed text-[var(--pad-ink-70)]">
              <p>
                {t.landing.wordAltP1}
              </p>
              <p>
                {t.landing.wordAltP2}
              </p>
              <p>
                {t.landing.wordAltP3}
              </p>
            </div>
          </div>
        </section>

        <section id="how" className="border-t border-[var(--pad-border)] px-6 py-24">
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="pad-display text-[clamp(2rem,5vw,3rem)]">{t.landing.howTitle}</h2>
              <p className="mt-4 text-lg text-[var(--pad-ink-70)]">
                {t.landing.howSubtitle}
              </p>
            </div>
            <div className="mt-14 grid gap-10 sm:grid-cols-3">
              {[
                { step: "1", title: t.landing.howStep1Title, desc: t.landing.howStep1Desc },
                { step: "2", title: t.landing.howStep2Title, desc: t.landing.howStep2Desc },
                { step: "3", title: t.landing.howStep3Title, desc: t.landing.howStep3Desc },
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
              {t.landing.howSeoText}
            </p>
          </div>
        </section>

        {/* ── Privacy callout ── */}
        <section id="privacy" className="border-t border-[var(--pad-border)] px-6 py-24">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-[var(--pad-border)] bg-[var(--pad-surface)]">
              <Lock size={26} weight="duotone" />
            </div>
            <h2 className="pad-display text-[clamp(2rem,5vw,3rem)]">{t.landing.privacyTitle}</h2>
            <p className="text-lg leading-relaxed text-[var(--pad-ink-70)]">
              {t.landing.privacyLead}
            </p>
            <p className="text-sm leading-relaxed text-[var(--pad-ink-50)]">
              {t.landing.privacyDetail}
            </p>
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
            <p className="mx-auto mt-4 max-w-xl text-lg text-[var(--pad-ink-70)]">
              {t.landing.ctaSubtitle}
            </p>
            <Link
              href="/pad"
              className="mt-9 inline-block rounded-full bg-[var(--pad-ink)] px-10 py-4 text-base font-semibold text-[var(--pad-bg)] transition-opacity hover:opacity-90"
            >
              {t.landing.ctaButton}
            </Link>
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
            <span>{t.landing.footerCopyright(new Date().getFullYear())}</span>
            <span>{renderCredit(t.landing.footerCredit)}</span>
          </div>
          <p className="mt-6 text-xs leading-relaxed">
            {t.landing.footerDisclaimer}
          </p>
        </div>
      </footer>
    </div>
  );
}
