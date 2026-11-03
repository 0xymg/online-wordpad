/** Paragraph constraints for the column solver; this module never mutates a document or units. */
import type { Node as PMNode } from 'prosemirror-model';
import type { FlowUnit } from './column-flow';
import { effectiveParagraph, paragraphFromXml } from './paragraph-format';

export type ParagraphFlowPolicy = {
  block: number; index: number; count: number;
  keepNext: boolean; keepLines: boolean; widowControl: boolean; pageBreakBefore: boolean;
};
export type ParagraphFlowUnit = FlowUnit & { paragraph?: ParagraphFlowPolicy };
export type ParagraphFlowContext = {
  /** Vertical space already occupied in this column, including preceding blocks. */
  y: number;
  /** Height of the current region band, in unzoomed CSS pixels. */
  capacity: number;
  /** True only at the first column and top of an actual physical page. */
  atPageStart: boolean;
  /** Lines from this paragraph segment already placed in the current column. */
  placedLines: number;
  /** Physical page capacity and actual remaining band, independent of balancing probes. */
  fullCapacity?: number;
  availableBand?: number;
  partialBand?: boolean;
};
export type ParagraphFlowDecision = 'place' | 'column' | 'page';
const EPSILON = 0.01;

/** Attach policies to consecutive measured lines. Explicit breaks and tables are barriers. */
export function annotateParagraphConstraints(doc: PMNode, input: readonly FlowUnit[]): ParagraphFlowUnit[] {
  const units: ParagraphFlowUnit[] = input.map(unit => ({ ...unit }));
  const seen = new Set<number>(), remaining = new Map<number, number>();
  for (const unit of units) if (unit.kind === 'line' && unit.sourceBlock !== undefined) remaining.set(unit.sourceBlock, (remaining.get(unit.sourceBlock) || 0) + 1);
  for (let start = 0; start < units.length;) {
    const first = units[start], block = first.kind === 'line' ? first.sourceBlock : undefined;
    if (block === undefined) { start++; continue; }
    let end = start + 1;
    while (end < units.length && units[end].kind === 'line' && units[end].sourceBlock === block) end++;
    const node = doc.nodeAt(block);
    if (!node?.isTextblock) { start = end; continue; }
    const format = effectiveParagraph(node), isFirstSegment = !seen.has(block);
    // Imported style projections contain default `keepNext:false` even when
    // no keep setting was specified. Match the existing heading fallback while
    // respecting an explicit paragraph-level managed or native false.
    const direct = paragraphFromXml(node.attrs.docxProperties), managed = node.attrs.paragraphFormat || {};
    const explicitKeepNext = managed.keepNext ?? direct.keepNext;
    const keepNext = explicitKeepNext ?? (node.type.name === 'heading' ? true : format.keepNext === true);
    seen.add(block);
    // An explicit break interrupts a paragraph; keep-next is meaningful only
    // on its final segment, never across that explicit break.
    const linesLeft = (remaining.get(block) || 0) - (end - start); remaining.set(block, linesLeft);
    const hasLaterSegment = linesLeft > 0;
    const policy = { block, count: end - start, keepNext: !hasLaterSegment && keepNext,
      keepLines: (managed.keepLines ?? direct.keepLines ?? format.keepLines) === true,
      widowControl: (managed.widowControl ?? direct.widowControl ?? format.widowControl) !== false,
      pageBreakBefore: isFirstSegment && (managed.pageBreakBefore ?? direct.pageBreakBefore ?? format.pageBreakBefore) === true };
    for (let i = start; i < end; i++) units[i].paragraph = { ...policy, index: i - start };
    start = end;
  }
  return units;
}

/**
 * Decide before placing `index`. `column` means try the next column (or page
 * when the current one is last); `page` ends the entire physical page without
 * consuming the unit. At an empty column an impossible keep/widow constraint is
 * relaxed so an oversized paragraph cannot cause an infinite retry.
 *
 * Keep-next retains a chain of whole keep-next paragraphs plus the first two
 * lines of the following paragraph when that group fits an empty region. A
 * table, hard break, or other non-line unit is an intentional barrier.
 */
export function paragraphFlowDecision(units: readonly ParagraphFlowUnit[], index: number, context: ParagraphFlowContext): ParagraphFlowDecision {
  const unit = units[index], p = unit?.paragraph;
  if (!p || unit.kind !== 'line') return 'place';
  const { y, capacity, atPageStart, placedLines } = context;
  if (p.pageBreakBefore && p.index === 0 && !atPageStart) return 'page';
  const remaining = Math.max(0, capacity - y);
  const end = Math.min(units.length, index + p.count - p.index);
  const needsFullPage = (height: number) => context.partialBand === true && context.fullCapacity !== undefined && context.availableBand !== undefined
    && height > context.availableBand + EPSILON && height <= context.fullCapacity + EPSILON;
  if (p.index === 0) {
    const ownHeight = units.slice(index, end).reduce((total, item) => total + item.height, 0);
    if (p.keepLines && needsFullPage(ownHeight)) return 'page';
    if (p.keepLines && y > EPSILON && ownHeight <= capacity + EPSILON && ownHeight > remaining + EPSILON) return 'column';
    if (p.keepNext) {
      let total = ownHeight, cursor = end, current = p, linked = false;
      while (current.keepNext && cursor < units.length) {
        const next = units[cursor], nextPolicy = next.paragraph;
        if (next.kind !== 'line' || !nextPolicy || nextPolicy.index !== 0 || nextPolicy.pageBreakBefore) break;
        linked = true;
        const whole = nextPolicy.keepNext || nextPolicy.keepLines;
        const take = whole ? nextPolicy.count : Math.min(2, nextPolicy.count);
        for (let i = 0; i < take; i++) total += units[cursor + i].height;
        if (!whole) break;
        cursor += nextPolicy.count; current = nextPolicy;
      }
      if (linked && needsFullPage(total)) return 'page';
      if (linked && y > EPSILON && total <= capacity + EPSILON && total > remaining + EPSILON) return 'column';
    }
  }
  if (p.widowControl && p.count > 1) {
    if (end - index >= 2 && needsFullPage(units[index].height + units[index + 1].height)) return 'page';
    let fit = 0, height = 0;
    for (let i = index; i < end; i++) { height += units[i].height; if (height > remaining + EPSILON) break; fit++; }
    const remainingLines = end - index;
    if (fit < remainingLines) {
      // Avoid a single orphan line at the bottom of a nonempty column.
      if (placedLines === 0 && fit < 2 && y > EPSILON) return 'column';
      // Three remaining lines cannot split 2/1 without a widow; keep them
      // together when they fit in a fresh column.
      if (placedLines === 0 && fit === 2 && remainingLines === 3 && y > EPSILON && units.slice(index, end).reduce((sum, item) => sum + item.height, 0) <= capacity + EPSILON) return 'column';
      // If only one of the final two lines fits, move both to the next column.
      if (remainingLines === 2 && fit === 1 && placedLines >= 2) return 'column';
    }
  }
  return 'place';
}
