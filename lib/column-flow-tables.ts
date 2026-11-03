/** Read-only table geometry for future table-aware column flow. No document or DOM mutation. */
import { TableMap } from 'prosemirror-tables';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

export type TableLine = { from: number; to: number; top: number; bottom: number; emptyBlock?: number; blockPos: number; blockTop: number; blockLeft: number; blockWidth: number };
export type TableCellPaint = { supported: boolean; background: string; borders: Record<'top' | 'right' | 'bottom' | 'left', { width: number; style: string; color: string }> };
export type TableCellLane = { paint: TableCellPaint; pos: number; from: number; to: number; left: number; top: number; width: number; height: number; lines: TableLine[] };
export type TableRowGeometry = { pos: number; from: number; to: number; top: number; height: number; header: boolean; paintSupported: boolean };
export type TableRowGroup = { from: number; to: number; top: number; height: number; rows: TableRowGeometry[]; cells: TableCellLane[]; safeCuts: number[] };
export type ColumnTableMeasurement = { table: { pos: number; from: number; to: number; left: number; top: number; width: number; height: number; columns: number; headerRows: number; headerHeight: number; headerHtml: string; paintSupported: boolean; hasWrapper: boolean }; groups: TableRowGroup[]; complete: boolean; diagnostics: Array<{ code: string; from: number; to: number }> };
export type ColumnTableOptions = { root: DOMRect; scale: number; columnWidth: number; regionHeight: number };
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const EPSILON = 0.5;
/**
 * A safe cut is a source-space Y that intersects no text line in any cell.
 * It is only a candidate for a synchronized multi-cell continuation: callers
 * must render every cell lane/border and any repeated headers before publishing.
 */
export function measureColumnTable(view: EditorView, node: PMNode, pos: number, options: ColumnTableOptions): ColumnTableMeasurement {
  const { root, scale, columnWidth, regionHeight } = options;
  const table = { pos, from: pos, to: pos + node.nodeSize, left: 0, top: 0, width: 0, height: 0, columns: 0, headerRows: 0, headerHeight: 0, headerHtml: "", paintSupported: false, hasWrapper: false };
  const result: ColumnTableMeasurement = { table, groups: [], complete: true, diagnostics: [] };
  const fail = (code: string, from = pos, to = pos + node.nodeSize) => { result.complete = false; result.diagnostics.push({ code, from, to }); };
  if (node.type.spec.tableRole !== 'table' || !Number.isFinite(scale) || scale <= 0 || !Number.isFinite(columnWidth) || columnWidth <= 0 || !Number.isFinite(regionHeight) || regionHeight <= 0) { fail('invalid-table-measurement'); return result; }
  const dom = view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement)) { fail('missing-table-dom'); return result; }
  table.hasWrapper = !dom.matches('table');
  const tableElement = dom.matches('table') ? dom : dom.querySelector('table');
  if (!(tableElement instanceof HTMLElement)) { fail('missing-table-dom'); return result; }
  const tableStyle = getComputedStyle(tableElement);
  table.paintSupported = tableStyle.backgroundImage === 'none' && tableStyle.boxShadow === 'none' && ['rgba(0, 0, 0, 0)', 'transparent'].includes(tableStyle.backgroundColor);
  const rect = tableElement.getBoundingClientRect();
  Object.assign(table, { left: (rect.left - root.left) / scale, top: (rect.top - root.top) / scale, width: rect.width / scale, height: rect.height / scale });
  if (![table.left, table.top, table.width, table.height].every(Number.isFinite) || table.width <= 0 || table.height <= 0) fail('invalid-table-geometry');
  if (table.width > columnWidth + EPSILON) fail('table-exceeds-column-width');
  let map: TableMap;
  try { map = TableMap.get(node); } catch { fail('invalid-table-map'); return result; }
  table.columns = map.width;
  if (map.problems?.length) { fail('invalid-table-map'); return result; }
  const rows: Array<TableRowGeometry & { node: PMNode }> = [];
  let headersOpen = true;
  node.forEach((row, offset) => {
    const rowPos = pos + 1 + offset, element = view.nodeDOM(rowPos);
    if (!(element instanceof HTMLElement)) { fail('missing-table-row-dom', rowPos, rowPos + row.nodeSize); return; }
    const r = element.getBoundingClientRect(), raw = String(row.attrs.docxProperties || '');
    const parsed = new DOMParser().parseFromString(raw || '<tr/>', 'application/xml');
    const properties = parsed.documentElement.namespaceURI === W && parsed.documentElement.localName === 'trPr' ? parsed.documentElement : null;
    const header = properties && Array.from(properties.children).find(child => child.namespaceURI === W && child.localName === 'tblHeader');
    const repeat = !!header && !['0', 'false', 'off'].includes(header.getAttributeNS(W, 'val') || '');
    if (headersOpen && repeat) table.headerRows++; else headersOpen = false;
    if (repeat && !headersOpen) fail('noncontiguous-table-header', rowPos, rowPos + row.nodeSize);
    const rowStyle = getComputedStyle(element), paintSupported = rowStyle.backgroundImage === 'none' && rowStyle.boxShadow === 'none' && ['rgba(0, 0, 0, 0)', 'transparent'].includes(rowStyle.backgroundColor);
    rows.push({ node: row, pos: rowPos, from: rowPos, to: rowPos + row.nodeSize, top: (r.top - root.top) / scale, height: r.height / scale, header: repeat, paintSupported });
  });
  if (rows.length !== map.height) { fail('missing-table-row-dom'); return result; }
  if (table.headerRows) {
    for (let row = 0; row < table.headerRows; row++) for (let col = 0; col < map.width; col++) if (map.findCell(map.map[row * map.width + col]).bottom > table.headerRows) fail('header-rowspan-crosses-header', rows[row].from, rows[row].to);
    table.headerHeight = rows.slice(0, table.headerRows).reduce((sum, row) => sum + row.height, 0);
    // A native <table> inside a PM widget can be reparsed by table editing.
    // Repeat header paint as inert positioned cell boxes, never nested tables.
    const clone = document.createElement('div'); clone.setAttribute('data-column-repeated-header', 'true');
    clone.style.cssText = `position:relative;width:${table.width}px;height:${table.headerHeight}px;pointer-events:none`;
    const headerTop = rows[0].top;
    for (const row of rows.slice(0, table.headerRows)) row.node.forEach((cell, offset) => {
      const cellPos = row.pos + 1 + offset, original = view.nodeDOM(cellPos);
      if (!(original instanceof HTMLElement)) { fail('missing-table-cell-dom', cellPos, cellPos + cell.nodeSize); return; }
      const rect = original.getBoundingClientRect(), css = getComputedStyle(original), box = document.createElement('div');
      box.style.cssText = `position:absolute;box-sizing:border-box;left:${(rect.left-root.left)/scale-table.left}px;top:${(rect.top-root.top)/scale-headerTop}px;width:${rect.width/scale}px;height:${rect.height/scale}px;overflow:hidden;pointer-events:none`;
      for (const property of ['padding-top','padding-right','padding-bottom','padding-left','background-color','border-top','border-right','border-bottom','border-left','font','color','text-align','vertical-align','white-space','overflow-wrap','word-break']) box.style.setProperty(property, css.getPropertyValue(property));
      box.innerHTML = original.innerHTML;
      const originals = Array.from(original.querySelectorAll('*')), copies = Array.from(box.querySelectorAll('*'));
      originals.forEach((element, index) => {
        const copy = copies[index]; if (!(copy instanceof HTMLElement)) return;
        const computed = getComputedStyle(element);
        for (const property of ['font-family','font-size','font-weight','font-style','line-height','letter-spacing','white-space','overflow-wrap','word-break','text-align','direction','margin-top','margin-right','margin-bottom','margin-left']) copy.style.setProperty(property, computed.getPropertyValue(property));
      });
      for (const el of Array.from(box.querySelectorAll('[id], [contenteditable], .column-resize-handle, .pm-page-spacer, .ProseMirror-separator'))) {
        if (el.classList.contains('column-resize-handle') || el.classList.contains('pm-page-spacer') || el.classList.contains('ProseMirror-separator')) el.remove();
        else { el.removeAttribute('id'); el.removeAttribute('contenteditable'); }
      }
      clone.appendChild(box);
    });
    table.headerHtml = clone.outerHTML;
  }
  for (let start = 0; start < rows.length;) {
    let end = start + 1;
    for (let row = start; row < end; row++) for (let col = 0; col < map.width; col++) end = Math.max(end, map.findCell(map.map[row * map.width + col]).bottom);
    const groupRows = rows.slice(start, end), top = groupRows[0].top, bottom = groupRows.at(-1)!.top + groupRows.at(-1)!.height;
    const group: TableRowGroup = { from: groupRows[0].from, to: groupRows.at(-1)!.to, top, height: bottom - top,
      rows: groupRows.map(row => ({ pos: row.pos, from: row.from, to: row.to, top: row.top, height: row.height, header: row.header, paintSupported: row.paintSupported })), cells: [], safeCuts: [] };
    for (const row of groupRows) row.node.forEach((cell, offset) => {
      const cellPos = row.pos + 1 + offset, element = view.nodeDOM(cellPos);
      if (!(element instanceof HTMLElement)) { fail('missing-table-cell-dom', cellPos, cellPos + cell.nodeSize); return; }
      const r = element.getBoundingClientRect(), computed = getComputedStyle(element);
      const borders = Object.fromEntries((['top', 'right', 'bottom', 'left'] as const).map(side => {
        return [side, { width: Number.parseFloat(computed.getPropertyValue(`border-${side}-width`)) || 0,
          style: computed.getPropertyValue(`border-${side}-style`), color: computed.getPropertyValue(`border-${side}-color`) }];
      })) as TableCellPaint['borders'];
      const lane: TableCellLane = { paint: { supported: computed.backgroundImage === 'none' && computed.boxShadow === 'none' && ['top-left', 'top-right', 'bottom-left', 'bottom-right'].every(corner => (Number.parseFloat(computed.getPropertyValue(`border-${corner}-radius`)) || 0) === 0) && Object.values(borders).every(border => ['none', 'hidden', 'solid'].includes(border.style)), background: computed.backgroundColor, borders }, pos: cellPos, from: cellPos + 1, to: cellPos + cell.nodeSize - 1, left: (r.left - root.left) / scale, top: (r.top - root.top) / scale, width: r.width / scale, height: r.height / scale, lines: [] };
      cell.descendants((block, relative) => {
        const blockPos = cellPos + 1 + relative;
        if (block.type.spec.tableRole === 'table' || block.isAtom && !block.isText) { fail('unsupported-table-cell-object', blockPos, blockPos + block.nodeSize); return false; }
        if (!block.isTextblock) return true;
        let line: TableLine | undefined;
        const blockDom = view.nodeDOM(blockPos);
        if (!(blockDom instanceof HTMLElement)) { fail('missing-table-cell-block-dom', blockPos, blockPos + block.nodeSize); return false; }
        const blockRect = blockDom.getBoundingClientRect(), blockTop = (blockRect.top - root.top) / scale, blockLeft = (blockRect.left - root.left) / scale, blockWidth = blockRect.width / scale;
        if (block.content.size === 0) {
          const rect = blockRect, style = getComputedStyle(blockDom);
          const top = (rect.top - root.top) / scale, lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2 || 16;
          lane.lines.push({ from: blockPos + 1, to: blockPos + 1, top, bottom: top + Math.max(rect.height / scale, lineHeight), emptyBlock: blockPos, blockPos, blockTop, blockLeft, blockWidth });
          return false;
        }
        for (let p = blockPos + 1; p < blockPos + block.nodeSize - 1; p++) {
          const inline = view.state.doc.nodeAt(p);
          if (inline?.isAtom && !inline.isText && !['tab', 'hard_break'].includes(inline.type.name)) { fail('unsupported-table-cell-object', p, p + inline.nodeSize); continue; }
          const at = view.coordsAtPos(p), after = view.coordsAtPos(p + 1), previous = p > blockPos + 1 ? view.coordsAtPos(p - 1) : null;
          const distance = (candidate: { top: number; bottom: number } | null) => !candidate ? Infinity : Math.max(candidate.top - at.top, 0, at.top - candidate.bottom);
          const beforeWrap = previous && after.top > previous.bottom && at.top <= after.top;
          const baseline = Math.abs(at.bottom - at.top) < 1 ? (beforeWrap || distance(previous) <= distance(after) ? previous || after : after) : at;
          const top = (baseline.top - root.top) / scale, bottom = (baseline.bottom - root.top) / scale;
          if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom < top) { fail('invalid-table-line-geometry', p, p + 1); continue; }
          if (!line || Math.abs(line.top - top) > 2) { if (line) lane.lines.push(line); line = { from: p, to: p + 1, top, bottom, blockPos, blockTop, blockLeft, blockWidth }; }
          else { line.to = p + 1; line.bottom = Math.max(line.bottom, bottom); }
        }
        if (line) lane.lines.push(line);
        return false;
      });
      group.cells.push(lane);
    });
    const lines = group.cells.flatMap(cell => cell.lines);
    const candidates = [...new Set([...lines.map(line => line.bottom), ...groupRows.slice(0, -1).map(row => row.top + row.height)])].sort((a, b) => a - b);
    group.safeCuts = candidates.filter(cut => cut > top + EPSILON && cut < bottom - EPSILON && lines.every(line => cut <= line.top + EPSILON || cut >= line.bottom - EPSILON));
    if (group.height > regionHeight + EPSILON) {
      let cursor = top;
      while (bottom - cursor > regionHeight + EPSILON) {
        const next = group.safeCuts.filter(cut => cut > cursor + EPSILON && cut <= cursor + regionHeight + EPSILON).at(-1);
        if (next === undefined) { fail('table-group-exceeds-region', group.from, group.to); break; }
        cursor = next;
      }
    }
    result.groups.push(group); start = end;
  }
  if (view.state.doc.nodeAt(pos) !== node) fail('document-changed-during-table-measurement');
  return result;
}

export type TableGroupBand = { top: number; bottom: number; continuation: boolean; headerHeight: number; cells: Array<{ pos: number; lines: TableLine[] }> };
/**
 * Plan synchronized source-space bands. Header height is reserved on each
 * continuation; empty cell lanes remain present. This is not a renderer or
 * proof that borders/repeated headers are faithfully represented.
 */
export function planTableGroupBands(group: TableRowGroup, regionHeight: number, repeatedHeaderHeight = 0): { bands: TableGroupBand[]; complete: boolean; diagnostic?: string } {
  if (!Number.isFinite(regionHeight) || regionHeight <= 0 || !Number.isFinite(repeatedHeaderHeight) || repeatedHeaderHeight < 0 || repeatedHeaderHeight >= regionHeight || !Number.isFinite(group.height) || group.height < 0)
    return { bands: [], complete: false, diagnostic: 'invalid-table-band-geometry' };
  const bands: TableGroupBand[] = [], bottom = group.top + group.height;
  let top = group.top;
  while (top < bottom - EPSILON) {
    const continuation = bands.length > 0, headerHeight = continuation ? repeatedHeaderHeight : 0, limit = top + regionHeight - headerHeight;
    const end = bottom <= limit + EPSILON ? bottom : group.safeCuts.filter(cut => cut > top + EPSILON && cut <= limit + EPSILON).at(-1);
    if (end === undefined) return { bands: [], complete: false, diagnostic: 'table-group-exceeds-region' };
    bands.push({ top, bottom: end, continuation, headerHeight, cells: group.cells.map(cell => ({ pos: cell.pos,
      lines: cell.lines.filter(line => line.bottom > top + EPSILON && line.top < end - EPSILON) })) });
    top = end;
  }
  return { bands, complete: true };
}
