// Client-side PDF exporter: ProseMirror doc → .pdf via @react-pdf/renderer.
// Loaded on demand via dynamic import so the (heavy) renderer stays out of the
// main bundle. Uses each document section’s paper size and margins, with
// rich running content and dynamic page fields resolved for the PDF’s pages.
import React from "react";
import { DOMParser as PMParser } from "prosemirror-model";
import { mySchema } from "@/app/components/editor-schema";
import { documentSections, type PageGeometry } from "./document-sections";
import { defaultDocumentLayout, type DocumentLayout } from "./document-layout";
import { runningSlot, type RunningSlots, type RunningVariant } from "./running-content";
import { numberLabel } from "./page-number";
import { resolvedAlignment, textDirection } from "./text-direction";
import type { Node as PMNode, Mark } from "prosemirror-model";
import { Document, Page, View, Text, Image, Link, Font, pdf, type DocumentProps } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";

/* ── geometry ───────────────────────────────────────────────────────────────
   Editor renders A4 at 96dpi (794×1123px, 21×29.7cm); PDF is in pt (72dpi),
   so editor px × 0.75 = pt and cm × 28.3465 = pt. */
const CM_TO_PT = 28.3465;
const PX_TO_PT = 0.75;
const BASE_FONT_PT = 12;          // .pm-page.ProseMirror { font-size: 12pt }
const BASE_LINE_HEIGHT = 1.5;     // .pm-page.ProseMirror { line-height: 1.5 }
const INDENT_STEP_PT = 24 * PX_TO_PT; // paragraph indent step is 24px/level

/* ── fonts ──────────────────────────────────────────────────────────────────
   The 14 built-in PDF fonts are WinAnsi-encoded and cannot render Turkish
   (ğ ş İ ı …), so we embed the metric-compatible Liberation family:
   LiberationSans≈Arial, LiberationSerif≈Times New Roman,
   LiberationMono≈Courier New, Carlito≈Calibri. Files live in public/pdf-fonts/. */
export type PdfFontResolver = (file: string) => string;

let fontsRegistered = false;

/** Register the document font families. `resolve` maps a TTF filename to a URL
 *  (browser) or filesystem path (Node tests). Idempotent. */
export function registerPdfFonts(resolve: PdfFontResolver): void {
  if (fontsRegistered) return;
  fontsRegistered = true;
  for (const family of ["Carlito", "LiberationSans", "LiberationSerif", "LiberationMono"]) {
    Font.register({
      family,
      fonts: [
        { src: resolve(`${family}-Regular.ttf`) },
        { src: resolve(`${family}-Bold.ttf`), fontWeight: 700 },
        { src: resolve(`${family}-Italic.ttf`), fontStyle: "italic" },
        { src: resolve(`${family}-BoldItalic.ttf`), fontWeight: 700, fontStyle: "italic" },
      ],
    });
  }
  Font.register({ family: "NotoSansArabic", fonts: [
    { src: resolve("NotoSansArabic.ttf") },
    { src: resolve("NotoSansArabic.ttf"), fontWeight: 700 },
    { src: resolve("NotoSansArabic.ttf"), fontStyle: "italic" },
    { src: resolve("NotoSansArabic.ttf"), fontWeight: 700, fontStyle: "italic" },
  ] });
  // The editor never hyphenates; keep words whole (react-pdf hyphenates by default).
  Font.registerHyphenationCallback((word) => [word]);
}

/** Map a CSS font-family list (e.g. "'Courier New', monospace") to one of the
 *  embedded families using its generic fallback category. */
function mapFontFamily(value: string | undefined | null): string {
  if (!value) return "Carlito";
  const parts = String(value)
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, "").toLowerCase())
    .filter(Boolean);
  const generic = parts[parts.length - 1] || "";
  if (parts[0] === "calibri" || parts[0] === "carlito") return "Carlito";
  if (generic === "monospace") return "LiberationMono";
  if (generic === "serif") return "LiberationSerif";
  if (generic === "sans-serif" || generic === "cursive" || generic === "fantasy") return "LiberationSans";
  // No generic fallback given — guess from the first concrete name.
  const first = parts[0] || "";
  if (/courier|mono|consolas|menlo/.test(first)) return "LiberationMono";
  if (/times|georgia|garamond|book|palatino/.test(first)) return "LiberationSerif";
  return "LiberationSans";
}

/* ── mark reading (mirrors doc-export.ts readMarks) ────────────────────── */

function cssColor(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const v = String(value).trim();
  if (v.startsWith("#")) return v;
  const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    return "#" + [m[1], m[2], m[3]]
      .map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0"))
      .join("");
  }
  return undefined;
}

/** "12pt" → 12, "16px" → 12. Returns undefined when unparseable. */
function fontSizePt(value: string | undefined | null): number | undefined {
  if (!value) return undefined;
  const n = Number.parseFloat(String(value));
  if (Number.isNaN(n) || n <= 0) return undefined;
  if (String(value).includes("px")) return n * PX_TO_PT;
  return n; // pt (the editor's font-size mark uses pt)
}

type MarkProps = {
  bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean;
  color?: string; bg?: string; size?: number; family?: string;
  superScript?: boolean; subScript?: boolean; link?: string;
};

function readMarks(marks: readonly Mark[]): MarkProps {
  const p: MarkProps = {};
  for (const m of marks) {
    switch (m.type.name) {
      case "strong": p.bold = true; break;
      case "em": p.italic = true; break;
      case "underline": p.underline = true; break;
      case "strikethrough": p.strike = true; break;
      case "superscript": p.superScript = true; break;
      case "subscript": p.subScript = true; break;
      case "textColor": p.color = cssColor(m.attrs.color); break;
      case "bgColor": p.bg = cssColor(m.attrs.color); break;
      case "fontSize": p.size = fontSizePt(m.attrs.size); break;
      case "fontFamily": p.family = mapFontFamily(m.attrs.family); break;
      case "link": p.link = String(m.attrs.href || ""); break;
    }
  }
  return p;
}

function spanStyle(p: MarkProps): Style {
  const s: Style = {};
  if (p.bold) s.fontWeight = 700;
  if (p.italic) s.fontStyle = "italic";
  if (p.underline && p.strike) s.textDecoration = "underline line-through";
  else if (p.underline) s.textDecoration = "underline";
  else if (p.strike) s.textDecoration = "line-through";
  if (p.color) s.color = p.color;
  if (p.bg) s.backgroundColor = p.bg;
  if (p.size) s.fontSize = p.size;
  if (p.family) s.fontFamily = p.family;
  if (p.superScript || p.subScript) {
    // Match sup/sub rendering: smaller type shifted off the baseline.
    s.fontSize = (p.size ?? BASE_FONT_PT) * 0.65;
    s.verticalAlign = p.superScript ? "super" : "sub";
  }
  return s;
}

/* ── conversion ─────────────────────────────────────────────────────────── */

type Align = "left" | "center" | "right" | "justify";

function blockAlign(node: PMNode): Align {
  return resolvedAlignment(node.attrs.textAlign, node.textContent);
}

class PdfBuilder {
  private key = 0;
  /** Set by a page_break node; the next rendered block starts a new page. */
  private pendingBreak = false;

  constructor(private contentWidthPt: number, private contentHeightPt: number, private running = false, private field?: (kind: string, page: { pageNumber: number; totalPages: number; subPageNumber: number }) => string) {}

  private k(): string { return `n${this.key++}`; }

  /* inline content of a textblock → Text spans; block-level images are
     flushed out separately (the editor renders images display:block). */
  private inlineContent(node: PMNode, blockStyle: Style): React.ReactElement[] {
    const out: React.ReactElement[] = [];
    let spans: React.ReactElement[] = [];

    const flush = () => {
      if (!spans.length) return;
      out.push(<Text key={this.k()} style={blockStyle}>{spans}</Text>);
      spans = [];
    };

    node.forEach((child) => {
      if (child.isText) {
        const p = readMarks(child.marks);
        const style = spanStyle(p);
        style.direction = textDirection(node.textContent);
        if (/[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/u.test(child.text || "")) style.fontFamily = "NotoSansArabic";
        const el = <Text key={this.k()} style={style}>{child.text || ""}</Text>;
        spans.push(p.link
          ? <Link key={this.k()} src={p.link} style={{ color: "#2563eb", textDecoration: "underline" }}>{el}</Link>
          : el);
      } else if (child.type.name === "doc_field") {
        spans.push(<Text key={this.k()} style={spanStyle(readMarks(child.marks))} render={props => child.attrs.kind === "OTHER" ? child.attrs.cached || "" : this.field?.(child.attrs.kind, props) || ""} />);
      } else if (child.type.name === "hard_break") {
        spans.push(<Text key={this.k()}>{"\n"}</Text>);
      } else if (child.type.name === "image") {
        flush();
        out.push(this.imageElement(child));
      }
    });
    flush();

    if (!out.length) {
      // An empty Text collapses to zero height; a NBSP keeps the line box.
      out.push(<Text key={this.k()} style={blockStyle}>{" "}</Text>);
    }
    return out;
  }

  private imageElement(node: PMNode): React.ReactElement {
    const a = node.attrs;
    const raw = String(a.width || "100%");
    let width = this.contentWidthPt;
    if (raw.endsWith("%")) {
      const pct = Number.parseFloat(raw);
      if (!Number.isNaN(pct) && pct > 0) width = (Math.min(pct, 100) / 100) * this.contentWidthPt;
    } else if (raw.endsWith("px")) {
      const px = Number.parseFloat(raw);
      if (!Number.isNaN(px) && px > 0) width = Math.min(px * PX_TO_PT, this.contentWidthPt);
    }
    const transforms: string[] = [];
    const rotate = Number(a.rotate || 0);
    if (rotate) transforms.push(`rotate(${rotate}deg)`);
    if (a.flipX) transforms.push("scaleX(-1)");
    if (a.flipY) transforms.push("scaleY(-1)");
    // Cap the height so a tall image scales down instead of overflowing the
    // page (react-pdf can't split an image across pages).
    const imgStyle: Style = {
      width,
      // Leave room for the wrapper's bottom margin so a full-height image
      // still fits on one page.
      maxHeight: this.contentHeightPt - 0.5 * BASE_FONT_PT,
      objectFit: "contain",
      ...(a.aspectRatio ? { height: width / Number(a.aspectRatio) } : {}),
    };
    if (transforms.length) imgStyle.transform = transforms.join(" ");

    const align = String(a.align || "left");
    const alignItems = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
    if (align === "justify") imgStyle.width = this.contentWidthPt;
    return (
      <View key={this.k()} style={{ alignItems, marginBottom: this.running ? 0 : 0.5 * BASE_FONT_PT }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={String(a.src || "")} style={imgStyle} />
      </View>
    );
  }

  /* paragraph/heading base style from node attrs (matches editor CSS). */
  private textblockStyle(node: PMNode, fontSize: number): Style {
    const lh = node.attrs.lineHeight ? Number.parseFloat(String(node.attrs.lineHeight)) : NaN;
    const indent = Number(node.attrs.indent || 0);
    const s: Style = {
      fontFamily: "Carlito",
      fontSize,
      lineHeight: !Number.isNaN(lh) && lh > 0 ? lh : this.running ? 1.2 : BASE_LINE_HEIGHT,
      textAlign: blockAlign(node),
      direction: textDirection(node.textContent),
    };
    if (indent > 0) {
      if (textDirection(node.textContent) === "rtl") s.marginRight = indent * INDENT_STEP_PT;
      else s.marginLeft = indent * INDENT_STEP_PT;
    }
    return s;
  }

  private paragraph(node: PMNode, extra: Style = {}): React.ReactElement[] {
    // .pm-page p { margin: 0 0 0.5em 0 }
    const style: Style = { ...this.textblockStyle(node, this.running ? 11 : BASE_FONT_PT), marginBottom: this.running ? 0 : 0.5 * BASE_FONT_PT, ...extra };
    return this.inlineContent(node, style);
  }

  private heading(node: PMNode): React.ReactElement[] {
    // h1 2em / h2 1.5em / h3 1.17em / h4+ 1em, bold, margin 0.5em 0.
    const level = Math.max(1, Math.min(6, Number(node.attrs.level || 1)));
    const em = [2, 1.5, 1.17, 1, 1, 1][level - 1];
    const size = em * BASE_FONT_PT;
    const style: Style = {
      ...this.textblockStyle(node, size),
      fontWeight: 700,
      marginTop: 0.5 * size,
      marginBottom: 0.5 * size,
    };
    return this.inlineContent(node, style);
  }

  private list(node: PMNode, ordered: boolean, depth: number): React.ReactElement[] {
    const out: React.ReactElement[] = [];
    // ul/ol { padding-left: 2em; margin: 0.5em 0 } with hanging markers.
    const gutter = 2 * BASE_FONT_PT;
    let n = Number(node.attrs?.order || 1);
    node.forEach((item) => {
      const marker = ordered ? `${n++}.` : depth > 0 ? "▪" : "•";
      let firstPara = true;
      item.forEach((block) => {
        const name = block.type.name;
        if (name === "bullet_list" || name === "ordered_list") {
          out.push(
            <View key={this.k()} style={{ marginLeft: gutter }}>
              {this.list(block, name === "ordered_list", depth + 1)}
            </View>
          );
        } else if (name === "paragraph") {
          const label = firstPara ? marker : "";
          firstPara = false;
          out.push(
            <View key={this.k()} style={{ flexDirection: "row" }}>
              <Text style={{
                width: gutter,
                paddingRight: 0.35 * BASE_FONT_PT,
                textAlign: "right",
                fontSize: BASE_FONT_PT,
                lineHeight: BASE_LINE_HEIGHT,
                fontWeight: ordered ? 700 : 400, // ol markers are bold in the editor CSS
              }}>{label}</Text>
              <View style={{ flex: 1 }}>{this.paragraph(block)}</View>
            </View>
          );
        } else {
          out.push(
            <View key={this.k()} style={{ marginLeft: gutter }}>
              {this.block(block)}
            </View>
          );
        }
      });
    });
    if (depth === 0) {
      return [
        <View key={this.k()} style={{ marginTop: 0.5 * BASE_FONT_PT, marginBottom: 0.5 * BASE_FONT_PT }}>
          {out}
        </View>,
      ];
    }
    return out;
  }

  private table(table: PMNode): React.ReactElement {
    // Column widths: honor colwidth (px) proportionally when present.
    const colWidths: number[] = [];
    const firstRow = table.firstChild;
    if (firstRow) {
      firstRow.forEach((cell) => {
        const span = Number(cell.attrs.colspan || 1);
        const cw = cell.attrs.colwidth as number[] | null;
        for (let i = 0; i < span; i++) colWidths.push(cw && cw[i] ? Number(cw[i]) : 0);
      });
    }
    const known = colWidths.filter((w) => w > 0);
    const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
    const weights = colWidths.map((w) => (w > 0 ? w : avg));
    const total = weights.reduce((a, b) => a + b, 0) || 1;

    const rowCount = table.childCount;
    const rows: React.ReactElement[] = [];
    table.forEach((row, _offset, rowIndex) => {
      const cells: React.ReactElement[] = [];
      let colIndex = 0;
      row.forEach((cell, _o, cellIndex) => {
        const isHeader = cell.type.name === "table_header";
        const span = Number(cell.attrs.colspan || 1);
        let weight = 0;
        for (let i = 0; i < span; i++) weight += weights[colIndex + i] ?? avg;
        colIndex += span;
        const content: React.ReactElement[] = [];
        cell.forEach((block) => content.push(...this.block(block)));
        // border-collapse: draw top/left on every cell, right/bottom on edges.
        const cellStyle: Style = {
          flexGrow: weight / total,
          flexBasis: 0,
          borderTopWidth: PX_TO_PT,
          borderLeftWidth: PX_TO_PT,
          borderColor: "#bbb",
          borderStyle: "solid",
          paddingTop: 6 * PX_TO_PT,
          paddingBottom: 6 * PX_TO_PT,
          paddingLeft: 10 * PX_TO_PT,
          paddingRight: 10 * PX_TO_PT,
        };
        if (cellIndex === row.childCount - 1) cellStyle.borderRightWidth = PX_TO_PT;
        if (rowIndex === rowCount - 1) cellStyle.borderBottomWidth = PX_TO_PT;
        if (isHeader) {
          cellStyle.backgroundColor = "#f0f0f0";
          cellStyle.fontWeight = 700;
        }
        cells.push(<View key={this.k()} style={cellStyle}>{content}</View>);
      });
      rows.push(<View key={this.k()} wrap={false} style={{ flexDirection: "row" }}>{cells}</View>);
    });
    return (
      <View key={this.k()} style={{ width: "100%", marginTop: 0.5 * BASE_FONT_PT, marginBottom: 0.5 * BASE_FONT_PT }}>
        {rows}
      </View>
    );
  }

  block(node: PMNode): React.ReactElement[] {
    const name = node.type.name;
    if (name === "paragraph") return this.paragraph(node);
    if (name === "heading") return this.heading(node);
    if (name === "bullet_list") return this.list(node, false, 0);
    if (name === "ordered_list") return this.list(node, true, 0);
    if (name === "table") return [this.table(node)];
    if (name === "blockquote") {
      // blockquote { border-left: 3px solid #ccc; padding-left: 1em; color: #555 }
      const inner: React.ReactElement[] = [];
      node.forEach((child) => inner.push(...this.block(child)));
      return [
        <View key={this.k()} style={{
          borderLeftWidth: 3 * PX_TO_PT,
          borderLeftColor: "#ccc",
          borderLeftStyle: "solid",
          paddingLeft: BASE_FONT_PT,
          color: "#555",
        }}>{inner}</View>,
      ];
    }
    if (name === "code_block") {
      // pre { background: #f4f4f4; padding: 1em; border-radius: 4px } + Courier
      return [
        <View key={this.k()} style={{
          backgroundColor: "#f4f4f4",
          padding: BASE_FONT_PT,
          borderRadius: 3,
          marginBottom: 0.5 * BASE_FONT_PT,
        }}>
          <Text style={{ fontFamily: "LiberationMono", fontSize: BASE_FONT_PT, lineHeight: BASE_LINE_HEIGHT }}>
            {node.textContent || " "}
          </Text>
        </View>,
      ];
    }
    if (name === "horizontal_rule") {
      // hr { border-top: 1px solid #c4c4c4; margin: 10px 0 }
      return [
        <View key={this.k()} style={{
          borderTopWidth: PX_TO_PT,
          borderTopColor: "#c4c4c4",
          borderTopStyle: "solid",
          marginTop: 10 * PX_TO_PT,
          marginBottom: 10 * PX_TO_PT,
        }} />,
      ];
    }
    if (name === "page_break") {
      this.pendingBreak = true;
      return [];
    }
    // Unknown block: flatten to text so nothing is silently lost.
    const text = node.textContent;
    return text
      ? [<Text key={this.k()} style={{ fontSize: BASE_FONT_PT, lineHeight: BASE_LINE_HEIGHT, marginBottom: 0.5 * BASE_FONT_PT }}>{text}</Text>]
      : [];
  }

  /** Top level: applies pending page breaks to the following block. */
  body(doc: PMNode): React.ReactElement[] {
    const out: React.ReactElement[] = [];
    doc.forEach((block) => {
      const els = this.block(block);
      if (!els.length) return;
      if (this.pendingBreak) {
        this.pendingBreak = false;
        out.push(<View key={this.k()} break>{els}</View>);
      } else {
        out.push(...els);
      }
    });
    return out;
  }
}

/* ── public API ─────────────────────────────────────────────────────────── */

export type PdfExportOptions = {
  title: string;
  orientation: "portrait" | "landscape";
  marginCm: number;
  headerFooter: boolean;
  /** Where the page number goes, or "off". */
  pageNumbers?: "off" | "bottom" | "top";
  pageNumberFormat?: "plain" | "of";
};

type PdfPageContext = { pageNumber: number; subPageNumber: number; totalPages?: number };

/** Document geometry belongs to the file, including inactive-file exports. */
function pdfLayout(doc: PMNode, opts: PdfExportOptions): PMNode {
  if (doc.attrs.layout) return doc;
  const layout = defaultDocumentLayout();
  if (opts.orientation === "landscape") [layout.width, layout.height] = [layout.height, layout.width];
  const margin = opts.marginCm * CM_TO_PT * 20;
  layout.margins = { top: margin, bottom: margin, left: margin, right: margin };
  layout.pageNumbers = opts.pageNumbers; layout.pageNumberFormat = opts.pageNumberFormat;
  layout.overrides = { pageNumbers: true };
  return doc.type.create({ ...doc.attrs, layout }, doc.content);
}

export function buildPdfDocument(source: PMNode, opts: PdfExportOptions, original: RunningSlots = {}): React.ReactElement<DocumentProps> {
  const doc = pdfLayout(source, opts), layout = doc.attrs.layout as DocumentLayout;
  const sections = documentSections(doc);
  const even = layout.evenAndOddHeaders || Object.keys(layout.running || {}).some(key => key.includes(":even:"));
  // react-pdf resolves final dynamic nodes in page order. Record each section's
  // physical start only in that final pass, after wrapping has determined it.
  const starts = new Map<number, number>();
  function logicalPage(index: number, props: PdfPageContext) {
    if (props.subPageNumber) starts.set(index, props.pageNumber - props.subPageNumber + 1);
    for (let previous = index; previous >= 0; previous--) {
      const start = sections[previous].geometry.numberStart;
      if (start !== undefined) return props.pageNumber - (starts.get(previous) ?? props.pageNumber) + start;
    }
    return props.pageNumber + (layout.numberingStyle?.start ?? 1) - 1;
  }
  function running(index: number, kind: "header" | "footer", g: PageGeometry) {
    const width = (g.width - g.margins.left - g.margins.right) / 20;
    const slotDocs = Object.fromEntries((["default", "first", "even"] as const).map(variant => {
      const slot = runningSlot(original, layout, index, variant, kind);
      return [variant, PMParser.fromSchema(mySchema).parse(new DOMParser().parseFromString(slot.html, "text/html").body)];
    })) as Record<RunningVariant, PMNode>;
    return <View key={kind} fixed style={{ position: "absolute", left: g.margins.left / 20, width,
      ...(kind === "header" ? { top: (g.headerDistance ?? 283) / 20 } : { bottom: (g.footerDistance ?? 283) / 20 }), fontSize: 11, lineHeight: 1.2 }} render={props => {
      const page = logicalPage(index, props);
      const variant: RunningVariant = g.differentFirst && (props.subPageNumber || 1) === 1 ? "first" : even && page % 2 === 0 ? "even" : "default";
      const builder = new PdfBuilder(width, g.height / 20, true, (field, context) => field === "NUMPAGES" ? String(context.totalPages || 1) : numberLabel(logicalPage(index, context), context.totalPages || 1, "plain", { start: 1, alignment: "right", template: "{{PAGE}}", format: g.numberFormat || layout.numberingStyle?.format || "decimal", hideFirst: false }));
      return builder.body(slotDocs[variant]);
    }} />;
  }
  const date = new Date().toLocaleDateString();
  return <Document title={opts.title}>{sections.map((section, index) => {
    const g = section.geometry, margin = g.margins;
    const nodes: PMNode[] = [];
    doc.forEach((node, position) => { if (position >= section.from && position < section.to) nodes.push(node); });
    const content = doc.type.create(null, nodes);
    const builder = new PdfBuilder((g.width - margin.left - margin.right) / 20, (g.height - margin.top - margin.bottom) / 20);
    const children = builder.body(content);
    const credit: Style = { position: "absolute", left: margin.left / 20, right: margin.right / 20, flexDirection: "row", justifyContent: "space-between", fontSize: 9, color: "#777" };
    return <Page key={index} size={[g.width / 20, g.height / 20]} style={{ paddingTop: margin.top / 20, paddingBottom: margin.bottom / 20, paddingLeft: margin.left / 20, paddingRight: margin.right / 20, fontFamily: "Carlito", fontSize: BASE_FONT_PT, lineHeight: BASE_LINE_HEIGHT, color: "#000" }}>
      {running(index, "header", g)}
      {children.length ? children : <Text>{" "}</Text>}
      {running(index, "footer", g)}
      {opts.headerFooter && <View fixed style={{ ...credit, top: 3 }}><Text>{opts.title || "Untitled document"}</Text><Text>{date}</Text></View>}
      {opts.headerFooter && <View fixed style={{ ...credit, bottom: 3 }}><Text>EDTRpad</Text><Text>wordpad.info</Text></View>}
    </Page>;
  })}</Document>;
}

export async function docToPdfBlob(doc: PMNode, opts: PdfExportOptions): Promise<Blob> {
  registerPdfFonts((file) => `${location.origin}/pdf-fonts/${file}`);
  const { readRunningSource } = await import("./header-footer-source");
  return pdf(buildPdfDocument(doc, opts, await readRunningSource(doc))).toBlob();
}
