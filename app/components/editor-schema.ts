// ── Schema ────────────────────────────────────────────────────────────────
// The ProseMirror schema lives in its own module so lightweight consumers
// (e.g. the landing page's ToolbarPreview) can import it without dragging in
// the entire Editor.tsx module graph (react-to-print, dialogs, actions, …).

import { paragraphAttrs, paragraphDOM, paragraphCSS } from "@/lib/paragraph-format";
import { imageWrap, imageDistance, imageLayoutStyle, imageDataAttrs, imagePosition, imageCoordinate, imageLayer, imageTextPlane } from "@/lib/image-layout";
import { Schema, Node as PMNode, Mark, type NodeSpec } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { tableNodes } from "prosemirror-tables";
import { readDocxProperties } from "@/lib/document-layout";
import { textBoxNodeSpec } from "@/lib/text-box";

function layoutStyles(el: HTMLElement): string {
  return ["height", "margin-top", "margin-bottom", "margin-left", "margin-right", "text-indent", "line-height", "background-color", "vertical-align", "border-top", "border-right", "border-bottom", "border-left", "padding-top", "padding-right", "padding-bottom", "padding-left"].map(p => el.style.getPropertyValue(p) ? `${p}:${el.style.getPropertyValue(p)}` : "").filter(Boolean).join(";");
}
const rawAttrs = { docxProperties: { default: null }, layoutStyle: { default: null } };
const parseRaw = (el: HTMLElement) => ({ docxProperties: readDocxProperties(el), layoutStyle: el.hasAttribute("data-docx-properties") ? layoutStyles(el) : null });
const rawDOM = (node: PMNode): Record<string, string> => node.attrs.docxProperties ? { "data-docx-properties": node.attrs.docxProperties } : {};

const normalizeTextAlign = (value: string | null | undefined) => {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "left" || v === "center" || v === "right" || v === "justify") return v;
  return null;
};

export const normalizeIndent = (value: unknown) => {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? "0"), 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(12, n));
};

const parseIndentFromDom = (el: HTMLElement) => {
  const dataIndent = el.getAttribute("data-indent");
  if (dataIndent !== null) return normalizeIndent(dataIndent);
  const marginLeft = el.style.marginLeft || "";
  if (!marginLeft) return 0;
  const px = Number.parseFloat(marginLeft);
  if (Number.isNaN(px)) return 0;
  return normalizeIndent(Math.round(px / 24));
};

const normalizeLineHeight = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number.parseFloat(String(value));
  if (Number.isNaN(n) || n <= 0) return null;
  return String(n);
};

const paragraphNodeSpec: NodeSpec = {
  ...basicSchema.spec.nodes.get("paragraph"),
  attrs: {
    ...rawAttrs,
    styleId: { default: null }, styleText: { default: null }, styleParagraph: { default: null }, paragraphFormat: { default: null },
    textAlign: { default: null },
    indent: { default: 0 },
    lineHeight: { default: null },
  },
  parseDOM: [{
    tag: "p",
    getAttrs(dom: Node | string) {
      if (typeof dom === "string") return { textAlign: null, indent: 0, lineHeight: null };
      const el = dom as HTMLElement;
      return {
        ...parseRaw(el), ...paragraphAttrs(el),
        textAlign: el.hasAttribute("data-edtr-style") ? null : normalizeTextAlign(el.style.textAlign),
        indent: el.hasAttribute("data-docx-properties") ? 0 : parseIndentFromDom(el),
        lineHeight: el.hasAttribute("data-edtr-style") || /[a-z%]/i.test(el.style.lineHeight) ? null : normalizeLineHeight(el.style.lineHeight),
      };
    },
  }],
  toDOM(node: PMNode) {
    const textAlign = normalizeTextAlign(node.attrs.textAlign);
    const indent = normalizeIndent(node.attrs.indent);
    const lineHeight = normalizeLineHeight(node.attrs.lineHeight);
    const style: string[] = node.attrs.layoutStyle ? [node.attrs.layoutStyle] : [];
    if (textAlign) style.push(`text-align:${textAlign}`);
    if (indent > 0) style.push(`margin-left:${indent * 24}px`);
    if (lineHeight) style.push(`line-height:${lineHeight}`);
    style.push(paragraphCSS(node));
    const attrs: Record<string, string> = { dir: "auto", ...rawDOM(node), ...paragraphDOM(node) };
    if (style.length) attrs.style = style.join(";");
    if (indent > 0) attrs["data-indent"] = String(indent);
    return ["p", attrs, 0];
  },
};

const headingNodeSpec: NodeSpec = {
  ...basicSchema.spec.nodes.get("heading"),
  attrs: {
    level: { default: 1 },
    ...rawAttrs,
    styleId: { default: null }, styleText: { default: null }, styleParagraph: { default: null }, paragraphFormat: { default: null },
    textAlign: { default: null },
    indent: { default: 0 },
    lineHeight: { default: null },
  },
  parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
    tag: `h${level}`,
    getAttrs(dom: Node | string) {
      if (typeof dom === "string") return { level, textAlign: null, indent: 0, lineHeight: null };
      const el = dom as HTMLElement;
      return {
        level,
        ...parseRaw(el), ...paragraphAttrs(el),
        textAlign: el.hasAttribute("data-edtr-style") ? null : normalizeTextAlign(el.style.textAlign),
        indent: el.hasAttribute("data-docx-properties") ? 0 : parseIndentFromDom(el),
        lineHeight: el.hasAttribute("data-edtr-style") || /[a-z%]/i.test(el.style.lineHeight) ? null : normalizeLineHeight(el.style.lineHeight),
      };
    },
  })),
  toDOM(node: PMNode) {
    const level = node.attrs.level || 1;
    const textAlign = normalizeTextAlign(node.attrs.textAlign);
    const indent = normalizeIndent(node.attrs.indent);
    const lineHeight = normalizeLineHeight(node.attrs.lineHeight);
    const style: string[] = node.attrs.layoutStyle ? [node.attrs.layoutStyle] : [];
    if (textAlign) style.push(`text-align:${textAlign}`);
    if (indent > 0) style.push(`margin-left:${indent * 24}px`);
    if (lineHeight) style.push(`line-height:${lineHeight}`);
    style.push(paragraphCSS(node));
    const attrs: Record<string, string> = { dir: "auto", ...rawDOM(node), ...paragraphDOM(node) };
    if (style.length) attrs.style = style.join(";");
    if (indent > 0) attrs["data-indent"] = String(indent);
    return [`h${level}`, attrs, 0];
  },
};

const imageNodeSpec: NodeSpec = {
  inline: true,
  group: "inline",
  draggable: true,
  attrs: {
    src: {},
    alt: { default: null },
    title: { default: null },
    width: { default: "100%" },
    aspectRatio: { default: null },
    rotate: { default: 0 },
    flipX: { default: false },
    flipY: { default: false },
    align: { default: "left" },
    wrap: { default: "topBottom" },
    distance: { default: 0 },
    position: { default: "flow" },
    x: { default: 0 },
    y: { default: 0 },
    layer: { default: 0 },
    textPlane: { default: "front" },
  },
  parseDOM: [{
    tag: "img[src]",
    getAttrs(dom: Node | string) {
      const img = dom as HTMLImageElement;
      return {
        src: img.getAttribute("src"),
        alt: img.getAttribute("alt"),
        title: img.getAttribute("title"),
        width: img.getAttribute("data-width") || img.style.width || "100%",
        aspectRatio: Number.isFinite(Number(img.getAttribute("data-aspect-ratio"))) && Number(img.getAttribute("data-aspect-ratio")) > 0 ? Number(img.getAttribute("data-aspect-ratio")) : null,
        rotate: Number(img.getAttribute("data-rotate") || "0") || 0,
        flipX: img.getAttribute("data-flip-x") === "true",
        flipY: img.getAttribute("data-flip-y") === "true",
        align: img.getAttribute("data-align") ?? "left",
        wrap: imageWrap(img.getAttribute("data-wrap") || (img.style.float === "left" ? "wrapLeft" : img.style.float === "right" ? "wrapRight" : "topBottom")),
        distance: imageDistance(img.getAttribute("data-distance")),
        position: imagePosition(img.getAttribute("data-position")),
        x: imageCoordinate(img.getAttribute("data-x")),
        y: imageCoordinate(img.getAttribute("data-y")),
        layer: imageLayer(img.getAttribute("data-layer")),
        textPlane: imageTextPlane(img.getAttribute("data-text-plane")),
      };
    },
  }],
  toDOM(node: PMNode) {
    const a = node.attrs;
    const sx = a.flipX ? -1 : 1;
    const sy = a.flipY ? -1 : 1;
    const transform = `rotate(${Number(a.rotate || 0)}deg) scale(${sx}, ${sy})`;
    const align = String(a.align ?? "left");
    return ["img", {
      src: a.src,
      alt: a.alt || "",
      title: a.title || "",
      "data-width": a.width || "100%",
      ...(a.aspectRatio ? { "data-aspect-ratio": String(a.aspectRatio) } : {}),
      "data-rotate": String(Number(a.rotate || 0)),
      "data-flip-x": a.flipX ? "true" : "false",
      "data-flip-y": a.flipY ? "true" : "false",
      "data-align": align,
      ...imageDataAttrs(a),
      style: `${imageLayoutStyle({ ...a, position: "flow" })}height:auto;${a.aspectRatio ? `aspect-ratio:${a.aspectRatio};` : ""}transform:${transform};transform-origin:center center;`,
    }];
  },
};

const pageBreakNodeSpec: NodeSpec = {
  group: "block",
  atom: true,
  selectable: true,
  parseDOM: [{
    tag: "hr[data-page-break]",
    priority: 100,
  }],
  toDOM() {
    return ["hr", { "data-page-break": "true", class: "pm-page-break" }];
  },
};

const importedTables = tableNodes({ tableGroup: "block", cellContent: "block+", cellAttributes: {
  docxContinuations: { default: null, getFromDOM: (el) => el.getAttribute("data-docx-continuations"), setDOMAttr(value, attrs) { if (value) attrs["data-docx-continuations"] = value; } },
  docxProperties: { default: null, getFromDOM: readDocxProperties, setDOMAttr(value, attrs) { if (value) attrs["data-docx-properties"] = value; } },
  layoutStyle: { default: null, getFromDOM: (el) => layoutStyles(el), setDOMAttr(value, attrs) { if (value) attrs.style = `${attrs.style || ""};${value}`; } },
} });
for (const name of ["table", "table_row"] as const) {
  const spec = importedTables[name];
  const originalDOM = spec.toDOM!;
  spec.attrs = { ...spec.attrs, ...rawAttrs, docxGrid: { default: null }, docxRows: { default: null } };
  spec.parseDOM = [{ tag: name === "table" ? "table" : "tr", getAttrs: (dom) => ({ ...parseRaw(dom as HTMLElement), docxGrid: (dom as HTMLElement).getAttribute("data-docx-grid"), docxRows: (dom as HTMLElement).getAttribute("data-docx-rows") }) }];
  spec.toDOM = (node) => {
    const dom = originalDOM(node) as [string, Record<string, unknown>, ...unknown[]];
    const attrs = { ...rawDOM(node), ...(node.attrs.layoutStyle ? { style: node.attrs.layoutStyle } : {}), ...(node.attrs.docxGrid ? { "data-docx-grid": node.attrs.docxGrid } : {}), ...(node.attrs.docxRows ? { "data-docx-rows": node.attrs.docxRows } : {}) };
    // tableNodes emits [table, [tbody, 0]] / [tr, 0], with no attrs object.
    return [dom[0], attrs, ...dom.slice(1)] as import("prosemirror-model").DOMOutputSpec;
  };
}

export const mySchema = new Schema({
  nodes: (addListNodes(
    basicSchema.spec.nodes
      .update("doc", { ...basicSchema.spec.nodes.get("doc"), attrs: { layout: { default: null } } })
      .update("paragraph", paragraphNodeSpec)
      .update("heading", headingNodeSpec)
      .update("image", imageNodeSpec),
    "paragraph block*",
    "block"
  ))
    .append(importedTables)
    .addToEnd("text_box", textBoxNodeSpec)
    .addToEnd("page_break", pageBreakNodeSpec)
    .addToEnd("doc_field", {
      inline: true, group: "inline", atom: true,
      attrs: { kind: { default: "PAGE" }, instruction: { default: null }, cached: { default: null } },
      parseDOM: [{ tag: "span[data-doc-field]", getAttrs: dom => { const el = dom as HTMLElement; const kind = el.getAttribute("data-doc-field"); return { kind: kind === "OTHER" || kind === "NUMPAGES" ? kind : "PAGE", instruction: el.getAttribute("data-field-instruction"), cached: el.getAttribute("data-field-cached") }; } }],
      toDOM: node => ["span", { "data-doc-field": node.attrs.kind, ...(node.attrs.instruction ? { "data-field-instruction": node.attrs.instruction, "data-field-cached": node.attrs.cached || "" } : {}), contenteditable: "false", class: "edtr-document-field" }, node.attrs.kind === "OTHER" ? node.attrs.cached || "…" : node.attrs.kind === "NUMPAGES" ? "…" : "1"],
    }),
  marks: basicSchema.spec.marks.append({
    underline:     { parseDOM: [{ tag: "u" }],                    toDOM: () => ["u", 0] },
    strikethrough: { parseDOM: [{ tag: "s" }, { tag: "strike" }],  toDOM: () => ["s", 0] },
    textColor: {
      attrs: { color: {} },
      parseDOM: [{ style: "color", getAttrs: (v) => ({ color: v }) }],
      toDOM: (mark: Mark) => ["span", { style: `color:${mark.attrs.color}` }, 0],
    },
    bgColor: {
      attrs: { color: {} },
      parseDOM: [{ style: "background-color", getAttrs: (v) => ({ color: v }) }],
      toDOM: (mark: Mark) => ["span", { style: `background-color:${mark.attrs.color}` }, 0],
    },
    fontSize: {
      attrs: { size: {} },
      parseDOM: [{ style: "font-size", getAttrs: (v) => ({ size: v }) }],
      toDOM: (mark: Mark) => ["span", { style: `font-size:${mark.attrs.size}` }, 0],
    },
    fontFamily: {
      attrs: { family: {} },
      parseDOM: [{ style: "font-family", getAttrs: (v) => ({ family: v }) }],
      toDOM: (mark: Mark) => ["span", { style: `font-family:${mark.attrs.family}` }, 0],
    },
    superscript: {
      parseDOM: [{ tag: "sup" }],
      toDOM: () => ["sup", 0],
      excludes: "superscript subscript",
    },
    subscript: {
      parseDOM: [{ tag: "sub" }],
      toDOM: () => ["sub", 0],
      excludes: "superscript subscript",
    },
    link: {
      attrs: { href: {}, title: { default: null } },
      inclusive: false,
      parseDOM: [{ tag: "a[href]", getAttrs: (dom) => {
        const href = sanitizeHref((dom as HTMLElement).getAttribute("href"));
        if (!href) return false;
        return { href, title: (dom as HTMLElement).getAttribute("title") };
      }}],
      toDOM: (mark: Mark) => ["a", { href: mark.attrs.href, title: mark.attrs.title, rel: "noopener noreferrer" }, 0],
    },
  }),
});

/** Reject javascript:/data:/vbscript: URLs so pasted HTML can't smuggle scripts. */
export function sanitizeHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return null;
  return trimmed;
}
