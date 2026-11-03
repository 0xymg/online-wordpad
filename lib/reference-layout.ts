/** Derived reference results and their bounded shared-pagination barrier. */
import type { EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { collectReferenceIndex, lookupReferenceTarget, newReferenceIdentity } from './document-references';
import { documentSections } from './document-sections';
import { numberLabel } from './page-number';
import { paginationKey } from '@/app/components/paginationPlugin';

export const REFERENCE_LAYOUT_STATUS_EVENT = 'edtr-reference-layout-status';
export type ReferencePage = { pageIndex: number; label: string; x: number; y: number };

/** Use actual laid-out caret geometry, not cloned IDs or assumed page breaks. */
export function referencePageAtPos(view: EditorView, pos: number): ReferencePage {
  const pages = paginationKey.getState(view.state)?.pages, host = view.dom.parentElement;
  if (!pages?.length || !host || view.isDestroyed) throw new Error('Reference page layout is not ready');
  const maxWidth = Math.max(...pages.map(page => page.geometry.width)) / 15;
  const hostRect = host.getBoundingClientRect(), scale = hostRect.width / maxWidth;
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Reference page scale is unavailable');
  const coordinate = (at: number) => {
    const node = view.state.doc.nodeAt(at);
    const caret = view.coordsAtPos(Math.min(view.state.doc.content.size, at + (node && !node.isLeaf ? 1 : 0)), 1);
    const y = (caret.top - hostRect.top) / scale;
    const index = pages.findIndex((page, i) => y >= page.top - 0.5 && y < (pages[i + 1]?.top ?? Infinity) - 0.5);
    if (index < 0) throw new Error('Reference target is outside the measured pages');
    return { index, x: (caret.left - hostRect.left) / scale - (maxWidth - pages[index].geometry.width / 15) / 2, y: y - pages[index].top };
  };
  const point = coordinate(pos), layout = view.state.doc.attrs.layout;
  let number = Number(layout?.numberingStyle?.start) || 1;
  for (let i = 0; i <= point.index; i++) {
    const page = pages[i];
    if (page.sectionPage === 0 && page.geometry.numberStart !== undefined) number = page.geometry.numberStart;
    else if (i) number++;
  }
  const format = pages[point.index].geometry.numberFormat || layout?.numberingStyle?.format || 'decimal';
  const label = numberLabel(number, pages.length, 'plain', { start: 1, alignment: 'right', template: '{{PAGE}}', format, hideFirst: false });
  return { pageIndex: point.index, label, x: point.x, y: point.y };
}

/** Build derived changes only; caller owns stale-doc and history handling. */
export function refreshReferenceFields(tr: Transaction, pageAt?: (pos: number) => string): Transaction {
  const index = collectReferenceIndex(tr.doc);
  for (const { pos, node } of index.fields) {
    const a = node.attrs;
    if (a.status === 'unsupported' || (a.status === 'ambiguous' && !a.targetId)) continue;
    const found = lookupReferenceTarget(index, a.targetId);
    const noNumber = found.status === 'ok' && a.display === 'number' && !found.target.number;
    const status = noNumber ? 'unsupported' : found.status === 'ok' && a.display === 'page' && !pageAt ? a.status : found.status;
    const cached = noNumber ? 'Number unavailable' : found.status === 'ok' ? a.display === 'page' ? (pageAt ? pageAt(found.target.pos) : a.cached) : a.display === 'number' ? found.target.number : found.target.text : '';
    if (a.status !== status || a.cached !== cached) tr.setNodeMarkup(pos, undefined, { ...a, status, cached });
  }
  return tr;
}

const active = new WeakMap<EditorView, Promise<void>>();
const revisions = new WeakMap<EditorView, number>(), derivedDocuments = new WeakSet<PMNode>();
/** Register cache-only projections before dispatch so export revisions remain canonical. */
export function markReferenceDerivedDocument(doc: PMNode): void { derivedDocuments.add(doc); }
/** Called by the pagination view after a document update. Derived cache-only
 * transactions do not count as user changes for an export snapshot. */
export function noteReferenceDocumentChange(view: EditorView): void {
  if (!derivedDocuments.has(view.state.doc)) revisions.set(view, (revisions.get(view) || 0) + 1);
}
function report(view: EditorView, error: string | null) {
  if (error) view.dom.dataset.referenceLayoutError = error; else delete view.dom.dataset.referenceLayoutError;
  view.dom.dispatchEvent(new CustomEvent(REFERENCE_LAYOUT_STATUS_EVENT, { bubbles: true, detail: { error } }));
}
async function compositionFinished(view: EditorView) {
  if (!view.composing) return;
  await new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const cleanup = () => { view.dom.removeEventListener('compositionend', finish); clearInterval(timer); };
    const finish = () => { cleanup(); resolve(); };
    const timer = setInterval(() => {
      if (view.isDestroyed || !view.dom.isConnected || Date.now() - started > 30000) { cleanup(); reject(new Error('Reference layout could not wait for composition')); }
    }, 250);
    view.dom.addEventListener('compositionend', finish, { once: true });
  });
}

/** Settle generated entries, pagination and page fields as one bounded cycle. */
export async function flushReferenceLayout(view: EditorView): Promise<void> {
  const revision = revisions.get(view) || 0, pending = active.get(view);
  if (pending) {
    try { await pending; }
    catch (error) {
      if (!(error instanceof Error) || error.message !== 'Document changed while refreshing references' || (revisions.get(view) || 0) !== revision) throw error;
      if (active.get(view) === pending) active.delete(view);
      return flushReferenceLayout(view);
    }
    if ((revisions.get(view) || 0) !== revision) throw new Error('Document changed while refreshing references');
    return;
  }
  const run = (async () => {
    try {
      for (let pass = 0; pass < 16; pass++) {
        if (view.isDestroyed || !view.dom.isConnected) throw new Error('Reference view is detached');
        await compositionFinished(view);
        if (view.composing) continue;
        const current = collectReferenceIndex(view.state.doc);
        if (!current.fields.length && !current.tocs.length) { report(view, null); return; }
        const prepared = refreshReferenceFields(refreshTableOfContents(view.state.tr));
        if (prepared.docChanged) {
          if (view.composing) continue;
          derivedDocuments.add(prepared.doc);
          view.dispatch(prepared.setMeta('addToHistory', false).setMeta('referenceLayout', true));
        }
        const before = view.state.doc;
        const { flushDocumentLayout } = await import('@/app/components/paginationPlugin');
        await flushDocumentLayout(view);
        if (view.isDestroyed) throw new Error('Reference view was destroyed');
        if (view.state.doc !== before) throw new Error('Document changed while refreshing references');
        if (view.composing) continue;
        const final = refreshReferenceFields(view.state.tr, pos => referencePageAtPos(view, pos).label);
        if (!final.docChanged) { report(view, null); return; }
        if (view.composing) continue;
        derivedDocuments.add(final.doc);
        view.dispatch(final.setMeta('addToHistory', false).setMeta('referenceLayout', true));
      }
      throw new Error('Reference layout did not converge');
    } catch (error) {
      if (!view.isDestroyed && !(error instanceof Error && error.message === 'Document changed while refreshing references')) report(view, error instanceof Error ? error.message : String(error));
      throw error;
    }
  })();
  active.set(view, run);
  try { await run; } finally { if (active.get(view) === run) active.delete(view); }
}

/** Rebuild generated paragraphs without changing marker or target identities. */
export function refreshTableOfContents(tr: Transaction): Transaction {
  const doc = tr.doc, index = collectReferenceIndex(doc), schema = doc.type.schema;
  if (!schema.nodes.reference_field || !schema.nodes.tab) return tr;
  const existing = new Map<string, PMNode[]>(), orphans: { pos: number; size: number }[] = [], owners = new Set(index.tocs.map(toc => toc.fieldId));
  doc.forEach((node, pos) => { if (node.attrs.tocOwnerId) { const list = existing.get(node.attrs.tocOwnerId) || []; list.push(node); existing.set(node.attrs.tocOwnerId, list); if (!owners.has(node.attrs.tocOwnerId)) orphans.push({ pos, size: node.nodeSize }); } });
  const occupied = new Set(index.fields.map(field => String(field.node.attrs.fieldId)).concat(index.tocs.map(toc => toc.fieldId)));
  for (const toc of [...index.tocs].reverse()) {
    if (toc.node.attrs.toc?.status === 'unsupported') continue;
    if (doc.resolve(toc.pos).depth !== 0) throw new Error('Table of contents must be a top-level paragraph');
    const old = existing.get(toc.fieldId) || [], ids = new Map<string, string>();
    for (const entry of old) entry.descendants(node => { if (node.type.name === 'reference_field' && node.attrs.fieldId) ids.set(String(entry.attrs.tocTargetId), String(node.attrs.fieldId)); });
    const section = documentSections(doc).find(item => toc.pos >= item.from && toc.pos < item.to) || documentSections(doc)[0];
    const geometry = section.geometry, count = section.columns.kind === 'equal' ? section.columns.count : 1;
    const gap = section.columns.kind === 'equal' ? section.columns.space : 0;
    const width = Math.max(1, Math.floor((geometry.width - geometry.margins.left - geometry.margins.right - gap * (count - 1)) / count));
    const targets = index.targets.filter(target => target.kind === 'heading' && target.text.trim() && toc.levels.includes(target.level) && lookupReferenceTarget(index, target.id).status === 'ok');
    const desired = targets.map(target => {
      let fieldId = ids.get(target.id); if (!fieldId) { fieldId = newReferenceIdentity('field', occupied); occupied.add(fieldId); }
      // A single unbound cached native row unambiguously belongs to the sole
      // target. Preserve its imported paragraph/run formatting on regeneration.
      const previous = old.find(node => node.attrs.tocTargetId === target.id) || (toc.node.attrs.toc?.markerOnly && old.length === 1 && targets.length === 1 && !old[0].attrs.tocTargetId ? old[0] : undefined);
      const mark = schema.marks.link?.create({ href: `#edtr-target-${target.id}` });
      let inheritedMarks: readonly import('prosemirror-model').Mark[] = [];
      previous?.descendants(node => { if (node.isText && !inheritedMarks.length) inheritedMarks = node.marks.filter(m => m.type.name !== 'link'); });
      const marks = mark ? [...inheritedMarks, mark] : [...inheritedMarks];
      const contents = [schema.text(target.text || ' ', marks), schema.nodes.tab.create(null, undefined, inheritedMarks), schema.nodes.reference_field.create({ fieldId, targetId: target.id, display: 'page', cached: '', status: 'pending' }, undefined, marks)];
      if (previous) { const f = previous.lastChild; if (f?.type.name === 'reference_field' && f.attrs.targetId === target.id) contents[2] = schema.nodes.reference_field.create(f.attrs, undefined, marks); }
      const strong = target.text.match(/[A-Za-z\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/u)?.[0];
      const rtl = !!strong && /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/u.test(strong), indent = Math.min(width - 1, Math.max(0, target.level - 1) * 240);
      return schema.nodes.paragraph.create({ ...previous?.attrs, tocOwnerId: toc.fieldId, tocTargetId: target.id, paragraphFormat: { ...previous?.attrs.paragraphFormat, left: rtl ? 0 : indent, right: rtl ? indent : 0, tabs: [{ position: width, alignment: 'right', leader: 'dot' }] } }, contents);
    });
    // Only replace the contiguous generated range attached to this marker.
    const end = toc.pos + toc.node.nodeSize; let cursor = end; const attached: PMNode[] = [];
    while (cursor < doc.content.size) { const node = doc.nodeAt(cursor); if (!node || node.attrs.tocOwnerId !== toc.fieldId) break; attached.push(node); cursor += node.nodeSize; }
    if (attached.length === desired.length && attached.every((node, i) => node.eq(desired[i]))) continue;
    tr.replaceWith(end, cursor, desired);
  }
  for (const orphan of orphans.reverse()) tr.delete(tr.mapping.map(orphan.pos), tr.mapping.map(orphan.pos + orphan.size));
  return tr;
}
