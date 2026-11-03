/** Read-only natural-line measurement for the column solver. */
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import type { DocumentSection } from './document-sections';
import type { FlowDiagnostic, FlowSection, FlowUnit } from './column-flow';
import { measureColumnTable, type ColumnTableMeasurement, type TableGroupBand } from './column-flow-tables';
import { annotateParagraphConstraints } from './column-paragraph-flow';

type Line = { from: number; to: number; top: number; bottom: number; keyTop: number };
export type NaturalBlock = { pos: number; from: number; to: number; top: number; left: number; width: number; height: number; paddingLeft: number; paddingRight: number; marginBottom: number; borderBottom: string; borderBottomWidth: number; textblock: boolean; noteSeparator?: { height: number; top: number; left: number; width: number; color: string } };
export type ColumnMeasurement = { sections: FlowSection[]; blocks: NaturalBlock[]; tables: ColumnTableMeasurement[]; complete: boolean; diagnostics: FlowDiagnostic[] };
/**
 * The caller must present an unfragmented, column-width view with settled tabs.
 * This routine only reads that view; it does not dispatch or modify the model.
 */
export function measureNaturalColumnSections(view: EditorView, sections: readonly DocumentSection[]): ColumnMeasurement {
  const doc = view.state.doc, root = view.dom.getBoundingClientRect();
  const width = Number.parseFloat(getComputedStyle(view.dom).width), scale = root.width / width;
  const diagnostics: FlowDiagnostic[] = [], measured: FlowSection[] = sections.map(section => ({
    id: section.id, geometry: section.geometry, start: section.geometry.startType === 'continuous' ? 'continuous' : 'nextPage',
    columns: section.columns, flowDirection: section.flowDirection, units: [],
  }));
  if (!Number.isFinite(scale) || scale <= 0) return { sections: measured, blocks: [], tables: [], complete: false, diagnostics: [{ code: 'invalid-measurement-scale', sectionId: sections[0]?.id || '' }] };
  const blocks: NaturalBlock[] = [];
  const tables: ColumnTableMeasurement[] = [];
  const mutable = measured.map(section => section.units as FlowUnit[]);
  const sectionAt = (pos: number) => Math.max(0, sections.findIndex(section => pos >= section.from && pos < section.to));
  const fail = (index: number, code: string, pos: number, size: number) => diagnostics.push({ sectionId: sections[index].id, code, from: pos, to: pos + size });
  const collectTextblock = (node: PMNode, pos: number, index: number) => {
    const element = view.nodeDOM(pos); if (!(element instanceof HTMLElement)) { fail(index, 'missing-measurement-dom', pos, node.nodeSize); return; }
    const style = getComputedStyle(element), lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2 || 16;
    const elementRect = element.getBoundingClientRect(), sourceLeft = (elementRect.left - root.left) / scale, sourceWidth = elementRect.width / scale;
    const sourceMarginLeft = Number.parseFloat(style.marginLeft) || 0, sourceMarginRight = Number.parseFloat(style.marginRight) || 0;
    if (node.attrs.toc?.markerOnly && node.attrs.toc.status !== 'unsupported' && !node.content.size) {
      mutable[index].push({ from: pos + 1, to: pos + 1, height: 0, kind: 'line', sourceTop: (elementRect.top - root.top) / scale, sourceBlock: pos, sourceLeft, sourceWidth, sourceMarginLeft, sourceMarginRight });
      return;
    }
    const marginTop = Math.max(0, Number.parseFloat(style.marginTop) || 0), marginBottom = Math.max(0, Number.parseFloat(style.marginBottom) || 0);
    const separator = element.querySelector<HTMLElement>(':scope > .pm-endnote-separator');
    const separatorHeight = separator ? separator.getBoundingClientRect().height / scale : 0;
    const topInset = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.borderTopWidth) || 0) + separatorHeight;
    const bottomInset = (Number.parseFloat(style.paddingBottom) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0);
    const lines: Line[] = [], breaks: Array<{ at: number; unit: FlowUnit }> = [], floats: Array<{ pos: number; top: number; bottom: number; wrap: string }> = [];
    let line: Line | undefined;
    const finish = () => { if (line && line.to > line.from) lines.push(line); line = undefined; };
    for (let p = pos + 1; p < pos + node.nodeSize - 1; p++) {
      const inline = doc.nodeAt(p);
      if (inline?.type.name === 'column_break') { finish(); breaks.push({ at: p, unit: { from: p, to: p + inline.nodeSize, height: 0, kind: 'column_break' } }); continue; }
      const anchoredObject = inline?.type.name === 'text_box' || inline?.type.name === 'image' && inline.attrs.position === 'page';
      const inlineImage = inline?.type.name === 'image' && inline.attrs.position !== 'page' && inline.attrs.wrap === 'inline';
      const blockImage = inline?.type.name === 'image' && inline.attrs.position !== 'page' && inline.attrs.wrap === 'topBottom';
      const floatingImage = inline?.type.name === 'image' && inline.attrs.position !== 'page' && ['wrapLeft', 'wrapRight'].includes(inline.attrs.wrap);
      if (inline?.isAtom && !inline.isText && !anchoredObject && !inlineImage && !blockImage && !floatingImage && !['tab', 'hard_break', 'reference_field', 'citation_field', 'note_reference', 'bookmark_start', 'bookmark_end'].includes(inline.type.name)) { fail(index, 'unsupported-inline-object', p, inline.nodeSize); return; }
      if (blockImage) {
        const image = view.nodeDOM(p); if (!(image instanceof HTMLElement)) { fail(index, 'missing-image-dom', p, 1); return; }
        const box = image.getBoundingClientRect(), imageStyle = getComputedStyle(image);
        if (!box.width || !box.height) { fail(index, 'unmeasurable-inline-image', p, 1); return; }
        const before = Math.max(0, Number.parseFloat(imageStyle.marginTop) || 0), after = Math.max(0, Number.parseFloat(imageStyle.marginBottom) || 0);
        finish(); lines.push({ from: p, to: p + 1, top: (box.top - root.top) / scale - before, bottom: (box.bottom - root.top) / scale + after, keyTop: (box.top - root.top) / scale });
        continue;
      }
      const a = view.coordsAtPos(p), b = view.coordsAtPos(p + 1), previous = p > pos + 1 ? view.coordsAtPos(p - 1) : null;
      const distance = (rect: { top: number; bottom: number } | null) => !rect ? Infinity : Math.max(rect.top - a.top, 0, a.top - rect.bottom);
      const beforeWrap = previous && b.top > previous.bottom && a.top <= b.top;
      const rect = Math.abs(a.bottom - a.top) < 1 ? (beforeWrap || distance(previous) <= distance(b) ? previous || b : b) : a;
      let key = rect, visualTop = rect.top, visualBottom = rect.bottom;
      if (inlineImage || floatingImage) {
        const image = view.nodeDOM(p); if (!(image instanceof HTMLElement)) { fail(index, 'missing-image-dom', p, 1); return; }
        const box = image.getBoundingClientRect();
        if (!box.width || !box.height) { fail(index, 'unmeasurable-inline-image', p, 1); return; }
        const overlaps = (candidate: {top:number;bottom:number} | null) => !!candidate && candidate.top < box.bottom && candidate.bottom > box.top;
        key = overlaps(b) ? b : overlaps(previous) ? previous! : box;
        if (floatingImage) {
          const gap = Math.max(0, Number.parseFloat(getComputedStyle(image).marginBottom) || 0);
          floats.push({ pos: p, top: (box.top - root.top) / scale, bottom: (box.bottom - root.top) / scale + gap, wrap: String(inline?.attrs.wrap) });
          visualTop = key.top; visualBottom = key.bottom;
        } else { visualTop = Math.min(key.top, box.top); visualBottom = Math.max(key.bottom, box.bottom); }
      }
      const top = (visualTop - root.top) / scale, bottom = (visualBottom - root.top) / scale, keyTop = (key.top - root.top) / scale;
      if (!line || Math.abs(keyTop - line.keyTop) > 2) { finish(); line = { from: p, to: p + 1, top, bottom, keyTop }; }
      else { line.to = p + 1; line.top = Math.min(line.top, top); line.bottom = Math.max(line.bottom, bottom); }
    }
    finish();
    for (let a = 0; a < floats.length; a++) for (let b = a + 1; b < floats.length; b++) {
      if (floats[a].top < floats[b].bottom && floats[b].top < floats[a].bottom) {
        const code = floats[a].wrap === floats[b].wrap ? 'overlapping-floats-unsupported' : 'opposing-overlapping-floats-unsupported';
        fail(index, code, floats[a].pos, floats[b].pos - floats[a].pos + 1); return;
      }
    }
    if (!lines.length && !breaks.length) { mutable[index].push({ from: pos + 1, to: pos + 1, height: lineHeight + marginTop + marginBottom + topInset + bottomInset, kind: 'line', sourceTop: (elementRect.top - root.top) / scale, sourceBlock: pos, sourceLeft, sourceWidth, sourceMarginLeft, sourceMarginRight, offsetY: marginTop + topInset, leadingMargin: marginTop, trailingMargin: marginBottom }); return; }
    let units: FlowUnit[] = lines.map((item, i) => ({ from: item.from, to: item.to, kind: 'line', sourceTop: item.keyTop, sourceBlock: pos, sourceLeft, sourceWidth, sourceMarginLeft, sourceMarginRight, offsetY: item.keyTop - item.top, height: Math.max(item.bottom - item.top, i + 1 < lines.length && lines[i + 1].top > item.top ? lines[i + 1].top - item.top : lineHeight) }));
    if (units.length) { units[0].height += marginTop + topInset; units[0].leadingMargin = marginTop; units[0].offsetY = (units[0].offsetY || 0) + marginTop + topInset; units[units.length - 1].height += marginBottom + bottomInset; units[units.length - 1].trailingMargin = marginBottom; }
    if (floats.length) {
      const grouped: FlowUnit[] = [];
      for (let start = 0; start < lines.length;) {
        const firstFloat = floats.find(item => item.pos >= lines[start].from && item.pos < lines[start].to);
        if (!firstFloat) { grouped.push(units[start++]); continue; }
        let end = start, bottom = Math.max(...floats.filter(item => item.pos >= lines[start].from && item.pos < lines[start].to).map(item => item.bottom));
        while (end + 1 < lines.length && lines[end + 1].keyTop < bottom - 0.01) {
          end++;
          for (const item of floats) if (item.pos >= lines[end].from && item.pos < lines[end].to) bottom = Math.max(bottom, item.bottom);
        }
        if (breaks.some(item => item.at > lines[start].from && item.at < lines[end].to)) { fail(index, 'float-crosses-explicit-break', firstFloat.pos, 1); return; }
        const group = units.slice(start, end + 1), base = lines[start].top, lead = start === 0 ? marginTop + topInset : 0;
        const height = Math.max(group.reduce((sum, item) => sum + item.height, 0), bottom - base + lead);
        const subLines = group.map((item, offset) => ({ from: item.from, to: item.to, sourceTop: item.sourceTop!, offsetY: item.sourceTop! - base + lead,
          height: offset === group.length - 1 ? height - (item.sourceTop! - base + lead) : Math.max(0, item.height - (item.offsetY || 0)) }));
        grouped.push({ from: group[0].from, to: group[group.length - 1].to, height, kind: 'line', sourceBlock: pos, sourceLeft, sourceWidth, sourceMarginLeft, sourceMarginRight, leadingMargin: group[0].leadingMargin, trailingMargin: group.at(-1)?.trailingMargin, subLines });
        start = end + 1;
      }
      units = grouped;
    }
    units.push(...breaks.map(item => item.unit)); units.sort((a, b) => a.from - b.from || (a.kind === 'column_break' ? -1 : 1));
    mutable[index].push(...units);
  };
  const visit = (node: PMNode, pos: number): boolean => {
    const index = sectionAt(pos);
    if (node.type.name === 'page_break') { mutable[index].push({ from: pos, to: pos + node.nodeSize, height: 0, kind: 'page_break' }); return false; }
    if (node.type.spec.tableRole === 'table') {
      if (doc.resolve(pos).depth !== 0) { fail(index, 'nested-table-unsupported', pos, node.nodeSize); return false; }
      const section = sections[index], columns = section.columns, g = section.geometry;
      if (columns.kind !== 'equal') { fail(index, 'unsupported-columns', pos, node.nodeSize); return false; }
      const columnWidth = (g.width - g.margins.left - g.margins.right - (columns.count - 1) * columns.space) / (15 * columns.count);
      const regionHeight = (g.height - g.margins.top - g.margins.bottom) / 15;
      const table = measureColumnTable(view, node, pos, { root, scale, columnWidth, regionHeight });
      tables.push(table);
      if (!table.complete) { for (const diagnostic of table.diagnostics) diagnostics.push({ sectionId: section.id, ...diagnostic }); return false; }
      const tableUnits: FlowUnit[] = [];
      const wrapper = view.nodeDOM(pos), tableStyle = wrapper instanceof HTMLElement ? getComputedStyle(wrapper) : null;
      const before = Math.max(0, Number.parseFloat(tableStyle?.marginTop || '') || 0), after = Math.max(0, Number.parseFloat(tableStyle?.marginBottom || '') || 0);
      for (const [groupIndex, group] of table.groups.entries()) {
        const headerGroup = group.rows.some(row => row.header);
        if (headerGroup && group.height > regionHeight + 0.5) { fail(index, 'table-header-group-split-unsupported', group.from, group.to - group.from); return false; }
        // Fine safe-cut bands let the solver use the actual remaining space.
        // Adjacent placements are rejoined before drawing borders.
        const cuts = headerGroup ? [group.top, group.top + group.height] : [group.top, ...group.safeCuts, group.top + group.height];
        const bands: TableGroupBand[] = [];
        for (let cut = 0; cut + 1 < cuts.length; cut++) {
          const top = cuts[cut], bottom = cuts[cut + 1]; if (bottom - top <= 0.01) continue;
          const maximum = headerGroup ? regionHeight : regionHeight - table.table.headerHeight - before;
          if (bottom - top > maximum + 0.5) { fail(index, 'table-group-exceeds-region', group.from, group.to - group.from); return false; }
          bands.push({ top, bottom, continuation: bands.length > 0, headerHeight: 0,
            cells: group.cells.map(cell => ({ pos: cell.pos, lines: cell.lines.filter(line => line.bottom > top + 0.5 && line.top < bottom - 0.5) })) });
        }
        for (const band of bands) tableUnits.push({ from: group.from, to: group.to, height: band.bottom - band.top, kind: 'table',
          sourceTop: band.top, sourceBlock: pos, table: { tablePos: pos, groupIndex, band, headerHeight: table.table.headerHeight, headerGroup } });
      }
      if (tableUnits.length) {
        const represented = tableUnits.reduce((sum, unit) => sum + unit.height, 0);
        tableUnits[0].height += before; tableUnits[0].offsetY = before;
        tableUnits[tableUnits.length - 1].height += after + Math.max(0, table.table.height - represented);
      }
      mutable[index].push(...tableUnits);
      return false;
    }
    if (node.isBlock && !node.isAtom) {
      const element = view.nodeDOM(pos);
      if (!(element instanceof HTMLElement)) { fail(index, 'missing-measurement-dom', pos, node.nodeSize); return false; }
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      const separator = node.isTextblock ? element.querySelector<HTMLElement>(':scope > .pm-endnote-separator') : null;
      const rule = separator?.querySelector<HTMLElement>('.pm-endnote-separator-rule');
      const separatorBox = separator?.getBoundingClientRect(), ruleBox = rule?.getBoundingClientRect();
      blocks.push({ pos, from: pos + 1, to: pos + node.nodeSize - 1, top: (rect.top - root.top) / scale, left: (rect.left - root.left) / scale,
        width: rect.width / scale, height: rect.height / scale, paddingLeft: Number.parseFloat(style.paddingLeft) || 0, paddingRight: Number.parseFloat(style.paddingRight) || 0, marginBottom: Number.parseFloat(style.marginBottom) || 0,
        borderBottom: style.borderBottom, borderBottomWidth: Number.parseFloat(style.borderBottomWidth) || 0, textblock: node.isTextblock,
        ...(separatorBox && ruleBox && rule ? { noteSeparator: { height: separatorBox.height / scale, top: (ruleBox.top - separatorBox.top) / scale, left: (ruleBox.left - separatorBox.left) / scale, width: ruleBox.width / scale, color: separator!.style.color } } : {}) });
    }
    if (node.isTextblock) { collectTextblock(node, pos, index); return false; }
    if (node.isAtom) { fail(index, 'unsupported-structural-object', pos, node.nodeSize); return false; }
    return true;
  };
  try { doc.descendants(visit); } catch { diagnostics.push({ code: 'measurement-failed', sectionId: sections[0]?.id || '' }); }
  if (view.state.doc !== doc) diagnostics.push({ code: 'document-changed-during-measurement', sectionId: sections[0]?.id || '' });
  for (let index = 0; index < measured.length; index++) measured[index].units = annotateParagraphConstraints(doc, mutable[index]);
  return { sections: measured, blocks, tables, complete: diagnostics.length === 0, diagnostics };
}
