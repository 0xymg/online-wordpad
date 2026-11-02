// Word-like visual pagination: measures the rendered top-level blocks and
// inserts widget decorations (spacers) that push content past each A4 page
// boundary, drawing a gap band between the "pages". The document itself is
// untouched — spacers are decorations only, so save/export see the plain
// flow (print hides them via pageStyle and uses real CSS page breaks).
import { effectiveParagraph } from "@/lib/paragraph-format";
import { numberLabel } from "@/lib/page-number";
import { rawSections, runningSlot, runningFragment, type RunningSlots, type RunningVariant } from "@/lib/running-content";
import { documentSections, sameGeometry, sectionBlockStyle, type PageGeometry } from "@/lib/document-sections";
import type { DocumentLayout } from "@/lib/document-layout";
import { Plugin, PluginKey } from "prosemirror-state";
import { TableMap } from "prosemirror-tables";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";

/** Where the page number sits, or "off" for none. */
export type PageNumberPosition = "off" | "bottom" | "top";
/** "3" versus "3 / 7". */
export type PageNumberFormat = "plain" | "of";

export interface PageLayoutConfig {
  /** Full page height in CSS px (A4 portrait: 1123). */
  pageHeightPx: number;
  /** Page margin in CSS px (padding of .pm-page). */
  marginPx: number;
  bottomMarginPx?: number;
  pageNumbers: PageNumberPosition;
  pageNumberFormat: PageNumberFormat;
  numberingStyle?: DocumentLayout["numberingStyle"];
}


/** A number filling one page-margin band; the CSS pins it to the outer edge. */
function numberDom(text: string, heightPx: number, place: "top" | "bottom"): HTMLElement {
  const el = document.createElement("div");
  el.className = `pm-page-number pm-page-number-${place}`;
  el.textContent = text;
  el.style.height = `${heightPx}px`;
  return el;
}

interface PageBreakPoint {
  /** Doc position of the top-level block pushed to the next page. */
  pos: number;
  /** Empty space left on the page being closed, in px. */
  fillPx: number;
  leftOffset?: number;
  rightOffset?: number;
  closingMargin?: number;
  openingMargin?: number;
  companions?: PageBreakPoint[];
  cellContentWidth?: number;
  cellHeader?: { html: string; height: number; width: number; left: number; primary: boolean };
  table?: { columns: number; headerHtml: string; headerHeight: number };
}

interface RenderedRow { pos: number; height: number; sourceHeight: string }
interface RenderedPage { top: number; geometry: PageGeometry; section: number; sectionPage: number }
interface PaginationState {
  breaks: PageBreakPoint[];
  pages?: RenderedPage[];
  tallCells?: number[];
  rowHeights?: RenderedRow[];
  marginPx: number;
  bottomMarginPx?: number;
  /** "<position>:<format>" — the numbering settings the decorations were built from. */
  numbering: string;
  deco: DecorationSet;
}

/** Total pages implied by a set of break points. */
export const pageCountOf = (breaks: PageBreakPoint[]) => breaks.length + 1;

/** Height of the gray band drawn between two pages. */
const PAGE_GAP_PX = 26;

export const paginationKey = new PluginKey<PaginationState>("pagination");

function spacerDom(
  fillPx: number, marginPx: number, bottomMarginPx: number,
  numbers: { position: PageNumberPosition; closing: string; opening: string; alignment?: string }
): HTMLElement {
  const el = document.createElement("div");
  el.className = "pm-page-spacer";
  el.contentEditable = "false";
  // Rest of the closed page (stays page-colored).
  const fill = document.createElement("div");
  fill.style.height = `${Math.max(0, fillPx)}px`;
  // …and its bottom margin, kept as its own band so a page number can sit in it.
  const bottomMargin = numbers.position === "bottom"
    ? numberDom(numbers.closing, bottomMarginPx, "bottom")
    : (() => { const d = document.createElement("div"); d.style.height = `${bottomMarginPx}px`; return d; })();
  // The gap between pages. It bleeds past the page's own edges so the single
  // box-shadow around .pm-page doesn't run through the gap; the inner element
  // redraws that shadow as a bottom edge for the closing page and a top edge
  // for the opening one.
  const gap = document.createElement("div");
  gap.className = "pm-page-spacer-gap";
  gap.style.height = `${PAGE_GAP_PX}px`;
  gap.style.marginLeft = "calc(-1 * (var(--page-margin-left, var(--page-margin)) + var(--page-bleed)))";
  gap.style.marginRight = "calc(-1 * (var(--page-margin-right, var(--page-margin)) + var(--page-bleed)))";
  const edge = document.createElement("div");
  edge.className = "pm-page-spacer-edge";
  gap.appendChild(edge);
  // Top margin of the page being opened.
  const top = numbers.position === "top"
    ? numberDom(numbers.opening, marginPx, "top")
    : (() => { const d = document.createElement("div"); d.style.height = `${marginPx}px`; return d; })();
  for (const margin of [bottomMargin, top]) margin.style.justifyContent = numbers.alignment === "center" ? "center" : numbers.alignment === "left" ? "flex-start" : "flex-end";
  el.append(fill, bottomMargin, gap, top);
  return el;
}



/**
 * Inside a textblock rendered as `blockPos`'s node, find the start of the
 * first line whose bottom crosses `boundary` (all values in natural/layout
 * px, relative to the measurement base). Returns the doc position where an
 * inline spacer should be inserted, plus that line's top. Line tops are
 * monotonic in doc positions within a textblock, so binary search works.
 */
function findLineSplit(
  view: EditorView,
  blockPos: number,
  node: PMNode,
  boundary: number,
  scale: number,
  baseTop: number
): { pos: number; lineTop: number } | null {
  const from = blockPos + 1;
  const to = blockPos + node.nodeSize - 1;
  if (to <= from) return null;
  try {
    const lineBottom = (pos: number) => view.coordsAtPos(pos).bottom / scale - baseTop;
    const lineTop = (pos: number) => view.coordsAtPos(pos).top / scale - baseTop;
    if (lineBottom(to) <= boundary + MEASURE_EPS) return null;
    // Smallest position whose line crosses the boundary…
    let lo = from, hi = to;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (lineBottom(mid) > boundary + MEASURE_EPS) hi = mid;
      else lo = mid + 1;
    }
    // …snapped back to the start of that line.
    const crossTop = lineTop(lo);
    let lo2 = from, hi2 = lo;
    while (lo2 < hi2) {
      const mid = Math.floor((lo2 + hi2) / 2);
      if (lineTop(mid) >= crossTop - MEASURE_EPS) hi2 = mid;
      else lo2 = mid + 1;
    }
    return { pos: lo2, lineTop: lineTop(lo2) };
  } catch {
    // coordsAtPos can throw on odd positions (atoms at edges) — fall back to
    // pushing the whole block.
    return null;
  }
}

/** Tolerance for subpixel/rounding noise in measurements. */
const MEASURE_EPS = 2;

/**
 * Simulate the natural (spacer-free) vertical flow of the top-level blocks
 * and decide before which blocks a page break belongs. Existing spacers are
 * hidden (display:none) for the duration of the measurement so the flow —
 * including the margin-collapse a spacer would otherwise interrupt — is
 * measured exactly as it would render without them; the class toggle happens
 * within a single frame, so nothing flickers. Rects are scaled back to layout
 * px so CSS `zoom` on the page doesn't skew the numbers. Also returns how
 * much of the last page is used, so the editor can be padded to a full page.
 */
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const paragraphRules = new Map<string, { before: boolean; after: boolean; keep: boolean; together: boolean }>();
function rules(node: PMNode) {
  const raw = String(node.attrs.docxProperties || ""), managed = effectiveParagraph(node);
  const key = raw + JSON.stringify(managed) + node.type.name;
  const cached = paragraphRules.get(key);
  if (cached) return cached;
  const xml = new DOMParser().parseFromString(raw || `<p/>`, "application/xml");
  const el = (name: string) => xml.getElementsByTagNameNS(WORD_NS, name)[0];
  const on = (name: string) => { const e = el(name); return !!e && !["0", "false", "off"].includes(e.getAttributeNS(WORD_NS, "val") || ""); };
  const result = { before: managed.pageBreakBefore ?? on("pageBreakBefore"), after: !!el("sectPr") && el("type")?.getAttributeNS(WORD_NS, "val") !== "continuous", keep: managed.keepNext ?? (on("keepNext") || node.type.name === "heading"), together: managed.keepLines ?? on("keepLines") };
  // Keep memory bounded when many imported documents have distinct properties.
  if (paragraphRules.size > 1000) paragraphRules.clear();
  paragraphRules.set(key, result);
  return result;
}
interface FlowUnit {
  node: PMNode; pos: number; dom: HTMLElement; endDom?: HTMLElement;
  table?: { columns: number; headerHtml: string; headerHeight: number };
  section: number;
  rows?: Array<RenderedRow & { top: number; bottom: number }>;
  cells?: Array<{ pos: number; node: PMNode; dom: HTMLElement; blocks: Array<{ node: PMNode; pos: number; dom: HTMLElement }> }>;
}
function computeLayout(view: EditorView, cfg: PageLayoutConfig): { breaks: PageBreakPoint[]; pages?: RenderedPage[]; tallCells?: number[]; rowHeights?: RenderedRow[]; lastPagePadPx: number; complete: boolean } {
  const dom = view.dom as HTMLElement;
  const sections = documentSections(view.state.doc);
  const mixed = sections.length > 1;
  let currentSection = 0;
  let geometry = sections[0].geometry;
  let pageContentH = (geometry.height - geometry.margins.top - geometry.margins.bottom) / 15;
  const pages: RenderedPage[] = [{ top: 0, geometry, section: 0, sectionPage: 0 }];
  if (pageContentH <= 60 || !dom.offsetWidth) return { breaks: [], lastPagePadPx: 0, complete: false };
  const scroller = dom.closest(".editor-shell") as HTMLElement | null;
  const scrollTop = scroller?.scrollTop ?? 0;
  const root = dom.getBoundingClientRect(), scale = root.width / Number.parseFloat(getComputedStyle(dom).width);
  const headerHeights = new Map<Element, number>();
  for (const header of Array.from(dom.querySelectorAll(".pm-repeated-header"))) {
    const table = header.parentElement?.closest("table");
    if (table) headerHeights.set(table, header.getBoundingClientRect().height / scale);
  }
  dom.classList.add("pm-measuring");
  try {
    if (!scale || !Number.isFinite(scale)) return { breaks: [], lastPagePadPx: 0, complete: false };
    const baseTop = root.top / scale;
    const units: FlowUnit[] = [];
    const tallCells: number[] = [];
    const rowHeights = new Map<number, RenderedRow>();
    let complete = true;
    const collect = (node: PMNode, pos: number, section: number) => {
      const element = view.nodeDOM(pos);
      if (!(element instanceof HTMLElement)) { complete = false; return; }
      if (node.type.name === "table") {
        const map = TableMap.get(node);
        const rows: { node: PMNode; pos: number; dom: HTMLElement }[] = [];
        node.forEach((row, offset) => {
          const rowPos = pos + 1 + offset, rowDom = view.nodeDOM(rowPos);
          if (rowDom instanceof HTMLElement) rows.push({ node: row, pos: rowPos, dom: rowDom });
          else complete = false;
        });
        if (rows.length !== map.height) { complete = false; return; }
        const headerRows: HTMLElement[] = [];
        for (const row of rows) {
          const xml = new DOMParser().parseFromString(row.node.attrs.docxProperties || "<tr/>", "application/xml");
          const repeat = xml.getElementsByTagNameNS(WORD_NS, "tblHeader")[0];
          if (!repeat || ["0", "false", "off"].includes(repeat.getAttributeNS(WORD_NS, "val") || "")) break;
          const clone = row.dom.cloneNode(true) as HTMLElement;
          clone.querySelectorAll(".pm-page-spacer").forEach(e => e.remove());
          clone.querySelectorAll(".selectedCell").forEach(e => e.classList.remove("selectedCell"));
          clone.querySelectorAll(".column-resize-handle").forEach(e => e.remove());
          clone.querySelectorAll("[id]").forEach(e => e.removeAttribute("id"));
          headerRows.push(clone);
        }
        const naturalHeaderHeight = rows.slice(0, headerRows.length).reduce((sum, row) => sum + row.dom.getBoundingClientRect().height / scale, 0);
        const tableDom = rows[0]?.dom.closest("table");
        const headerHeight = naturalHeaderHeight && tableDom ? headerHeights.get(tableDom) || naturalHeaderHeight : 0;
        const colgroup = tableDom?.querySelector("colgroup")?.outerHTML || "";
        // Keep small rowspan groups together; large groups receive synchronized cell fragments.
        for (let r = 0; r < rows.length;) {
          let end = r + 1;
          for (let row = r; row < end; row++) for (let c = 0; c < map.width; c++) end = Math.max(end, map.findCell(map.map[row * map.width + c]).bottom);
          const cells: NonNullable<FlowUnit["cells"]> = [];
          const available = (sections[section].geometry.height - sections[section].geometry.margins.top - sections[section].geometry.margins.bottom) / 15;
          if ((rows[end - 1].dom.getBoundingClientRect().bottom - rows[r].dom.getBoundingClientRect().top) / scale > available) {
            for (let rowIndex = r; rowIndex < end; rowIndex++) rows[rowIndex].node.forEach((cell, offset) => {
              const cellPos = rows[rowIndex].pos + 1 + offset, cellDom = view.nodeDOM(cellPos);
              if (!(cellDom instanceof HTMLElement)) return;
              const blocks: NonNullable<FlowUnit["cells"]>[number]["blocks"] = [];
              cell.descendants((block, relative) => {
                if (!block.isTextblock) return;
                const blockPos = cellPos + 1 + relative, blockDom = view.nodeDOM(blockPos);
                if (blockDom instanceof HTMLElement) blocks.push({ node: block, pos: blockPos, dom: blockDom });
                return false;
              });
              if (blocks.length) { cells.push({ pos: cellPos, node: cell, dom: cellDom, blocks }); tallCells.push(cellPos); }
            });
          }
          const groupRows = cells.length ? rows.slice(r, end).map(row => {
            const css = document.createElement("div"); css.style.cssText = row.node.attrs.layoutStyle || "";
            const rect = row.dom.getBoundingClientRect();
            const result = { pos: row.pos, height: rect.height / scale, sourceHeight: css.style.height || "auto", top: rect.top / scale - baseTop, bottom: rect.bottom / scale - baseTop };
            rowHeights.set(row.pos, result); return result;
          }) : undefined;
          units.push({ ...rows[r], section, rows: groupRows, cells: cells.length ? cells : undefined, endDom: rows[end - 1].dom, table: { columns: map.width, headerHtml: r >= headerRows.length && headerHeight < pageContentH / 2 ? `${colgroup}<tbody>${headerRows.map(e => e.outerHTML).join("")}</tbody>` : "", headerHeight: r >= headerRows.length && headerHeight < pageContentH / 2 ? headerHeight : 0 } });
          r = end;
        }
      } else if (node.isTextblock || node.isLeaf) units.push({ node, pos, dom: element, section });
      else node.forEach((child, offset) => collect(child, pos + 1 + offset, section));
    };
    view.state.doc.forEach((node, pos) => collect(node, pos, Math.max(0, sections.findIndex(s => pos >= s.from && pos < s.to))));
    if (!complete) return { breaks: [], lastPagePadPx: 0, complete: false };
    const breaks: PageBreakPoint[] = [];
    let pageStart = 0, contentBottom = 0, repeatedHeight = 0, forced = false;
    const topOf = (el: HTMLElement) => el.getBoundingClientRect().top / scale - baseTop;
    const bottomOf = (el: HTMLElement) => el.getBoundingClientRect().bottom / scale - baseTop;
    function addBreak(unit: FlowUnit, top: number, pos = unit.pos, inline = false, nextSection = currentSection) {
      if (breaks.at(-1)?.pos === pos) return;
      const rect = unit.dom.getBoundingClientRect();
      let border = 0;
      if (unit.table && !inline) {
        let previous = unit.dom.previousElementSibling;
        while (previous?.classList.contains("pm-page-spacer")) previous = previous.previousElementSibling;
        const maxBorder = (row: Element | null, side: "borderTopWidth" | "borderBottomWidth") => Math.max(0, ...Array.from(row?.children || []).map(cell => Number.parseFloat(getComputedStyle(cell)[side]) || 0));
        border = (maxBorder(previous, "borderBottomWidth") + maxBorder(unit.dom, "borderTopWidth")) / 2;
      }
      breaks.push({ pos, fillPx: Math.max(0, pageContentH - repeatedHeight - (top - pageStart) - border), leftOffset: mixed ? (rect.left - root.left) / scale : Math.max(0, (rect.left - root.left) / scale), rightOffset: mixed ? (root.right - rect.right) / scale : Math.max(0, (root.right - rect.right) / scale), closingMargin: geometry.margins.bottom / 15, openingMargin: sections[nextSection].geometry.margins.top / 15, table: inline ? undefined : unit.table });
      const previousPage = pages[pages.length - 1];
      const nextGeometry = sections[nextSection].geometry;
      pages.push({ top: previousPage.top + previousPage.geometry.height / 15 + PAGE_GAP_PX, geometry: nextGeometry, section: nextSection, sectionPage: nextSection === currentSection ? previousPage.sectionPage + 1 : 0 });
      currentSection = nextSection; geometry = nextGeometry;
      pageContentH = (geometry.height - geometry.margins.top - geometry.margins.bottom) / 15;
      pageStart = top;
      repeatedHeight = inline ? 0 : unit.table?.headerHeight || 0;
    }
    function splitCells(unit: FlowUnit, boundary: number): boolean {
      if (!unit.cells?.length) return false;
      const active = unit.cells.filter(cell => topOf(cell.dom) < boundary - 32);
      if (!active.length) return false;
      const dominant = active.reduce((a, b) => bottomOf(a.blocks[a.blocks.length - 1].dom) > bottomOf(b.blocks[b.blocks.length - 1].dom) ? a : b);
      const candidates = active.map(cell => {
        const safeBoundary = boundary - 32;
        const block = cell.blocks.find(b => bottomOf(b.dom) > safeBoundary + MEASURE_EPS) || cell.blocks[cell.blocks.length - 1];
        if (topOf(block.dom) >= safeBoundary - MEASURE_EPS) return { cell, block, pos: block.pos, top: topOf(block.dom) };
        const split = findLineSplit(view, block.pos, block.node, safeBoundary, scale, baseTop);
        if (split) return { cell, block, pos: split.pos, top: split.lineTop };
        if (bottomOf(block.dom) > safeBoundary + MEASURE_EPS) return { cell, block, pos: block.pos, top: topOf(block.dom) };
        // A finished short column receives blank continuation bands after its
        // final paragraph, rather than moving its last line to a later page.
        const pos = cell.pos + cell.node.nodeSize - 1;
        return { cell, block, pos, top: bottomOf(block.dom) + (Number.parseFloat(getComputedStyle(block.dom).marginBottom) || 0) };
      });
      const primary = candidates.find(c => c.cell === dominant)!;
      const crossing = candidates.filter(c => c.cell === dominant || topOf(c.cell.dom) < primary.top - MEASURE_EPS && bottomOf(c.cell.dom) > primary.top + MEASURE_EPS);
      if (primary.top <= pageStart + MEASURE_EPS || breaks.at(-1)?.pos === primary.pos) return false;
      const physicalEnd = pages[pages.length - 1].top + geometry.height / 15 - sections[0].geometry.margins.top / 15 - geometry.margins.bottom / 15;
      const offsets = cellOffsets.get(unit.pos) || new Map<number, number>(); cellOffsets.set(unit.pos, offsets);
      addBreak({ ...unit, node: primary.block.node, pos: primary.block.pos, dom: primary.block.dom }, primary.top, primary.pos, true);
      const point = breaks[breaks.length - 1];
      const tableDom = unit.dom.closest("table")!;
      const headerHeight = unit.table?.headerHeight || 0;
      const format = (candidate: typeof primary, main: boolean): PageBreakPoint => {
        const rect = candidate.block.dom.getBoundingClientRect();
        const beforeCell = (groupShifts.get(unit.pos) || []).filter(s => s.cut <= topOf(candidate.cell.dom) + MEASURE_EPS).reduce((sum, s) => sum + s.height, 0);
        const fillPx = Math.max(0, physicalEnd - candidate.top - beforeCell - (offsets.get(candidate.cell.pos) || 0));
        const result: PageBreakPoint = { pos: candidate.pos, fillPx, cellContentWidth: root.width / scale, leftOffset: (rect.left - root.left) / scale, rightOffset: (root.right - rect.right) / scale, closingMargin: point.closingMargin, openingMargin: point.openingMargin,
          cellHeader: headerHeight ? { html: unit.table!.headerHtml, height: headerHeight, width: tableDom.getBoundingClientRect().width / scale, left: (tableDom.getBoundingClientRect().left - rect.left) / scale, primary: main } : undefined };
        offsets.set(candidate.cell.pos, (offsets.get(candidate.cell.pos) || 0) + fillPx + (point.closingMargin ?? cfg.bottomMarginPx ?? cfg.marginPx) + PAGE_GAP_PX + (point.openingMargin ?? cfg.marginPx) + headerHeight);
        return result;
      };
      Object.assign(point, format(primary, true));
      point.companions = crossing.filter(c => c !== primary).map(c => format(c, false));
      const extra = point.fillPx + (point.closingMargin ?? cfg.bottomMarginPx ?? cfg.marginPx) + PAGE_GAP_PX + (point.openingMargin ?? cfg.marginPx) + headerHeight;
      const shifts = groupShifts.get(unit.pos) || []; shifts.push({ cut: primary.top, height: extra }); groupShifts.set(unit.pos, shifts);
      const row = unit.rows?.find(r => primary.top >= r.top - MEASURE_EPS && primary.top < r.bottom - MEASURE_EPS) || unit.rows?.[0];
      if (row) { const rendered = rowHeights.get(row.pos)!; rowHeights.set(row.pos, { ...rendered, height: rendered.height + extra }); }
      repeatedHeight = headerHeight;
      return true;
    }
    const groupShifts = new Map<number, Array<{ cut: number; height: number }>>();
    const cellOffsets = new Map<number, Map<number, number>>();
    for (let i = 0; i < units.length; i++) {
      const unit = units[i], top = topOf(unit.dom), bottom = bottomOf(unit.endDom || unit.dom), policy = rules(unit.node);
      contentBottom = Math.max(contentBottom, bottom);
      const nextGeometry = sections[unit.section].geometry;
      if (mixed && unit.section !== currentSection) {
        const needsPage = nextGeometry.startType !== "continuous" || !sameGeometry(geometry, nextGeometry);
        if (needsPage) addBreak(unit, top, unit.pos, false, unit.section);
        else { currentSection = unit.section; geometry = nextGeometry; }
        forced = false;
      }
      if (forced || policy.before && top > pageStart + MEASURE_EPS) addBreak(unit, top);
      forced = false;
      const next = units[i + 1];
      if (policy.keep && next && top > pageStart + MEASURE_EPS) {
        const nextBottom = Math.min(bottomOf(next.endDom || next.dom), topOf(next.dom) + Math.max(24, Number.parseFloat(getComputedStyle(next.dom).lineHeight) * 2 || 32));
        if (nextBottom - pageStart + repeatedHeight > pageContentH && nextBottom - top < pageContentH) addBreak(unit, top);
      }
      let guard = 0;
      while (bottom - pageStart + repeatedHeight > pageContentH + MEASURE_EPS && guard++ < 1000) {
        const boundary = pageStart + pageContentH - repeatedHeight;
        if (unit.cells && splitCells(unit, boundary)) continue;
        let split = unit.node.isTextblock && (!policy.together || bottom-top > pageContentH) ? findLineSplit(view, unit.pos, unit.node, boundary, scale, baseTop) : null;
        // Prefer two lines on each side of a paragraph boundary.
        const line = Number.parseFloat(getComputedStyle(unit.dom).lineHeight) || 20;
        if (effectiveParagraph(unit.node).widowControl !== false && split) {
          if (bottom-split.lineTop < line*1.5) split = findLineSplit(view,unit.pos,unit.node,boundary-line,scale,baseTop) || split;
          if (split.lineTop-top < line*1.5 && top > pageStart+MEASURE_EPS) split=null;
        }
        if (split && split.lineTop > top + MEASURE_EPS && split.lineTop > pageStart + MEASURE_EPS) addBreak(unit, split.lineTop, split.pos, true);
        else if (top > pageStart + MEASURE_EPS) addBreak(unit, top);
        else break; // An indivisible row/image taller than a sheet cannot fit.
      }
      if (unit.node.type.name === "page_break" || !mixed && policy.after) forced = true;
    }
    // Include trailing block margins; otherwise every page gains a few pixels.
    const last = Array.from(dom.children).filter(e => !e.classList.contains("pm-page-spacer")).at(-1) as HTMLElement | undefined;
    if (last) contentBottom = Math.max(contentBottom, bottomOf(last) + (Number.parseFloat(getComputedStyle(last).marginBottom) || 0));
    let lastPagePadPx = Math.max(0, pageContentH - repeatedHeight - (contentBottom - pageStart));
    if (forced && units.length) {
      const lastPos = view.state.doc.content.size;
      const nextSection = Math.min(currentSection + (sections[currentSection].to === lastPos ? 1 : 0), sections.length - 1);
      const previousPage = pages[pages.length - 1], nextGeometry = sections[nextSection].geometry;
      breaks.push({ pos: lastPos, fillPx: lastPagePadPx, closingMargin: geometry.margins.bottom / 15, openingMargin: nextGeometry.margins.top / 15 });
      pages.push({ top: previousPage.top + previousPage.geometry.height / 15 + PAGE_GAP_PX, geometry: nextGeometry, section: nextSection, sectionPage: nextSection === currentSection ? previousPage.sectionPage + 1 : 0 });
      lastPagePadPx = pageContentH;
    }
    return { breaks, pages, tallCells, rowHeights: Array.from(rowHeights.values()), lastPagePadPx, complete: true };
  } finally {
    dom.classList.remove("pm-measuring");
    if (scroller && scroller.scrollTop !== scrollTop) scroller.scrollTop = scrollTop;
  }
}

function sameBreaks(a: PageBreakPoint[], b: PageBreakPoint[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].pos !== b[i].pos || Math.round(a[i].fillPx) !== Math.round(b[i].fillPx) || a[i].table?.headerHtml !== b[i].table?.headerHtml || a[i].table?.headerHeight !== b[i].table?.headerHeight || JSON.stringify(a[i].companions) !== JSON.stringify(b[i].companions) || JSON.stringify(a[i].cellHeader) !== JSON.stringify(b[i].cellHeader) || Math.round(a[i].leftOffset || 0) !== Math.round(b[i].leftOffset || 0) || Math.round(a[i].rightOffset || 0) !== Math.round(b[i].rightOffset || 0)) return false;
  }
  return true;
}

/** Frames to wait for the DOM to catch up with the state before giving up (~1s). */
const MAX_REMEASURE_TRIES = 60;
function breakDom(point: PageBreakPoint, top: number, bottom: number, numbers: Parameters<typeof spacerDom>[3]): HTMLElement {
  const gap = spacerDom(point.fillPx, point.openingMargin ?? top, point.closingMargin ?? bottom, numbers);
  gap.style.setProperty("--pagination-left-offset", `${point.leftOffset || 0}px`);
  gap.style.setProperty("--pagination-right-offset", `${point.rightOffset || 0}px`);
  if (point.cellContentWidth) for (const index of [1, 3]) {
    const band = gap.children[index] as HTMLElement;
    band.style.width = `${point.cellContentWidth + 2}px`;
    band.style.marginLeft = `${-(point.leftOffset || 0) - 1}px`;
    band.style.background = "var(--sheet-bg, #fff)";
  }
  if (point.cellHeader) {
    const info = point.cellHeader;
    if (info.primary) {
      const header = document.createElement("table"); header.className = "pm-repeated-header";
      header.innerHTML = info.html;
      header.style.cssText = `width:${info.width}px;margin-left:${info.left}px!important;max-width:none!important`;
      gap.appendChild(header);
    } else {
      const space = document.createElement("div"); space.style.height = `${info.height}px`; gap.appendChild(space);
    }
  }
  if (!point.table) return gap;
  const row = document.createElement("tr");
  row.className = "pm-page-spacer pm-pagination-row";
  row.contentEditable = "false";
  row.setAttribute("aria-hidden", "true");
  const cell = document.createElement("td"); cell.colSpan = point.table.columns;
  gap.classList.remove("pm-page-spacer"); cell.appendChild(gap);
  if (point.table.headerHtml) {
    const header = document.createElement("table");
    header.className = "pm-repeated-header";
    header.innerHTML = point.table.headerHtml;
    header.querySelectorAll("a,button,input,[tabindex]").forEach(el => el.setAttribute("tabindex", "-1"));
    cell.appendChild(header);
  }
  row.appendChild(cell); return row;
}


/**
 * Lets the editor ask for a re-measure directly. Plugin views are torn down and
 * rebuilt whenever the plugin set changes, and a rebuilt view can miss the
 * update that follows a whole-document replacement — this gives the app a way
 * in that does not depend on that lifecycle.
 */
const measurements = new WeakMap<EditorView, (view: EditorView) => void>();

export function remeasurePagination(view: EditorView | null | undefined): void {
  if (view && !view.isDestroyed) measurements.get(view)?.(view);
}

export function paginationPlugin(getConfig: () => PageLayoutConfig): Plugin {
  let rafId = 0;
  let tries = 0;
  let runningOriginal: RunningSlots = {};
  let sourceKey = "";
  let suppressNumbering = false;
  let paintRunning: ((pages: RenderedPage[]) => void) | undefined;
  let paintPages: ((pages: RenderedPage[]) => void) | undefined;

  const measure = (view: EditorView) => {
    // Latest request wins. Skipping while one is pending would drop the
    // measurement that matters (the one after a document swap) and, if that
    // frame never fired, would wedge the plugin permanently.
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      // View destroyed between the schedule and the frame.
      if (!view.dom.isConnected) return;
      // Redecorating mid-composition would abort IME input; the update after
      // compositionend re-triggers the measure.
      if (view.composing) return;
      const cfg = getConfig();
      const sections = documentSections(view.state.doc), mixed = sections.length > 1;
      const page = view.dom.parentElement;
      const first = sections[0].geometry;
      const maximum = Math.max(...sections.map(s => s.geometry.width));
      if (page) {
        page.classList.toggle("pm-page-mixed", mixed);
        page.style.setProperty("--page-w", `${maximum / 15}px`);
        page.style.setProperty("--page-margin-top", `${first.margins.top / 15}px`);
        page.style.setProperty("--page-margin-left", `${first.margins.left / 15}px`);
        page.style.setProperty("--page-margin-right", `${first.margins.right / 15}px`);
      }
      const { breaks, pages = [], tallCells = [], rowHeights = [], complete } = computeLayout(view, cfg);
      // Replacing a whole document (loading a template, switching files) can
      // leave the rendered blocks a frame behind the state. Measuring then sees
      // only the outgoing document — one empty paragraph, say — and pads the
      // page out to a full extra page, which sticks because nothing re-measures
      // afterwards. Wait for the two to agree instead.
      if (!complete) {
        // Never write a padding derived from a partial measurement — that is
        // exactly what used to stick. Retry a few frames, then leave it alone.
        if (tries < MAX_REMEASURE_TRIES) { tries++; measure(view); }
        else tries = 0;
        return;
      }
      tries = 0;
      const cur = paginationKey.getState(view.state);
      const numbering = `${cfg.pageNumbers}:${cfg.pageNumberFormat}:${JSON.stringify(cfg.numberingStyle)}:${JSON.stringify(pages)}:${tallCells.join(",")}:${JSON.stringify(rowHeights)}:${suppressNumbering}`;
      if (!cur || !sameBreaks(cur.breaks, breaks) || cur.marginPx !== cfg.marginPx || cur.bottomMarginPx !== cfg.bottomMarginPx || cur.numbering !== numbering) {
        view.dispatch(view.state.tr.setMeta(paginationKey, {
          breaks, pages, tallCells, rowHeights, marginPx: cfg.marginPx, bottomMarginPx: cfg.bottomMarginPx, numbering,
          pageNumbers: suppressNumbering ? "off" : cfg.pageNumbers, pageNumberFormat: cfg.pageNumberFormat, numberingStyle: cfg.numberingStyle,
        }));
      }
      // Align each cell against the same physical sheet edge. Inline widgets at
      // wrapped lines can otherwise differ by a font's leading or a paragraph
      // margin. Apply corrections in page order so later cell bands follow them.
      const physicalPage = view.dom.parentElement?.getBoundingClientRect();
      const physicalRoot = view.dom.getBoundingClientRect();
      const physicalScale = physicalRoot.width / Number.parseFloat(getComputedStyle(view.dom).width);
      if (physicalPage) for (let index = 0; index < breaks.length; index++) {
        const entry = pages[index]; if (!entry) continue;
        const target = physicalPage.top + (entry.top + entry.geometry.height / 15) * physicalScale;
        for (const widget of Array.from(view.dom.querySelectorAll<HTMLElement>(`[data-pagination-cell][data-pagination-break="${index}"]`))) {
          const gap = widget.querySelector<HTMLElement>(".pm-page-spacer-gap"), fill = widget.firstElementChild as HTMLElement | null;
          if (!gap || !fill) continue;
          const difference = (target - gap.getBoundingClientRect().top) / physicalScale;
          if (Math.abs(difference) > 0.1) fill.style.height = `${Math.max(0, Number.parseFloat(fill.style.height) + difference)}px`;
        }
      }
      // Measure final padding after the widgets have reached the live DOM.
      // This includes collapsed table borders and repeated-header geometry.
      const root = view.dom.getBoundingClientRect();
      const scale = root.width / Number.parseFloat(getComputedStyle(view.dom).width);
      const last = Array.from(view.dom.children).filter(e => !e.classList.contains("pm-page-spacer")).at(-1) as HTMLElement | undefined;
      const used = last ? (last.getBoundingClientRect().bottom - root.top) / scale + (Number.parseFloat(getComputedStyle(last).marginBottom) || 0) : 0;
      const lastGeometry = pages[pages.length - 1]?.geometry || first;
      if (page) page.style.setProperty("--page-margin-bottom", `${lastGeometry.margins.bottom / 15}px`);
      const target = pages.reduce((sum, p) => sum + p.geometry.height / 15, 0) + breaks.length * PAGE_GAP_PX - first.margins.top / 15 - lastGeometry.margins.bottom / 15;
      const padding = breaks.length ? Math.max(0, target - used) : 0;
      view.dom.style.paddingBottom = padding > 0.5 ? `${padding}px` : "";
      paintPages?.(pages);
      paintRunning?.(pages);
    });
  };

  return new Plugin<PaginationState>({
    key: paginationKey,
    state: {
      init: () => ({ breaks: [], marginPx: 0, numbering: "off:plain", deco: DecorationSet.empty }),
      apply(tr, prev, _oldState, newState) {
        const meta = tr.getMeta(paginationKey) as
          | {
              breaks: PageBreakPoint[]; pages?: RenderedPage[]; tallCells?: number[]; rowHeights?: RenderedRow[]; marginPx: number;
              bottomMarginPx?: number; numbering: string;
              pageNumbers: PageNumberPosition; pageNumberFormat: PageNumberFormat; numberingStyle?: DocumentLayout["numberingStyle"];
            }
          | undefined;
        if (meta) {
          const total = pageCountOf(meta.breaks);
          const deco = DecorationSet.create(
            newState.doc,
            meta.breaks.flatMap((point, i) => [point, ...(point.companions || [])].map((b, companion) =>
              Decoration.widget(b.pos, () => {
                const element = breakDom(b, meta.marginPx, meta.bottomMarginPx ?? meta.marginPx, {
                position: companion || documentSections(newState.doc).length > 1 ? "off" : meta.pageNumbers,
                alignment: meta.numberingStyle?.alignment,
                closing: numberLabel(i + 1, total, meta.pageNumberFormat, meta.numberingStyle),
                opening: numberLabel(i + 2, total, meta.pageNumberFormat, meta.numberingStyle),
                });
                if (b.cellContentWidth) { element.dataset.paginationCell = "true"; element.dataset.paginationBreak = String(i); }
                return element;
              }, { side: -1, key: `page:${i}:${companion}:${JSON.stringify({ ...b, companions: undefined })}:${meta.numbering}:${total}` })
            ))
          );
          return {
            breaks: meta.breaks, pages: meta.pages, tallCells: meta.tallCells, rowHeights: meta.rowHeights, marginPx: meta.marginPx, bottomMarginPx: meta.bottomMarginPx, numbering: meta.numbering, deco,
          };
        }
        if (tr.docChanged) {
          // Keep spacers roughly in place until the post-update remeasure lands.
          return {
            ...prev,
            deco: prev.deco.map(tr.mapping, tr.doc),
            breaks: prev.breaks.map((b) => ({ ...b, pos: tr.mapping.map(b.pos) })),
            tallCells: prev.tallCells?.map(pos => tr.mapping.map(pos)),
            rowHeights: prev.rowHeights?.map(row => ({ ...row, pos: tr.mapping.map(row.pos) })),
          };
        }
        return prev;
      },
    },
    props: {
      decorations(state) {
        const saved = paginationKey.getState(state);
        const sections = documentSections(state.doc);
        const first = sections[0].geometry, maximum = Math.max(...sections.map(s => s.geometry.width));
        const nodes: Decoration[] = [];
        if (sections.length > 1) state.doc.forEach((node, pos) => {
          const index = Math.max(0, sections.findIndex(s => pos >= s.from && pos < s.to));
          nodes.push(Decoration.node(pos, pos + node.nodeSize, { class: "pm-section-block", "data-page-section": String(index), style: sectionBlockStyle(node, sections[index].geometry, first, maximum) }));
        });
        for (const pos of saved?.tallCells || []) {
          const cell = state.doc.nodeAt(pos);
          if (cell?.type.spec.tableRole === "cell" || cell?.type.spec.tableRole === "header_cell") nodes.push(Decoration.node(pos, pos + cell.nodeSize, { class: "pm-paginated-cell" }));
        }
        for (const row of saved?.rowHeights || []) {
          const node = state.doc.nodeAt(row.pos);
          if (node?.type.spec.tableRole === "row") nodes.push(Decoration.node(row.pos, row.pos + node.nodeSize, { class: "pm-paginated-source-row", style: `--pagination-row-height:${row.height}px;--pagination-source-height:${row.sourceHeight}` }));
        }
        return (saved?.deco || DecorationSet.empty).add(state.doc, nodes);
      },
    },
    view(view) {
      measurements.set(view, measure);
      measure(view);
      // The first page's top band and the last page's bottom band are .pm-page's
      // own padding — no spacer reaches them, so those two numbers are absolutely
      // positioned against the page element instead of riding in the flow.
      const page = view.dom.parentElement;
      const runningLayer = document.createElement("div"); runningLayer.className = "pm-running-layer";
      runningLayer.setAttribute("aria-hidden", "true"); page?.appendChild(runningLayer);
      const loadRunning = (v: EditorView) => {
        const layout = v.state.doc.attrs.layout as DocumentLayout | null;
        const raw = rawSections(v.state.doc).join("");
        const nextKey = `${layout?.source || ""}:${raw}`;
        if (nextKey === sourceKey) return;
        sourceKey = nextKey; runningOriginal = {};
        if (!layout?.source || !/headerReference|footerReference/.test(raw)) return;
        import("@/lib/header-footer-source").then(module => module.readRunningSource(v.state.doc)).then(slots => {
          if (sourceKey === nextKey && v.dom.isConnected) { runningOriginal = slots; measure(v); }
        }).catch(() => {});
      };
      loadRunning(view);
      let lastRunning = "", lastLayout: DocumentLayout | null = null, lastOriginal: RunningSlots | null = null;
      paintRunning = (pages) => {
        const layout = view.state.doc.attrs.layout as DocumentLayout | null, cfg = getConfig();
        const signature = JSON.stringify([pages, cfg.pageNumbers, cfg.pageNumberFormat]);
        if (layout === lastLayout && runningOriginal === lastOriginal && signature === lastRunning) return;
        lastLayout = layout; lastOriginal = runningOriginal; lastRunning = signature;
        runningLayer.replaceChildren();
        const maximum = Math.max(...documentSections(view.state.doc).map(s => s.geometry.width));
        const even = layout?.evenAndOddHeaders || Object.keys(layout?.running || {}).some(key => key.includes(":even:"));
        let replacesNumber = false, counter = cfg.numberingStyle?.start ?? 1;
        for (let index = 0; index < pages.length; index++) {
          const entry = pages[index], g = entry.geometry;
          if (entry.sectionPage === 0 && g.numberStart !== undefined) counter = g.numberStart;
          else if (index) counter++;
          const variant: RunningVariant = entry.sectionPage === 0 && g.differentFirst ? "first" : even && counter % 2 === 0 ? "even" : "default";
          const formatted = numberLabel(counter, pages.length, "plain", { start: 1, alignment: "right", template: "{{PAGE}}", format: g.numberFormat || cfg.numberingStyle?.format || "decimal", hideFirst: false });
          for (const kind of ["header", "footer"] as const) {
            const slot = runningSlot(runningOriginal, layout, entry.section, variant, kind);
            if (cfg.pageNumbers === (kind === "header" ? "top" : "bottom") && Object.keys(layout?.running || {}).some(key => key.endsWith(`:${kind}`))) replacesNumber = true;
            if (!slot.html || !new DOMParser().parseFromString(slot.html, "text/html").body.textContent?.trim() && !/data-doc-field|<img/.test(slot.html)) continue;
            const box = document.createElement("div"); box.className = `edtr-running-content pm-running-${kind}`;
            box.style.cssText = `position:absolute;left:${(maximum - g.width) / 30 + g.margins.left / 15}px;width:${(g.width - g.margins.left - g.margins.right) / 15}px;${kind === "header" ? `top:${entry.top + (g.headerDistance ?? slot.distance) / 15}px` : `top:${entry.top + g.height / 15 - (g.footerDistance ?? slot.distance) / 15}px;transform:translateY(-100%)`}`;
            box.appendChild(runningFragment(slot.html, formatted, pages.length)); runningLayer.appendChild(box);
            if (cfg.pageNumbers === (kind === "header" ? "top" : "bottom") && (slot.html.includes('data-doc-field="PAGE"') || Object.keys(layout?.running || {}).some(key => key.startsWith(`${entry.section}:`) && key.endsWith(`:${kind}`)))) replacesNumber = true;
          }
        }
        if (suppressNumbering !== replacesNumber) { suppressNumbering = replacesNumber; measure(view); }
      };
      const edge = (place: "top" | "bottom") => {
        const el = document.createElement("div");
        el.className = `pm-page-number pm-page-number-edge pm-page-number-${place}`;
        el.setAttribute("aria-hidden", "true");
        return el;
      };
      const firstEdge = edge("top");
      const lastEdge = edge("bottom");
      page?.append(firstEdge, lastEdge);
      const sheets = document.createElement("div"); sheets.className = "pm-sheet-backgrounds";
      sheets.setAttribute("aria-hidden", "true"); page?.insertBefore(sheets, view.dom);
      let painted = "";
      paintPages = (pages) => {
        const sections = documentSections(view.state.doc), cfg = getConfig();
        const signature = JSON.stringify([pages, cfg.pageNumbers, cfg.pageNumberFormat, cfg.numberingStyle, suppressNumbering]);
        if (painted === signature) return; painted = signature;
        sheets.replaceChildren();
        if (sections.length < 2) return;
        const maximum = Math.max(...sections.map(s => s.geometry.width));
        for (let i = 0; i < pages.length; i++) {
          const entry = pages[i], g = entry.geometry;
          const sheet = document.createElement("div"); sheet.className = "pm-section-sheet";
          sheet.setAttribute("data-section-index", String(entry.section));
          sheet.style.cssText = `top:${entry.top}px;left:${(maximum - g.width) / 30}px;width:${g.width / 15}px;height:${g.height / 15}px`;
          if (cfg.pageNumbers !== "off" && !suppressNumbering) {
            const number = document.createElement("div"); number.className = `pm-section-number pm-page-number pm-page-number-${cfg.pageNumbers}`;
            const style = cfg.numberingStyle ? { ...cfg.numberingStyle, start: (g.numberStart ?? i - entry.sectionPage + cfg.numberingStyle.start) - (i - entry.sectionPage), format: g.numberFormat || cfg.numberingStyle.format, hideFirst: !!g.differentFirst && entry.sectionPage === 0 } : undefined;
            number.textContent = g.differentFirst && entry.sectionPage === 0 ? "" : numberLabel(i + 1, pages.length, cfg.pageNumberFormat, style);
            number.style.cssText = `left:${g.margins.left / 15}px;right:${g.margins.right / 15}px;${cfg.pageNumbers === "top" ? "top:0" : "bottom:0"};height:${(cfg.pageNumbers === "top" ? g.margins.top : g.margins.bottom) / 15}px;justify-content:${cfg.numberingStyle?.alignment === "center" ? "center" : cfg.numberingStyle?.alignment === "left" ? "flex-start" : "flex-end"}`;
            sheet.appendChild(number);
          }
          sheets.appendChild(sheet);
        }
        // Named pages let print retain each section's paper size and margins.
        const style = document.createElement("style");
        style.textContent = `@media print { ${sections.map((s, index) => {
          const g = s.geometry;
          return `@page edtrsection${index} { size:${g.width / 20}pt ${g.height / 20}pt; margin:${g.margins.top / 20}pt ${g.margins.right / 20}pt ${g.margins.bottom / 20}pt ${g.margins.left / 20}pt; } [data-page-section="${index}"] { page:edtrsection${index}; }`;
        }).join(" ")} }`;
        sheets.appendChild(style);
      };
      const syncEdges = (v: EditorView) => {
        const cfg = getConfig();
        const total = pageCountOf(paginationKey.getState(v.state)?.breaks ?? []);
        const entries: Array<[HTMLElement, boolean, string]> = [
          [firstEdge, cfg.pageNumbers === "top", numberLabel(1, total, cfg.pageNumberFormat, cfg.numberingStyle)],
          [lastEdge, cfg.pageNumbers === "bottom", numberLabel(total, total, cfg.pageNumberFormat, cfg.numberingStyle)],
        ];
        for (const [el, on, text] of entries) {
          el.style.display = on && !suppressNumbering && documentSections(v.state.doc).length < 2 ? "" : "none";
          el.style.justifyContent = cfg.numberingStyle?.alignment === "center" ? "center" : cfg.numberingStyle?.alignment === "left" ? "flex-start" : "flex-end";
          const pages = paginationKey.getState(v.state)?.pages;
          el.style.height = `${el === lastEdge ? (pages?.at(-1)?.geometry.margins.bottom ?? (cfg.bottomMarginPx ?? cfg.marginPx) * 15) / 15 : (pages?.[0]?.geometry.margins.top ?? cfg.marginPx * 15) / 15}px`;
          if (on) el.textContent = text;
        }
      };
      syncEdges(view);
      // Catches async height changes (image loads, fonts) and layout-affecting
      // config changes (orientation/margins change the editor's width).
      const observer = new ResizeObserver(() => measure(view));
      observer.observe(view.dom);
      const onLoad = () => measure(view);
      view.dom.addEventListener("load", onLoad, true);
      view.dom.addEventListener("compositionend", onLoad);
      document.fonts?.addEventListener("loadingdone", onLoad);
      return {
        update(v, previous) {
          if (v.state.doc !== previous.doc) { loadRunning(v); measure(v); }
          syncEdges(v);
        },
        destroy() {
          // A replacement plugin registers its own measure callback; stale
          // views must not write geometry into its document.
          if (measurements.get(view) === measure) measurements.delete(view);
          if (rafId) cancelAnimationFrame(rafId);
          view.dom.removeEventListener("load", onLoad, true);
          view.dom.removeEventListener("compositionend", onLoad);
          document.fonts?.removeEventListener("loadingdone", onLoad);
          observer.disconnect();
          sourceKey = ""; paintRunning = undefined; runningLayer.remove();
          paintPages = undefined; sheets.remove();
          firstEdge.remove();
          lastEdge.remove();
        },
      };
    },
  });
}
