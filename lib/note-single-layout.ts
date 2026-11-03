import type { EditorView } from 'prosemirror-view';
import { collectNoteIndex, noteBodyReference, noteSeparators } from './document-notes';
import { documentSections } from './document-sections';
import { flushBodyDocumentLayout, paginationKey, setNoteReservations, noteGeometryRevision, invalidateNoteGeometry } from '@/app/components/paginationPlugin';
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
  return JSON.stringify([parent?.getBoundingClientRect().width, parent?.style.zoom, style.width, style.fontFamily, style.fontSize, style.lineHeight, view.dom.ownerDocument.fonts.status, noteGeometryRevision(view)]);
}
export const NOTE_LAYOUT_STATUS_EVENT = 'edtr-note-layout-status';
function report(view: EditorView, error: string | null) {
  if (error) view.dom.dataset.noteLayoutError = error; else delete view.dom.dataset.noteLayoutError;
  view.dom.dispatchEvent(new CustomEvent(NOTE_LAYOUT_STATUS_EVENT, { bubbles: true, detail: { error } }));
}
export function invalidateFootnoteLayout(view: EditorView): void { completed.delete(view); invalidateNoteGeometry(view); }
export function footnoteLayoutComplete(view: EditorView): boolean { const state = completed.get(view); return !view.isDestroyed && !!state && state.doc === view.state.doc && state.geometry === geometrySignature(view); }
/** Targets are physical sheet-relative CSS px for this exact document. */
export function getFootnoteTargets(view: EditorView): readonly FootnoteTarget[] | null {
  const snapshot = completed.get(view); return footnoteLayoutComplete(view) && snapshot ? snapshot.targets : null;
}

/** Settle measured note bands with the shared physical pagination path.
 * Unsupported geometry or objects fail explicitly before a snapshot publishes. */
export async function flushSimpleFootnoteLayout(view: EditorView): Promise<void> {
  if (footnoteLayoutComplete(view)) return;
  const existing = pending.get(view); if (existing) return existing;
  const original = view.state.doc;
  const run = (async () => {
    for (let attempt = 0; ; attempt++) {
      const revision = noteGeometryRevision(view);
      try { await runSimpleFootnoteLayout(view); return; }
      catch (error) {
        // First-use note fonts and late images can invalidate geometry while
        // the canonical document remains unchanged. Warm assets once, then
        // measure again; edits, detachment, and all other failures propagate.
        if (attempt >= 2 || !(error instanceof Error) || error.message !== 'note-layout-stale'
          || view.isDestroyed || !view.dom.isConnected || view.state.doc !== original
          || noteGeometryRevision(view) === revision) throw error;
      }
    }
  })();
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
  const geometryRevision = noteGeometryRevision(view);
  completed.delete(view);
  if (index.diagnostics.length) throw new Error('note-invalid-graph');
  const notes = index.notes.filter(note => note.kind === 'footnote');
  const separatorProfile = noteSeparators(Object.fromEntries(notes.map(note => [note.noteId, note.record])), 'footnote');
  const sourceSeparators = notes.some(note => !!note.record.presentation?.separators);
  if (!notes.length) { clearLayers(view); setNoteReservations(view, doc, null); return; }
  // A continuous sheet uses one physical band; differing paper sizes remain
  // gated, while shared-sheet margins are reconciled from actual regions.
  const samePhysical = (a: typeof sections[number]['geometry'], b: typeof sections[number]['geometry']) =>
    a.width === b.width && a.height === b.height;
  if (sections.some(section => section.columns.kind !== 'equal' || section.columns.count > 3) || sections.some((section, i) => i > 0 && section.geometry.startType === 'continuous' && !samePhysical(section.geometry, sections[i - 1].geometry))) throw new Error('note-mixed-or-column-layout-unsupported');
  let unsupported = false;
  const images: number[] = [];
  const tableRows: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'text_box') unsupported = true;
    if (node.type.spec.tableRole === 'table') {
      const resolved = doc.resolve(pos);
      if (Array.from({ length: resolved.depth }, (_, i) => resolved.node(i + 1)).some(parent => parent.type.spec.tableRole === 'table')) unsupported = true;
    }
    if (node.type.spec.tableRole === 'row') tableRows.push(pos);
    if ((node.type.spec.tableRole === 'cell' || node.type.spec.tableRole === 'header_cell') && ((node.attrs.rowspan || 1) !== 1 || (node.attrs.colspan || 1) !== 1)) unsupported = true;
    // Page-positioned artwork can intentionally cross the note band; only
    // measured flow images are allowed until their stacking policy is proven.
    if (node.type.name === 'image') {
      if (node.attrs.position === 'page' || !['inline', 'topBottom', 'wrapLeft', 'wrapRight'].includes(node.attrs.wrap)) unsupported = true;
      else images.push(pos);
    }
  });
  if (unsupported) throw new Error('note-body-layout-object-unsupported');
  const maximumWidth = Math.max(...sections.map(section => section.geometry.width));
  const usesColumns = sections.some(section => section.columns.kind === 'equal' && section.columns.count > 1) || sections.slice(1).some(section => section.geometry.startType === 'continuous');
  const measured = new Map<string, MeasuredNoteBody>();
  const variants: Array<{ noteId: string; from: number; body: MeasuredNoteBody }> = [];
  const assertDocumentCurrent = () => { if (view.isDestroyed || !view.dom.isConnected || view.state.doc !== doc) throw new Error('note-layout-stale'); };
  const assertCurrent = () => { assertDocumentCurrent(); if (noteGeometryRevision(view) !== geometryRevision) throw new Error('note-layout-stale'); };
  clearLayers(view);
  try {
    for (const note of notes) {
      const section = sections.find(item => item.id === note.sectionId); if (!section) throw new Error('note-layout-stale');
      const geometry = section.geometry, width = (geometry.width - geometry.margins.left - geometry.margins.right) / 15;
      const body = doc.type.schema.nodeFromJSON(note.record.body);
      if (Array.from({ length: body.childCount }, (_, i) => body.child(i)).some(node => !['paragraph', 'bullet_list', 'ordered_list'].includes(node.type.name))) throw new Error('note-body-render-unsupported');
      const bodyMeasurement = await measureNoteBody(view, body, width, note.label, { prefix: noteBodyReference(note.record, note.label, doc.type.schema), preserveTrailingSpacing: !!note.record.presentation });
      // Finish warming every note's fonts before testing the geometry epoch.
      // Otherwise each retry could stop at the next previously unseen font.
      measured.set(note.noteId, bodyMeasurement); assertDocumentCurrent();
    }
    assertCurrent();
    let previous = '', reserve: number[] = [], bottomByPage: number[] = [];
    const continuationSections: string[] = [];
    const advance = new Map<number, number>();
    const previousOwnerPages = new Map<string, number>();
    for (let pass = 0; pass < 12; pass++) {
      if (!setNoteReservations(view, doc, reserve, continuationSections, Array.from(advance, ([pos, toPage]) => ({ pos, toPage })), bottomByPage)) throw new Error('note-layout-stale');
      // Column invalidation is scheduled on the next animation frame; await
      // it before asking the existing coordinator for a physical snapshot.
      if (usesColumns) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      await flushBodyDocumentLayout(view); assertCurrent();
      const physical = paginationKey.getState(view.state)?.pages, host = view.dom.parentElement;
      if (!physical?.length || !host) throw new Error('note-layout-not-ready');
      const hostRect = host.getBoundingClientRect(), rootRect = view.dom.getBoundingClientRect(), rootWidth = Number.parseFloat(getComputedStyle(view.dom).width), scale = rootRect.width / rootWidth;
      if (!Number.isFinite(scale) || scale <= 0) throw new Error('note-layout-not-ready');
      const flow = paginationKey.getState(view.state)?.columnFlow;
      const pages = physical.map((page, pageIndex) => {
        const geometries = [page.geometry, ...(flow?.regions.filter(region => region.pageIndex === pageIndex).map(region => sections.find(section => section.id === region.sectionId)?.geometry).filter((geometry): geometry is typeof page.geometry => !!geometry) || [])];
        const top = Math.max(...geometries.map(g => g.margins.top)), bottom = Math.max(...geometries.map(g => g.margins.bottom));
        const left = Math.max(...geometries.map(g => g.margins.left)), right = Math.max(...geometries.map(g => g.margins.right));
        return { x: (maximumWidth - page.geometry.width) / 30 + left / 15, y: page.top + top / 15, width: (page.geometry.width - left - right) / 15, height: (page.geometry.height - top - bottom) / 15 };
      });
      const usedBounds = JSON.stringify(bottomByPage);
      bottomByPage = pages.map((page, i) => page.y - physical[i].top + page.height);
      const owners = notes.map(note => {
        const caret = view.coordsAtPos(note.pos), y = (caret.bottom - hostRect.top) / scale;
        const fragment = flow?.fragments.find(item => item.kind === 'line' && note.pos >= item.from && note.pos < item.to)
          ?? flow?.fragments.find(item => item.kind === 'table' && item.table?.band.cells.some(cell => cell.lines.some(line => note.pos >= line.from && note.pos < line.to)));
        const resolved = doc.resolve(note.pos), inTable = Array.from({ length: resolved.depth }, (_, i) => resolved.node(i + 1)).some(node => node.type.spec.tableRole === 'table');
        if (inTable && flow && fragment?.kind !== 'table') throw new Error('note-table-owner-geometry-unavailable');
        const pageIndex = fragment?.pageIndex ?? physical.findIndex((page, i) => y >= page.top && y < (physical[i + 1]?.top ?? Infinity));
        if (!pages[pageIndex]) throw new Error('note-layout-not-ready');
        // The column solver's line unit also carries leading/paragraph space.
        // Using only the glyph caret bottom can reserve that space away and
        // make an otherwise fitting owner bounce indefinitely between pages.
        const element = view.nodeDOM(note.pos), row = element instanceof HTMLElement ? element.closest('tr') : null;
        const rowBottom = row && !flow ? (row.getBoundingClientRect().bottom - hostRect.top) / scale : y;
        if (row && !flow && row.getBoundingClientRect().height / scale > pages[pageIndex].height + 0.5) throw new Error('note-table-owner-row-unsupported');
        const lineBottom = fragment ? Math.max(y, fragment.rect.y + fragment.rect.height) : Math.max(y, rowBottom);
        return { noteId: note.noteId, sectionId: note.sectionId, pageIndex, lineBottom, lineHeight: Math.max((caret.bottom - caret.top) / scale, fragment?.rect.height || 0), units: measured.get(note.noteId)!.lines };
      });
      for (const owner of owners) {
        const width = pages[owner.pageIndex]?.width, existing = measured.get(owner.noteId);
        if (!width || !existing) throw new Error('note-layout-not-ready');
        if (Math.abs(existing.width - width) > 0.5) {
          const note = notes.find(item => item.noteId === owner.noteId)!;
          const body = doc.type.schema.nodeFromJSON(note.record.body);
          const revised = await measureNoteBody(view, body, width, note.label, { prefix: noteBodyReference(note.record, note.label, doc.type.schema), preserveTrailingSpacing: !!note.record.presentation }); assertCurrent();
          measured.set(owner.noteId, revised); owner.units = revised.lines;
        }
      }
      // If reserving a band pushes an owner to a later page, retain that
      // advance for this bounded pass. Otherwise removing the old-page band
      // pulls the owner back and the two layouts oscillate forever.
      for (const owner of owners) {
        const prior = previousOwnerPages.get(owner.noteId), note = notes.find(item => item.noteId === owner.noteId)!;
        if (prior !== undefined && owner.pageIndex > prior) advance.set(note.pos, Math.max(advance.get(note.pos) || 0, owner.pageIndex));
        previousOwnerPages.set(owner.noteId, owner.pageIndex);
      }
      const plan = planPageNotes({ pages, owners, separatorHeight: 8, continuationSeparatorHeight: 8, gap: 4, maxContinuationContentHeight: Math.max(...sections.map(section => (section.geometry.height - section.geometry.margins.top - section.geometry.margins.bottom) / 15)),
        resolveContinuation: (noteId, from, width) => variants.find(item => item.noteId === noteId && item.from === from && Math.abs(item.body.width - width) < 0.01)?.body.lines });
      if (plan.diagnostics.length) throw new Error(plan.diagnostics[0].code);
      if (plan.remeasure.length) {
        for (const request of plan.remeasure) {
          const note = notes.find(item => item.noteId === request.noteId); if (!note) throw new Error('note-layout-stale');
          const body = doc.type.schema.nodeFromJSON(note.record.body);
          const suffix = await measureNoteBody(view, body, request.width, note.label, { from: request.from, prefix: noteBodyReference(note.record, note.label, doc.type.schema), preserveTrailingSpacing: !!note.record.presentation });
          variants.push({ noteId: request.noteId, from: request.from, body: suffix }); assertCurrent();
        }
        continue;
      }
      if (plan.advance.length) {
        for (const move of plan.advance) {
          const note = notes.find(item => item.noteId === move.noteId); if (!note) throw new Error('note-layout-stale');
          advance.set(note.pos, Math.max(advance.get(note.pos) || 0, move.toPage));
        }
        continue;
      }
      // The single-column engine can otherwise retain an inline/floating
      // image whose painted box extends below the fitted text line. Advance
      // its containing unit rather than letting it cover the shared note band.
      let objectAdvanced = false;
      const reservationReady = JSON.stringify(reserve) === JSON.stringify(plan.pages.map(page => page.reservePx));
      for (const pos of reservationReady ? images : []) {
        const dom = view.nodeDOM(pos); if (!(dom instanceof HTMLElement)) throw new Error('note-object-unmeasurable');
        const box = dom.getBoundingClientRect(), top = (box.top - hostRect.top) / scale, bottom = (box.bottom - hostRect.top) / scale;
        if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= top) throw new Error('note-object-unmeasurable');
        const pageIndex = physical.findIndex((page, i) => top >= page.top && top < (physical[i + 1]?.top ?? Infinity));
        const page = pages[pageIndex], band = plan.pages[pageIndex];
        if (!page || !band) throw new Error('note-object-unmeasurable');
        if (band.reservePx > 0 && bottom > page.y + page.height - band.reservePx + 0.5 && top < page.y + page.height) {
          const target = pageIndex + 1;
          if ((advance.get(pos) || 0) >= target) throw new Error('note-object-cannot-advance');
          advance.set(pos, target); objectAdvanced = true;
        }
      }
      if (objectAdvanced) continue;
      // Until a row is proven to fit above the reserved band, never publish
      // note text over table content or borders. Banded column fragments are
      // already physical; single-column rows use their live painted boxes.
      if (reservationReady && flow) {
        for (const fragment of flow.fragments) if (fragment.kind === 'table') {
          const page = pages[fragment.pageIndex], band = plan.pages[fragment.pageIndex];
          if (page && band?.reservePx && fragment.rect.y + fragment.rect.height > page.y + page.height - band.reservePx + 0.5) throw new Error('note-table-band-overlap');
        }
      } else if (reservationReady) for (const pos of tableRows) {
        const row = view.nodeDOM(pos); if (!(row instanceof HTMLElement)) throw new Error('note-object-unmeasurable');
        const box = row.getBoundingClientRect(), top = (box.top - hostRect.top) / scale, bottom = (box.bottom - hostRect.top) / scale;
        for (let i = 0; i < pages.length; i++) {
          const band = plan.pages[i]; if (band?.reservePx && top < pages[i].y + pages[i].height && bottom > pages[i].y + pages[i].height - band.reservePx + 0.5) throw new Error('note-table-band-overlap');
        }
      }
      if (plan.continuationPages.length) {
        continuationSections.push(...plan.continuationPages.map(request => request.sectionId));
        if (continuationSections.length > 100) throw new Error('note-layout-nonconvergent'); continue;
      }
      // A provisional continuation sheet may become unnecessary when the
      // reserved body itself grows onto a new page. Never publish that empty
      // trailing sheet merely because an earlier pass requested it.
      if (continuationSections.length > 0 && !plan.pages.at(-1)?.fragments.length) { continuationSections.pop(); continue; }
      const next = plan.pages.map(page => page.reservePx), signature = JSON.stringify([physical, owners.map(o => [o.noteId, o.pageIndex, o.lineBottom]), plan]);
      if (signature === previous && JSON.stringify(next) === JSON.stringify(reserve) && usedBounds === JSON.stringify(bottomByPage)) {
        const result: HTMLElement[] = [];
        // Register before building the first page so any later diagnostic
        // removes already-attached fragments instead of leaving partial UI.
        layers.set(view, result);
        for (const page of plan.pages) {
          if (!page.fragments.length) continue;
          const rendered = renderPageNotes(view.dom.ownerDocument, page, measured, (noteId, from, to, width) => {
            const candidates = variants.filter(item => item.noteId === noteId && item.from <= from && Math.abs(item.body.width - width) < 0.01)
              .sort((a, b) => b.from - a.from);
            return candidates.find(item => item.body.lines.some(line => line.from === from) && item.body.lines.some(line => line.to === to))?.body;
          });
          if (!rendered.element) throw new Error(rendered.diagnostic || 'note-render-failed');
          const continuation = page.fragments[0].continuation;
          const separator = continuation ? separatorProfile.continuationSeparator : separatorProfile.separator;
          if (separator !== 'none') {
            const band = view.dom.ownerDocument.createElement('div'); band.className = 'pm-footnote-separator';
            const bounds = pages[page.pageIndex], nativeNormal = sourceSeparators && !continuation;
            // Word's standard w:separator is a two-inch, half-point rule.
            // Keep existing continuation geometry until separately measured.
            band.style.cssText = `position:absolute;left:${bounds.x}px;top:${bounds.y + bounds.height - page.reservePx}px;width:${Math.min(nativeNormal ? 192 : 120, bounds.width)}px;border-top:${nativeNormal ? '0.5pt' : '1px'} solid currentColor;`;
            rendered.element.appendChild(band);
          }
          host.appendChild(rendered.element); result.push(rendered.element);
        }
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
