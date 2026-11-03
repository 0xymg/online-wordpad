"use client";
import { useEffect, useState } from "react";
import type { Node as PMNode } from "prosemirror-model";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { documentSections } from "@/lib/document-sections";
import { runningKey, runningSlot, runningHeight, type RunningSlots, type RunningVariant, type RunningKind } from "@/lib/running-content";
import { readRunningSource } from "@/lib/header-footer-source";
import { ensureFontsInHtml } from "@/lib/editor-fonts";
import RunningEditor from "./RunningEditor";
import { useT } from "./I18nProvider";
export default function HeaderFooterDialog({ doc, initialSection, onApply, onClose }: { doc: PMNode; initialSection: number; onApply: (slots: RunningSlots) => void; onClose: () => void }) {
  const t = useT().running, sections = documentSections(doc);
  const [section, setSection] = useState(Math.min(initialSection, sections.length - 1));
  const [variant, setVariant] = useState<RunningVariant>("default");
  const [original, setOriginal] = useState<RunningSlots | null>(null), [draft, setDraft] = useState<RunningSlots>({});
  const [error, setError] = useState("");
  useEffect(() => { let cancelled = false; readRunningSource(doc).then(value => { if (!cancelled) { setOriginal(value); Object.values(value).forEach(slot => ensureFontsInHtml(slot.html)); } }).catch(() => { if (!cancelled) setError(t.failed); }); return () => { cancelled = true; }; }, [doc, t.failed]);
  const slot = (kind: RunningKind) => {
    const key = runningKey(section, variant, kind), g = sections[section].geometry;
    const current = runningSlot(original || {}, { ...doc.attrs.layout, running: { ...doc.attrs.layout?.running, ...draft } }, section, variant, kind);
    return { ...current, distance: draft[key]?.distance ?? (kind === "header" ? g.headerDistance ?? 283 : g.footerDistance ?? 283) };
  };
  const update = (kind: RunningKind, value: Partial<RunningSlots[string]>) => { const key = runningKey(section, variant, kind); setDraft(v => ({ ...v, [key]: { ...slot(kind), ...value } })); };
  function apply() {
    const edits = { ...draft };
    for (const [key, value] of Object.entries(edits)) {
      const index = Number(key.split(":")[0]), g = sections[index].geometry;
      const height = value.linked ? 0 : runningHeight(value.html, (g.width - g.margins.left - g.margins.right) / 15, doc.attrs.layout);
      if (height + value.distance > g.height * 0.4) { setError(t.tooTall); return; }
      edits[key] = { ...value, height };
    }
    onApply(edits); onClose();
  }
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
    <form onSubmit={e => { e.preventDefault(); apply(); }} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && ["p", "o"].includes(e.key.toLowerCase())) { e.preventDefault(); e.stopPropagation(); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); e.currentTarget.requestSubmit(); } }}>
      <DialogHeader><DialogTitle>{t.title}</DialogTitle><DialogDescription>{t.description}</DialogDescription></DialogHeader>
      <div className="my-4 grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm">{t.section}<select aria-label={t.section} value={section} onChange={e => setSection(Number(e.target.value))} className="h-9 w-full border border-input bg-background px-2">{sections.map((_, index) => <option value={index} key={index}>{t.section} {index + 1}</option>)}</select></label>
        <label className="space-y-1 text-sm">{t.variant}<select aria-label={t.variant} value={variant} onChange={e => setVariant(e.target.value as RunningVariant)} className="h-9 w-full border border-input bg-background px-2"><option value="default">{t.normal}</option><option value="first">{t.first}</option><option value="even">{t.even}</option></select></label>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      {original === null ? <p className="py-8 text-sm text-muted-foreground">{t.loading}</p> : <div className="space-y-5">{(["header", "footer"] as RunningKind[]).map(kind => { const value = slot(kind); return <div key={kind} className="space-y-2">
        <RunningEditor layout={doc.attrs.layout} width={(sections[section].geometry.width - sections[section].geometry.margins.left - sections[section].geometry.margins.right) / 15} key={`${runningKey(section, variant, kind)}:${value.linked}`} html={value.html} label={kind === "header" ? t.header : t.footer} disabled={value.linked} onChange={html => update(kind, { html })} />
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <label className="flex items-center gap-2"><input type="checkbox" aria-label={`${kind === "header" ? t.header : t.footer} ${t.link}`} checked={value.linked} disabled={section === 0} onChange={e => update(kind, { linked: e.target.checked })} />{t.link}</label>
          <label className="flex items-center gap-2">{t.distance}<input aria-label={`${kind === "header" ? t.header : t.footer} ${t.distance}`} type="number" min="0" max="10" step="0.01" value={Math.round(value.distance / 1440 * 254) / 100} onChange={e => update(kind, { distance: Math.round(Number(e.target.value) / 2.54 * 1440) })} className="h-7 w-20 border border-input bg-background px-2 text-foreground" /></label>
        </div>
      </div>; })}</div>}
      <DialogFooter className="mt-5"><Button type="button" variant="outline" onClick={onClose}>{t.cancel}</Button><Button type="submit" disabled={original === null || !Object.keys(draft).length}>{t.apply}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
