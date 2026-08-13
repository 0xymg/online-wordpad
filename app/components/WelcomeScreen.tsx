"use client";

import { useEffect, useState } from "react";
import { FileText, Plus, UploadSimple, X, SignIn, LinkSimple, Trash, CircleNotch } from "./icons";
import { TEMPLATES, type DocTemplate } from "@/lib/templates";
import { useT } from "./I18nProvider";

export type WelcomeFile = { id: string; name: string; folder?: string | null };

interface WelcomeScreenProps {
  open: boolean;
  onClose: () => void;
  isAuthed: boolean;
  userName?: string | null;
  files: WelcomeFile[];
  activeId: string;
  onNewDocument: () => void;
  onOpenFile: () => void;
  onPickTemplate: (t: DocTemplate) => void;
  onOpenDocument: (id: string) => void;
  onCopyLink: (id: string) => void;
  onDeleteDocument: (id: string) => void;
  /** Documents whose deletion is in flight — their rows show a spinner. */
  deletingIds?: string[];
  /** True while the document list is still being fetched. */
  loading?: boolean;
  /** Shareable/bookmarkable URL for a document, used as the row's href. */
  docHref: (id: string) => string;
  onSignIn: () => void;
  /** Opens the account-settings dialog (signed-in users only). */
  onOpenProfile?: () => void;
  userEmail?: string | null;
  /** True while the auth session is still resolving — show placeholders
      instead of guessing "guest" (matters on a direct /welcome visit). */
  sessionLoading?: boolean;
}

function greeting(t: ReturnType<typeof useT>) {
  const h = new Date().getHours();
  if (h < 6) return t.welcome.greetingNight;
  if (h < 12) return t.welcome.greetingMorning;
  if (h < 18) return t.welcome.greetingAfternoon;
  return t.welcome.greetingEvening;
}

/* Miniature of an A4 page rendering the template's own HTML, scaled down.
   Showing the real content beats a generic line drawing — you pick a template
   by recognising its layout. */
const PAGE_W = 794;
const PAGE_H = 1123;
const THUMB_W = 108;
const SCALE = THUMB_W / PAGE_W;

/** How many documents the "Last used" list shows before "All documents". */
const RECENT_COUNT = 5;
/** Keep in sync with the fade-out duration of .welcome-screen below. */
const EXIT_MS = 220;

function TemplateThumb({ html }: { html: string }) {
  return (
    <div
      aria-hidden
      className="relative mx-auto overflow-hidden rounded-sm border border-gray-200 bg-white shadow-sm dark:border-gray-600"
      style={{ width: THUMB_W, height: Math.round(PAGE_H * SCALE) }}
    >
      <div
        className="template-preview absolute left-0 top-0 origin-top-left"
        style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${SCALE})` }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

/** One row of the document lists: open, copy link, delete. */
function DocRow({
  f, t, activeId, docHref, onOpen, onCopyLink, onDelete, deleting = false,
}: {
  f: WelcomeFile;
  t: ReturnType<typeof useT>;
  activeId: string;
  docHref: (id: string) => string;
  onOpen: (id: string) => void;
  onCopyLink: (id: string) => void;
  onDelete: (id: string) => void;
  deleting?: boolean;
}) {
  if (deleting) {
    // Row stays visible but inert while the server deletion is in flight.
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 opacity-60" aria-busy="true">
        <FileText size={18} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm line-through">{f.name || t.sidebar.untitled}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <CircleNotch size={14} className="animate-spin" />
          {t.welcome.deleting}
        </span>
      </div>
    );
  }
  return (
      <div className="group flex items-center hover:bg-accent/60">
        {/* Real link so it can be bookmarked, middle-clicked, or copied;
            plain clicks are handled in-app to avoid a full reload. */}
        <a
          href={docHref(f.id)}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            onOpen(f.id);
          }}
          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left focus-visible:bg-accent/60 focus-visible:outline-none"
        >
          <FileText size={18} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm">{f.name || t.sidebar.untitled}</span>
          {f.folder && <span className="shrink-0 text-xs text-muted-foreground">{f.folder}</span>}
          {f.id === activeId && (
            <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">{t.welcome.lastOpened}</span>
          )}
        </a>
        <button
          type="button"
          onClick={() => onCopyLink(f.id)}
          aria-label={t.welcome.copyLinkTo(f.name || t.sidebar.untitled)}
          title={t.sidebar.copyLink}
          className="shrink-0 rounded p-1.5 text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring group-hover:opacity-100"
        >
          <LinkSimple size={15} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(f.id)}
          aria-label={t.welcome.deleteDocumentNamed(f.name || t.sidebar.untitled)}
          title={t.welcome.deleteDocument}
          className="mr-2 shrink-0 rounded p-1.5 text-muted-foreground opacity-0 transition hover:bg-destructive/15 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring group-hover:opacity-100"
        >
          <Trash size={15} />
        </button>
      </div>
    );
}

/** Shimmer rows shown while the document list is on its way. */
function DocRowSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-3 px-4 py-2.5" aria-hidden="true">
      <div className="h-[18px] w-[18px] shrink-0 bg-accent" />
      <div className="h-3.5 w-48 max-w-[50%] bg-accent" />
    </div>
  );
}

export default function WelcomeScreen({
  open, onClose, isAuthed, userName, files, activeId,
  onNewDocument, onOpenFile, onPickTemplate, onOpenDocument, onCopyLink, onDeleteDocument,
  docHref, onSignIn, onOpenProfile, userEmail, deletingIds = [], loading = false, sessionLoading = false,
}: WelcomeScreenProps) {
  const t = useT();
  // Stay mounted through the closing animation so the editor fades in behind
  // it instead of snapping into place.
  const [visible, setVisible] = useState(open);
  useEffect(() => {
    if (open) { setVisible(true); return; }
    const timer = setTimeout(() => setVisible(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // With no documents there is nothing to go back to, so the screen stays put
  // until one is created or opened.
  const canClose = files.length > 0;

  useEffect(() => {
    if (!open || !canClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, canClose]);

  if (!visible) return null;

  const firstName = (userName || "").trim().split(/\s+/)[0] || null;

  // Opening a document from here always closes the screen behind it.
  const rowProps = {
    t, activeId, docHref, onCopyLink,
    onOpen: (id: string) => { onOpenDocument(id); onClose(); },
    onDelete: onDeleteDocument,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.welcome.ariaLabel}
      className={`welcome-screen fixed inset-0 z-[1400] overflow-y-auto bg-background text-foreground ${
        open ? "welcome-screen-in" : "welcome-screen-out"
      }`}
    >
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-5 py-2.5 backdrop-blur">
        <span className="font-brand select-none leading-none">
          <span className="text-lg font-bold tracking-tight text-foreground dark:text-[#FFFFE3]">EDTR</span>
          <span className="text-sm font-semibold tracking-wider text-muted-foreground dark:text-[#FFFFE3]/70">PAD</span>
        </span>
        {canClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            {t.welcome.skipToEditor} <X size={14} />
          </button>
        )}
      </div>

      {/* The template strip gets the wider container; the document lists below
          sit in a narrower one so the eye lands on "start something" first. */}
      <div className="mx-auto max-w-6xl px-5 pb-16 pt-10">
        {/* Greeting on the left, account entry on the right, same line.
            While the session resolves we don't yet know WHO this is — show
            placeholders rather than flashing the guest copy. */}
        <div className="flex items-start justify-between gap-4">
          {sessionLoading ? (
            <div className="animate-pulse" aria-hidden="true">
              <div className="h-8 w-72 max-w-[70vw] bg-accent" />
              <div className="mt-2.5 h-4 w-96 max-w-[85vw] bg-accent" />
            </div>
          ) : (
          <div>
            <h1 className="font-serif text-3xl font-normal tracking-tight">
              {firstName ? t.welcome.greetingWith(greeting(t), firstName) : t.welcome.titleGuest}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.welcome.subtitle}
            </p>
          </div>
          )}
          {sessionLoading && (
            <div className="flex shrink-0 animate-pulse items-center gap-2.5 px-2.5 py-1.5" aria-hidden="true">
              <div className="h-9 w-9 bg-accent" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-28 bg-accent" />
                <div className="h-3 w-36 bg-accent" />
              </div>
            </div>
          )}
          {!sessionLoading && isAuthed && onOpenProfile && (
            <button
              type="button"
              onClick={onOpenProfile}
              title={t.profile.title}
              className="flex shrink-0 items-center gap-2.5 border border-transparent px-2.5 py-1.5 transition-colors hover:border-border hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <span className="flex h-9 w-9 select-none items-center justify-center bg-primary text-[11px] font-semibold text-primary-foreground">
                {(userName || "").trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?"}
              </span>
              <span className="flex min-w-0 flex-col items-start text-left">
                <span className="max-w-[220px] truncate text-sm font-medium">{userName}</span>
                {userEmail && (
                  <span className="max-w-[220px] truncate text-xs text-muted-foreground">{userEmail}</span>
                )}
              </span>
            </button>
          )}
        </div>

        {/* Start new */}
        <h2 className="mb-3 mt-8 text-sm font-medium text-muted-foreground">{t.welcome.startNew}</h2>
        <div className="flex gap-4 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => { onNewDocument(); onClose(); }}
            className="group w-[124px] shrink-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <div
              className="mx-auto flex items-center justify-center rounded-sm border border-gray-300 bg-white shadow-sm transition group-hover:border-gray-500 group-hover:shadow dark:border-gray-500"
              style={{ width: THUMB_W, height: Math.round(PAGE_H * SCALE) }}
            >
              <Plus size={26} className="text-gray-400" />
            </div>
            <p className="mt-2 truncate text-center text-xs font-medium">{t.welcome.blankDocument}</p>
          </button>
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => { onPickTemplate(tpl); onClose(); }}
              title={tpl.description}
              className="group w-[124px] shrink-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <div className="transition group-hover:-translate-y-0.5">
                <TemplateThumb html={tpl.html} />
              </div>
              <p className="mt-2 truncate text-center text-xs font-medium">{tpl.name}</p>
              <p className="mt-0.5 line-clamp-2 text-center text-[11px] leading-tight text-muted-foreground">{tpl.description}</p>
            </button>
          ))}
        </div>

        {/* Stays open behind the file picker — the editor appears once a file is
            actually chosen (and nothing flashes if the picker is cancelled). */}
        <button
          type="button"
          onClick={onOpenFile}
          className="mt-4 flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <UploadSimple size={16} /> {t.welcome.openFile}
          <span className="text-xs text-muted-foreground">{t.welcome.openFileFormats}</span>
        </button>

        {/* Document lists — narrower than the strip above, and centred in it */}
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-2 mt-10 text-sm font-medium text-muted-foreground">
            {isAuthed ? t.welcome.lastUsed : t.welcome.continueWhereLeftOff}
          </h2>
          {loading ? (
            <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
              <DocRowSkeleton />
              <DocRowSkeleton />
              <DocRowSkeleton />
            </div>
          ) : files.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              {t.welcome.noDocuments}
            </p>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
              {files.slice(0, RECENT_COUNT).map((f) => <DocRow key={f.id} {...rowProps} f={f} deleting={deletingIds.includes(f.id)} />)}
            </div>
          )}

          {/* The full library, always available below the recent few */}
          {loading ? (
            <>
              <h2 className="mb-2 mt-8 text-sm font-medium text-muted-foreground">{t.welcome.allDocuments}</h2>
              <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
                <DocRowSkeleton />
                <DocRowSkeleton />
              </div>
            </>
          ) : files.length > 0 && (
            <>
              <h2 className="mb-2 mt-8 text-sm font-medium text-muted-foreground">
                {t.welcome.allDocuments} <span className="text-xs font-normal">({files.length})</span>
              </h2>
              <div className="max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border">
                {files.map((f) => <DocRow key={f.id} {...rowProps} f={f} deleting={deletingIds.includes(f.id)} />)}
              </div>
            </>
          )}
        </div>

        {/* Sign-in nudge for guests */}
        {!isAuthed && !sessionLoading && (
          <div className="mx-auto mt-10 flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {t.welcome.guestNudge}
            </p>
            <button
              type="button"
              onClick={() => { onClose(); onSignIn(); }}
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <SignIn size={15} /> {t.welcome.signInFree}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
