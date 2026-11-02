import type { DocumentStyles } from "./paragraph-format";
/** Small, shared document metadata. Kept in the document, never in user preferences. */
export type DocumentLayout = {
  width: number; height: number;
  margins: { top: number; right: number; bottom: number; left: number };
  styles?: DocumentStyles;
  sectionMargins?: Record<string, {top:number;right:number;bottom:number;left:number}>;
  pageNumbers?: "off" | "top" | "bottom";
  pageNumberFormat?: "plain" | "of";
  numberingStyle?: { start: number; alignment: string; template: string; format: string; hideFirst: boolean };
  evenAndOddHeaders?: boolean;
  running?: Record<string, { html: string; linked: boolean; distance: number; height: number }>;
  source?: string; // Compressed OOXML header/footer dependencies, not the original document.
  section?: string;
  overrides?: { margins?: boolean; orientation?: boolean; pageNumbers?: boolean };
};
export const LAYOUT_ATTRIBUTE = "data-edtr-layout";
export function readLayout(root: HTMLElement): DocumentLayout | null {
  const value = root.querySelector(`[${LAYOUT_ATTRIBUTE}]`)?.getAttribute(LAYOUT_ATTRIBUTE);
  if (!value) return null;
  try {
    const data = JSON.parse(value) as DocumentLayout;
    if (![data.width, data.height, ...Object.values(data.margins)].every(v => Number.isFinite(v) && v >= 0) || data.width < 720 || data.height < 720) return null;
    return data;
  } catch { return null; }
}
export function wrapDocumentHtml(html: string, layout: DocumentLayout | null): string {
  if (!layout) return html;
  const wrapper = document.createElement("div");
  wrapper.setAttribute(LAYOUT_ATTRIBUTE, JSON.stringify(layout));
  wrapper.innerHTML = html;
  return wrapper.outerHTML;
}
export function readDocxProperties(dom: Node | string): string | null {
  return typeof dom === "string" ? null : (dom as HTMLElement).getAttribute("data-docx-properties");
}

export function defaultDocumentLayout(): DocumentLayout {
  return { width: 11906, height: 16838, margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, pageNumbers: "off", pageNumberFormat: "plain" };
}
