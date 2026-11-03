/** View-only placement of an intact table in a measured column. */
import type { Node as PMNode } from 'prosemirror-model';
import { Decoration, type EditorView } from 'prosemirror-view';
import { TextSelection, type EditorState } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import type { FlowFragment, FlowPage } from './column-flow';
import type { ColumnTableMeasurement } from './column-flow-tables';


type CellPaintBox = { left: number; top: number; width: number; height: number; paint: import('./column-flow-tables').TableCellPaint; from: number; to: number; lines: import('./column-flow-tables').TableLine[] };
/** A pointer target behind text; it never duplicates editable content. */
function paintCellBox(box: CellPaintBox, documentNode: PMNode, view?: EditorView): HTMLElement {
  const el = document.createElement('span');
  el.dataset.columnTableCell = String(box.from); el.dataset.columnCellEmpty = String(box.lines.length === 0);
  el.style.cssText = `position:absolute;box-sizing:border-box;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;background:${box.paint.background};pointer-events:${view ? 'auto' : 'none'}`;
  for (const side of ['top', 'right', 'bottom', 'left'] as const) { const border = box.paint.borders[side]; el.style.setProperty(`border-${side}`, `${border.width}px ${border.style} ${border.color}`); }
  if (view) el.addEventListener('mousedown', event => {
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || view.isDestroyed || !view.editable || view.state.doc !== documentNode) return;
    const candidates = box.lines.flatMap(line => line.emptyBlock !== undefined ? [line.from] : Array.from({ length: Math.max(0, line.to - line.from) }, (_, i) => line.from + i));
    if (!candidates.length) candidates.push(Math.max(box.from, box.to - 1));
    let best = candidates[0], distance = Infinity;
    for (const pos of candidates) {
      try { const rect = view.coordsAtPos(pos), dy = Math.max(rect.top - event.clientY, 0, event.clientY - rect.bottom), dx = Math.abs(rect.left - event.clientX); const d = dy * 1000 + dx; if (d < distance) { distance = d; best = pos; } } catch { /* try remaining source positions */ }
    }
    if (!Number.isFinite(distance) && box.lines.length) return;
    event.preventDefault();
    const selection = TextSelection.near(view.state.doc.resolve(Math.min(view.state.doc.content.size, best)));
    view.dispatch(view.state.tr.setSelection(selection)); view.focus();
    const anchor = selection.anchor, owner = view.dom.ownerDocument;
    const move = (e: MouseEvent) => { if (view.isDestroyed || !view.editable || view.state.doc !== documentNode) return; const hit = view.posAtCoords({ left: e.clientX, top: e.clientY }); if (hit) view.dispatch(view.state.tr.setSelection(TextSelection.between(view.state.doc.resolve(anchor), view.state.doc.resolve(hit.pos)))); };
    const up = () => { owner.removeEventListener('mousemove', move); owner.removeEventListener('mouseup', up); };
    owner.addEventListener('mousemove', move); owner.addEventListener('mouseup', up, { once: true });
  });
  return el;
}

/** Reflect table cell selection in the inert paint layer without changing the document. */
export function updateTableOverlaySelection(layer: HTMLElement, state: EditorState): void {
  const selected = new Set<number>();
  if (state.selection instanceof CellSelection) state.selection.forEachCell((_cell, pos) => selected.add(pos + 1));
  for (const box of Array.from(layer.querySelectorAll<HTMLElement>('[data-column-table-cell]'))) {
    if (selected.has(Number(box.dataset.columnTableCell))) box.dataset.columnCellSelected = 'true';
    else delete box.dataset.columnCellSelected;
  }
}

export type TableDecorationResult = { decoration?: Decoration; diagnostic?: string };
/**
 * This first renderer moves one complete canonical table as a single block.
 * The target geometry uses the same root/page coordinate conversion as the
 * paragraph renderer. Fragmented tables require a separate synchronized cell
 * continuation renderer and are rejected rather than clipped.
 */
export function buildIntactTableDecoration(doc: PMNode, measurement: ColumnTableMeasurement, fragment: FlowFragment, page: FlowPage, rootWidth: number, topOffset: number): TableDecorationResult {
  const table = measurement.table, node = doc.nodeAt(table.pos);
  if (!measurement.complete) return { diagnostic: 'incomplete-table-measurement' };
  if (!node || node.type.spec.tableRole !== 'table' || fragment.kind !== 'block' || fragment.sourceBlock !== table.pos || fragment.from !== table.from || fragment.to !== table.to)
    return { diagnostic: 'invalid-table-fragment' };
  if (![rootWidth, topOffset, fragment.rect.x, fragment.rect.y, fragment.rect.width, fragment.rect.height, table.width, table.height, page.geometry.width].every(Number.isFinite)
      || rootWidth <= 0 || table.width <= 0 || table.height <= 0 || table.width > fragment.rect.width + 0.5 || table.height > fragment.rect.height + 0.5)
    return { diagnostic: 'table-fragment-overflow' };
  const left = (rootWidth - page.geometry.width / 15) / 2 + fragment.rect.x;
  const top = fragment.rect.y - topOffset;
  const style = `position:absolute;left:${left}px;top:${top}px;width:${table.width}px;max-width:none;box-sizing:border-box;margin:0;pointer-events:auto`;
  return { decoration: Decoration.node(table.pos, table.pos + node.nodeSize, { style, 'data-column-table': `${fragment.pageIndex}:${fragment.columnIndex}` }) };
}


export type TableGroupPlacement = { groupIndex: number; fragment: FlowFragment; page: FlowPage; repeatedHeaderHeight?: number };
export type TableGroupDecorationResult = { decorations: Decoration[]; overlay?: HTMLElement; diagnostic?: string };
/**
 * Prototype: move whole rowspan-connected groups and paint their cell boxes in
 * a transient, inert layer. Source text remains in its one editable PM DOM.
 * A split cell and repeated headers remain explicit diagnostics.
 */
export function buildTableGroupDecorations(doc: PMNode, measurement: ColumnTableMeasurement, placements: readonly TableGroupPlacement[], rootWidth: number, topOffset: number, view?: EditorView): TableGroupDecorationResult {
  const table = measurement.table, node = doc.nodeAt(table.pos);
  const reject = (diagnostic: string): TableGroupDecorationResult => ({ decorations: [], diagnostic });
  if (!measurement.complete) return reject('incomplete-table-measurement');
  if (!node || node.type.spec.tableRole !== 'table' || placements.length !== measurement.groups.length || !Number.isFinite(rootWidth) || rootWidth <= 0 || !Number.isFinite(topOffset) || new Set(placements.map(item => item.groupIndex)).size !== measurement.groups.length) return reject('invalid-table-group-placements');
  if (!table.paintSupported || measurement.groups.some(group => group.rows.some(row => !row.paintSupported) || group.cells.some(cell => !cell.paint.supported))) return reject('unsupported-table-cell-paint');
  const borders = measurement.groups.flatMap(group => group.cells.flatMap(cell => Object.values(cell.paint.borders))).filter(border => border.width > 0 && border.style === 'solid');
  if (new Set(borders.map(border => `${border.width}:${border.color}`)).size > 1) return reject('complex-table-border-conflict');
  const boxes: CellPaintBox[] = [];
  const decorations: Decoration[] = [Decoration.node(table.pos, table.pos + node.nodeSize, { style: `position:absolute;left:0;top:0;width:${table.width}px;max-width:none;box-sizing:border-box;margin:0;pointer-events:auto`, class: 'pm-column-table-source', 'data-column-table-groups': 'true' })];
  let initialRegion: string | null = null;
  const visitedRegions = new Set<string>();
  const headers: Array<{ left: number; top: number }> = [];
  for (const item of placements) {
    const group = measurement.groups[item.groupIndex], fragment = item.fragment;
    if (!group || fragment.kind !== 'block' || fragment.from !== group.from || fragment.to !== group.to || fragment.sourceBlock !== table.pos || ![fragment.rect.x, fragment.rect.y, fragment.rect.width, fragment.rect.height, item.page.geometry.width].every(Number.isFinite) || table.width > fragment.rect.width + 0.5 || group.height > fragment.rect.height + 0.5) return reject('table-group-overflow');
    const regionKey = `${fragment.regionIndex}:${fragment.columnIndex}`;
    if (initialRegion === null) initialRegion = regionKey;
    const x = (rootWidth - item.page.geometry.width / 15) / 2 + fragment.rect.x, targetTop = fragment.rect.y - topOffset;
    if (table.headerRows && regionKey !== initialRegion && !visitedRegions.has(regionKey)) {
      if (!table.headerHtml || Math.abs((item.repeatedHeaderHeight || 0) - table.headerHeight) > 0.5 || targetTop < table.headerHeight) return reject('repeated-table-header-space-unverified');
      headers.push({ left: x, top: targetTop - table.headerHeight });
    }
    visitedRegions.add(regionKey);
    const y = targetTop - (group.top - table.top);
    for (const row of group.rows) {
      const rowNode = doc.nodeAt(row.pos);
      if (!rowNode || rowNode.type.spec.tableRole !== 'row') return reject('missing-table-row');
      decorations.push(Decoration.node(row.pos, row.pos + rowNode.nodeSize, { style: `position:relative;left:${x}px;top:${y}px;pointer-events:auto;z-index:2;background:transparent;border-color:transparent`, 'data-column-table-row': `${fragment.pageIndex}:${fragment.columnIndex}` }));
    }
    for (const cell of group.cells) {
      const cellNode = doc.nodeAt(cell.pos);
      if (!cellNode) return reject('missing-table-cell');
      boxes.push({ left: x + cell.left - table.left, top: targetTop + cell.top - group.top, width: cell.width, height: cell.height, paint: cell.paint, from: cell.from, to: cell.to, lines: cell.lines });
      decorations.push(Decoration.node(cell.pos, cell.pos + cellNode.nodeSize, { class: 'pm-column-table-cell' }));
    }
  }
  const layer = document.createElement('div'); layer.setAttribute('aria-hidden', 'true'); layer.setAttribute('contenteditable', 'false'); layer.setAttribute('data-column-table-paint', 'true'); layer.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:1';
  for (const header of headers) { const wrapper = document.createElement('span'); wrapper.style.cssText = `position:absolute;left:${header.left}px;top:${header.top}px;width:${table.width}px;pointer-events:none`; wrapper.innerHTML = table.headerHtml; for (const el of Array.from(wrapper.querySelectorAll('a,button,input,select,textarea,[tabindex]'))) el.setAttribute('tabindex', '-1'); layer.appendChild(wrapper); }
  for (const box of boxes) layer.appendChild(paintCellBox(box, doc, view));
  return { decorations, overlay: layer };
}

export type TableBandPlacement = { groupIndex: number; band: import('./column-flow-tables').TableGroupBand; rect: { x: number; y: number; width: number; height: number }; page: FlowPage; pageIndex: number; regionIndex: number; columnIndex: number; repeatedHeaderHeight?: number };
/**
 * Prototype synchronized cell-band renderer. Each measured text line moves as
 * one PM inline decoration; the inert cell paint layer is the only duplication.
 * Callers must provide every band exactly once and reserve any header area.
 */
export function buildTableBandDecorations(doc: PMNode, measurement: ColumnTableMeasurement, placements: readonly TableBandPlacement[], rootWidth: number, topOffset: number, view?: EditorView): TableGroupDecorationResult {
  const table = measurement.table, node = doc.nodeAt(table.pos), reject = (diagnostic: string): TableGroupDecorationResult => ({ decorations: [], diagnostic });
  if (!measurement.complete || !node || node.type.spec.tableRole !== 'table' || !table.paintSupported || !Number.isFinite(rootWidth) || !Number.isFinite(topOffset)) return reject('invalid-table-band-measurement');
  if (measurement.groups.some(group => group.rows.some(row => !row.paintSupported) || group.cells.some(cell => !cell.paint.supported))) return reject('unsupported-table-cell-paint');
  const borders = measurement.groups.flatMap(group => group.cells.flatMap(cell => Object.values(cell.paint.borders))).filter(border => border.width > 0 && border.style === 'solid');
  if (new Set(borders.map(border => `${border.width}:${border.color}`)).size > 1) return reject('complex-table-border-conflict');
  const boxes: CellPaintBox[] = [];
  const headers: Array<{ left: number; top: number }> = [];
  let initialRegion: string | null = null; const visitedRegions = new Set<string>();
  // Hit testing traverses ancestor rectangles; cover every placed band while
  // retaining the natural inner table width with a scoped CSS custom property.
  const wrapperHeight = Math.max(table.height, ...placements.map(item => item.rect.y - topOffset + item.rect.height));
  const decorations: Decoration[] = [Decoration.node(table.pos, table.pos + node.nodeSize, { style: `position:absolute;left:0;top:0;width:${table.hasWrapper ? rootWidth : table.width}px;${table.hasWrapper ? `height:${wrapperHeight}px;` : ""}--column-table-natural-width:${table.width}px;max-width:none;box-sizing:border-box;margin:0;overflow:visible;pointer-events:none`, class: 'pm-column-table-source', 'data-column-table-bands': 'true' })];
  for (const group of measurement.groups) for (const cell of group.cells) {
    const cellNode = doc.nodeAt(cell.pos); if (!cellNode) return reject('missing-table-cell');
    decorations.push(Decoration.node(cell.pos, cell.pos + cellNode.nodeSize, { class: 'pm-column-table-cell', style: `position:absolute;display:block;left:0;top:0;width:${rootWidth}px;height:${wrapperHeight}px;box-sizing:border-box;padding:0;overflow:visible;pointer-events:none` }));
  }
  const blocks = new Map<number, import('./column-flow-tables').TableLine>();
  for (const group of measurement.groups) for (const cell of group.cells) for (const line of cell.lines) blocks.set(line.blockPos, line);
  const emptyTargets = new Map<number, { x: number; y: number; id: string }>();
  for (const item of placements) {
    const group = measurement.groups[item.groupIndex]; if (!group) continue;
    const x = (rootWidth - item.page.geometry.width / 15) / 2 + item.rect.x, top = item.rect.y - topOffset;
    for (const cell of group.cells) for (const line of cell.lines) if (line.emptyBlock !== undefined && line.top >= item.band.top - 0.5 && line.bottom <= item.band.bottom + 0.5)
      emptyTargets.set(line.blockPos, { x: x + line.blockLeft - table.left, y: top + line.blockTop - item.band.top, id: `${item.pageIndex}:${item.columnIndex}` });
  }
  for (const line of blocks.values()) {
    const block = doc.nodeAt(line.blockPos); if (!block?.isTextblock) return reject('missing-table-cell-block');
    const empty = line.emptyBlock !== undefined ? emptyTargets.get(line.blockPos) : undefined;
    if (line.emptyBlock !== undefined && (!empty || empty.x < 0 || empty.y < 0)) return reject('empty-table-cell-band-unverified');
    const left = empty?.x || 0, top = empty?.y || 0, right = Math.max(0, rootWidth - left - line.blockWidth);
    decorations.push(Decoration.node(line.blockPos, line.blockPos + block.nodeSize, { style: `position:absolute;left:0;top:0;width:${rootWidth}px;height:${wrapperHeight}px;box-sizing:border-box;margin:0;padding:${top}px ${right}px 0 ${left}px;overflow:visible;pointer-events:none;z-index:2`, ...(empty ? { 'data-column-table-empty': empty.id } : {}) }));
  }
  for (let groupIndex = 0; groupIndex < measurement.groups.length; groupIndex++) {
    const group = measurement.groups[groupIndex], bands = placements.filter(item => item.groupIndex === groupIndex).sort((a, b) => a.band.top - b.band.top);
    if (bands.length > 1 && group.rows.some(row => row.header)) return reject('table-header-group-split-unsupported');
    if (!bands.length || Math.abs(bands[0].band.top - group.top) > 0.5 || Math.abs(bands.at(-1)!.band.bottom - (group.top + group.height)) > 0.5) return reject('incomplete-table-bands');
    for (let index = 0; index < bands.length; index++) {
      const { band, rect, page, pageIndex, regionIndex, columnIndex, repeatedHeaderHeight } = bands[index];
      if (index && Math.abs(bands[index - 1].band.bottom - band.top) > 0.5 || ![band.top, band.bottom, rect.x, rect.y, rect.width, rect.height, page.geometry.width].every(Number.isFinite) || band.bottom <= band.top || table.width > rect.width + 0.5 || band.bottom - band.top > rect.height + 0.5) return reject('invalid-table-band-placement');
      const x = (rootWidth - page.geometry.width / 15) / 2 + rect.x, targetTop = rect.y - topOffset;
      const regionKey = `${regionIndex}:${columnIndex}`;
      if (initialRegion === null) initialRegion = regionKey;
      if (table.headerRows && regionKey !== initialRegion && !visitedRegions.has(regionKey)) {
        if (!table.headerHtml || Math.abs((repeatedHeaderHeight || band.headerHeight || 0) - table.headerHeight) > 0.5 || targetTop < table.headerHeight) return reject('repeated-table-header-space-unverified');
        headers.push({ left: x, top: targetTop - table.headerHeight });
      }
      visitedRegions.add(regionKey);
      for (const cell of group.cells) {
        const begin = Math.max(cell.top, band.top), end = Math.min(cell.top + cell.height, band.bottom);
        if (end > begin + 0.01) boxes.push({ left: x + cell.left - table.left, top: targetTop + begin - band.top, width: cell.width, height: end - begin, paint: cell.paint, from: cell.from, to: cell.to, lines: cell.lines.filter(line => line.bottom > band.top + 0.5 && line.top < band.bottom - 0.5) });
        for (const line of cell.lines) {
          if (line.bottom <= band.top + 0.5 || line.top >= band.bottom - 0.5) continue;
          if (line.top < band.top - 0.5 || line.bottom > band.bottom + 0.5) return reject('table-band-cuts-text');
          const textX = x + line.blockLeft - table.left, textY = targetTop + line.blockTop - band.top;
          if (line.emptyBlock !== undefined) continue;
          else if (line.to > line.from) decorations.push(Decoration.inline(line.from, line.to, { style: `position:relative;left:${textX}px;top:${textY}px;pointer-events:auto;z-index:2`, 'data-column-table-line': `${pageIndex}:${columnIndex}` }));
        }
      }
    }
  }
  if (placements.some(item => item.groupIndex < 0 || item.groupIndex >= measurement.groups.length)) return reject('invalid-table-band-placement');
  // The paint layer is a sibling of the editable root, never PM content.
  const layer = document.createElement('div'); layer.setAttribute('aria-hidden', 'true'); layer.setAttribute('contenteditable', 'false'); layer.setAttribute('data-column-table-paint', 'true'); layer.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:1';
  for (const header of headers) { const wrapper = document.createElement('span'); wrapper.style.cssText = `position:absolute;left:${header.left}px;top:${header.top}px;width:${table.width}px;pointer-events:none`; wrapper.innerHTML = table.headerHtml; for (const el of Array.from(wrapper.querySelectorAll('a,button,input,select,textarea,[tabindex]'))) el.setAttribute('tabindex', '-1'); layer.appendChild(wrapper); }
  for (const box of boxes) layer.appendChild(paintCellBox(box, doc, view));
  return { decorations, overlay: layer };
}
