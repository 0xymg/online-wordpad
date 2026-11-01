import type { EditorState, Transaction } from "prosemirror-state";
import { CellSelection, findTable, TableMap } from "prosemirror-tables";

export type TableFormatting = {
  fill?: string; vertical?: string; padding?: number;
  border?: "all" | "none"; borderColor?: string; borderWidth?: number;
  alignment?: string; rowHeight?: number; repeatHeader?: boolean;
  columns?: "equal" | "page";
};
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
function properties(raw: string | null, name: string) {
  const doc = new DOMParser().parseFromString(raw || `<w:${name} xmlns:w="${W}"/>`, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Invalid table properties");
  return doc.documentElement;
}
function set(parent: Element, name: string, attrs: Record<string, string>) {
  let el = Array.from(parent.children).find(e => e.namespaceURI === W && e.localName === name);
  if (!el) { el = parent.ownerDocument.createElementNS(W, `w:${name}`); parent.appendChild(el); }
  for (const [key, value] of Object.entries(attrs)) el.setAttributeNS(W, `w:${key}`, value);
  return el;
}
const xml = (el: Element) => new XMLSerializer().serializeToString(el);
function style(raw: string | null) { const el = document.createElement("div"); el.style.cssText = raw || ""; return el.style; }

/** One transaction keeps a multi-cell formatting change atomic for undo/autosave. */
export function formatTable(state: EditorState, options: TableFormatting, pageWidth = 600): Transaction | null {
  const table = findTable(state.selection.$from);
  if (!table) return null;
  const map = TableMap.get(table.node), selected = new Set<number>();
  if (state.selection instanceof CellSelection) state.selection.forEachCell((_, pos) => selected.add(pos));
  else {
    for (let depth = state.selection.$from.depth; depth > 0; depth--) {
      const node = state.selection.$from.node(depth);
      if (node.type.spec.tableRole === "cell" || node.type.spec.tableRole === "header_cell") { selected.add(state.selection.$from.before(depth)); break; }
    }
  }
  if (!selected.size) return null;
  const tr = state.tr;
  let totalWidth = 0;
  for (let c = 0; c < map.width; c++) {
    let width = 0;
    for (let r = 0; r < map.height && !width; r++) {
      const pos = map.map[r * map.width + c], cell = table.node.nodeAt(pos)!;
      width = cell.attrs.colwidth?.[c - map.findCell(pos).left] || 0;
    }
    totalWidth += width || pageWidth / map.width;
  }
  const columnWidth = Math.max(25, Math.floor((options.columns === "page" ? pageWidth : totalWidth) / map.width));
  const selectedRows = new Set<number>();
  for (const absolute of selected) {
    const rect = map.findCell(absolute - table.start);
    for (let r = rect.top; r < rect.bottom; r++) selectedRows.add(r);
  }
  table.node.forEach((row, rowOffset, r) => {
    const rowPos = table.start + rowOffset;
    if (options.rowHeight !== undefined && selectedRows.has(r) || options.repeatHeader !== undefined && r === 0) {
      const pr = properties(row.attrs.docxProperties, "trPr"), css = style(row.attrs.layoutStyle);
      if (options.rowHeight !== undefined && selectedRows.has(r)) {
        css.height = `${options.rowHeight}cm`;
        set(pr, "trHeight", { val: String(Math.round(options.rowHeight / 2.54 * 1440)), hRule: "atLeast" });
      }
      if (options.repeatHeader !== undefined && r === 0) set(pr, "tblHeader", { val: options.repeatHeader ? "1" : "0" });
      tr.setNodeMarkup(rowPos, undefined, { ...row.attrs, layoutStyle: css.cssText, docxProperties: xml(pr) });
    }
    row.forEach((cell, cellOffset) => {
      const pos = rowPos + cellOffset + 1;
      const attrs = { ...cell.attrs };
      if (options.columns) attrs.colwidth = Array.from({ length: cell.attrs.colspan }, () => columnWidth);
      if (selected.has(pos)) {
        const pr = properties(cell.attrs.docxProperties, "tcPr"), css = style(cell.attrs.layoutStyle);
        if (options.fill !== undefined) {
          css.backgroundColor = options.fill === "none" ? "transparent" : options.fill;
          const shd = set(pr, "shd", { val: "clear", fill: options.fill === "none" ? "auto" : options.fill.slice(1) });
          for (const key of ["themeFill", "themeFillTint", "themeFillShade"]) shd.removeAttributeNS(W, key);
        }
        if (options.vertical) { css.verticalAlign = options.vertical; set(pr, "vAlign", { val: options.vertical === "middle" ? "center" : options.vertical }); }
        if (options.padding !== undefined) {
          const margins = set(pr, "tcMar", {}); css.padding = `${options.padding}pt`;
          for (const side of ["top", "right", "bottom", "left"]) set(margins, side, { w: String(Math.round(options.padding * 20)), type: "dxa" });
        }
        if (options.border) {
          const borders = set(pr, "tcBorders", {});
          for (const side of ["top", "right", "bottom", "left"]) {
            css.setProperty(`border-${side}`, options.border === "none" ? "none" : `${options.borderWidth ?? 0.75}pt solid ${options.borderColor || "#000000"}`);
            const border = set(borders, side, { val: options.border === "none" ? "nil" : "single", sz: String(Math.round((options.borderWidth ?? 0.75) * 8)), color: (options.borderColor || "#000000").slice(1) });
            border.removeAttributeNS(W, "themeColor");
          }
          // Continuation cells of vertical merges need the same explicit border.
          if (attrs.docxContinuations) attrs.docxContinuations = JSON.stringify((JSON.parse(attrs.docxContinuations) as string[]).map(raw => {
            const continuation = properties(raw, "tcPr");
            Array.from(continuation.children).filter(e => e.localName === "tcBorders").forEach(e => e.remove());
            continuation.appendChild(borders.cloneNode(true)); return xml(continuation);
          }));
        }
        attrs.layoutStyle = css.cssText; attrs.docxProperties = xml(pr);
      }
      tr.setNodeMarkup(pos, undefined, attrs);
    });
  });
  if (options.alignment || options.columns) {
    const attrs = { ...table.node.attrs }, pr = properties(attrs.docxProperties, "tblPr"), css = style(attrs.layoutStyle);
    if (options.alignment) {
      set(pr, "jc", { val: options.alignment });
      css.marginLeft = options.alignment === "left" ? "0" : "auto";
      css.marginRight = options.alignment === "right" ? "0" : "auto";
      // A floating Word table otherwise ignores its new inline alignment.
      Array.from(pr.children).filter(e => e.localName === "tblpPr").forEach(e => e.remove());
    }
    if (options.columns) {
      set(pr, "tblW", { type: "dxa", w: String(columnWidth * map.width * 15) });
      set(pr, "tblLayout", { type: "fixed" });
    }
    attrs.docxProperties = xml(pr); attrs.layoutStyle = css.cssText;
    tr.setNodeMarkup(table.pos, undefined, attrs);
  }
  return tr;
}
