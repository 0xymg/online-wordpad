// ── Schema ────────────────────────────────────────────────────────────────
// The ProseMirror schema lives in its own module so lightweight consumers
// (e.g. the landing page's ToolbarPreview) can import it without dragging in
// the entire Editor.tsx module graph (react-to-print, dialogs, actions, …).

import { Schema, Node as PMNode, Mark } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { tableNodes } from "prosemirror-tables";

const normalizeTextAlign = (value: string | null | undefined) => {
  if (!value) return "left";
  const v = value.trim().toLowerCase();
  if (v === "left" || v === "center" || v === "right" || v === "justify") return v;
  return "left";
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

const paragraphNodeSpec = {
  ...basicSchema.spec.nodes.get("paragraph"),
  attrs: {
    textAlign: { default: "left" },
    indent: { default: 0 },
    lineHeight: { default: null },
  },
  parseDOM: [{
    tag: "p",
    getAttrs(dom: Node | string) {
      if (typeof dom === "string") return { textAlign: "left", indent: 0, lineHeight: null };
      const el = dom as HTMLElement;
      return {
        textAlign: normalizeTextAlign(el.style.textAlign),
        indent: parseIndentFromDom(el),
        lineHeight: normalizeLineHeight(el.style.lineHeight),
      };
    },
  }],
  toDOM(node: PMNode) {
    const textAlign = normalizeTextAlign(node.attrs.textAlign);
    const indent = normalizeIndent(node.attrs.indent);
    const lineHeight = normalizeLineHeight(node.attrs.lineHeight);
    const style: string[] = [];
    if (textAlign !== "left") style.push(`text-align:${textAlign}`);
    if (indent > 0) style.push(`margin-left:${indent * 24}px`);
    if (lineHeight) style.push(`line-height:${lineHeight}`);
    const attrs: Record<string, string> = {};
    if (style.length) attrs.style = style.join(";");
    if (indent > 0) attrs["data-indent"] = String(indent);
    return ["p", attrs, 0];
  },
};

const headingNodeSpec = {
  ...basicSchema.spec.nodes.get("heading"),
  attrs: {
    level: { default: 1 },
    textAlign: { default: "left" },
    indent: { default: 0 },
    lineHeight: { default: null },
  },
  parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
    tag: `h${level}`,
    getAttrs(dom: Node | string) {
      if (typeof dom === "string") return { level, textAlign: "left", indent: 0, lineHeight: null };
      const el = dom as HTMLElement;
      return {
        level,
        textAlign: normalizeTextAlign(el.style.textAlign),
        indent: parseIndentFromDom(el),
        lineHeight: normalizeLineHeight(el.style.lineHeight),
      };
    },
  })),
  toDOM(node: PMNode) {
    const level = node.attrs.level || 1;
    const textAlign = normalizeTextAlign(node.attrs.textAlign);
    const indent = normalizeIndent(node.attrs.indent);
    const lineHeight = normalizeLineHeight(node.attrs.lineHeight);
    const style: string[] = [];
    if (textAlign !== "left") style.push(`text-align:${textAlign}`);
    if (indent > 0) style.push(`margin-left:${indent * 24}px`);
    if (lineHeight) style.push(`line-height:${lineHeight}`);
    const attrs: Record<string, string> = {};
    if (style.length) attrs.style = style.join(";");
    if (indent > 0) attrs["data-indent"] = String(indent);
    return [`h${level}`, attrs, 0];
  },
};

const imageNodeSpec = {
  inline: true,
  group: "inline",
  draggable: true,
  attrs: {
    src: {},
    alt: { default: null },
    title: { default: null },
    width: { default: "100%" },
    rotate: { default: 0 },
    flipX: { default: false },
    flipY: { default: false },
    align: { default: "left" },
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
        rotate: Number(img.getAttribute("data-rotate") || "0") || 0,
        flipX: img.getAttribute("data-flip-x") === "true",
        flipY: img.getAttribute("data-flip-y") === "true",
        align: img.getAttribute("data-align") || "left",
      };
    },
  }],
  toDOM(node: PMNode) {
    const a = node.attrs;
    const sx = a.flipX ? -1 : 1;
    const sy = a.flipY ? -1 : 1;
    const transform = `rotate(${Number(a.rotate || 0)}deg) scale(${sx}, ${sy})`;
    const align = String(a.align || "left");
    const alignStyle =
      align === "center"
        ? "display:block;margin:0 auto;"
        : align === "right"
          ? "display:block;margin-left:auto;margin-right:0;"
          : align === "justify"
            ? "display:block;width:100%;"
            : "display:block;margin:0;";
    return ["img", {
      src: a.src,
      alt: a.alt || "",
      title: a.title || "",
      "data-width": a.width || "100%",
      "data-rotate": String(Number(a.rotate || 0)),
      "data-flip-x": a.flipX ? "true" : "false",
      "data-flip-y": a.flipY ? "true" : "false",
      "data-align": align,
      style: `width:${a.width || "100%"};height:auto;max-width:100%;transform:${transform};transform-origin:center center;${alignStyle}`,
    }];
  },
};

const pageBreakNodeSpec = {
  group: "block",
  atom: true,
  selectable: true,
  parseDOM: [{
    tag: "hr[data-page-break]",
  }],
  toDOM() {
    return ["hr", { "data-page-break": "true", class: "pm-page-break" }];
  },
};

export const mySchema = new Schema({
  nodes: (addListNodes(
    basicSchema.spec.nodes
      .update("paragraph", paragraphNodeSpec as any)
      .update("heading", headingNodeSpec as any)
      .update("image", imageNodeSpec as any),
    "paragraph block*",
    "block"
  ) as any)
    .append(tableNodes({ tableGroup: "block", cellContent: "block+", cellAttributes: {} }))
    .addToEnd("page_break", pageBreakNodeSpec as any),
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
