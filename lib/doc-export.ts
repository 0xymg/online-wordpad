// Client-side document exporters: ProseMirror doc → .docx (formatted) and .rtf.
// Loaded on demand via dynamic import so the docx library stays out of the main bundle.
import type { Node as PMNode, Mark } from "prosemirror-model";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ImageRun, ExternalHyperlink,
  LevelFormat, ShadingType, BorderStyle, PageBreak, PageOrientation,
  type FileChild, type ParagraphChild, type INumberingOptions,
} from "docx";

/* ── shared helpers ─────────────────────────────────────────────────────── */

function colorToHex(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (v.startsWith("#")) {
    const hex = v.slice(1);
    if (hex.length === 3) return hex.split("").map((c) => c + c).join("").toUpperCase();
    if (hex.length >= 6) return hex.slice(0, 6).toUpperCase();
    return undefined;
  }
  const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    return [m[1], m[2], m[3]]
      .map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0"))
      .join("").toUpperCase();
  }
  return undefined;
}

function firstFontFamily(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const first = value.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "");
  return first || undefined;
}

function fontSizeHalfPoints(value: string | undefined | null): number | undefined {
  if (!value) return undefined;
  const n = Number.parseFloat(String(value));
  if (Number.isNaN(n) || n <= 0) return undefined;
  if (String(value).includes("px")) return Math.round((n * 72) / 96) * 2;
  return Math.round(n * 2); // pt
}

type MarkProps = {
  bold?: boolean; italics?: boolean; underline?: boolean; strike?: boolean;
  color?: string; size?: number; font?: string; highlight?: string;
  superScript?: boolean; subScript?: boolean; link?: string;
};

function readMarks(marks: readonly Mark[]): MarkProps {
  const p: MarkProps = {};
  for (const m of marks) {
    switch (m.type.name) {
      case "strong": p.bold = true; break;
      case "em": p.italics = true; break;
      case "underline": p.underline = true; break;
      case "strikethrough": p.strike = true; break;
      case "superscript": p.superScript = true; break;
      case "subscript": p.subScript = true; break;
      case "textColor": p.color = colorToHex(m.attrs.color); break;
      case "bgColor": p.highlight = colorToHex(m.attrs.color); break;
      case "fontSize": p.size = fontSizeHalfPoints(m.attrs.size); break;
      case "fontFamily": p.font = firstFontFamily(m.attrs.family); break;
      case "link": p.link = String(m.attrs.href || ""); break;
    }
  }
  return p;
}

const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

/* ── image preloading ───────────────────────────────────────────────────── */

type LoadedImage = { data: Uint8Array; type: "png" | "jpg" | "gif" | "bmp"; width: number; height: number };

function imageTypeFromMime(mime: string): LoadedImage["type"] {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("bmp")) return "bmp";
  return "png";
}

async function loadImage(src: string): Promise<LoadedImage | null> {
  try {
    let blob: Blob;
    if (src.startsWith("data:")) {
      const res = await fetch(src);
      blob = await res.blob();
    } else {
      const res = await fetch(src, { mode: "cors" });
      if (!res.ok) return null;
      blob = await res.blob();
    }
    const bitmap = await createImageBitmap(blob);
    const data = new Uint8Array(await blob.arrayBuffer());
    const img = {
      data,
      type: imageTypeFromMime(blob.type),
      width: bitmap.width,
      height: bitmap.height,
    };
    bitmap.close();
    return img;
  } catch {
    return null;
  }
}

/** Preload every image in document order so conversion can stay synchronous. */
async function preloadImages(doc: PMNode): Promise<Array<LoadedImage | null>> {
  const srcs: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === "image") srcs.push(String(node.attrs.src || ""));
    return true;
  });
  return Promise.all(srcs.map(loadImage));
}

/* ── DOCX conversion ────────────────────────────────────────────────────── */

const MAX_IMAGE_WIDTH = 600; // px inside an A4 text column

class DocxBuilder {
  private imageQueue: Array<LoadedImage | null>;
  numbering: INumberingOptions["config"][number][] = [];

  constructor(images: Array<LoadedImage | null>) {
    this.imageQueue = [...images];
  }

  inlineChildren(node: PMNode): ParagraphChild[] {
    const out: ParagraphChild[] = [];
    node.forEach((child) => {
      if (child.isText) {
        const p = readMarks(child.marks);
        const run = new TextRun({
          text: child.text || "",
          bold: p.bold,
          italics: p.italics,
          underline: p.underline ? {} : undefined,
          strike: p.strike,
          color: p.color,
          size: p.size,
          font: p.font,
          superScript: p.superScript,
          subScript: p.subScript,
          shading: p.highlight
            ? { type: ShadingType.CLEAR, fill: p.highlight }
            : undefined,
          style: p.link ? "Hyperlink" : undefined,
        });
        if (p.link) {
          out.push(new ExternalHyperlink({ children: [run], link: p.link }));
        } else {
          out.push(run);
        }
      } else if (child.type.name === "image") {
        const img = this.imageQueue.shift() ?? null;
        if (img) {
          const attrWidth = String(child.attrs.width || "");
          let width = img.width;
          if (attrWidth.endsWith("px")) width = Number.parseFloat(attrWidth) || img.width;
          width = Math.min(width, MAX_IMAGE_WIDTH);
          const height = Math.round((width / img.width) * img.height);
          out.push(new ImageRun({
            type: img.type,
            data: img.data,
            transformation: { width, height },
          }));
        } else {
          out.push(new TextRun({ text: "[image]", italics: true, color: "888888" }));
        }
      } else if (child.type.name === "hard_break") {
        out.push(new TextRun({ break: 1 }));
      }
    });
    return out;
  }

  private paragraphOpts(node: PMNode) {
    const align = ALIGN[String(node.attrs.textAlign || "left")];
    const indent = Number(node.attrs.indent || 0);
    const lh = node.attrs.lineHeight ? Number.parseFloat(String(node.attrs.lineHeight)) : NaN;
    return {
      alignment: align !== AlignmentType.LEFT ? align : undefined,
      indent: indent > 0 ? { left: indent * 360 } : undefined,
      spacing: !Number.isNaN(lh) && lh > 0 ? { line: Math.round(lh * 240) } : undefined,
    };
  }

  private listItems(
    list: PMNode,
    depth: number,
    numberRef: string | null
  ): FileChild[] {
    const out: FileChild[] = [];
    list.forEach((item) => {
      // Only the first paragraph of a list item carries the bullet/number;
      // follow-up paragraphs are indented to match.
      let firstPara = true;
      item.forEach((block) => {
        if (block.type.name === "bullet_list") {
          out.push(...this.listItems(block, depth + 1, null));
        } else if (block.type.name === "ordered_list") {
          out.push(...this.listItems(block, depth + 1, this.newNumberRef()));
        } else if (block.type.name === "paragraph") {
          const marker = firstPara
            ? (numberRef
                ? { numbering: { reference: numberRef, level: Math.min(depth, 8) } }
                : { bullet: { level: Math.min(depth, 8) } })
            : { indent: { left: 720 * (depth + 1) } };
          firstPara = false;
          out.push(new Paragraph({
            children: this.inlineChildren(block),
            ...this.paragraphOpts(block),
            ...marker,
          }));
        } else {
          out.push(...this.blockToDocx(block));
        }
      });
    });
    return out;
  }

  private newNumberRef(): string {
    const ref = `ol-${this.numbering.length}`;
    this.numbering.push({
      reference: ref,
      levels: Array.from({ length: 9 }, (_, level) => ({
        level,
        format: LevelFormat.DECIMAL,
        text: `%${level + 1}.`,
        alignment: AlignmentType.START,
        style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
      })),
    });
    return ref;
  }

  blockToDocx(node: PMNode): FileChild[] {
    const name = node.type.name;
    if (name === "paragraph") {
      return [new Paragraph({ children: this.inlineChildren(node), ...this.paragraphOpts(node) })];
    }
    if (name === "heading") {
      const level = Math.max(1, Math.min(6, Number(node.attrs.level || 1)));
      const headings = [
        HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
        HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6,
      ];
      return [new Paragraph({
        children: this.inlineChildren(node),
        heading: headings[level - 1],
        ...this.paragraphOpts(node),
      })];
    }
    if (name === "blockquote") {
      return this.quoted(node);
    }
    if (name === "code_block") {
      const lines = (node.textContent || "").split("\n");
      return lines.map((line) => new Paragraph({
        children: [new TextRun({ text: line, font: "Courier New", size: 20 })],
        shading: { type: ShadingType.CLEAR, fill: "F3F4F6" },
        spacing: { after: 0 },
      }));
    }
    if (name === "bullet_list") return this.listItems(node, 0, null);
    if (name === "ordered_list") return this.listItems(node, 0, this.newNumberRef());
    if (name === "table") return [this.tableToDocx(node)];
    if (name === "horizontal_rule") {
      return [new Paragraph({
        children: [],
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 1 } },
      })];
    }
    if (name === "page_break") {
      return [new Paragraph({ children: [new PageBreak()] })];
    }
    // Unknown block: flatten to a text paragraph so nothing is silently lost.
    const text = node.textContent;
    return text ? [new Paragraph({ children: [new TextRun(text)] })] : [];
  }

  private quoted(blockquote: PMNode): FileChild[] {
    const out: FileChild[] = [];
    blockquote.forEach((child) => {
      if (child.type.name === "paragraph") {
        out.push(new Paragraph({
          children: this.inlineChildren(child),
          indent: { left: 720 },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: "D1D5DB", space: 8 } },
        }));
      } else {
        out.push(...this.blockToDocx(child));
      }
    });
    return out;
  }

  private tableToDocx(table: PMNode): Table {
    const rows: TableRow[] = [];
    table.forEach((row) => {
      const cells: TableCell[] = [];
      row.forEach((cell) => {
        const isHeader = cell.type.name === "table_header";
        const content: FileChild[] = [];
        cell.forEach((block) => content.push(...this.blockToDocx(block)));
        cells.push(new TableCell({
          children: content.length ? content : [new Paragraph("")],
          shading: isHeader ? { type: ShadingType.CLEAR, fill: "F3F4F6" } : undefined,
        }));
      });
      rows.push(new TableRow({ children: cells }));
    });
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
  }
}

export async function docToDocxBlob(
  doc: PMNode,
  title: string,
  orientation: "portrait" | "landscape" = "portrait"
): Promise<Blob> {
  const images = await preloadImages(doc);
  const builder = new DocxBuilder(images);
  const children: FileChild[] = [];
  doc.forEach((block) => children.push(...builder.blockToDocx(block)));
  // A4 portrait in twips (11906×16838) — docx.js swaps the two itself when
  // orientation is LANDSCAPE, so always pass the portrait dimensions.
  const file = new Document({
    title,
    numbering: { config: builder.numbering },
    styles: {
      default: {
        document: { run: { font: "Arial", size: 24 } },
      },
    },
    sections: [{
      properties: {
        page: {
          size: {
            width: 11906,
            height: 16838,
            orientation: orientation === "landscape" ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
          },
        },
      },
      children: children.length ? children : [new Paragraph("")],
    }],
  });
  return Packer.toBlob(file);
}

/* ── RTF conversion ─────────────────────────────────────────────────────── */

// RTF \u takes a SIGNED 16-bit value; code points above 0x7FFF must wrap negative,
// and astral characters are written as a UTF-16 surrogate pair.
function rtfUnit(code: number): string {
  const signed = code > 0x7fff ? code - 0x10000 : code;
  return `\\u${signed}?`;
}

function rtfEscape(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch === "\\" || ch === "{" || ch === "}") out += "\\" + ch;
    else if (code < 128) out += ch;
    else if (code <= 0xffff) out += rtfUnit(code);
    else {
      const v = code - 0x10000;
      out += rtfUnit(0xd800 + (v >> 10)) + rtfUnit(0xdc00 + (v & 0x3ff));
    }
  }
  return out;
}

class RtfBuilder {
  private colors: string[] = [];
  private fonts: string[] = ["Arial", "Courier New"];
  body = "";

  private colorIndex(hex: string | undefined): number {
    if (!hex) return 0;
    const i = this.colors.indexOf(hex);
    if (i >= 0) return i + 1;
    this.colors.push(hex);
    return this.colors.length;
  }

  private fontIndex(family: string | undefined): number {
    if (!family) return 0;
    const i = this.fonts.indexOf(family);
    if (i >= 0) return i;
    this.fonts.push(family);
    return this.fonts.length - 1;
  }

  private inline(node: PMNode): string {
    let out = "";
    node.forEach((child) => {
      if (child.isText) {
        const p = readMarks(child.marks);
        let open = "{";
        if (p.bold) open += "\\b";
        if (p.italics) open += "\\i";
        if (p.underline) open += "\\ul";
        if (p.strike) open += "\\strike";
        if (p.superScript) open += "\\super";
        if (p.subScript) open += "\\sub";
        if (p.color) open += `\\cf${this.colorIndex(p.color)}`;
        if (p.highlight) open += `\\highlight${this.colorIndex(p.highlight)}`;
        if (p.size) open += `\\fs${p.size}`;
        if (p.font) open += `\\f${this.fontIndex(p.font)}`;
        out += `${open} ${rtfEscape(child.text || "")}}`;
      } else if (child.type.name === "image") {
        out += "{\\i [image]}";
      } else if (child.type.name === "hard_break") {
        out += "\\line ";
      }
    });
    return out;
  }

  private paraPrefix(node: PMNode, extra = ""): string {
    const alignMap: Record<string, string> = { left: "\\ql", center: "\\qc", right: "\\qr", justify: "\\qj" };
    const align = alignMap[String(node.attrs.textAlign || "left")] || "\\ql";
    const indent = Number(node.attrs.indent || 0);
    const li = indent > 0 ? `\\li${indent * 360}` : "";
    return `\\pard${align}${li}${extra}\\sa120 `;
  }

  block(node: PMNode, listDepth = 0, listPrefix: (() => string) | null = null): void {
    const name = node.type.name;
    if (name === "paragraph") {
      const prefix = listPrefix ? listPrefix() : "";
      const li = listDepth > 0 ? `\\li${listDepth * 360}` : "";
      this.body += this.paraPrefix(node, li) + prefix + this.inline(node) + "\\par\n";
    } else if (name === "heading") {
      const level = Math.max(1, Math.min(6, Number(node.attrs.level || 1)));
      const sizes = [48, 36, 28, 26, 24, 24];
      this.body += this.paraPrefix(node) + `{\\b\\fs${sizes[level - 1]} ${this.inline(node)}}\\par\n`;
    } else if (name === "blockquote") {
      node.forEach((child) => {
        this.body += "\\pard\\li720\\sa120 ";
        if (child.type.name === "paragraph") this.body += this.inline(child) + "\\par\n";
        else this.block(child);
      });
    } else if (name === "code_block") {
      for (const line of (node.textContent || "").split("\n")) {
        this.body += `\\pard\\sa0{\\f1 ${rtfEscape(line)}}\\par\n`;
      }
    } else if (name === "bullet_list" || name === "ordered_list") {
      let n = Number(node.attrs?.order || 1);
      node.forEach((item) => {
        const prefix = name === "ordered_list"
          ? (() => { const cur = n++; return `${cur}.\\tab `; })
          : () => "\\bullet\\tab ";
        item.forEach((block) => {
          if (block.type.name === "bullet_list" || block.type.name === "ordered_list") {
            this.block(block, listDepth + 1, null);
          } else {
            this.block(block, listDepth + 1, block.type.name === "paragraph" ? prefix : null);
          }
        });
      });
    } else if (name === "table") {
      this.table(node);
    } else if (name === "horizontal_rule") {
      this.body += "\\pard\\brdrb\\brdrs\\brdrw10\\brsp20\\sa120 \\par\n";
    } else if (name === "page_break") {
      this.body += "\\page\n";
    } else if (node.isTextblock) {
      this.body += "\\pard\\sa120 " + this.inline(node) + "\\par\n";
    } else {
      node.forEach((child) => this.block(child));
    }
  }

  private table(table: PMNode): void {
    table.forEach((row) => {
      const cellCount = row.childCount || 1;
      const step = Math.floor(9000 / cellCount);
      let rowDef = "\\trowd\\trgaph108";
      for (let i = 1; i <= cellCount; i++) rowDef += `\\clbrdrt\\brdrs\\clbrdrl\\brdrs\\clbrdrb\\brdrs\\clbrdrr\\brdrs\\cellx${step * i}`;
      this.body += rowDef + "\n";
      row.forEach((cell) => {
        const isHeader = cell.type.name === "table_header";
        let text = "";
        cell.forEach((block) => { text += this.inline(block) + " "; });
        this.body += `\\pard\\intbl ${isHeader ? "{\\b " + text + "}" : text}\\cell\n`;
      });
      this.body += "\\row\n";
    });
    this.body += "\\pard\\sa120 \\par\n";
  }

  toString(): string {
    const fontTbl = this.fonts.map((f, i) => `{\\f${i} ${rtfEscape(f)};}`).join("");
    const colorTbl = this.colors.map((hex) => {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `\\red${r}\\green${g}\\blue${b};`;
    }).join("");
    return `{\\rtf1\\ansi\\deff0\n{\\fonttbl${fontTbl}}\n{\\colortbl ;${colorTbl}}\n\\fs24\n${this.body}}`;
  }
}

export function docToRtf(doc: PMNode): string {
  const builder = new RtfBuilder();
  doc.forEach((block) => builder.block(block));
  return builder.toString();
}

/* ── download helper ────────────────────────────────────────────────────── */

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/* ── Markdown conversion ───────────────────────────────────────────────── */

function mdEscape(text: string): string {
  return text.replace(/([\\`*_[\]])/g, "\\$1");
}

function inlineToMd(node: PMNode): string {
  let out = "";
  node.forEach((child) => {
    if (child.isText) {
      const marks = child.marks;
      const has = (name: string) => marks.some((m) => m.type.name === name);
      const link = marks.find((m) => m.type.name === "link");
      let t = has("code") ? "`" + (child.text || "") + "`" : mdEscape(child.text || "");
      if (has("strong")) t = `**${t}**`;
      if (has("em")) t = `*${t}*`;
      if (has("strikethrough")) t = `~~${t}~~`;
      if (has("underline")) t = `<u>${t}</u>`;
      if (has("superscript")) t = `<sup>${t}</sup>`;
      if (has("subscript")) t = `<sub>${t}</sub>`;
      if (link) t = `[${t}](${link.attrs.href})`;
      out += t;
    } else if (child.type.name === "image") {
      out += `![${child.attrs.alt || ""}](${child.attrs.src})`;
    } else if (child.type.name === "hard_break") {
      out += "  \n";
    }
  });
  return out;
}

function listToMd(list: PMNode, ordered: boolean, indent: string): string {
  let out = "";
  let n = Number(list.attrs?.order || 1);
  list.forEach((item) => {
    const marker = ordered ? `${n++}. ` : "- ";
    let first = true;
    item.forEach((block) => {
      if (block.type.name === "bullet_list") out += listToMd(block, false, indent + "  ");
      else if (block.type.name === "ordered_list") out += listToMd(block, true, indent + "  ");
      else if (block.type.name === "paragraph") {
        out += indent + (first ? marker : " ".repeat(marker.length)) + inlineToMd(block) + "\n";
        first = false;
      } else {
        out += blockToMd(block);
      }
    });
  });
  return out;
}

function tableToMd(table: PMNode): string {
  const rows: string[][] = [];
  table.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) => {
      let text = "";
      cell.forEach((block) => { text += inlineToMd(block) + " "; });
      cells.push(text.trim().replace(/\|/g, "\\|"));
    });
    rows.push(cells);
  });
  if (!rows.length) return "";
  const cols = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => "| " + Array.from({ length: cols }, (_, i) => r[i] || "").join(" | ") + " |";
  return [
    line(rows[0]),
    "| " + Array(cols).fill("---").join(" | ") + " |",
    ...rows.slice(1).map(line),
  ].join("\n") + "\n\n";
}

function blockToMd(node: PMNode): string {
  const name = node.type.name;
  if (name === "paragraph") return inlineToMd(node) + "\n\n";
  if (name === "heading") {
    const level = Math.max(1, Math.min(6, Number(node.attrs.level || 1)));
    return "#".repeat(level) + " " + inlineToMd(node) + "\n\n";
  }
  if (name === "code_block") return "```\n" + (node.textContent || "") + "\n```\n\n";
  if (name === "blockquote") {
    let inner = "";
    node.forEach((child) => { inner += blockToMd(child); });
    return inner.trimEnd().split("\n").map((l) => "> " + l).join("\n") + "\n\n";
  }
  if (name === "bullet_list") return listToMd(node, false, "") + "\n";
  if (name === "ordered_list") return listToMd(node, true, "") + "\n";
  if (name === "table") return tableToMd(node);
  if (name === "horizontal_rule") return "---\n\n";
  if (name === "page_break") return "<!-- page break -->\n\n";
  return node.textContent ? node.textContent + "\n\n" : "";
}

export function docToMarkdown(doc: PMNode): string {
  let out = "";
  doc.forEach((block) => { out += blockToMd(block); });
  return out.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
