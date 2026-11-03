/** Lazy DOCX bridge: editable native VML text boxes, never rasterized artwork. */
import JSZip from "jszip";
import { parseXml, xmlString, W } from "./docx-preservation";
import { textBoxAttrs, textBoxDOM, type TextBoxAttrs } from "./text-box";
import { DOMSerializer } from "prosemirror-model";

const V = "urn:schemas-microsoft-com:vml";
const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const esc = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pt = (pixels: number) => Math.round(pixels * 0.75 * 10000) / 10000;
const all = (el: Document | Element, ns: string, name: string) => Array.from(el.getElementsByTagNameNS(ns, name));
export const textBoxBookmark = (index: number) => `EDTRTextBoxExport${index}`;

/** Word's fit-to-text model matches the browser's auto-growing minimum height. */
export function textBoxWordXml(raw: Record<string, unknown>, index: number): string {
  const a = textBoxAttrs(raw), font = a.fontFamily.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  const paragraph = (line: string) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="288" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${esc(font)}" w:hAnsi="${esc(font)}" w:cs="${esc(font)}"/><w:color w:val="${a.color.slice(1)}"/><w:sz w:val="${Math.round(a.fontSize * 2)}"/><w:szCs w:val="${Math.round(a.fontSize * 2)}"/></w:rPr>${line.split("\t").map(text => `<w:t xml:space="preserve">${esc(text)}</w:t>`).join("<w:tab/>")}</w:r></w:p>`;
  const z = a.textPlane === "behind" ? -1000001 + a.layer : 1 + a.layer;
  return `<w:r xmlns:w="${W}" xmlns:v="${V}" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w10="urn:schemas-microsoft-com:office:word"><w:pict><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype><v:shape id="EDTRTextBox${index}" type="#_x0000_t202" alt="${esc("EDTRTextBox:" + JSON.stringify(a))}" style="position:absolute;margin-left:${pt(a.x)}pt;margin-top:${pt(a.y)}pt;width:${pt(Number.parseFloat(a.width))}pt;height:${pt(a.height)}pt;z-index:${z};mso-position-horizontal-relative:page;mso-position-vertical-relative:page;mso-wrap-style:none" fillcolor="${a.background === "transparent" ? "#ffffff" : a.background}" filled="${a.background === "transparent" ? "f" : "t"}" strokecolor="${a.borderColor}" strokeweight="0.75pt"><v:textbox inset="${pt(a.padding)}pt,${pt(a.padding)}pt,${pt(a.padding)}pt,${pt(a.padding)}pt" style="mso-fit-shape-to-text:t"><w:txbxContent>${a.text.split("\n").map(paragraph).join("")}</w:txbxContent></v:textbox><w10:wrap type="none"/></v:shape></w:pict></w:r>`;
}

/** Builder emits zero-width bookmarks; this pass replaces them after OOXML preservation. */
export async function exportTextBoxes(blob: Blob, boxes: readonly Record<string, unknown>[]): Promise<Blob> {
  if (!boxes.length) return blob;
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const path = "word/document.xml", source = await zip.file(path)?.async("string");
  if (!source) throw new Error("DOCX document part is missing");
  const doc = parseXml(source);
  boxes.forEach((attrs, index) => {
    const bookmark = all(doc, W, "bookmarkStart").find(el => el.getAttributeNS(W, "name") === textBoxBookmark(index));
    if (!bookmark) throw new Error("A text box lost its DOCX anchor");
    const id = bookmark.getAttributeNS(W, "id");
    const run = parseXml(textBoxWordXml(attrs, index)).documentElement;
    bookmark.parentNode!.replaceChild(doc.importNode(run, true), bookmark);
    all(doc, W, "bookmarkEnd").find(el => el.getAttributeNS(W, "id") === id)?.remove();
  });
  zip.file(path, xmlString(doc));
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function ancestor(el: Element, predicate: (el: Element) => boolean): Element | null {
  let current: Element | null = el;
  while (current) { if (predicate(current)) return current; current = current.parentElement; }
  return null;
}
function css(style: string) {
  return Object.fromEntries(style.split(";").map(p => { const i = p.indexOf(":"); return [p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim()]; }).filter(([key]) => key));
}
const pixels = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const n = Number.parseFloat(value); if (!Number.isFinite(n)) return fallback;
  return n * (value.endsWith("pt") ? 96 / 72 : value.endsWith("in") ? 96 : value.endsWith("cm") ? 96 / 2.54 : 1);
};
function boxText(content: Element): string {
  // Tables and content controls can contain paragraphs too. Flatten their text
  // in document order rather than silently dropping it in this plain-text model.
  const paragraphs = all(content, W, "p").filter(p => {
    let parent = p.parentElement;
    while (parent && parent !== content) {
      if (parent.namespaceURI === W && parent.localName === "p") return false;
      parent = parent.parentElement;
    }
    return true;
  });
  return paragraphs.map(p => {
    let result = "";
    const walk = (node: Element) => {
      if (node.namespaceURI === W && node.localName === "t") result += node.textContent || "";
      else if (node.namespaceURI === W && ["br", "cr"].includes(node.localName)) result += "\n";
      else if (node.namespaceURI === W && node.localName === "tab") result += "\t";
      else if (node !== p && node.namespaceURI === W && node.localName === "p") {
        if (result && !result.endsWith("\n")) result += "\n";
        for (const child of Array.from(node.children)) walk(child);
        result += "\n";
      }
      else for (const child of Array.from(node.children)) walk(child);
    };
    walk(p); return result;
  }).join("\n");
}
function importAttrs(content: Element): TextBoxAttrs {
  const shape = ancestor(content, el => el.namespaceURI === V && el.localName === "shape");
  const drawing = ancestor(content, el => el.namespaceURI === W && el.localName === "drawing");
  let saved: Record<string, unknown> = {};
  const alt = shape?.getAttribute("alt") || "";
  if (alt.startsWith("EDTRTextBox:")) { try { saved = JSON.parse(alt.slice(12)); } catch { /* Foreign descriptions are not executable data. */ } }
  const a = textBoxAttrs(saved), style = css(shape?.getAttribute("style") || "");
  const nativeFont = all(content, W, "rFonts")[0]?.getAttributeNS(W, "ascii");
  const savedFont = a.fontFamily.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  const fontSize = Number(all(content, W, "sz")[0]?.getAttributeNS(W, "val")) / 2;
  const nativeColor = all(content, W, "color")[0]?.getAttributeNS(W, "val");
  const textbox = shape && all(shape, V, "textbox")[0];
  const inset = textbox?.getAttribute("inset")?.split(",")[0];
  const anchor = drawing && all(drawing, WP, "anchor")[0];
  const extent = drawing && all(drawing, WP, "extent")[0];
  const x = anchor && all(anchor, WP, "positionH")[0], y = anchor && all(anchor, WP, "positionV")[0];
  const background = shape ? shape.getAttribute("filled") === "f" ? "transparent" : shape.getAttribute("fillcolor") || a.background : a.background;
  const z = Number(style["z-index"] || anchor?.getAttribute("relativeHeight") || a.layer);
  const behind = z < 0 || ["1", "true"].includes(anchor?.getAttribute("behindDoc") || "");
  return textBoxAttrs({ ...a, text: boxText(content), x: shape ? pixels(style["margin-left"] || style.left, a.x) : Number(x && all(x, WP, "posOffset")[0]?.textContent || 0) / 9525,
    y: shape ? pixels(style["margin-top"] || style.top, a.y) : Number(y && all(y, WP, "posOffset")[0]?.textContent || 0) / 9525,
    width: `${shape ? pixels(style.width, Number.parseFloat(a.width)) : Number(extent?.getAttribute("cx") || 2286000) / 9525}px`,
    height: shape ? pixels(style.height, a.height) : Number(extent?.getAttribute("cy") || 914400) / 9525,
    fontFamily: nativeFont && nativeFont !== savedFont ? nativeFont : a.fontFamily,
    fontSize: fontSize || a.fontSize, color: nativeColor ? `#${nativeColor}` : a.color, background,
    borderColor: shape?.getAttribute("strokecolor") || a.borderColor, padding: pixels(inset, a.padding), textPlane: behind ? "behind" : "front",
    layer: shape && behind ? 1000001 + z : Math.max(0, z - 1) });
}

/** Pull native boxes out before Mammoth can flatten them into body text. */
export async function prepareTextBoxImport(arrayBuffer: ArrayBuffer): Promise<{ arrayBuffer: ArrayBuffer; restore: (html: string) => string }> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const source = await zip.file("word/document.xml")?.async("string");
  if (!source) return { arrayBuffer, restore: html => html };
  const doc = parseXml(source), boxes = new Map<string, TextBoxAttrs>();
  const handled = new Set<Element>();
  for (const content of all(doc, W, "txbxContent")) {
    const alternate = ancestor(content, el => el.localName === "AlternateContent");
    const drawing = ancestor(content, el => el.namespaceURI === W && ["pict", "drawing"].includes(el.localName));
    const target = alternate || drawing;
    if (!target || handled.has(target) || !target.isConnected) continue;
    handled.add(target);
    const run = ancestor(target, el => el.namespaceURI === W && el.localName === "r");
    if (!run?.parentElement) continue;
    const id = `EDTRTextBoxImport${boxes.size}`;
    boxes.set(id, importAttrs(content));
    const start = doc.createElementNS(W, "w:bookmarkStart"), end = doc.createElementNS(W, "w:bookmarkEnd");
    start.setAttributeNS(W, "w:name", id); start.setAttributeNS(W, "w:id", String(2000000 + boxes.size));
    end.setAttributeNS(W, "w:id", String(2000000 + boxes.size));
    // A bookmark is a paragraph child. Preserve any other run content alongside the shape.
    run.parentElement.insertBefore(start, run); run.parentElement.insertBefore(end, run);
    target.remove();
  }
  if (!boxes.size) return { arrayBuffer, restore: html => html };
  zip.file("word/document.xml", xmlString(doc));
  return { arrayBuffer: await zip.generateAsync({ type: "arraybuffer" }), restore(html) {
    const body = new DOMParser().parseFromString(html, "text/html");
    for (const [id, attrs] of boxes) {
      const anchor = body.getElementById(id);
      if (!anchor) throw new Error("A text box lost its import anchor");
      const dom = DOMSerializer.renderSpec(body, textBoxDOM(attrs)).dom;
      anchor.replaceWith(dom);
    }
    return body.body.innerHTML;
  } };
}
