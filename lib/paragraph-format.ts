/** Paragraph values use Word twips, except unitless line-spacing multiples. */
import type { Node as PMNode } from "prosemirror-model";
export type ParagraphFormat = {
  alignment?: "left" | "center" | "right" | "justify";
  left?: number; right?: number; firstLine?: number;
  before?: number; after?: number;
  lineMode?: "multiple" | "exact" | "atLeast"; lineValue?: number;
  keepNext?: boolean; keepLines?: boolean; pageBreakBefore?: boolean; widowControl?: boolean;
};
export type StyleText = { family: string; size: number; bold: boolean; italic: boolean; underline: boolean; color: string };
export type DocumentStyle = { name: string; basedOn?: string; level?: number; paragraph: ParagraphFormat; text: Partial<StyleText> };
export type DocumentStyles = Record<string, DocumentStyle>;
export const DEFAULT_STYLE_TEXT: StyleText = { family: "Calibri, Carlito, Arial, sans-serif", size: 12, bold: false, italic: false, underline: false, color: "#000000" };
export const DEFAULT_PARAGRAPH: Required<ParagraphFormat> = { alignment: "left", left: 0, right: 0, firstLine: 0, before: 0, after: 120, lineMode: "multiple", lineValue: 1.5, keepNext: false, keepLines: false, pageBreakBefore: false, widowControl: true };
export function cleanParagraph(value: unknown): ParagraphFormat {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>, result: Record<string, unknown> = {};
  for (const key of ["left", "right", "firstLine", "before", "after", "lineValue"]) if (typeof raw[key] === "number" && Number.isFinite(raw[key])) result[key] = Math.max(key === "firstLine" ? -14400 : 0, Math.min(key === "lineValue" ? 1638 : 14400, raw[key] as number));
  for (const key of ["keepNext", "keepLines", "pageBreakBefore", "widowControl"]) if (typeof raw[key] === "boolean") result[key] = raw[key];
  if (["left", "center", "right", "justify"].includes(String(raw.alignment))) result.alignment = raw.alignment;
  if (["multiple", "exact", "atLeast"].includes(String(raw.lineMode))) result.lineMode = raw.lineMode;
  return result as ParagraphFormat;
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
  return { styleId: el.getAttribute("data-edtr-style") || null, styleText: rawText ? { ...DEFAULT_STYLE_TEXT,...cleanStyleText(rawText) } : null, styleParagraph: cleanParagraph(jsonAttribute(el, "data-edtr-style-paragraph")), paragraphFormat: cleanParagraph(jsonAttribute(el, "data-edtr-paragraph")) };
}
export function paragraphDOM(node: PMNode): Record<string, string> {
  return { ...(effectiveParagraph(node).lineMode ? { "data-edtr-line-mode":effectiveParagraph(node).lineMode! }:{}), ...(node.attrs.styleId ? { "data-edtr-style": node.attrs.styleId, "data-edtr-style-text": JSON.stringify(node.attrs.styleText), "data-edtr-style-paragraph": JSON.stringify(node.attrs.styleParagraph) } : {}), ...(Object.keys(node.attrs.paragraphFormat || {}).length ? { "data-edtr-paragraph": JSON.stringify(node.attrs.paragraphFormat) } : {}) };
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
  const line = number("spacing","line"); if (line !== undefined) { result.lineMode = attr("spacing","lineRule") === "exact" ? "exact" : attr("spacing","lineRule") === "atLeast" ? "atLeast" : "multiple"; result.lineValue = line / (result.lineMode === "multiple" ? 240 : 20); }
  const align = attr("jc","val"); if (["left","center","right","both"].includes(align || "")) result.alignment = align === "both" ? "justify" : align as ParagraphFormat["alignment"];
  for (const key of ["keepNext", "keepLines", "pageBreakBefore", "widowControl"] as const) if (element(key)) result[key] = !["0","false","off"].includes(attr(key,"val") || "");
  if(typeof raw==="string"){if(paragraphCache.size>2000)paragraphCache.clear();paragraphCache.set(raw,result);}
  return result;
}
export function effectiveParagraph(node: PMNode): ParagraphFormat {
  return { ...paragraphFromXml(node.attrs.docxProperties), ...(node.attrs.styleParagraph || {}), ...(node.attrs.textAlign ? { alignment: node.attrs.textAlign } : {}), ...(node.attrs.indent ? { left: node.attrs.indent * 360 } : {}), ...(node.attrs.lineHeight ? { lineMode: "multiple", lineValue: Number(node.attrs.lineHeight) } : {}), ...(node.attrs.paragraphFormat || {}) };
}
export function paragraphCSS(node: PMNode): string {
  // Only newly managed values override the original imported CSS.
  const p = { ...(node.attrs.styleParagraph || {}), ...(node.attrs.textAlign ? {alignment:node.attrs.textAlign}:{}), ...(node.attrs.indent ? {left:node.attrs.indent*360}:{}), ...(node.attrs.lineHeight ? {lineMode:"multiple",lineValue:Number(node.attrs.lineHeight)}:{}), ...(node.attrs.paragraphFormat || {}) } as ParagraphFormat;
  const css: string[] = [];
  if (node.attrs.styleId && node.attrs.styleText) { const text = node.attrs.styleText as StyleText; css.push(`font-family:${text.family};font-size:${text.size}pt;font-weight:400;font-style:normal;text-decoration:none;color:#000`); }
  for (const [key, prop] of [["left","margin-left"],["right","margin-right"],["firstLine","text-indent"],["before","margin-top"],["after","margin-bottom"]] as const) if (p[key] !== undefined) css.push(`${prop}:${p[key]! / 20}pt`);
  if (p.alignment !== undefined) css.push(`text-align:${p.alignment}`);
  if (p.lineValue !== undefined) css.push(`line-height:${p.lineValue}${p.lineMode === "multiple" || !p.lineMode ? "" : "pt"}`);
  if (p.keepNext !== undefined) css.push(`break-after:${p.keepNext ? "avoid" : "auto"}`);
  if (p.keepLines !== undefined) css.push(`break-inside:${p.keepLines ? "avoid" : "auto"}`);
  if (p.pageBreakBefore !== undefined) css.push(`break-before:${p.pageBreakBefore ? "page" : "auto"}`);
  if (p.widowControl !== undefined) css.push(`orphans:${p.widowControl ? 2 : 1};widows:${p.widowControl ? 2 : 1}`);
  return css.join(";");
}
export function paragraphXml(node: PMNode, linked = true): string {
  const xml = new DOMParser().parseFromString(node.attrs.docxProperties || `<w:pPr xmlns:w="${W}"/>`, "application/xml");
  const root = xml.documentElement;
  const ownsStyle = linked && !!node.attrs.styleId;
  const p: ParagraphFormat = ownsStyle ? { ...(node.attrs.textAlign ? { alignment: node.attrs.textAlign } : {}), ...(node.attrs.indent ? { left: node.attrs.indent * 360 } : {}), ...(node.attrs.lineHeight ? { lineMode: "multiple", lineValue: Number(node.attrs.lineHeight) } : {}), ...node.attrs.paragraphFormat } : effectiveParagraph(node);
  if (node.attrs.styleId) for (const el of Array.from(root.children)) if (["pStyle",...(ownsStyle ? ["spacing","ind","jc","keepNext","keepLines","pageBreakBefore","widowControl"] : [])].includes(el.localName)) el.remove();
  const set = (name: string, key: string, value: string | number) => { let el = Array.from(root.children).find(el => el.localName === name); if (!el) { el = xml.createElementNS(W,`w:${name}`); root.appendChild(el); } el.setAttributeNS(W,`w:${key}`,String(value)); };
  if (ownsStyle) set("pStyle","val",node.attrs.styleId);
  for (const [key,name,prop] of [["left","ind","left"],["right","ind","right"],["before","spacing","before"],["after","spacing","after"]] as const) if (p[key] !== undefined) set(name,prop,Math.round(p[key]!));
  if (p.firstLine !== undefined) { const ind = Array.from(root.children).find(el => el.localName === "ind"); ind?.removeAttributeNS(W,"firstLine"); ind?.removeAttributeNS(W,"hanging"); set("ind",p.firstLine < 0 ? "hanging" : "firstLine",Math.round(Math.abs(p.firstLine))); }
  if (p.lineValue !== undefined) { set("spacing","line",Math.round(p.lineValue * (p.lineMode === "multiple" || !p.lineMode ? 240 : 20))); set("spacing","lineRule",p.lineMode === "multiple" || !p.lineMode ? "auto" : p.lineMode); }
  if (p.alignment) set("jc","val",p.alignment === "justify" ? "both" : p.alignment);
  for (const key of ["keepNext","keepLines","pageBreakBefore","widowControl"] as const) if (p[key] !== undefined) set(key,"val",p[key] ? "1" : "0");
  const order="pStyle keepNext keepLines pageBreakBefore framePr widowControl numPr suppressLineNumbers pBdr shd tabs suppressAutoHyphens kinsoku wordWrap overflowPunct topLinePunct autoSpaceDE autoSpaceDN bidi adjustRightInd snapToGrid spacing ind contextualSpacing mirrorIndents suppressOverlap jc textDirection textAlignment textboxTightWrap outlineLvl divId cnfStyle rPr sectPr pPrChange".split(" ");
  const rank=(element:Element)=>{const index=order.indexOf(element.localName);return index<0?order.length:index;};
  for(const element of Array.from(root.children).sort((a,b)=>rank(a)-rank(b)))root.appendChild(element);
  return new XMLSerializer().serializeToString(root);
}
