// Client-side PDF exporter: ProseMirror doc → .pdf via @react-pdf/renderer.
// Loaded on demand via dynamic import so the (heavy) renderer stays out of the
// main bundle. Mirrors the on-screen document: A4 geometry, current
// orientation/margins, and the editor CSS (globals.css .pm-page rules).
import React from "react";
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
const A4_PORTRAIT_WIDTH_PT = 595.28;
const A4_LANDSCAPE_WIDTH_PT = 841.89;

/* ── fonts ──────────────────────────────────────────────────────────────────
   The 14 built-in PDF fonts are WinAnsi-encoded and cannot render Turkish
   (ğ ş İ ı …), so we embed the metric-compatible Liberation family:
   LiberationSans≈Arial, LiberationSerif≈Times New Roman,
   LiberationMono≈Courier New. Files live in public/pdf-fonts/. */
export type PdfFontResolver = (file: string) => string;

let fontsRegistered = false;

/** Register the Liberation families. `resolve` maps a TTF filename to a URL
 *  (browser) or filesystem path (Node tests). Idempotent. */
export function registerPdfFonts(resolve: PdfFontResolver): void {
  if (fontsRegistered) return;
  fontsRegistered = true;
  for (const family of ["LiberationSans", "LiberationSerif", "LiberationMono"]) {
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
  // The editor never hyphenates; keep words whole (react-pdf hyphenates by default).
  Font.registerHyphenationCallback((word) => [word]);
}

/** Map a CSS font-family list (e.g. "'Courier New', monospace") to one of the
 *  embedded families using its generic fallback category. */
function mapFontFamily(value: string | undefined | null): string {
  if (!value) return "LiberationSans";
  const parts = String(value)
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, "").toLowerCase())
    .filter(Boolean);
  const generic = parts[parts.length - 1] || "";
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
  const v = String(node.attrs.textAlign || "left");
  return (v === "center" || v === "right" || v === "justify" ? v : "left") as Align;
}

class PdfBuilder {
  private key = 0;
  /** Set by a page_break node; the next rendered block starts a new page. */
  private pendingBreak = false;

  constructor(private contentWidthPt: number) {}

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
        const el = <Text key={this.k()} style={spanStyle(p)}>{child.text || ""}</Text>;
        spans.push(p.link
          ? <Link key={this.k()} src={p.link} style={{ color: "#2563eb", textDecoration: "underline" }}>{el}</Link>
          : el);
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
    const imgStyle: Style = { width };
    if (transforms.length) imgStyle.transform = transforms.join(" ");

    const align = String(a.align || "left");
    const alignItems = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
    if (align === "justify") imgStyle.width = this.contentWidthPt;
    return (
      <View key={this.k()} style={{ alignItems, marginBottom: 0.5 * BASE_FONT_PT }}>
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
      fontSize,
      lineHeight: !Number.isNaN(lh) && lh > 0 ? lh : BASE_LINE_HEIGHT,
      textAlign: blockAlign(node),
    };
    if (indent > 0) s.marginLeft = indent * INDENT_STEP_PT;
    return s;
  }

  private paragraph(node: PMNode, extra: Style = {}): React.ReactElement[] {
    // .pm-page p { margin: 0 0 0.5em 0 }
    const style: Style = { ...this.textblockStyle(node, BASE_FONT_PT), marginBottom: 0.5 * BASE_FONT_PT, ...extra };
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
};

export function buildPdfDocument(doc: PMNode, opts: PdfExportOptions): React.ReactElement<DocumentProps> {
  const marginPt = opts.marginCm * CM_TO_PT;
  const pageWidthPt = opts.orientation === "landscape" ? A4_LANDSCAPE_WIDTH_PT : A4_PORTRAIT_WIDTH_PT;
  const contentWidthPt = pageWidthPt - 2 * marginPt;
  const builder = new PdfBuilder(contentWidthPt);
  const children = builder.body(doc);

  // Header/footer sit inside the margin band ~0.15cm from the paper edge
  // (mirrors the print CSS: top: -(margin − 0.15)cm from the content box).
  const edgeOffsetPt = Math.min(opts.marginCm, 0.15) * CM_TO_PT;
  const hfStyle: Style = {
    position: "absolute",
    left: marginPt,
    right: marginPt,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 9,
    color: "#777",
    fontFamily: "LiberationSans",
  };

  return (
    <Document title={opts.title}>
      <Page
        size="A4"
        orientation={opts.orientation}
        style={{
          padding: marginPt,
          fontFamily: "LiberationSans",
          fontSize: BASE_FONT_PT,
          lineHeight: BASE_LINE_HEIGHT,
          color: "#000",
        }}
      >
        {opts.headerFooter && (
          <View fixed style={{ ...hfStyle, top: edgeOffsetPt }}>
            <Text>{opts.title || "Untitled document"}</Text>
            <Text>{new Date().toLocaleDateString()}</Text>
          </View>
        )}
        {children.length ? children : <Text>{" "}</Text>}
        {opts.headerFooter && (
          <View fixed style={{ ...hfStyle, bottom: edgeOffsetPt }}>
            <Text>EDTRpad</Text>
            <Text>wordpad.info</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}

export async function docToPdfBlob(doc: PMNode, opts: PdfExportOptions): Promise<Blob> {
  registerPdfFonts((file) => `${location.origin}/pdf-fonts/${file}`);
  return pdf(buildPdfDocument(doc, opts)).toBlob();
}
