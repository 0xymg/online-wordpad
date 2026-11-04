// Client-side document exporters: ProseMirror doc → .docx (formatted) and .rtf.
// Loaded on demand via dynamic import so the docx library stays out of the main bundle.
import { resolvedAlignment, textDirection } from "./text-direction";
import { restoreDocxPackage } from "./docx-preservation";
import { paragraphXml, effectiveParagraph } from "./paragraph-format";
import { textFormat } from "./document-styles";
import type { DocumentStyles } from "./paragraph-format";
import type { DocumentLayout } from "./document-layout";
import { TableMap } from "prosemirror-tables";
import { DEFAULT_DOCUMENT_FONT } from "./document-font";
import { imageWrap, imageDistance } from "./image-layout";
import { documentSections } from "./document-sections";
import { getDocumentModel, sectionIdentityOrder, projectDocumentModel } from "./document-model";
import { EditorState } from "prosemirror-state";
import { unprojectEndnotes } from "./document-notes";
import { createBibliographyExport, type BibliographyDocxCarrier } from "./bibliography-docx";
import { collectCitationIndex, unprojectBibliography } from "./document-bibliography";
import type { BibliographyRun } from "./bibliography-format";
import { createNoteExport } from "./note-docx";
import { prepareTextNoteExport, type TextExportNote } from "./note-text-export";
import { collectReferenceIndex } from "./document-references";
import { fixedImageWidth } from "./page-image-position";
import { exportTextBoxes, textBoxBookmark } from "./text-box-docx";
import { captionMetadataNames, captionSequenceAlias, nativeReferenceAlias, nativeTocAlias, replaceReferenceBookmarks, type ReferenceReplacement } from "./reference-docx";
import { DOMParser as PMParser, DOMSerializer, type Node as PMNode, type Mark } from "prosemirror-model";
import { mySchema } from "@/app/components/editor-schema";
import {
  Document, Packer, Paragraph, TextRun as NativeTextRun, HpsMeasureElement, Tab, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ImageRun, ExternalHyperlink, InternalHyperlink, Bookmark, Header, Footer, PageNumber, SimpleField,
  LevelFormat, ShadingType, BorderStyle, PageBreak, BuilderElement, PageOrientation,
  TextWrappingType, TextWrappingSide, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom,
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

/** docx omits numeric zero for kern. Zero is meaningful native disabling. */
class TextRun extends NativeTextRun {
  constructor(options: ConstructorParameters<typeof NativeTextRun>[0]) {
    super(options);
    if (typeof options !== 'string' && options.kern === 0) this.properties.push(new HpsMeasureElement('w:kern', 0));
  }
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
  color?: string; size?: number; font?: string; highlight?: string; kern?: number;
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
      case "nativeKerning": p.kern = m.attrs.threshold; break;
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
  paragraphProperties: Array<{ id: string; properties: string }> = [];
  textBoxes: Record<string, unknown>[] = [];
  private imageQueue: Array<LoadedImage | null>;
  numbering: INumberingOptions["config"][number][] = [];
  referenceReplacements: ReferenceReplacement[] = [];
  citationMarkers = new Map<string, { start: string; end: string }>();
  noteOwnerMarkers = new Map<string, string>();
  closeTocAfter = false;
  openTocHere: { fieldId: string; levels: number[]; status?: string } | null = null;
  private referenceNumbers = new Map<string, number>();
  private referenceMarkerToken = crypto.randomUUID().replace(/-/g, "");
  private referenceKinds = new Map<string, "bookmark" | "heading" | "caption">();
  private referenceNames = new Map<string, string>();
  private sequenceLabels = new Map<string, string>();
  private captionMetadataOwners = new Map<string, string>();
  registerReferences(doc: PMNode) {
    doc.descendants(node => {
      const id = node.attrs.targetId;
      if (id && (node.type.name === "heading" || node.type.name === "bookmark_start" || node.attrs.targetKind === "caption")) {
        if (this.referenceKinds.has(id)) throw new Error("Cannot export duplicate reference target identities");
        this.referenceKinds.set(id, node.type.name === "heading" ? "heading" : node.attrs.targetKind === "caption" ? "caption" : "bookmark");
        if (node.type.name === "bookmark_start" && node.attrs.nativeName) {
          if (typeof node.attrs.nativeName !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(node.attrs.nativeName)) throw new Error("Cannot safely export this native bookmark name");
          this.referenceNames.set(id, node.attrs.nativeName);
        }
      }
    });
  }
  private referenceAlias(id: string) { return this.referenceNames.get(id) || nativeReferenceAlias(id, this.referenceKinds.get(id)); }
  private marker(kind: ReferenceReplacement["kind"], targetId: string, xml?: string, nameOverride?: string, keyOverride?: string, headingLevel?: number): TextRun {
    const name = nameOverride || this.referenceAlias(targetId);
    if (kind !== "xml" && !name) throw new Error("Cannot export an invalid reference target identity");
    const key = keyOverride || targetId;
    let id = this.referenceNumbers.get(key);
    if (!id) { id = this.referenceNumbers.size + 1; this.referenceNumbers.set(key, id); }
    const marker = `EDTRRefAnchor${this.referenceMarkerToken}${this.referenceReplacements.length}`;
    this.referenceReplacements.push({ marker, kind, id, name: name || undefined, xml, headingLevel });
    return new TextRun({ text: marker });
  }
  private hyperlink(run: TextRun, link: string): ParagraphChild {
    if (link.startsWith("#")) {
      const id = link.slice(1).replace(/^edtr-target-/, "");
      const anchor = this.referenceAlias(id);
      if (anchor) return new InternalHyperlink({ children: [run], anchor });
    }
    return new ExternalHyperlink({ children: [run], link });
  }

  constructor(images: Array<LoadedImage | null>, private styles: DocumentStyles = {}, private imageWidths = new Map<PMNode, number>()) {
    this.imageQueue = [...images];
  }

  inlineChildren(node: PMNode): ParagraphChild[] {
    const out: ParagraphChild[] = [];
    const nativeToc = !!node.attrs.tocOwnerId && node.attrs.tocSourceIndent !== null;
    const sourceTocPresentation = (p: MarkProps) => {
      if (nativeToc) {
        p.color ??= colorToHex(node.attrs.styleText?.color || "#000000");
        p.underline ??= !!node.attrs.styleText?.underline;
      }
      return p;
    };
    const inlineMarks = (marks: readonly Mark[]) => {
      const p = readMarks(marks);
      // Plain HTML paragraph fonts are a CSS base, rather than a linked Word
      // style. Materialize that base beneath each run's explicit overrides.
      if ((!node.attrs.styleId || !this.styles[node.attrs.styleId]) && node.attrs.styleText) {
        p.kern ??= node.attrs.styleText.kerning;
        p.font ??= firstFontFamily(node.attrs.styleText.family);
        p.size ??= fontSizeHalfPoints(node.attrs.styleText.size ? `${node.attrs.styleText.size}pt` : undefined);
      }
      return sourceTocPresentation(p);
    };
    if (node.attrs.docxProperties || node.attrs.styleId || node.attrs.styleText || node.attrs.lineHeight || Object.keys(node.attrs.paragraphFormat || {}).length) {
      const id = `EDTRLayout${this.paragraphProperties.length}`;
      this.paragraphProperties.push({ id, properties: paragraphXml(node,!!this.styles[node.attrs.styleId]) });
      out.push(new Bookmark({ id, children: [] }));
    }
    const target = (node.type.name === "heading" || node.attrs.targetKind === "caption") && node.attrs.targetId;
    if (target) out.push(this.marker("start", String(target), undefined, undefined, undefined, node.type.name === "heading" ? Math.max(1, Math.min(6, Number(node.attrs.level) || 1)) : undefined));
    if (node.attrs.toc) {
      const id = String(node.attrs.toc.fieldId || ""), alias = nativeTocAlias(id, !!node.attrs.toc.markerOnly && !node.content.size);
      if (!alias) throw new Error("Invalid table of contents identity");
      out.push(this.marker("start", id, undefined, alias, `toc-title:${id}`));
      out.push(this.marker("end", id, undefined, alias, `toc-title:${id}`));
    }
    if (this.openTocHere && !node.attrs.toc) out.push(this.tocStart(this.openTocHere));
    if (node.attrs.targetKind === "caption" && target) {
      for (const name of captionMetadataNames(String(node.attrs.captionLabel || ""), String(target))) {
        const prior = this.captionMetadataOwners.get(name);
        if (prior && prior !== target) throw new Error("Caption metadata alias collision");
        this.captionMetadataOwners.set(name, String(target));
        const key = `metadata:${name}:${target}`;
        out.push(this.marker("start", String(target), undefined, name, key));
        out.push(this.marker("end", String(target), undefined, name, key));
      }
    }
    node.forEach((child) => {
      if (child.isText) {
        const p = inlineMarks(child.marks);
        if (node.attrs.styleId && this.styles[node.attrs.styleId] && node.attrs.styleText) {
          const actual = textFormat(child.marks),base = node.attrs.styleText;
          if (actual.family.replace(/["'\s]/g,"").toLowerCase() === String(base.family).replace(/["'\s]/g,"").toLowerCase()) p.font = undefined;
          if (actual.size === base.size) p.size = undefined;
          p.bold = actual.bold === base.bold ? undefined : actual.bold;
          p.italics = actual.italic === base.italic ? undefined : actual.italic;
          p.underline = actual.underline === base.underline ? undefined : actual.underline;
          if (actual.color.toLowerCase() === String(base.color).toLowerCase()) p.color = undefined;
        }
        sourceTocPresentation(p);
        const run = new TextRun({
          text: child.text || "",
          rightToLeft: textDirection(child.text || "") === "rtl",
          bold: p.bold,
          italics: p.italics,
          underline: p.underline === false ? { type: "none" } : p.underline ? {} : undefined,
          strike: p.strike,
          color: p.color,
          size: p.size, kern: p.kern,
          font: p.font,
          superScript: p.superScript,
          subScript: p.subScript,
          shading: p.highlight
            ? { type: ShadingType.CLEAR, fill: p.highlight }
            : undefined,
          style: p.link && !nativeToc ? "Hyperlink" : undefined,
        });
        if (p.link) {
          out.push(this.hyperlink(run, p.link));
        } else {
          out.push(run);
        }
      } else if (child.type.name === "tab") {
        const p = inlineMarks(child.marks);
        const run = new TextRun({ children: [new Tab()], font: p.font, size: p.size, kern: p.kern, bold: p.bold, italics: p.italics,
          underline: p.underline === false ? { type: "none" } : p.underline ? {} : undefined, strike: p.strike, color: p.color,
          superScript: p.superScript, subScript: p.subScript,
          shading: p.highlight ? { type: ShadingType.CLEAR, fill: p.highlight } : undefined,
          style: p.link && !nativeToc ? "Hyperlink" : undefined });
        if (p.link) out.push(this.hyperlink(run, p.link)); else out.push(run);
      } else if (child.type.name === "bookmark_start" || child.type.name === "bookmark_end") {
        const id = String(child.attrs.targetId || "");
        if (child.type.name === "bookmark_start" && this.referenceNames.has(id)) {
          const transport = nativeReferenceAlias(id, "transport");
          if (!transport) throw new Error("Cannot export an invalid bookmark identity");
          out.push(this.marker("start", id, undefined, transport, `transport:${id}`));
          out.push(this.marker("end", id, undefined, transport, `transport:${id}`));
        }
        out.push(this.marker(child.type.name === "bookmark_start" ? "start" : "end", id));
      } else if (child.type.name === "citation_field") {
        const marker = this.citationMarkers.get(String(child.attrs.fieldId));
        if (!marker || !Array.isArray(child.attrs.cachedRuns) || child.attrs.status !== "current") throw new Error("Cannot export an unsettled citation");
        out.push(new TextRun(marker.start));
        for (const cached of child.attrs.cachedRuns as BibliographyRun[]) {
          const run = new TextRun({text:cached.text,rightToLeft:textDirection(cached.text)==="rtl",bold:cached.bold,italics:cached.italic,underline:cached.underline?{}:undefined,superScript:cached.superscript,subScript:cached.subscript,style:cached.href?"Hyperlink":undefined});
          if(cached.href) out.push(this.hyperlink(run,cached.href)); else out.push(run);
        }
        out.push(new TextRun(marker.end));
      } else if (child.type.name === "note_reference") {
        const marker = this.noteOwnerMarkers.get(String(child.attrs.noteId));
        if (!marker) throw new Error("Cannot export a note without its canonical body");
        const p = inlineMarks(child.marks), run = new TextRun({ text: marker,
          font: p.font, size: p.size, kern: p.kern, bold: p.bold, italics: p.italics,
          underline: p.underline === false ? { type: "none" } : p.underline ? {} : undefined,
          strike: p.strike, color: p.color, superScript: p.superScript, subScript: p.subScript,
          shading: p.highlight ? { type: ShadingType.CLEAR, fill: p.highlight } : undefined,
          style: p.link && !nativeToc ? "Hyperlink" : undefined });
        if (p.link) out.push(this.hyperlink(run, p.link)); else out.push(run);
      } else if (child.type.name === "reference_field") {
        const attrs = child.attrs;
        if (attrs.status === "unsupported") {
          if (!attrs.nativeXml) throw new Error("Cannot safely export an unsupported field without its native source");
          out.push(this.marker("xml", `field:${attrs.fieldId}`, String(attrs.nativeXml)));
        } else {
          if (node.attrs.targetKind === "caption" && attrs.targetId === node.attrs.targetId && attrs.display === "number" && /^SEQ\s/i.test(String(attrs.instruction || ""))) {
            const label = String(node.attrs.captionLabel || "");
            if (attrs.instruction !== `SEQ ${label}`) throw new Error("Cannot safely export this native caption sequence");
            const sequence = captionSequenceAlias(label), previous = this.sequenceLabels.get(sequence);
            if (previous !== undefined && previous !== label) throw new Error("Caption sequence alias collision");
            this.sequenceLabels.set(sequence, label);
            const number = nativeReferenceAlias(String(attrs.targetId), "number");
            if (!number) throw new Error("Invalid caption target identity");
            out.push(this.marker("start", String(attrs.targetId), undefined, number, `number:${attrs.targetId}`));
            out.push(new SimpleField(`SEQ ${sequence}`, String(attrs.cached || "")));
            out.push(this.marker("end", String(attrs.targetId), undefined, number, `number:${attrs.targetId}`));
            return;
          }
          const target = attrs.targetId ? this.referenceAlias(String(attrs.targetId)) : attrs.nativeName;
          if (!target || !/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(target)) throw new Error("Cannot safely export an unresolved reference");
          if (attrs.status === "ambiguous") {
            if (!attrs.instruction || !attrs.nativeName) throw new Error("Cannot safely export an ambiguous reference without its native instruction");
            out.push(new SimpleField(String(attrs.instruction), String(attrs.cached || ""))); return;
          }
          if (attrs.display === "number" && this.referenceKinds.get(String(attrs.targetId)) !== "caption") throw new Error("Cannot export an unavailable paragraph number");
          const fieldTarget = attrs.display === "number" ? nativeReferenceAlias(String(attrs.targetId), "number") : target;
          const instruction = attrs.display === "page" ? `PAGEREF ${fieldTarget} \\h` : `REF ${fieldTarget} \\h`;
          const field = new SimpleField(instruction), p = inlineMarks(child.marks);
          field.addChildElement(new TextRun({ text: String(attrs.cached || ""), font: p.font, size: p.size, kern: p.kern, bold: p.bold, italics: p.italics, underline: p.underline === false ? { type: "none" } : p.underline ? {} : undefined, strike: p.strike, color: p.color, superScript: p.superScript, subScript: p.subScript, shading: p.highlight ? { type: ShadingType.CLEAR, fill: p.highlight } : undefined }));
          out.push(field);
        }
      } else if (child.type.name === "doc_field") {
        const marks = inlineMarks(child.marks);
        if (child.attrs.kind === "OTHER" && child.attrs.instruction) { out.push(new SimpleField(child.attrs.instruction, child.attrs.cached || "")); return; }
        out.push(new TextRun({ children: [child.attrs.kind === "NUMPAGES" ? PageNumber.TOTAL_PAGES : PageNumber.CURRENT], font: marks.font, size: marks.size, kern: marks.kern, bold: marks.bold, italics: marks.italics, color: marks.color }));
      } else if (child.type.name === "text_box") {
        const index = this.textBoxes.push(child.attrs) - 1;
        out.push(new Bookmark({ id: textBoxBookmark(index), children: [] }));
      } else if (child.type.name === "image") {
        const img = this.imageQueue.shift() ?? null;
        if (img) {
          const fixed = child.attrs.position === "page";
          const attrWidth = String(child.attrs.width || "");
          let width = img.width;
          if (fixed) width = this.imageWidths.get(child) || img.width;
          else if (attrWidth.endsWith("px") && Number.parseFloat(attrWidth) > 0) width = Number.parseFloat(attrWidth);
          else if (attrWidth.endsWith("%")) width = (this.imageWidths.get(child) || MAX_IMAGE_WIDTH) * Number.parseFloat(attrWidth) / 100;
          else width = Math.min(width, this.imageWidths.get(child) || MAX_IMAGE_WIDTH);
          const wrap = imageWrap(child.attrs.wrap), distance = fixed ? 0 : imageDistance(child.attrs.distance);
          width = Math.max(1, Math.min(width, (this.imageWidths.get(child) || MAX_IMAGE_WIDTH) - (wrap === "inline" ? 2 : wrap === "topBottom" ? 0 : 1) * distance));
          const height = Math.round(child.attrs.aspectRatio ? width / Number(child.attrs.aspectRatio) : (width / img.width) * img.height);
          out.push(new ImageRun({
            type: img.type,
            data: img.data,
            transformation: { width, height, rotation: Number(child.attrs.rotate) || 0, flip: { horizontal: !!child.attrs.flipX, vertical: !!child.attrs.flipY } },
            ...(fixed || wrap !== "inline" ? { floating: {
              horizontalPosition: fixed ? { relative: HorizontalPositionRelativeFrom.PAGE, offset: Math.round((Number(child.attrs.x) || 0) * 9525) } : { relative: HorizontalPositionRelativeFrom.COLUMN, align: wrap === "wrapRight" ? "right" : wrap === "wrapLeft" ? "left" : child.attrs.align === "center" ? "center" : child.attrs.align === "right" ? "right" : "left" },
              verticalPosition: fixed ? { relative: VerticalPositionRelativeFrom.PAGE, offset: Math.round((Number(child.attrs.y) || 0) * 9525) } : { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: 0 },
              allowOverlap: fixed, layoutInCell: !fixed, zIndex: Math.max(0, Math.round(Number(child.attrs.layer) || 0)) + 1,
              behindDocument: fixed && child.attrs.textPlane === "behind",
              wrap: { type: fixed ? TextWrappingType.NONE : wrap === "topBottom" ? TextWrappingType.TOP_AND_BOTTOM : TextWrappingType.SQUARE, side: wrap === "wrapRight" ? TextWrappingSide.LEFT : TextWrappingSide.RIGHT },
              margins: { top: wrap === "topBottom" ? Math.round(distance * 9525) : 0, bottom: Math.round(distance * 9525), left: wrap === "wrapRight" ? Math.round(distance * 9525) : 0, right: wrap === "wrapLeft" ? Math.round(distance * 9525) : 0 },
            } } : {}),
          }));
        } else {
          out.push(new TextRun({ text: "[image]", italics: true, color: "888888" }));
        }
      } else if (child.type.name === "column_break") {
        const p = inlineMarks(child.marks);
        const run = new TextRun({ font: p.font, size: p.size, kern: p.kern, bold: p.bold, italics: p.italics,
          underline: p.underline === false ? { type: "none" } : p.underline ? {} : undefined, strike: p.strike, color: p.color,
          superScript: p.superScript, subScript: p.subScript,
          shading: p.highlight ? { type: ShadingType.CLEAR, fill: p.highlight } : undefined,
          style: p.link && !nativeToc ? "Hyperlink" : undefined });
        run.addChildElement(new BuilderElement({ name: "w:br", attributes: { type: { key: "w:type", value: "column" } } }));
        if (p.link) out.push(this.hyperlink(run, p.link)); else out.push(run);
      } else if (child.type.name === "hard_break") {
        const p = inlineMarks(child.marks);
        out.push(new TextRun({ break: 1, font: p.font, size: p.size }));
      }
    });
    if (target) out.push(this.marker("end", String(target)));
    if (this.openTocHere && node.attrs.toc) out.push(this.tocStart(this.openTocHere));
    if (this.closeTocAfter) out.push(this.marker("xml", `toc-end:${node.attrs.toc?.fieldId || node.attrs.tocOwnerId}`, `<w:r><w:fldChar w:fldCharType="end"/></w:r>`));
    return out;
  }

  private tocStart(toc: { fieldId: string; levels: number[]; status?: string }): TextRun {
    const levels = toc.levels;
    if (toc.status === "unsupported" || !Array.isArray(levels) || !levels.length || levels.some((n, i) => !Number.isInteger(n) || n < 1 || n > 6 || (i > 0 && n <= levels[i - 1]))) throw new Error("Cannot safely export this table of contents configuration");
    const contiguous = levels.every((n, i) => !i || n === levels[i - 1] + 1);
    const option = contiguous ? `\\o &quot;${levels[0]}-${levels[levels.length - 1]}&quot;` : `\\t &quot;${levels.map(n => `heading ${n},${n}`).join(",")}&quot;`;
    const instruction = ` TOC ${option} \\h `;
    return this.marker("xml", `toc-start:${toc.fieldId}`, `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">${instruction}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>`);
  }

  private paragraphOpts(node: PMNode) {
    const rtl = textDirection(node.textContent) === "rtl";
    const align = ALIGN[resolvedAlignment(node.attrs.textAlign, node.textContent)];
    const indent = Number(node.attrs.indent || 0);
    const lh = node.attrs.lineHeight ? Number.parseFloat(String(node.attrs.lineHeight)) : NaN;
    if (node.attrs.styleId && this.styles[node.attrs.styleId]) return { alignment: undefined, bidirectional: rtl, indent: undefined, spacing: undefined };
    return {
      alignment: align,
      bidirectional: rtl,
      indent: indent > 0 ? (rtl ? { right: indent * 360 } : { left: indent * 360 }) : undefined,
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
          out.push(...this.listItems(block, depth + 1, this.newNumberRef(block)));
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

  private newNumberRef(list: PMNode): string {
    const start = Number(list.attrs.order ?? 1);
    if (!Number.isSafeInteger(start) || start < 1 || start > 2147483647) throw new Error("Cannot export an invalid ordered-list start");
    const ref = `ol-${this.numbering.length}`;
    this.numbering.push({
      reference: ref,
      levels: Array.from({ length: 9 }, (_, level) => ({
        level,
        format: LevelFormat.DECIMAL,
        start,
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
    if (name === "ordered_list") return this.listItems(node, 0, this.newNumberRef(node));
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
    const map = TableMap.get(table);
    const originalGrid: number[] = table.attrs.docxGrid ? JSON.parse(table.attrs.docxGrid) : [];
    const columnWidths = Array.from({ length: map.width }, (_, c) => {
      for (let r = 0; r < map.height; r++) {
        const pos = map.map[r * map.width + c];
        const cell = table.nodeAt(pos);
        const left = map.findCell(pos).left;
        const width = cell?.attrs.colwidth?.[c - left];
        if (width) return originalGrid[c] && Math.round(originalGrid[c] / 15) === width ? originalGrid[c] : width * 15;
      }
      return originalGrid[c] || Math.floor(9000 / map.width);
    });
    table.forEach((row, rowOffset) => {
      const cells: TableCell[] = [];
      row.forEach((cell, cellOffset) => {
        const position = rowOffset + 1 + cellOffset;
        const left = map.findCell(position).left;
        const width = columnWidths.slice(left, left + cell.attrs.colspan).reduce((sum, w) => sum + w, 0);
        const isHeader = cell.type.name === "table_header";
        const content: FileChild[] = [];
        cell.forEach((block) => content.push(...this.blockToDocx(block)));
        cells.push(new TableCell({
          children: content.length ? content : [new Paragraph("")],
          columnSpan: cell.attrs.colspan || 1,
          rowSpan: cell.attrs.rowspan || 1,
          width: { size: width, type: WidthType.DXA },
          shading: isHeader ? { type: ShadingType.CLEAR, fill: "F3F4F6" } : undefined,
        }));
      });
      rows.push(new TableRow({ children: cells }));
    });
    return new Table({ width: { size: columnWidths.reduce((sum, w) => sum + w, 0), type: WidthType.DXA }, columnWidths, rows });
  }
}

type DocxExportOptions = { orientation?: "portrait" | "landscape"; marginCm?: number; pageNumbers?: "off" | "top" | "bottom"; pageNumberFormat?: "plain" | "of" } | "portrait" | "landscape";

/** Every entry point exports settled reference caches from one measured snapshot. */
export async function docToDocxBlob(doc: PMNode, title: string, options: DocxExportOptions = {}): Promise<Blob> {
  const references = collectReferenceIndex(doc);
  const bibliographyIndex = collectCitationIndex(doc);
  if (!bibliographyIndex.citations.length && !bibliographyIndex.markers.length && !references.fields.length && !references.tocs.length && !Object.keys(getDocumentModel(doc)?.notes || {}).length) return docToDocxBlobReady(doc, title, options);
  const [{ readonlyDocumentView }, { flushDocumentOutputLayout }] = await Promise.all([import("./readonly-document-view"), import("./document-output-layout")]);
  const renderer = readonlyDocumentView(doc);
  try {
    await document.fonts.ready;
    await Promise.all(Array.from(renderer.view.dom.querySelectorAll("img")).map(img => img.decode().catch(() => {})));
    await flushDocumentOutputLayout(renderer.view);
    return await docToDocxBlobReady(renderer.view.state.doc, title, options);
  } finally { renderer.destroy(); }
}

async function docToDocxBlobReady(
  doc: PMNode,
  title: string,
  options: DocxExportOptions
): Promise<Blob> {
  // Reject unsupported or inconsistent future models before any export can
  // silently flatten their sections to legacy layout metadata.
  const model = getDocumentModel(doc);
  if (model) {
    doc = projectDocumentModel(unprojectEndnotes(EditorState.create({ doc }).tr), model).doc;
    const ids = sectionIdentityOrder(doc, model);
    if (new Set(ids).size !== ids.length || ids.some(id => !Object.hasOwn(model.sections, id)) || ids.length !== Object.keys(model.sections).length)
      throw new Error("Cannot export inconsistent document section boundaries");
  }
  const defaults = typeof options === "string" ? { orientation: options } : options;
  const layout = doc.attrs.layout as DocumentLayout | null;
  const orientation = layout ? layout.width > layout.height ? "landscape" : "portrait" : defaults.orientation || "portrait";
  const margin = Math.round((defaults.marginCm ?? 2.54) / 2.54 * 1440);
  const margins = layout?.margins ?? { top: margin, right: margin, bottom: margin, left: margin };
  const pageNumbers = layout?.pageNumbers ?? defaults.pageNumbers ?? "off";
  const pageNumberFormat = layout?.pageNumberFormat ?? defaults.pageNumberFormat ?? "plain";
  const numberingParagraph = new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: pageNumberFormat === "of" ? [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES] : [PageNumber.CURRENT] })] });
  const images = await preloadImages(doc);
  const sections = documentSections(doc), imageWidths = new Map<PMNode, number>();
  doc.descendants((node, pos) => {
    if (node.type.name !== "image") return;
    const geometry = (sections.find(s => pos >= s.from && pos < s.to) || sections[0]).geometry;
    let width = node.attrs.position === "page" ? geometry.width / 15 : (geometry.width - geometry.margins.left - geometry.margins.right) / 15;
    const parent = doc.resolve(pos);
    for (let depth = 1; node.attrs.position !== "page" && depth <= parent.depth; depth++) {
      const ancestor = parent.node(depth);
      if (ancestor.attrs.colwidth?.length && ancestor.attrs.colwidth.every((w: number) => w > 0)) width = Math.min(width, ancestor.attrs.colwidth.reduce((sum: number, w: number) => sum + w, 0) - 16);
      if (ancestor.isTextblock) { const p = effectiveParagraph(ancestor); width -= ((p.left || 0) + (p.right || 0)) / 15; }
    }
    imageWidths.set(node, node.attrs.position === "page" ? fixedImageWidth(node.attrs, geometry) : Math.max(1, width));
  });
  const canonical = unprojectBibliography(EditorState.create({doc}).tr).doc;
  const serializer = DOMSerializer.fromSchema(doc.type.schema);
  const htmlFor = (node: PMNode) => { const wrap = document.createElement("div"); wrap.append(serializer.serializeNode(node)); return wrap.innerHTML; };
  const carriers: BibliographyDocxCarrier[] = [];
  const citationIndex = collectCitationIndex(doc);
  for (const citation of citationIndex.citations) carriers.push({fieldId:citation.fieldId,kind:"citation",html:htmlFor(doc.nodeAt(citation.pos)!)});
  canonical.forEach(block => { if(block.attrs.bibliography) carriers.push({fieldId:block.attrs.bibliography.fieldId,kind:"bibliography",html:htmlFor(block)}); });
  const bibliographyExport = model ? createBibliographyExport({sources:model.sources,bibliography:model.bibliography},carriers) : null;
  const bibliographyMarkers = new Map(carriers.map((carrier,i)=>[carrier.fieldId,bibliographyExport!.markers[i]]));
  const noteExport = createNoteExport(doc);
  const builder = new DocxBuilder(images,layout?.styles,imageWidths);
  builder.citationMarkers = bibliographyMarkers;
  builder.noteOwnerMarkers = noteExport.ownerMarkers;
  builder.registerReferences(doc);
  const children: FileChild[] = [];
  let activeToc: { fieldId: string; levels: number[]; status?: string } | null = null;
  let pendingTocStart = false;
  doc.forEach((block, _offset, index) => {
    if (block.attrs.toc) {
      if (activeToc) throw new Error("Cannot export overlapping tables of contents");
      activeToc = block.attrs.toc;
      pendingTocStart = true;
    } else if (block.attrs.tocOwnerId && block.attrs.tocOwnerId !== activeToc?.fieldId) throw new Error("Cannot export an orphaned table of contents entry");
    const next = index + 1 < doc.childCount ? doc.child(index + 1) : null;
    builder.closeTocAfter = !!activeToc && next?.attrs.tocOwnerId !== activeToc.fieldId;
    const isFirstEntry = !!activeToc && block.attrs.tocOwnerId === activeToc.fieldId && pendingTocStart;
    builder.openTocHere = isFirstEntry || (pendingTocStart && builder.closeTocAfter) ? activeToc : null;
    if (builder.openTocHere) pendingTocStart = false;
    const bibliographyId = block.attrs.bibliography?.fieldId || block.attrs.bibliographyOwnerId;
    const bibliographyMarker = bibliographyId && bibliographyMarkers.get(bibliographyId);
    if(block.attrs.bibliography && bibliographyMarker) children.push(new Paragraph(bibliographyMarker.start));
    children.push(...builder.blockToDocx(block));
    if(bibliographyMarker && next?.attrs.bibliographyOwnerId !== bibliographyId) children.push(new Paragraph(bibliographyMarker.end));
    if (builder.closeTocAfter) activeToc = null;
  });
  builder.closeTocAfter = false; builder.openTocHere = null;
  for (const body of noteExport.bodies) {
    children.push(new Paragraph(body.startMarker));
    body.body.forEach(block => children.push(...builder.blockToDocx(block)));
    children.push(new Paragraph(body.endMarker));
  }
  // A4 portrait in twips (11906×16838) — docx.js swaps the two itself when
  // orientation is LANDSCAPE, so always pass the portrait dimensions.
  const file = new Document({
    title,
    numbering: { config: builder.numbering },
    styles: {
      default: {
        document: { run: { font: DEFAULT_DOCUMENT_FONT, size: 24 } },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: margins,
          size: {
            width: layout ? Math.min(layout.width, layout.height) : 11906,
            height: layout ? Math.max(layout.width, layout.height) : 16838,
            orientation: orientation === "landscape" ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
          },
        },
      },
      headers: pageNumbers === "top" ? { default: new Header({ children: [numberingParagraph] }) } : undefined,
      footers: pageNumbers === "bottom" ? { default: new Footer({ children: [numberingParagraph] }) } : undefined,
      children: children.length ? children : [new Paragraph("")],
    }],
  });
  let result = await restoreDocxPackage(await Packer.toBlob(file), doc, builder.paragraphProperties);
  result = await exportTextBoxes(result, builder.textBoxes);
  result = await replaceReferenceBookmarks(result, builder.referenceReplacements);
  if (layout?.styles) { const { exportDocumentStyles } = await import("./style-docx"); result = await exportDocumentStyles(result,doc); }
  if (!layout?.running || !Object.keys(layout.running).length) return noteExport.finish(bibliographyExport ? await bibliographyExport.finish(result) : result);
  const { exportRunning } = await import("./header-footer-export");
  result = await exportRunning(result, doc, html => {
    const body = new DOMParser().parseFromString(html, "text/html");
    const header = PMParser.fromSchema(mySchema).parse(body.body);
    return docToDocxBlob(header, title);
  });
  return noteExport.finish(bibliographyExport ? await bibliographyExport.finish(result) : result);
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
    if (ch === "\t") out += "\\tab ";
    else if (ch === "\\" || ch === "{" || ch === "}") out += "\\" + ch;
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
  private fonts: string[] = [DEFAULT_DOCUMENT_FONT, "Courier New"];
  body = "";

  constructor(private notes: ReadonlyMap<string, TextExportNote> = new Map()) {}

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
        const formatted = `${open} ${rtfEscape(child.text || "")}}`;
        if (p.link && /^(?:https?:|mailto:|tel:)/i.test(p.link)) {
          const target = rtfEscape(p.link.replace(/"/g, "%22").replace(/[\r\n]/g, ""));
          out += `{\\field{\\*\\fldinst HYPERLINK "${target}"}{\\fldrslt ${formatted}}}`;
        } else out += formatted;
      } else if (child.type.name === "citation_field") {
        for(const run of (child.attrs.cachedRuns || []) as BibliographyRun[]) out += `{${run.bold?"\\b ":""}${run.italic?"\\i ":""}${run.underline?"\\ul ":""}${rtfEscape(run.text)}}`;
      } else if (child.type.name === "citation_field") {
      for(const run of (child.attrs.cachedRuns || []) as BibliographyRun[]) { let t=mdEscape(run.text);if(run.bold)t=`**${t}**`;if(run.italic)t=`*${t}*`;if(run.href)t=`[${t}](${run.href})`;out+=t; }
    } else if (child.type.name === "note_reference") {
        const note = this.notes.get(String(child.attrs.noteId));
        if (!note) throw new Error("Cannot export a note reference without its canonical body");
        out += `{\\super [${note.number}]}`;
      } else if (child.type.name === "tab") {
        out += "\\tab ";
      } else if (child.type.name === "image") {
        out += "{\\i [image]}";
      } else if (child.type.name === "text_box") {
        // RTF exports preserve the box text in document flow; geometry is DOCX/HTML only.
        const p = child.attrs;
        out += `{\\f${this.fontIndex(firstFontFamily(p.fontFamily))}\\fs${Math.round(Number(p.fontSize || 12) * 2)}\\cf${this.colorIndex(colorToHex(p.color))} ${String(p.text || "").split("\n").map(rtfEscape).join("\\line ")}}`;
      } else if (child.type.name === "hard_break" || child.type.name === "column_break") {
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

  private cellBlock(node: PMNode): string {
    if (node.isTextblock) return this.inline(node);
    const parts: string[] = [];
    if (node.type.name === "bullet_list" || node.type.name === "ordered_list") {
      let number = Number(node.attrs.order || 1);
      node.forEach(item => {
        const body: string[] = []; item.forEach(block => body.push(this.cellBlock(block)));
        parts.push((node.type.name === "ordered_list" ? `${number++}.\\tab ` : "\\bullet\\tab ") + body.join("\\line "));
      });
    } else node.forEach(child => parts.push(this.cellBlock(child)));
    return parts.join("\\line ");
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
        cell.forEach((block) => { text += this.cellBlock(block) + "\\line "; });
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
  const plan = prepareTextNoteExport(doc);
  const builder = new RtfBuilder(plan.byId);
  plan.doc.forEach((block) => builder.block(block));
  if (plan.notes.length) {
    builder.body += "\\pard\\sa240 {\\b Notes}\\par\n";
    for (const note of plan.notes) {
      builder.body += `\\pard\\sa120 {\\b [${note.number}]} (${note.kind})\\par\n`;
      note.body.forEach(block => builder.block(block));
    }
  }
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

function inlineToMd(node: PMNode, notes: ReadonlyMap<string, TextExportNote>): string {
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
    } else if (child.type.name === "note_reference") {
      const note = notes.get(String(child.attrs.noteId));
      if (!note) throw new Error("Cannot export a note reference without its canonical body");
      out += `[^${note.markdownKey}]`;
    } else if (child.type.name === "tab") {
      out += "\t";
    } else if (child.type.name === "image") {
      out += `![${child.attrs.alt || ""}](${child.attrs.src})`;
    } else if (child.type.name === "text_box") {
      out += mdEscape(String(child.attrs.text || ""));
    } else if (child.type.name === "hard_break" || child.type.name === "column_break") {
      out += "  \n";
    }
  });
  return out;
}

function listToMd(list: PMNode, ordered: boolean, indent: string, notes: ReadonlyMap<string, TextExportNote>): string {
  let out = "";
  let n = Number(list.attrs?.order || 1);
  list.forEach((item) => {
    const marker = ordered ? `${n++}. ` : "- ";
    let first = true;
    item.forEach((block) => {
      if (block.type.name === "bullet_list") out += listToMd(block, false, indent + "  ", notes);
      else if (block.type.name === "ordered_list") out += listToMd(block, true, indent + "  ", notes);
      else if (block.type.name === "paragraph") {
        out += indent + (first ? marker : " ".repeat(marker.length)) + inlineToMd(block, notes) + "\n";
        first = false;
      } else {
        out += blockToMd(block, notes);
      }
    });
  });
  return out;
}

function tableToMd(table: PMNode, notes: ReadonlyMap<string, TextExportNote>): string {
  const rows: string[][] = [];
  table.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) => {
      let text = "";
      cell.forEach((block) => { text += (block.isTextblock ? inlineToMd(block, notes) : blockToMd(block, notes).trimEnd().replace(/\n/g, "<br>")) + " "; });
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

function blockToMd(node: PMNode, notes: ReadonlyMap<string, TextExportNote>): string {
  const name = node.type.name;
  if (name === "paragraph") return inlineToMd(node, notes) + "\n\n";
  if (name === "heading") {
    const level = Math.max(1, Math.min(6, Number(node.attrs.level || 1)));
    return "#".repeat(level) + " " + inlineToMd(node, notes) + "\n\n";
  }
  if (name === "code_block") return "```\n" + (node.textContent || "") + "\n```\n\n";
  if (name === "blockquote") {
    let inner = "";
    node.forEach((child) => { inner += blockToMd(child, notes); });
    return inner.trimEnd().split("\n").map((l) => "> " + l).join("\n") + "\n\n";
  }
  if (name === "bullet_list") return listToMd(node, false, "", notes) + "\n";
  if (name === "ordered_list") return listToMd(node, true, "", notes) + "\n";
  if (name === "table") return tableToMd(node, notes);
  if (name === "horizontal_rule") return "---\n\n";
  if (name === "page_break") return "<!-- page break -->\n\n";
  return node.textContent ? node.textContent + "\n\n" : "";
}

/** Markdown footnote keys are global export identities, independent of display
 * labels that can restart for each kind or section. Definitions appear once. */
export function docToMarkdown(doc: PMNode): string {
  const plan = prepareTextNoteExport(doc);
  let out = "";
  plan.doc.forEach((block) => { out += blockToMd(block, plan.byId); });
  out = out.replace(/\n{3,}/g, "\n\n").trimEnd();
  for (const note of plan.notes) {
    let body = ""; note.body.forEach(block => { body += blockToMd(block, plan.byId); });
    const lines = body.trimEnd().split("\n");
    out += `\n\n[^${note.markdownKey}]:${lines[0] ? " " + lines[0] : ""}`;
    for (const line of lines.slice(1)) out += `\n    ${line}`;
  }
  return out + "\n";
}
