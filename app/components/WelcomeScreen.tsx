"use client";

import { useEffect } from "react";
import { FileText, Plus, UploadSimple, X, SignIn, LinkSimple } from "@phosphor-icons/react";
import { TEMPLATES, type DocTemplate } from "@/lib/templates";
import { cn } from "@/lib/utils";

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
  /** Shareable/bookmarkable URL for a document, used as the row's href. */
  docHref: (id: string) => string;
  onSignIn: () => void;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/* Stylized mini page used as a template thumbnail (no real previews exist). */
function PageThumb({ accent, lines }: { accent?: boolean; lines: number[] }) {
  return (
    <div className="relative mx-auto h-28 w-[84px] overflow-hidden rounded-sm border border-gray-200 bg-white shadow-sm dark:border-gray-600 dark:bg-gray-100">
      {accent && <div className="absolute inset-x-0 top-0 h-3 bg-gray-800" />}
      <div className={cn("flex flex-col gap-1.5 px-2.5", accent ? "pt-6" : "pt-4")}>
        {lines.map((w, i) => (
          <div
            key={i}
            className={cn("h-1 rounded-full bg-gray-300", i === 0 && "h-1.5 bg-gray-500")}
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    </div>
  );
}

const THUMB_LINES: Record<string, number[]> = {
  "business-letter": [45, 90, 85, 70, 88, 60],
  resume: [55, 35, 80, 90, 75, 40, 85],
  "meeting-notes": [60, 40, 85, 85, 70],
  invoice: [50, 30, 90, 90, 90, 45],
  report: [65, 45, 88, 82, 88, 76],
  "todo-list": [40, 70, 70, 70, 70],
};

export default function WelcomeScreen({
  open, onClose, isAuthed, userName, files, activeId,
  onNewDocument, onOpenFile, onPickTemplate, onOpenDocument, onCopyLink, docHref, onSignIn,
}: WelcomeScreenProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const firstName = (userName || "").trim().split(/\s+/)[0] || null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome"
      className="fixed inset-0 z-[1400] overflow-y-auto bg-background text-foreground"
    >
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-5 py-2.5 backdrop-blur">
        <span className="font-brand select-none leading-none">
          <span className="text-lg font-bold tracking-tight text-foreground dark:text-[#FFFFE3]">EDTR</span>
          <span className="text-sm font-semibold tracking-wider text-muted-foreground dark:text-[#FFFFE3]/70">PAD</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          Skip to editor <X size={14} />
        </button>
      </div>

      <div className="mx-auto max-w-4xl px-5 pb-16 pt-10">
        {/* Greeting */}
        <h1 className="text-2xl font-semibold tracking-tight">
          {firstName ? `${greeting()}, ${firstName}!` : "Welcome to EDTRpad"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Free word processor in your browser — no installation, no sign-up required.
        </p>

        {/* Start new */}
        <h2 className="mb-3 mt-8 text-sm font-medium text-muted-foreground">Start a new document</h2>
        <div className="flex gap-4 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => { onNewDocument(); onClose(); }}
            className="group w-[116px] shrink-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <div className="mx-auto flex h-28 w-[84px] items-center justify-center rounded-sm border border-gray-300 bg-white shadow-sm transition group-hover:border-gray-500 group-hover:shadow dark:border-gray-500 dark:bg-gray-100">
              <Plus size={26} className="text-gray-500" />
            </div>
            <p className="mt-2 truncate text-center text-xs font-medium">Blank document</p>
          </button>
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { onPickTemplate(t); onClose(); }}
              title={t.description}
              className="group w-[116px] shrink-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <div className="transition group-hover:-translate-y-0.5">
                <PageThumb accent={t.id === "invoice" || t.id === "report"} lines={THUMB_LINES[t.id] ?? [55, 85, 80, 70, 85]} />
              </div>
              <p className="mt-2 truncate text-center text-xs font-medium">{t.name}</p>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => { onOpenFile(); onClose(); }}
          className="mt-4 flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <UploadSimple size={16} /> Open a file from your device
          <span className="text-xs text-muted-foreground">(.docx, .txt, .md, .html)</span>
        </button>

        {/* Recent documents */}
        <h2 className="mb-2 mt-10 text-sm font-medium text-muted-foreground">
          {isAuthed ? "Recent documents" : "Continue where you left off"}
        </h2>
        {files.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No documents yet — start with a blank page or a template above.
          </p>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {files.slice(0, 8).map((f) => (
              <div key={f.id} className="group flex items-center hover:bg-accent/60">
                {/* Real link so it can be bookmarked, middle-clicked, or copied;
                    plain clicks are handled in-app to avoid a full reload. */}
                <a
                  href={docHref(f.id)}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    onOpenDocument(f.id);
                    onClose();
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left focus-visible:bg-accent/60 focus-visible:outline-none"
                >
                  <FileText size={18} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">{f.name || "Untitled"}</span>
                  {f.folder && <span className="shrink-0 text-xs text-muted-foreground">{f.folder}</span>}
                  {f.id === activeId && (
                    <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">Last opened</span>
                  )}
                </a>
                <button
                  type="button"
                  onClick={() => onCopyLink(f.id)}
                  aria-label={`Copy link to ${f.name || "Untitled"}`}
                  title="Copy link"
                  className="mr-2 shrink-0 rounded p-1.5 text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring group-hover:opacity-100"
                >
                  <LinkSimple size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Sign-in nudge for guests */}
        {!isAuthed && (
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Documents are stored in this browser. Sign in to keep multiple documents and sync across devices.
            </p>
            <button
              type="button"
              onClick={() => { onClose(); onSignIn(); }}
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <SignIn size={15} /> Sign in — it&apos;s free
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
