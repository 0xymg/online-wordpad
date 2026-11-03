/** Construct transient column decorations from measured source ranges. */
import type { Node as PMNode } from 'prosemirror-model';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { EditorView } from 'prosemirror-view';
import type { ColumnMeasurement, NaturalBlock } from './column-flow-measure';
import type { FlowDiagnostic, FlowLayout } from './column-flow';
import { buildIntactTableDecoration, buildTableBandDecorations, type TableBandPlacement } from './column-flow-table-decorations';

export type ColumnDecorations = { decorations: DecorationSet; overlays: HTMLElement[]; rootHeight: number; rootWidth: number; rootLeft: number; rootTop: number; rootMarginBottom: number; complete: boolean; diagnostics: FlowDiagnostic[] };
type PlacedBlock = NaturalBlock & { top: number; bottom: number; parent?: PlacedBlock; sectionIndex: number };
type Run = { from: number; to: number; block: number; x: number; y: number; page: number; column: number };
/** Does not touch the source document or live DOM. Unsupported geometry is explicit. */
export function buildColumnDecorations(doc: PMNode, measurement: ColumnMeasurement, flow: FlowLayout, view?: EditorView): ColumnDecorations {
  const diagnostics = [...measurement.diagnostics, ...flow.diagnostics];
  const fail = (code: string, sectionId = measurement.sections[0]?.id || '') => diagnostics.push({ code, sectionId });
  const empty = () => ({ decorations: DecorationSet.empty, overlays: [], rootHeight: 0, rootWidth: 0, rootLeft: 0, rootTop: 0, rootMarginBottom: 0, complete: false, diagnostics });
  if (!measurement.complete || !flow.complete || !flow.pages.length) return empty();
  const first = flow.pages[0].geometry;
  const topOffset = 0, rootWidth = Math.max(...flow.pages.map(page => page.geometry.width)) / 15, rootLeft = -first.margins.left / 15, rootTop = -first.margins.top / 15;
  const blocks: PlacedBlock[] = [];
  for (const source of measurement.blocks) {
    const descendants = flow.fragments.filter(fragment => fragment.kind !== 'table' && fragment.from >= source.from && fragment.to <= source.to);
    if (!descendants.length) continue;
    const top = Math.min(...descendants.map(fragment => fragment.rect.y)) - topOffset;
    const bottom = Math.max(...descendants.map(fragment => fragment.rect.y + fragment.rect.height)) - topOffset;
    const sectionIndex = Math.max(0, measurement.sections.findIndex(section => descendants[0].regionIndex >= 0 && flow.regions[descendants[0].regionIndex].sectionId === section.id));
    const parent = [...blocks].reverse().find(item => item.pos < source.pos && item.to >= source.to);
    blocks.push({ ...source, top, bottom, parent, sectionIndex });
  }
  const decorations: Decoration[] = [], overlays: HTMLElement[] = [];
  for (const block of blocks) {
    const node = doc.nodeAt(block.pos), section = measurement.sections[block.sectionIndex];
    if (!node || section.columns.kind !== 'equal') { fail('missing-measured-block', section.id); return empty(); }
    const available = (section.geometry.width - section.geometry.margins.left - section.geometry.margins.right) / 15;
    const column = (available - (section.columns.count - 1) * section.columns.space / 15) / section.columns.count;
    const extra = Math.max(0, rootWidth - column), parentTop = block.parent?.top || 0, parentLeft = block.parent?.left || 0;
    // Preserve the natural content width while the ancestor box covers all columns.
    const emptyTextblock = block.textblock && block.from === block.to;
    const emptyFragment = emptyTextblock ? flow.fragments.find(fragment => fragment.sourceBlock === block.pos) : undefined;
    const emptyPage = emptyFragment ? flow.pages[emptyFragment.pageIndex] : undefined;
    const emptyShift = emptyFragment && emptyPage ? (rootWidth - emptyPage.geometry.width / 15) / 2 + emptyFragment.rect.x : 0;
    const padding = `padding-left:${block.paddingLeft}px;padding-right:${block.paddingRight + (emptyTextblock ? 0 : extra)}px;`;
    const style = `position:absolute;top:${block.top - parentTop}px;left:${block.left - parentLeft + emptyShift}px;height:${Math.max(0, block.bottom - block.top)}px;width:${block.width + (emptyTextblock ? 0 : extra)}px;box-sizing:border-box;margin:0;overflow-wrap:anywhere;pointer-events:${emptyTextblock ? 'auto' : 'none'};${padding}`;
    decorations.push(Decoration.node(block.pos, block.pos + node.nodeSize, { style, 'data-column-block': 'true' }));
  }
  const runs: Run[] = [];
  for (const fragment of flow.fragments) {
    if (fragment.kind === 'table') continue;
    if (fragment.sourceTop === undefined || fragment.sourceBlock === undefined) { fail('missing-line-geometry'); return empty(); }
    const block = blocks.find(item => item.pos === fragment.sourceBlock && item.textblock);
    if (!block) { fail('missing-textblock-geometry'); return empty(); }
    const page = flow.pages[fragment.pageIndex];
    const x = (rootWidth - page.geometry.width / 15) / 2 + fragment.rect.x;
    // Source line coordinates are relative to the natural root, independent of placement.
    const shift = fragment.rect.y - topOffset - block.top - (fragment.sourceTop - (measurement.blocks.find(item => item.pos === block.pos)?.top ?? 0));
    const previous = runs.at(-1);
    if (fragment.to <= fragment.from) continue; // Empty textblocks are positioned by their node box.
    if (previous && previous.to === fragment.from && previous.block === block.pos && Math.abs(previous.x - x) < 0.01 && Math.abs(previous.y - shift) < 0.01) previous.to = fragment.to;
    else runs.push({ from: fragment.from, to: fragment.to, block: block.pos, x, y: shift, page: fragment.pageIndex, column: fragment.columnIndex });
  }
  for (const run of runs) decorations.push(Decoration.inline(run.from, run.to, { style: `position:relative;left:${run.x}px;top:${run.y}px;pointer-events:auto`, 'data-column-fragment': `${run.page}:${run.column}` }));
  for (const table of measurement.tables) {
    const fragments = flow.fragments.filter(fragment => fragment.kind === 'table' && fragment.table?.tablePos === table.table.pos);
    if (!fragments.length) { fail('missing-table-placement'); return empty(); }
    const firstFragment = fragments[0], firstPage = flow.pages[firstFragment.pageIndex];
    const oneColumn = fragments.every(fragment => fragment.regionIndex === firstFragment.regionIndex && fragment.columnIndex === firstFragment.columnIndex);
    if (oneColumn && table.table.height <= flow.regions[firstFragment.regionIndex].bandHeight + 0.5) {
      const whole = { ...firstFragment, from: table.table.from, to: table.table.to, kind: 'block' as const, sourceBlock: table.table.pos,
        rect: { ...firstFragment.rect, height: table.table.height } };
      const result = buildIntactTableDecoration(doc, table, whole, firstPage, rootWidth, topOffset);
      if (result.diagnostic || !result.decoration) { fail(result.diagnostic || 'missing-table-decoration'); return empty(); }
      decorations.push(result.decoration);
      continue;
    }
    const placements: TableBandPlacement[] = [];
    for (const fragment of fragments) {
      const data = fragment.table!, previous = placements.at(-1);
      if (previous && previous.groupIndex === data.groupIndex && previous.regionIndex === fragment.regionIndex && previous.columnIndex === fragment.columnIndex
          && Math.abs(previous.band.bottom - data.band.top) < 0.01 && Math.abs(previous.rect.y + previous.rect.height - fragment.rect.y) < 0.51) {
        previous.band = { ...previous.band, bottom: data.band.bottom, cells: previous.band.cells.map(cell => ({ ...cell,
          lines: [...cell.lines, ...(data.band.cells.find(next => next.pos === cell.pos)?.lines || [])] })) };
        previous.rect = { ...previous.rect, height: fragment.rect.y + fragment.rect.height - previous.rect.y };
      } else placements.push({ groupIndex: data.groupIndex, band: data.band, rect: { ...fragment.rect }, page: flow.pages[fragment.pageIndex],
        pageIndex: fragment.pageIndex, regionIndex: fragment.regionIndex, columnIndex: fragment.columnIndex, repeatedHeaderHeight: data.repeatedHeaderHeight });
    }
    const result = buildTableBandDecorations(doc, table, placements, rootWidth, topOffset, view);
    if (result.diagnostic) { fail(result.diagnostic); return empty(); }
    decorations.push(...result.decorations);
    if (result.overlay) overlays.push(result.overlay);
  }
  const last = flow.pages[flow.pages.length - 1], rootHeight = last.top + last.geometry.height / 15;
  const rootMarginBottom = -(first.margins.top + last.geometry.margins.bottom) / 15;
  return { decorations: DecorationSet.create(doc, decorations), overlays, rootHeight: Math.max(0, rootHeight), rootWidth, rootLeft, rootTop, rootMarginBottom, complete: true, diagnostics };
}
