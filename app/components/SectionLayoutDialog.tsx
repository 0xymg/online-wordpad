"use client";

import { useState } from "react";
import type { Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { documentSections, type PageGeometry } from "@/lib/document-sections";
import { requestedMargins } from "@/lib/page-margins";
import { activeDocumentSection, insertDocumentSection, removeDocumentSectionBoundary, setSectionGeometry } from "@/lib/section-commands";
import { sectionLabels } from "@/lib/section-i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLocale } from "./I18nProvider";

const PAPER = { a4: [11906, 16838], letter: [12240, 15840], legal: [12240, 20160] } as const;
type Paper = keyof typeof PAPER | "custom";
type MarginKey = keyof PageGeometry["margins"];
const cm = (twips: number) => (twips * 2.54 / 1440).toFixed(2);
const twips = (value: string, original: number) => value === cm(original) ? original : value.trim() ? Math.round(Number(value) * 1440 / 2.54) : NaN;
const paperFor = (g: PageGeometry): Paper => {
  const a = Math.min(g.width, g.height), b = Math.max(g.width, g.height);
  return (Object.keys(PAPER) as (keyof typeof PAPER)[]).find(key => Math.abs(PAPER[key][0] - a) <= 1 && Math.abs(PAPER[key][1] - b) <= 1) || "custom";
};
const draftFor = (g: PageGeometry) => ({ width: cm(g.width), height: cm(g.height), margins: {
  top: cm(g.margins.top), bottom: cm(g.margins.bottom), left: cm(g.margins.left), right: cm(g.margins.right),
} });

export default function SectionLayoutDialog({ view, onClose }: { view: EditorView; onClose: () => void }) {
  const { locale } = useLocale(), t = sectionLabels(locale);
  const [initial] = useState(() => {
    const state = view.state;
    const sections = documentSections(state.doc).map((section, index) => ({ ...section,
      geometry: { ...section.geometry, margins: requestedMargins(state.doc, index) } }));
    return { state, sections, current: activeDocumentSection(state).index };
  });
  const [selectedId, setSelectedId] = useState(initial.sections[initial.current].id);
  const selectedIndex = initial.sections.findIndex(section => section.id === selectedId);
  const selected = initial.sections[selectedIndex];
  const [base, setBase] = useState(selected.geometry);
  const [draft, setDraft] = useState(() => draftFor(selected.geometry));
  const [paper, setPaper] = useState<Paper>(() => paperFor(selected.geometry));
  const [scope, setScope] = useState<"section" | "all">("section");
  const [policy, setPolicy] = useState<"keepBefore" | "keepAfter">("keepBefore");
  const [error, setError] = useState("");
  const field = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  const width = twips(draft.width, base.width), height = twips(draft.height, base.height);
  const orientation = (Number.isFinite(width) ? width : base.width) > (Number.isFinite(height) ? height : base.height) ? "landscape" : "portrait";
  const hasBoundary = selectedIndex < initial.sections.length - 1;

  function run(operation: () => Transaction) {
    if (view.isDestroyed || view.state.doc !== initial.state.doc) { setError(t.changed); return; }
    try { view.dispatch(operation()); onClose(); view.focus(); }
    catch (failure) {
      const code = failure && typeof failure === "object" && "code" in failure ? failure.code : "";
      const messages: Record<string, string> = { "unsupported-cursor": t.unsupportedCursor, "invalid-geometry": t.invalidGeometry,
        "missing-section": t.missingSection, "no-boundary": t.noBoundary, "invalid-selection": t.invalidSelection, "unsupported-model": t.unsupportedModel };
      setError(typeof code === "string" ? messages[code] || t.actionError : t.actionError);
    }
  }
  function chooseSection(id: string) {
    const section = initial.sections.find(section => section.id === id);
    if (!section) return;
    setSelectedId(id); setBase(section.geometry); setDraft(draftFor(section.geometry)); setPaper(paperFor(section.geometry)); setError("");
  }
  function choosePaper(value: Paper) {
    setPaper(value); setError("");
    if (value === "custom") return;
    const [short, long] = PAPER[value];
    const geometry = { ...base, width: orientation === "landscape" ? long : short, height: orientation === "landscape" ? short : long };
    setBase(geometry); setDraft(previous => ({ ...previous, width: cm(geometry.width), height: cm(geometry.height) }));
  }
  function chooseOrientation(value: string) {
    const short = Math.min(Number.isFinite(width) ? width : base.width, Number.isFinite(height) ? height : base.height);
    const long = Math.max(Number.isFinite(width) ? width : base.width, Number.isFinite(height) ? height : base.height);
    const geometry = { ...base, width: value === "landscape" ? long : short, height: value === "landscape" ? short : long };
    setBase(geometry); setDraft(previous => ({ ...previous, width: cm(geometry.width), height: cm(geometry.height) })); setError("");
  }
  function apply() {
    const margins = Object.fromEntries((Object.keys(base.margins) as MarginKey[]).map(key => [key, twips(draft.margins[key], base.margins[key])])) as PageGeometry["margins"];
    if (![width, height, ...Object.values(margins)].every(Number.isFinite)) { setError(t.invalidGeometry); return; }
    run(() => setSectionGeometry(initial.state, { width, height, margins }, scope, selectedId));
  }
  const previewW = Number.isFinite(width) && width > 0 ? width : base.width;
  const previewH = Number.isFinite(height) && height > 0 ? height : base.height;
  const previewScale = Math.min(120 / previewW, 160 / previewH);
  const previewMargin = (key: MarginKey) => Math.max(0, Math.min(key === "left" || key === "right" ? previewW : previewH, twips(draft.margins[key], base.margins[key]) || 0)) * previewScale;
  const start = selected.geometry.startType;

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" onCloseAutoFocus={event => { event.preventDefault(); if (!view.isDestroyed) view.focus(); }}>
      <form onSubmit={event => { event.preventDefault(); apply(); }} onKeyDown={event => {
        if ((event.ctrlKey || event.metaKey) && ["s", "o", "p"].includes(event.key.toLowerCase())) { event.preventDefault(); event.stopPropagation(); }
      }}>
        <DialogHeader><DialogTitle>{t.title}</DialogTitle><DialogDescription>{t.description}</DialogDescription></DialogHeader>
        <p className="mt-3 text-xs text-muted-foreground">{t.currentSection(initial.current + 1, initial.sections.length)}</p>
        <label className="mt-3 block space-y-1 text-sm"><span>{t.sectionPicker}</span><select className={field} value={selectedId} onChange={event => chooseSection(event.target.value)}>{initial.sections.map((section, index) => <option key={section.id} value={section.id}>{t.sectionName(index + 1)}</option>)}</select></label>
        <div className="my-4 grid gap-4 sm:grid-cols-[1fr_130px]">
          <fieldset className="min-w-0 space-y-3"><legend className="mb-2 text-sm font-semibold">{t.pageSettings}</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm"><span>{t.paper}</span><select className={field} value={paper} onChange={event => choosePaper(event.target.value as Paper)}><option value="a4">A4</option><option value="letter">Letter</option><option value="legal">Legal</option><option value="custom">{t.custom}</option></select></label>
              <label className="space-y-1 text-sm"><span>{t.orientation}</span><select className={field} value={orientation} onChange={event => chooseOrientation(event.target.value)}><option value="portrait">{t.portrait}</option><option value="landscape">{t.landscape}</option></select></label>
              {(["width", "height"] as const).map(key => <label key={key} className="space-y-1 text-sm"><span>{t[key]}</span><input className={field} type="number" min="1.27" max="55.88" step="0.01" required value={draft[key]} onChange={event => { setDraft(previous => ({ ...previous, [key]: event.target.value })); setPaper("custom"); setError(""); }} /></label>)}
            </div>
            <fieldset><legend className="mb-2 text-xs text-muted-foreground">{t.margins}</legend><div className="grid grid-cols-2 gap-3">{(["top", "bottom", "left", "right"] as const).map(key => <label key={key} className="space-y-1 text-sm"><span>{t[key]}</span><input className={field} type="number" min="0" max="55.88" step="0.01" required value={draft.margins[key]} onChange={event => { setDraft(previous => ({ ...previous, margins: { ...previous.margins, [key]: event.target.value } })); setError(""); }} /></label>)}</div></fieldset>
            <label className="block space-y-1 text-sm"><span>{t.scope}</span><select className={field} value={scope} onChange={event => setScope(event.target.value as "section" | "all")}><option value="section">{t.sectionScope}</option><option value="all">{t.allScope}</option></select></label>
          </fieldset>
          <figure className="hidden self-center sm:block"><div role="img" aria-label={t.preview} className="mx-auto box-border border border-border bg-muted" style={{ width: previewW * previewScale, height: previewH * previewScale, padding: `${previewMargin("top")}px ${previewMargin("right")}px ${previewMargin("bottom")}px ${previewMargin("left")}px` }}><div className="h-full min-h-px border border-border bg-background" /></div><figcaption className="mt-2 text-center text-[11px] text-muted-foreground">{start === "continuous" ? t.continuous : start === "nextPage" || !start ? t.nextPage : t.otherStart}</figcaption></figure>
        </div>
        <section className="space-y-2 border-t border-border py-3"><h3 className="text-sm font-semibold">{t.insertHeading}</h3><p className="text-xs text-muted-foreground">{t.insertHint(initial.current + 1)}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => run(() => insertDocumentSection(initial.state, "nextPage"))}>{t.nextPage}</Button><Button type="button" variant="outline" onClick={() => run(() => insertDocumentSection(initial.state, "continuous"))}>{t.continuous}</Button></div></section>
        <section className="space-y-2 border-t border-border py-3"><h3 className="text-sm font-semibold">{t.removeHeading}</h3><p className="text-xs text-muted-foreground">{hasBoundary ? t.removeHint(selectedIndex + 1, selectedIndex + 2) : t.lastSection}</p><label className="block space-y-1 text-sm"><span>{t.removalPolicy}</span><select className={field} disabled={!hasBoundary} value={policy} onChange={event => setPolicy(event.target.value as "keepBefore" | "keepAfter")}><option value="keepBefore">{t.keepBefore}</option><option value="keepAfter">{t.keepAfter}</option></select></label><Button type="button" variant="outline" disabled={!hasBoundary} onClick={() => run(() => removeDocumentSectionBoundary(initial.state, selectedId, policy))}>{t.remove}</Button></section>
        {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>{t.cancel}</Button><Button type="submit">{t.apply}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
