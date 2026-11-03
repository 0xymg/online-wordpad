/** Pure A3 column-region solver. Coordinates are unzoomed CSS pixels. */
import type { SectionColumns, SectionFlowDirection } from './section-columns';
import type { EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import type { TabContentGeometry } from './tab-dom-layout';
import type { TableGroupBand } from './column-flow-tables';
import { paragraphFlowDecision, type ParagraphFlowPolicy } from './column-paragraph-flow';
export type ColumnGeometry = { width: number; height: number; margins: { top: number; right: number; bottom: number; left: number } };
export type FlowTableUnit = { tablePos: number; groupIndex: number; band: TableGroupBand; headerHeight: number; headerGroup?: boolean };
export type FlowSubLine = { from: number; to: number; sourceTop: number; offsetY: number; height: number };
export type FlowUnit = { from: number; to: number; height: number; kind: 'line' | 'block' | 'table' | 'column_break' | 'page_break'; sourceTop?: number; sourceBlock?: number; sourceLeft?: number; sourceWidth?: number; sourceMarginLeft?: number; sourceMarginRight?: number; offsetY?: number; table?: FlowTableUnit; paragraph?: ParagraphFlowPolicy; subLines?: FlowSubLine[] };
export type FlowSection = { id: string; geometry: ColumnGeometry; start: 'nextPage' | 'continuous'; columns: SectionColumns; flowDirection: SectionFlowDirection; units: readonly FlowUnit[] };
export type FlowRect = { x: number; y: number; width: number; height: number };
export type FlowPage = { top: number; geometry: ColumnGeometry; section: number; sectionPage: number };
export type FlowRegion = { pageIndex: number; sectionId: string; bandTop: number; bandHeight: number; direction: 'ltr' | 'rtl'; columns: FlowRect[]; separator: boolean; activeColumns: number };
export type FlowFragment = { from: number; to: number; pageIndex: number; regionIndex: number; columnIndex: number; rect: FlowRect; kind: 'line' | 'block' | 'table'; sourceTop?: number; sourceBlock?: number; sourceLeft?: number; sourceWidth?: number; sourceMarginLeft?: number; sourceMarginRight?: number; table?: FlowTableUnit & { repeatedHeaderHeight: number } };
export type FlowDiagnostic = { code: string; sectionId: string; from?: number; to?: number };
export type FlowLayout = { pages: FlowPage[]; regions: FlowRegion[]; fragments: FlowFragment[]; complete: boolean; diagnostics: FlowDiagnostic[] };
/** Physical X shift between logical columns, including centered mixed-size sheets. */
export function columnRelativeXDelta(layout: FlowLayout, current: FlowFragment, next: FlowFragment): number | null {
  const a = layout.regions[current.regionIndex]?.columns[current.columnIndex], b = layout.regions[next.regionIndex]?.columns[next.columnIndex];
  const currentPage = layout.pages[current.pageIndex], nextPage = layout.pages[next.pageIndex];
  if (!a || !b || !currentPage || !nextPage) return null;
  return b.x - a.x + (currentPage.geometry.width - nextPage.geometry.width) / 30;
}
/** Only a genuine top-level textblock start can be treated as a block boundary. */
export function columnPageBreakPositions(doc: PMNode, layout: FlowLayout): number[] {
  return layout.pages.slice(1).map((_page, offset) => {
    const first = layout.fragments.find(fragment => fragment.pageIndex === offset + 1);
    if (!first) return doc.content.size;
    const block = first.sourceBlock === undefined ? null : doc.nodeAt(first.sourceBlock);
    if (block?.isTextblock && first.sourceBlock !== undefined && first.from === first.sourceBlock + 1 && doc.resolve(first.sourceBlock).depth === 0) return first.sourceBlock;
    return first.from;
  });
}
type ActiveFlow = { doc: PMNode; layout: FlowLayout };
const activeFlows = new WeakMap<EditorView, ActiveFlow>();
const previewFlows = new WeakMap<EditorView, ActiveFlow>();
/** Emitted after a converged view-only snapshot becomes available. */
export const COLUMN_FLOW_READY_EVENT = 'edtr-column-flow-ready';
/** Publish only a complete result for the exact document it measured. */
export function setColumnFlowSnapshot(view: EditorView, doc: PMNode, layout: FlowLayout | null): boolean {
  if (!layout) { activeFlows.delete(view); return true; }
  if (!layout.complete || view.isDestroyed || view.state.doc !== doc) return false;
  activeFlows.set(view, { doc, layout });
  view.dom.dispatchEvent(new CustomEvent(COLUMN_FLOW_READY_EVENT, { bubbles: true }));
  return true;
}
/** A provisional plan is available only to the tab measurement pass. */
export function setColumnFlowPreview(view: EditorView, doc: PMNode, layout: FlowLayout | null): boolean {
  if (!layout) { previewFlows.delete(view); return true; }
  if (!layout.complete || view.isDestroyed || view.state.doc !== doc) return false;
  previewFlows.set(view, { doc, layout }); return true;
}
/** Keep same-document tab geometry while an invalidated layout is recomputed. */
export function retainColumnFlowPreview(view: EditorView): void {
  const preview = previewFlows.get(view), active = activeFlows.get(view);
  if (preview?.doc === view.state.doc) return;
  if (active?.doc === view.state.doc) previewFlows.set(view, active);
  else previewFlows.delete(view);
}
function geometryAtPos(view: EditorView, pos: number, active: ActiveFlow | undefined, fallback?: TabContentGeometry, exactElement?: HTMLElement): TabContentGeometry | null {
  if (!active || view.isDestroyed || active.doc !== view.state.doc) return null;
  const fragment = active.layout.fragments.find(item => item.from === item.to && pos === item.from)
    ?? active.layout.fragments.find(item => item.kind === 'table' && item.table?.band.cells.some(cell => cell.lines.some(line => pos >= line.from && pos < line.to)))
    ?? active.layout.fragments.find(item => pos >= item.from && pos < item.to)
    ?? active.layout.fragments.find(item => pos === item.to);
  if (!fragment) return null;
  const region = active.layout.regions[fragment.regionIndex], page = active.layout.pages[fragment.pageIndex], column = region?.columns[fragment.columnIndex];
  const pageElement = view.dom.parentElement; if (!region || !page || !column || !pageElement) return null;
  const root = view.dom.getBoundingClientRect(), width = Number.parseFloat(getComputedStyle(view.dom).width), scale = root.width / width;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  if (fragment.kind === 'table') {
    let base = fallback;
    if (!base) {
      const resolved = view.state.doc.resolve(pos);
      for (let depth = resolved.depth; depth > 0; depth--) {
        if (!resolved.node(depth).isTextblock) continue;
        const dom = view.nodeDOM(resolved.before(depth)); if (!(dom instanceof HTMLElement)) break;
        const rect = dom.getBoundingClientRect(), style = getComputedStyle(dom), direction = style.direction === 'rtl' ? 'rtl' : 'ltr';
        const leading = Math.max(0, Number.parseFloat(direction === 'rtl' ? style.marginRight : style.marginLeft) || 0);
        base = { originClientX: direction === 'rtl' ? rect.right + leading * scale : rect.left - leading * scale,
          direction, availableWidthTwips: (rect.width / scale + leading) * 15, cssPixelsPerTwip: scale / 15 };
        break;
      }
    }
    if (!base) return null;
    const at = exactElement || view.domAtPos(pos).node, element = at instanceof HTMLElement ? at : at.parentElement;
    const shifted = element?.closest<HTMLElement>('[data-column-table-line]');
    const shift = Number.parseFloat(shifted?.style.left || '') || 0;
    return { ...base, originClientX: base.originClientX + shift * scale };
  }
  const maximum = Math.max(...active.layout.pages.map(item => item.geometry.width));
  const left = pageElement.getBoundingClientRect().left + ((maximum - page.geometry.width) / 30 + column.x) * scale;
  let paragraph: HTMLElement | null = null;
  if (fragment.sourceBlock !== undefined) {
    const dom = view.nodeDOM(fragment.sourceBlock); if (dom instanceof HTMLElement) paragraph = dom;
  }
  const style = paragraph ? getComputedStyle(paragraph) : null;
  const direction = fallback?.direction ?? (style?.direction === 'rtl' ? 'rtl' : 'ltr');
  const storedMargin = direction === 'rtl' ? fragment.sourceMarginRight : fragment.sourceMarginLeft;
  const leading = Math.max(0, storedMargin ?? (Number.parseFloat(direction === 'rtl' ? style?.marginRight || '' : style?.marginLeft || '') || 0));
  const sourceLeft = fragment.sourceLeft ?? 0, sourceWidth = fragment.sourceWidth ?? column.width;
  const origin = direction === 'rtl' ? sourceLeft + sourceWidth + leading : sourceLeft - leading;
  return { originClientX: left + origin * scale, direction,
    availableWidthTwips: Math.max(0, sourceWidth + leading) * 15, cssPixelsPerTwip: scale / 15 };
}
/** The active region is defined by the source position, not paragraph start. */
export function columnContentGeometryAtPos(view: EditorView, pos: number): TabContentGeometry | null {
  return geometryAtPos(view, pos, activeFlows.get(view));
}
export function resolveColumnTabGeometry(view: EditorView, _paragraphPos: number, tab: HTMLElement, fallback: TabContentGeometry): TabContentGeometry {
  try { return geometryAtPos(view, view.posAtDOM(tab, 0), previewFlows.get(view) ?? activeFlows.get(view), fallback, tab) ?? fallback; } catch { return fallback; }
}
const px = (twips: number) => twips / 15;
const epsilon = 0.01;
const paperEqual = (a: ColumnGeometry, b: ColumnGeometry) => a.width === b.width && a.height === b.height;
function validGeometry(g: ColumnGeometry): boolean {
  return [g.width, g.height, g.margins.top, g.margins.bottom, g.margins.left, g.margins.right].every(Number.isFinite)
    && g.width > g.margins.left + g.margins.right && g.height > g.margins.top + g.margins.bottom;
}
/** Place units within one band. Hard breaks do not open an otherwise empty trailing region. */
function fit(units: readonly FlowUnit[], start: number, count: number, capacity: number, physicalStart: boolean, fullCapacity: number, availableBand: number): { end: number; placements: Array<{ unit: FlowUnit; column: number; y: number; repeatedHeaderHeight: number }>; used: number; pageBreak: boolean; columnsUsed: number; overflow?: FlowUnit; requiredHeight?: number; unverifiedTrailingBreak?: FlowUnit; terminalBlankPage?: boolean } {
  let index = start, column = 0, y = 0, used = 0, pageBreak = false;
  const placements: Array<{ unit: FlowUnit; column: number; y: number; repeatedHeaderHeight: number }> = [];
  while (index < units.length) {
    const unit = units[index];
    if (unit.kind === 'column_break' || unit.kind === 'page_break') {
      index++;
      if (!units.slice(index).some(candidate => candidate.kind === 'line' || candidate.kind === 'block' || candidate.kind === 'table')) {
        // Consecutive terminal breaks still advance through remaining columns.
        if (unit.kind === 'column_break' && column < count - 1) { column++; continue; }
        if (unit.kind === 'column_break' && count <= 2) return { end: index, placements, used, pageBreak, columnsUsed: Math.min(count, column + 1), terminalBlankPage: true };
        if (unit.kind === 'page_break' && count === 1) continue;
        return { end: index, placements, used, pageBreak, columnsUsed: Math.min(count, column + 1), unverifiedTrailingBreak: unit };
      }
      if (unit.kind === 'page_break') { pageBreak = true; break; }
      if (++column >= count) break;
      y = 0; continue;
    }
    const policy = unit.paragraph;
    if (policy) {
      const placedLines = placements.filter(item => item.column === column && item.unit.paragraph?.block === policy.block).length;
      const decision = paragraphFlowDecision(units, index, { y, capacity, atPageStart: physicalStart && column === 0 && y <= epsilon, placedLines,
        fullCapacity, availableBand, partialBand: availableBand < fullCapacity - epsilon });
      if (decision === 'page') { pageBreak = true; break; }
      if (decision === 'column') { if (++column >= count) break; y = 0; continue; }
    }
    if (unit.table?.headerGroup && y > epsilon) {
      let needed = 0, cursor = index;
      while (cursor < units.length && units[cursor].table?.tablePos === unit.table.tablePos && units[cursor].table?.headerGroup) needed += units[cursor++].height;
      if (cursor < units.length && units[cursor].table?.tablePos === unit.table.tablePos) needed += units[cursor].height;
      // Keep the initial header with its first body band when that pair fits
      // in a fresh column; do not retry forever if it is intrinsically too tall.
      if (needed <= capacity + epsilon && y + needed > capacity + epsilon) { if (++column >= count) break; y = 0; continue; }
    }
    const header = () => unit.table && y <= epsilon && units.slice(0, index).some(prior => prior.table?.tablePos === unit.table?.tablePos) ? unit.table.headerHeight : 0;
    let repeatedHeaderHeight = header(), required = unit.height + repeatedHeaderHeight;
    if (!Number.isFinite(required) || required < 0 || required > capacity + epsilon && y <= epsilon) return { end: index, placements, used, pageBreak, columnsUsed: Math.min(count, column + 1), overflow: unit, requiredHeight: required };
    if (y + required > capacity + epsilon) {
      if (++column >= count) break;
      y = 0;
      repeatedHeaderHeight = header(); required = unit.height + repeatedHeaderHeight;
      if (required > capacity + epsilon) return { end: index, placements, used, pageBreak, columnsUsed: Math.min(count, column + 1), overflow: unit, requiredHeight: required };
    }
    placements.push({ unit, column, y, repeatedHeaderHeight }); y += required; used = Math.max(used, y); index++;
  }
  return { end: index, placements, used, pageBreak, columnsUsed: Math.min(count, column + 1) };
}
/** Deterministic region flow. Explicit diagnostics mean callers must not publish a complete layout. */
export function solveColumnFlow(sections: readonly FlowSection[], pageGap = 26): FlowLayout {
  const result: FlowLayout = { pages: [], regions: [], fragments: [], diagnostics: [], complete: true };
  const fail = (sectionId: string, code: string, unit?: FlowUnit) => { result.complete = false; result.diagnostics.push({ sectionId, code, ...(unit ? { from: unit.from, to: unit.to } : {}) }); };
  let pageIndex = -1, bandTop = 0;
  const newPage = (section: FlowSection, sectionIndex: number, sectionPage: number) => {
    const previous = result.pages.at(-1); const top = previous ? previous.top + px(previous.geometry.height) + pageGap : 0;
    result.pages.push({ top, geometry: section.geometry, section: sectionIndex, sectionPage }); pageIndex++;
    bandTop = px(section.geometry.margins.top);
  };
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    const section = sections[sectionIndex], next = sections[sectionIndex + 1];
    if (!validGeometry(section.geometry)) { fail(section.id, 'invalid-page-geometry'); break; }
    if (section.columns.kind !== 'equal') { fail(section.id, 'unsupported-columns'); break; }
    if (section.flowDirection === 'preserved') { fail(section.id, 'unsupported-section-direction'); break; }
    const { count, space, separator } = section.columns;
    if (![1, 2, 3].includes(count) || !Number.isInteger(space) || space < 0) { fail(section.id, 'invalid-columns'); break; }
    const contentWidth = px(section.geometry.width - section.geometry.margins.left - section.geometry.margins.right), gap = px(space);
    const columnWidth = (contentWidth - (count - 1) * gap) / count;
    if (columnWidth < 48) { fail(section.id, 'column-too-narrow'); break; }
    const terminal = section.units.at(-1);
    if (next && terminal && (terminal.kind === 'column_break' || terminal.kind === 'page_break')) { fail(section.id, 'unverified-section-ending-break', terminal); break; }
    let sectionPage = 0;
    if (pageIndex < 0 || section.start !== 'continuous' || !paperEqual(result.pages[pageIndex].geometry, section.geometry)) newPage(section, sectionIndex, sectionPage);
    else bandTop = Math.max(bandTop, px(section.geometry.margins.top));
    let index = 0;
    while (index < section.units.length) {
      const bottom = px(section.geometry.height - section.geometry.margins.bottom);
      const available = bottom - bandTop;
      const fullCapacity = px(section.geometry.height - section.geometry.margins.top - section.geometry.margins.bottom);
      if (available <= epsilon) { newPage(section, sectionIndex, ++sectionPage); continue; }
      const physicalStart = bandTop <= px(result.pages[pageIndex].geometry.margins.top) + epsilon;
      let placed = fit(section.units, index, count, available, physicalStart, fullCapacity, available);
      if (placed.pageBreak && placed.end === index && !placed.placements.length) { newPage(section, sectionIndex, ++sectionPage); continue; }
      if (placed.unverifiedTrailingBreak) { fail(section.id, 'unverified-trailing-break', placed.unverifiedTrailingBreak); break; }
      if (placed.terminalBlankPage && next) { fail(section.id, 'unverified-section-ending-break'); break; }
      if (placed.overflow) {
        if ((placed.requiredHeight ?? placed.overflow.height) > fullCapacity + epsilon || !Number.isFinite(placed.overflow.height) || placed.overflow.height < 0) { fail(section.id, 'unit-exceeds-region', placed.overflow); break; }
        if (!placed.placements.length) { newPage(section, sectionIndex, ++sectionPage); continue; }
      }
      const closesContinuous = placed.end === section.units.length && !placed.pageBreak && next?.start === 'continuous' && paperEqual(section.geometry, next.geometry);
      let bandHeight = available;
      if (closesContinuous && placed.placements.length) {
        // Search a common band height; retain explicit break constraints.
        let low = Math.max(...placed.placements.map(item => item.unit.height)), high = available;
        for (let pass = 0; pass < 24 && high - low > 0.01; pass++) {
          const middle = (low + high) / 2, candidate = fit(section.units, index, count, middle, physicalStart, fullCapacity, available);
          if (!candidate.overflow && !candidate.unverifiedTrailingBreak && candidate.end === section.units.length && !candidate.pageBreak) high = middle; else low = middle;
        }
        bandHeight = high; placed = fit(section.units, index, count, bandHeight, physicalStart, fullCapacity, available);
      }
      const regionIndex = result.regions.length, page = result.pages[pageIndex];
      const columns = Array.from({ length: count }, (_, logical) => {
        const physical = section.flowDirection === 'rtl' ? count - 1 - logical : logical;
        return { x: px(section.geometry.margins.left) + physical * (columnWidth + gap), y: page.top + bandTop, width: columnWidth, height: bandHeight };
      });
      result.regions.push({ pageIndex, sectionId: section.id, bandTop: page.top + bandTop, bandHeight, direction: section.flowDirection, columns, separator, activeColumns: placed.columnsUsed });
      for (const item of placed.placements) {
        const col = columns[item.column];
        if (item.unit.subLines?.length) {
          for (const line of item.unit.subLines) result.fragments.push({ from: line.from, to: line.to, pageIndex, regionIndex, columnIndex: item.column,
            rect: { x: col.x, y: col.y + item.y + line.offsetY, width: col.width, height: line.height }, kind: 'line',
            sourceTop: line.sourceTop, sourceBlock: item.unit.sourceBlock, sourceLeft: item.unit.sourceLeft, sourceWidth: item.unit.sourceWidth,
            sourceMarginLeft: item.unit.sourceMarginLeft, sourceMarginRight: item.unit.sourceMarginRight });
          continue;
        }
        result.fragments.push({ from: item.unit.from, to: item.unit.to, pageIndex, regionIndex, columnIndex: item.column,
          rect: { x: col.x, y: col.y + item.y + item.repeatedHeaderHeight + (item.unit.offsetY || 0), width: col.width, height: item.unit.height - (item.unit.offsetY || 0) }, kind: item.unit.kind as 'line' | 'block' | 'table',
          sourceTop: item.unit.sourceTop, sourceBlock: item.unit.sourceBlock, sourceLeft: item.unit.sourceLeft, sourceWidth: item.unit.sourceWidth,
          sourceMarginLeft: item.unit.sourceMarginLeft, sourceMarginRight: item.unit.sourceMarginRight,
          ...(item.unit.table ? { table: { ...item.unit.table, repeatedHeaderHeight: item.repeatedHeaderHeight } } : {}) });
      }
      if (placed.end <= index) { fail(section.id, 'no-progress', section.units[index]); break; }
      index = placed.end;
      if (index < section.units.length) newPage(section, sectionIndex, ++sectionPage);
      else if (placed.terminalBlankPage) newPage(section, sectionIndex, ++sectionPage);
      else bandTop += closesContinuous ? bandHeight : placed.used;
    }
    if (!result.complete) break;
  }
  return result;
}
