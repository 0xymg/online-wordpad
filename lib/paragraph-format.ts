/** Paragraph values use Word twips, except unitless line-spacing multiples. */
import type { Node as PMNode } from "prosemirror-model";
import { cleanTabStops, mergeTabStops, effectiveTabs, parseTabStopsXml, writeTabStopsXml, type TabStop } from "./tab-stops";
import { wordAutomaticLineHeight, wordSingleLineMetric } from "./word-font-metrics";
export type ParagraphFormat = {
  alignment?: "left" | "center" | "right" | "justify";
  left?: number; right?: number; firstLine?: number;
  before?: number; after?: number;
  lineMode?: "multiple" | "exact" | "atLeast"; lineValue?: number;
  lineBasis?: "em" | "font";
  keepNext?: boolean; keepLines?: boolean; pageBreakBefore?: boolean; widowControl?: boolean;
  tabs?: TabStop[];
};
export type StyleText = { family: string; size: number; bold: boolean; italic: boolean; underline: boolean; color: string };
export type DocumentStyle = { name: string; basedOn?: string; level?: number; paragraph: ParagraphFormat; paragraphDefaults?: ParagraphFormat; text: Partial<StyleText>; rawParagraphProperties?: string };
export type DocumentStyles = Record<string, DocumentStyle>;
export const DEFAULT_STYLE_TEXT: StyleText = { family: "Calibri, Carlito, Arial, sans-serif", size: 12, bold: false, italic: false, underline: false, color: "#000000" };
export const DEFAULT_PARAGRAPH: Required<ParagraphFormat> = { alignment: "left", left: 0, right: 0, firstLine: 0, before: 0, after: 120, lineMode: "multiple", lineValue: 1.5, lineBasis: "em", keepNext: false, keepLines: false, pageBreakBefore: false, widowControl: true, tabs: [] };
export function cleanParagraph(value: unknown): ParagraphFormat {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>, result: Record<string, unknown> = {};
  for (const key of ["left", "right", "firstLine", "before", "after", "lineValue"]) if (typeof raw[key] === "number" && Number.isFinite(raw[key])) result[key] = Math.max(key === "firstLine" ? -14400 : 0, Math.min(key === "lineValue" ? 1638 : 14400, raw[key] as number));
  for (const key of ["keepNext", "keepLines", "pageBreakBefore", "widowControl"]) if (typeof raw[key] === "boolean") result[key] = raw[key];
  if (["left", "center", "right", "justify"].includes(String(raw.alignment))) result.alignment = raw.alignment;
  if (["multiple", "exact", "atLeast"].includes(String(raw.lineMode))) result.lineMode = raw.lineMode;
  if (["em", "font"].includes(String(raw.lineBasis))) result.lineBasis = raw.lineBasis;
  if (Array.isArray(raw.tabs)) result.tabs = cleanTabStops(raw.tabs);
  return result as ParagraphFormat;
}
export function mergeParagraphFormats(...layers: readonly (ParagraphFormat | undefined)[]): ParagraphFormat {
  let result: ParagraphFormat = {};
  for (const layer of layers) if (layer) {
    const tabs = layer.tabs === undefined ? result.tabs : mergeTabStops(result.tabs, layer.tabs);
    result = { ...result, ...layer, ...(tabs === undefined ? {} : { tabs }) };
  }
  return result;
}
export function jsonAttribute(el: HTMLElement, key: string): unknown { try { return JSON.parse(el.getAttribute(key) || "null"); } catch { return null; } }
export function cleanStyleText(value: unknown): Partial<StyleText> {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string,unknown>, text: Partial<StyleText> = {};
  if (typeof raw.family === "string") text.family = raw.family.replace(/[;{}<>]/g,"").slice(0,250);
  if (typeof raw.size === "number" && Number.isFinite(raw.size)) text.size = Math.max(1,Math.min(1638,raw.size));
  for (const key of ["bold","italic","underline"] as const) if (typeof raw[key] === "boolean") text[key] = raw[key];
  if (typeof raw.color === "string" && /^#[a-f\d]{6}$/i.test(raw.color)) text.color = raw.color;
  return text;
}
export function paragraphAttrs(el: HTMLElement) {
  const rawText = jsonAttribute(el,"data-edtr-style-text");
  const explicit: Partial<StyleText> = {};
  // A paragraph's font establishes its CSS strut even when every child has a
  // font mark. Retain explicit plain-HTML base fonts independently of styles.
  if (el.style.fontFamily) explicit.family = el.style.fontFamily;
  const size = el.style.fontSize.match(/^(\d+(?:\.\d+)?)(pt|px)$/);
  if (size) explicit.size = Number(size[1]) * (size[2] === "px" ? .75 : 1);
  const styleId = el.getAttribute("data-edtr-style") || null;
  const text = rawText ? { ...(styleId ? DEFAULT_STYLE_TEXT : {}), ...cleanStyleText(rawText) } : cleanStyleText(explicit);
  return { styleId, styleText: Object.keys(text).length ? text : null, styleParagraph: cleanParagraph(jsonAttribute(el, "data-edtr-style-paragraph")), tableStyleParagraph: cleanParagraph(jsonAttribute(el,"data-edtr-table-style-paragraph")), paragraphFormat: cleanParagraph(jsonAttribute(el, "data-edtr-paragraph")) };
}
export function paragraphDOM(node: PMNode): Record<string, string> {
  return { ...(effectiveParagraph(node).lineMode ? { "data-edtr-line-mode":effectiveParagraph(node).lineMode! }:{}), ...(Object.keys(node.attrs.tableStyleParagraph || {}).length ? { "data-edtr-table-style-paragraph":JSON.stringify(node.attrs.tableStyleParagraph) } : {}), ...(node.attrs.styleText ? { "data-edtr-style-text": JSON.stringify(node.attrs.styleText) } : {}), ...(node.attrs.styleId ? { "data-edtr-style": node.attrs.styleId, "data-edtr-style-paragraph": JSON.stringify(node.attrs.styleParagraph) } : {}), ...(Object.keys(node.attrs.paragraphFormat || {}).length ? { "data-edtr-paragraph": JSON.stringify(node.attrs.paragraphFormat) } : {}) };
}
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const paragraphCache = new Map<string,ParagraphFormat>();
export function paragraphFromXml(raw: string | Element | null): ParagraphFormat {
  if (!raw) return {};
  if(typeof raw==="string"&&paragraphCache.has(raw))return paragraphCache.get(raw)!;
  const root = typeof raw === "string" ? new DOMParser().parseFromString(raw, "application/xml").documentElement : raw;
  const element = (name: string) => Array.from(root.children).find(el => el.namespaceURI === W && el.localName === name);
  const attr = (name: string, key: string) => element(name)?.getAttributeNS(W, key);
  const result: ParagraphFormat = {};
  const number = (name: string, key: string) => { const v = attr(name,key); return v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : undefined; };
  for (const [key, name, prop] of [["left","ind","left"],["right","ind","right"],["before","spacing","before"],["after","spacing","after"]] as const) { const n = number(name,prop); if (n !== undefined) result[key] = n; }
  const first = number("ind","firstLine"), hanging = number("ind","hanging"); if (first !== undefined || hanging !== undefined) result.firstLine = (first || 0) - (hanging || 0);
  const line = number("spacing","line"); if (line !== undefined) { result.lineMode = attr("spacing","lineRule") === "exact" ? "exact" : attr("spacing","lineRule") === "atLeast" ? "atLeast" : "multiple"; result.lineValue = line / (result.lineMode === "multiple" ? 240 : 20); if (result.lineMode === "multiple") result.lineBasis = "font"; }
  const align = attr("jc","val"); if (["left","center","right","both"].includes(align || "")) result.alignment = align === "both" ? "justify" : align as ParagraphFormat["alignment"];
  for (const key of ["keepNext", "keepLines", "pageBreakBefore", "widowControl"] as const) if (element(key)) result[key] = !["0","false","off"].includes(attr(key,"val") || "");
  if (element("tabs")) result.tabs = parseTabStopsXml(root).stops;
  if(typeof raw==="string"){if(paragraphCache.size>2000)paragraphCache.clear();paragraphCache.set(raw,result);}
  return result;
}
export function effectiveParagraph(node: PMNode): ParagraphFormat {
  return { ...paragraphFromXml(node.attrs.docxProperties), ...(node.attrs.styleParagraph || {}), ...(node.attrs.textAlign ? { alignment: node.attrs.textAlign } : {}), ...(node.attrs.indent ? { left: node.attrs.indent * 360 } : {}), ...(node.attrs.lineHeight ? { lineMode: "multiple", lineValue: Number(node.attrs.lineHeight) } : {}), ...(node.attrs.paragraphFormat || {}), tabs: effectiveTabs(node) };
}
/** The font profile used for Word automatic spacing, derived from actual runs. */
export function lineMetricFamily(node: PMNode): string {
  const inherited = node.attrs.styleText?.family || "", families = new Set<string>();
  let supported = true;
  node.descendants(child => {
    if (!child.isText || !child.text?.trim()) return;
    // New profiles establish Latin ASCII runs. Existing Arial behavior stays
    // separate, with its previously documented script/fallback limitations.
    if (/[^\t\n\r\x20-\x7e]/.test(child.text)) supported = false;
    const family = child.marks.find(mark => mark.type.name === "fontFamily")?.attrs.family || inherited;
    families.add(String(family).split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase());
  });
  const family = [...families][0] || inherited;
  return families.size > 1 || (!supported && !["arial", "liberation sans"].includes(family)) ? "" : family;
}
export function paragraphCSS(node: PMNode): string {
  const native = paragraphFromXml(node.attrs.docxProperties);
  const p = { ...native, ...(node.attrs.styleParagraph || {}), ...(node.attrs.textAlign ? {alignment:node.attrs.textAlign}:{}), ...(node.attrs.indent ? {left:node.attrs.indent*360}:{}), ...(node.attrs.lineHeight ? {lineMode:"multiple",lineValue:Number(node.attrs.lineHeight)}:{}), ...(node.attrs.paragraphFormat || {}) } as ParagraphFormat;
  const css: string[] = [];
  if (node.attrs.styleId && node.attrs.styleText) { const text = node.attrs.styleText as StyleText; css.push(`font-family:${text.family};font-size:${text.size}pt;font-weight:400;font-style:normal;text-decoration:none;color:#000`); }
  else if (node.attrs.styleText) {
    const text = node.attrs.styleText as Partial<StyleText>;
    if (text.family) css.push(`font-family:${text.family}`);
    if (text.size) css.push(`font-size:${text.size}pt`);
  }
  for (const [key, prop] of [["left","margin-left"],["right","margin-right"],["firstLine","text-indent"],["before","margin-top"],["after","margin-bottom"]] as const) if (p[key] !== undefined) css.push(`${prop}:${p[key]! / 20}pt`);
  if (p.alignment !== undefined) css.push(`text-align:${p.alignment}`);
  if (p.lineValue !== undefined) {
    const multiple = p.lineMode === "multiple" || !p.lineMode;
    // Native automatic spacing uses font metrics. Keep its original multiple
    // in the model/DOCX; authored HTML multiples still mean CSS em multiples.
    // A single paragraph-level CSS multiplier cannot represent different font
    // metric bases on different lines. Keep the fallback for mixed families.
    const family = lineMetricFamily(node);
    const line = multiple && (p.lineBasis || native.lineBasis) === "font" ? wordAutomaticLineHeight(p.lineValue, family) : p.lineValue;
    css.push(`line-height:${line}${multiple ? "" : "pt"}`);
  }
  if (p.keepNext !== undefined) css.push(`break-after:${p.keepNext ? "avoid" : "auto"}`);
  if (p.keepLines !== undefined) css.push(`break-inside:${p.keepLines ? "avoid" : "auto"}`);
  if (p.pageBreakBefore !== undefined) css.push(`break-before:${p.pageBreakBefore ? "page" : "auto"}`);
  if (p.widowControl !== undefined) css.push(`orphans:${p.widowControl ? 2 : 1};widows:${p.widowControl ? 2 : 1}`);
  return css.join(";");
}
/** A fixed Word line box can express a CSS em multiple only when every run
 * shares the measured paragraph font/size and the height is whole twips.
 * Keep native rules, unsupported scripts, inline objects and mixed runs as-is.
 * This is an export conversion; the editor's original CSS basis stays intact.
 */
export function authoredExactLineSpacing(node: PMNode): number | undefined {
  const p = effectiveParagraph(node);
  if ((p.lineMode && p.lineMode !== "multiple") || p.lineBasis === "font" || !p.lineValue) return;
  const text = node.attrs.styleText;
  if (!text || !Number.isFinite(text.size) || text.size <= 0 || !Number.isInteger(text.size * 2)) return;
  const single = wordSingleLineMetric(text.family || "");
  if (!single || p.lineValue < single) return;
  const family = String(text.family).split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase();
  // Native automatic profiles do not automatically authorize authored CSS
  // conversion. Its genuine exact-spacing evidence remains Arial-only.
  if (!["arial", "liberation sans"].includes(family)) return;
  let supported = true;
  node.descendants(child => {
    if (!supported) return false;
    if ((!child.isText && child.type.name !== "hard_break") || /[^\t\n\r\x20-\x7e]/.test(child.text || "")) { supported = false; return false; }
    const ownFamily = child.marks.find(mark => mark.type.name === "fontFamily")?.attrs.family || text.family;
    const ownSize = child.marks.find(mark => mark.type.name === "fontSize")?.attrs.size;
    const size = ownSize === undefined ? text.size : /^\d+(?:\.\d+)?pt$/.test(String(ownSize)) ? Number.parseFloat(ownSize) : NaN;
    if (String(ownFamily).split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase() !== family || size !== text.size || child.marks.some(mark => ["superscript", "subscript"].includes(mark.type.name))) supported = false;
  });
  const twips = p.lineValue * text.size * 20;
  if (supported && Math.abs(twips - Math.round(twips)) < 1e-8) return Math.round(twips) / 20;
}
export function paragraphXml(node: PMNode, linked = true, convertAuthoredSpacing = true): string {
  const xml = new DOMParser().parseFromString(node.attrs.docxProperties || `<w:pPr xmlns:w="${W}"/>`, "application/xml");
  const root = xml.documentElement;
  const ownsStyle = linked && !!node.attrs.styleId;
  const p: ParagraphFormat = ownsStyle ? { ...(node.attrs.textAlign ? { alignment: node.attrs.textAlign } : {}), ...(node.attrs.indent ? { left: node.attrs.indent * 360 } : {}), ...(node.attrs.lineHeight ? { lineMode: "multiple", lineValue: Number(node.attrs.lineHeight) } : {}), ...node.attrs.paragraphFormat } : effectiveParagraph(node);
  const exact = convertAuthoredSpacing ? authoredExactLineSpacing(node) : undefined;
  if (exact !== undefined) { p.lineMode = "exact"; p.lineValue = exact; }
  if (node.attrs.styleId) for (const el of Array.from(root.children)) if (["pStyle",...(ownsStyle ? ["spacing","ind","jc","keepNext","keepLines","pageBreakBefore","widowControl"] : [])].includes(el.localName)) el.remove();
  const set = (name: string, key: string, value: string | number) => { let el = Array.from(root.children).find(el => el.localName === name); if (!el) { el = xml.createElementNS(W,`w:${name}`); root.appendChild(el); } el.setAttributeNS(W,`w:${key}`,String(value)); };
  if (!ownsStyle && node.attrs.styleText) {
    const text = node.attrs.styleText as Partial<StyleText>;
    let run = Array.from(root.children).find(el => el.localName === "rPr");
    if (!run) { run = xml.createElementNS(W,"w:rPr"); root.appendChild(run); }
    if (text.family) {
      const fonts = Array.from(run.children).find(el => el.localName === "rFonts") || xml.createElementNS(W,"w:rFonts"), family = text.family.split(",")[0].trim().replace(/^["']|["']$/g, "");
      for (const key of ["ascii", "hAnsi"]) fonts.setAttributeNS(W,`w:${key}`,family);
      run.appendChild(fonts);
    }
    if (text.size) for (const name of ["sz", "szCs"]) { const size = Array.from(run.children).find(el => el.localName === name) || xml.createElementNS(W,`w:${name}`); size.setAttributeNS(W,"w:val",String(Math.round(text.size * 2))); run.appendChild(size); }
  }
  if (ownsStyle) set("pStyle","val",node.attrs.styleId);
  for (const [key,name,prop] of [["left","ind","left"],["right","ind","right"],["before","spacing","before"],["after","spacing","after"]] as const) if (p[key] !== undefined) set(name,prop,Math.round(p[key]!));
  if (p.firstLine !== undefined) { const ind = Array.from(root.children).find(el => el.localName === "ind"); ind?.removeAttributeNS(W,"firstLine"); ind?.removeAttributeNS(W,"hanging"); set("ind",p.firstLine < 0 ? "hanging" : "firstLine",Math.round(Math.abs(p.firstLine))); }
  if (p.lineValue !== undefined) { set("spacing","line",Math.round(p.lineValue * (p.lineMode === "multiple" || !p.lineMode ? 240 : 20))); set("spacing","lineRule",p.lineMode === "multiple" || !p.lineMode ? "auto" : p.lineMode); }
  if (p.alignment) set("jc","val",p.alignment === "justify" ? "both" : p.alignment);
  for (const key of ["keepNext","keepLines","pageBreakBefore","widowControl"] as const) if (p[key] !== undefined) set(key,"val",p[key] ? "1" : "0");
  if (p.tabs !== undefined) writeTabStopsXml(root, p.tabs);
  const order="pStyle keepNext keepLines pageBreakBefore framePr widowControl numPr suppressLineNumbers pBdr shd tabs suppressAutoHyphens kinsoku wordWrap overflowPunct topLinePunct autoSpaceDE autoSpaceDN bidi adjustRightInd snapToGrid spacing ind contextualSpacing mirrorIndents suppressOverlap jc textDirection textAlignment textboxTightWrap outlineLvl divId cnfStyle rPr sectPr pPrChange".split(" ");
  const rank=(element:Element)=>{const index=order.indexOf(element.localName);return index<0?order.length:index;};
  for(const element of Array.from(root.children).sort((a,b)=>rank(a)-rank(b)))root.appendChild(element);
  return new XMLSerializer().serializeToString(root);
}
