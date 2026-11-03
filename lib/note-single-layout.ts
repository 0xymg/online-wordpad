import type { EditorView } from 'prosemirror-view';
import { collectNoteIndex } from './document-notes';
import { documentSections } from './document-sections';
import { flushBodyDocumentLayout, paginationKey, setNoteReservations } from '@/app/components/paginationPlugin';
import { measureNoteBody, type MeasuredNoteBody } from './note-body-measure';
import { planPageNotes } from './note-layout';
import { renderPageNotes } from './note-render';

const layers = new WeakMap<EditorView, HTMLElement[]>();
export type FootnoteTarget = { noteId: string; ownerPos: number; note: { pageIndex: number; x: number; y: number } };
const completed = new WeakMap<EditorView, { doc: import('prosemirror-model').Node; geometry: string; targets: FootnoteTarget[] }>();
const pending = new WeakMap<EditorView, Promise<void>>();
function clearLayers(view: EditorView) { layers.get(view)?.forEach(node => node.remove()); layers.delete(view); }
function geometrySignature(view: EditorView): string {
  const style = view.dom.ownerDocument.defaultView!.getComputedStyle(view.dom), parent = view.dom.parentElement;
  return JSON.stringify([parent?.getBoundingClientRect().width, parent?.style.zoom, style.width, style.fontFamily, style.fontSize, style.lineHeight, view.dom.ownerDocument.fonts.status]);
}
export const NOTE_LAYOUT_STATUS_EVENT = 'edtr-note-layout-status';
function report(view: EditorView, error: string | null) {
  if (error) view.dom.dataset.noteLayoutError = error; else delete view.dom.dataset.noteLayoutError;
  view.dom.dispatchEvent(new CustomEvent(NOTE_LAYOUT_STATUS_EVENT, { bubbles: true, detail: { error } }));
}
export function invalidateFootnoteLayout(view: EditorView): void { completed.delete(view); }
export function footnoteLayoutComplete(view: EditorView): boolean { const state = completed.get(view); return !view.isDestroyed && !!state && state.doc === view.state.doc && state.geometry === geometrySignature(view); }
/** Targets are physical sheet-relative CSS px for this exact document. */
export function getFootnoteTargets(view: EditorView): readonly FootnoteTarget[] | null {
  const snapshot = completed.get(view); return footnoteLayoutComplete(view) && snapshot ? snapshot.targets : null;
}

/** Experimental single-section ordinary-paragraph pipeline. Not registered as
 * the output barrier: caller must not publish until the full product gate is met. */
export async function flushSimpleFootnoteLayout(view: EditorView): Promise<void> {
  if (footnoteLayoutComplete(view)) return;
  const existing = pending.get(view); if (existing) return existing;
  const original = view.state.doc;
  const run = runSimpleFootnoteLayout(view);
  pending.set(view, run);
  try { await run; }
  catch (error) {
    completed.delete(view); clearLayers(view);
    if (!view.isDestroyed && view.state.doc === original) report(view, error instanceof Error ? error.message : String(error));
    throw error;
  } finally { if (pending.get(view) === run) pending.delete(view); }
}
async function runSimpleFootnoteLayout(view: EditorView): Promise<void> {
  const doc = view.state.doc, sections = documentSections(doc), index = collectNoteIndex(doc);
  completed.delete(view);
  if (index.diagnostics.length) throw new Error('note-invalid-graph');
  const notes = index.notes.filter(note => note.kind === 'footnote');
  if (!notes.length) { clearLayers(view); setNoteReservations(view, doc, null); return; }
  // Mixed-section reservation is staged below but remains gated until its
  // physical-page and output fixtures have passed.
  if (sections.length !== 1 || sections.some(section => section.columns.kind !== 'equal' || section.columns.count > 2)) throw new Error('note-mixed-or-column-layout-unsupported');
  let unsupported = false;
  doc.descendants(node => { if (node.type.name === 'table' || node.type.name === 'text_box' || node.type.name === 'image') unsupported = true; });
  if (unsupported) throw new Error('note-body-layout-object-unsupported');
  const maximumWidth = Math.max(...sections.map(section => section.geometry.width));
  const usesColumns = sections.some(section => section.columns.kind === 'equal' && section.columns.count > 1);
  const measured = new Map<string, MeasuredNoteBody>();
  const assertCurrent = () => { if (view.isDestroyed || !view.dom.isConnected || view.state.doc !== doc) throw new Error('note-layout-stale'); };
  clearLayers(view);
  try {
    for (const note of notes) {
      const section = sections.find(item => item.id === note.sectionId); if (!section) throw new Error('note-layout-stale');
      const geometry = section.geometry, width = (geometry.width - geometry.margins.left - geometry.margins.right) / 15;
      const body = doc.type.schema.nodeFromJSON(note.record.body);
      if (Array.from({ length: body.childCount }, (_, i) => body.child(i)).some(node => !['paragraph', 'bullet_list', 'ordered_list'].includes(node.type.name))) throw new Error('note-body-render-unsupported');
      body.descendants((node, pos) => {
        if (node.type.name !== 'ordered_list' && node.type.name !== 'bullet_list') return;
        if (node.type.name === 'ordered_list' && node.attrs.order !== 1) throw new Error('note-list-start-unsupported');
        const at = body.resolve(pos);
        if (Array.from({ length: at.depth }, (_, i) => at.node(i + 1)).some(parent => ['bullet_list', 'ordered_list'].includes(parent.type.name))) throw new Error('note-nested-list-unsupported');
      });
      const bodyMeasurement = await measureNoteBody(view, body, width, note.label);
      if (bodyMeasurement.lines.some(line => /(?:^|;)direction:rtl(?:;|$)/.test(line.style))) throw new Error('note-rtl-render-unsupported');
      measured.set(note.noteId, bodyMeasurement); assertCurrent();
    }
    let previous = '', reserve: number[] = [], extraPages = 0;
    const advance = new Map<number, number>();
    const previousOwnerPages = new Map<string, number>();
    for (let pass = 0; pass < 12; pass++) {
      if (!setNoteReservations(view, doc, reserve, extraPages, Array.from(advance, ([pos, toPage]) => ({ pos, toPage })))) throw new Error('note-layout-stale');
      // Column invalidation is scheduled on the next animation frame; await
      // it before asking the existing coordinator for a physical snapshot.
      if (usesColumns) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      await flushBodyDocumentLayout(view); assertCurrent();
      const physical = paginationKey.getState(view.state)?.pages, host = view.dom.parentElement;
      if (!physical?.length || !host) throw new Error('note-layout-not-ready');
      const hostRect = host.getBoundingClientRect(), rootRect = view.dom.getBoundingClientRect(), rootWidth = Number.parseFloat(getComputedStyle(view.dom).width), scale = rootRect.width / rootWidth;
      if (!Number.isFinite(scale) || scale <= 0) throw new Error('note-layout-not-ready');
      const pages = physical.map(page => ({ x: (maximumWidth - page.geometry.width) / 30 + page.geometry.margins.left / 15, y: page.top + page.geometry.margins.top / 15, width: (page.geometry.width - page.geometry.margins.left - page.geometry.margins.right) / 15, height: (page.geometry.height - page.geometry.margins.top - page.geometry.margins.bottom) / 15 }));
      const owners = notes.map(note => {
        const caret = view.coordsAtPos(note.pos), y = (caret.bottom - hostRect.top) / scale;
        const pageIndex = physical.findIndex((page, i) => y >= page.top && y < (physical[i + 1]?.top ?? Infinity));
        return { noteId: note.noteId, sectionId: note.sectionId, pageIndex, lineBottom: y, lineHeight: (caret.bottom - caret.top) / scale, units: measured.get(note.noteId)!.lines };
      });
      // If reserving a band pushes an owner to a later page, retain that
      // advance for this bounded pass. Otherwise removing the old-page band
      // pulls the owner back and the two layouts oscillate forever.
      for (const owner of owners) {
        const prior = previousOwnerPages.get(owner.noteId), note = notes.find(item => item.noteId === owner.noteId)!;
        if (prior !== undefined && owner.pageIndex > prior) advance.set(note.pos, Math.max(advance.get(note.pos) || 0, owner.pageIndex));
        previousOwnerPages.set(owner.noteId, owner.pageIndex);
      }
      const plan = planPageNotes({ pages, owners, separatorHeight: 8, continuationSeparatorHeight: 8, gap: 4, maxContinuationContentHeight: Math.max(...sections.map(section => (section.geometry.height - section.geometry.margins.top - section.geometry.margins.bottom) / 15)) });
      if (plan.diagnostics.length) throw new Error(plan.diagnostics[0].code);
      if (plan.advance.length) {
        for (const move of plan.advance) {
          const note = notes.find(item => item.noteId === move.noteId); if (!note) throw new Error('note-layout-stale');
          advance.set(note.pos, Math.max(advance.get(note.pos) || 0, move.toPage));
        }
        continue;
      }
      if (plan.continuationPages.length) {
        if (plan.continuationPages.some(request => request.sectionId !== sections.at(-1)?.id)) throw new Error('note-continuation-section-unsupported');
        extraPages++; if (extraPages > 100) throw new Error('note-layout-nonconvergent'); continue;
      }
      // A provisional continuation sheet may become unnecessary when the
      // reserved body itself grows onto a new page. Never publish that empty
      // trailing sheet merely because an earlier pass requested it.
      if (extraPages > 0 && !plan.pages.at(-1)?.fragments.length) { extraPages--; continue; }
      const next = plan.pages.map(page => page.reservePx), signature = JSON.stringify([physical, owners.map(o => [o.noteId, o.pageIndex, o.lineBottom]), plan]);
      if (signature === previous && JSON.stringify(next) === JSON.stringify(reserve)) {
        const result: HTMLElement[] = [];
        for (const page of plan.pages) {
          if (!page.fragments.length) continue;
          const rendered = renderPageNotes(view.dom.ownerDocument, page, measured);
          if (!rendered.element) throw new Error(rendered.diagnostic || 'note-render-failed');
          const band = view.dom.ownerDocument.createElement('div'); band.className = 'pm-footnote-separator';
          const bounds = pages[page.pageIndex]; band.style.cssText = `position:absolute;left:${bounds.x}px;top:${bounds.y + bounds.height - page.reservePx}px;width:${Math.min(120, bounds.width)}px;border-top:1px solid currentColor;`;
          rendered.element.appendChild(band); host.appendChild(rendered.element); result.push(rendered.element);
        }
        layers.set(view, result);
        const targets: FootnoteTarget[] = notes.map(note => {
          const page = plan.pages.find(item => item.fragments.some(fragment => fragment.noteId === note.noteId && !fragment.continuation));
          const fragment = page?.fragments.find(item => item.noteId === note.noteId && !item.continuation), line = measured.get(note.noteId)?.lines[0];
          if (!page || !fragment || !line) throw new Error('note-target-missing');
          return { noteId: note.noteId, ownerPos: note.pos, note: { pageIndex: page.pageIndex, x: fragment.rect.x + line.left - (maximumWidth - physical[page.pageIndex].geometry.width) / 30, y: fragment.rect.y + line.leading - physical[page.pageIndex].top } };
        });
        assertCurrent(); completed.set(view, { doc, geometry: geometrySignature(view), targets }); report(view, null); return;
      }
      previous = signature; reserve = next;
    }
    throw new Error('note-layout-nonconvergent');
  } catch (error) { clearLayers(view); if (view.state.doc === doc) { setNoteReservations(view, doc, null); view.dom.dataset.noteLayoutError = error instanceof Error ? error.message : String(error); } throw error; }
}
