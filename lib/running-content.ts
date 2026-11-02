/** Header/footer HTML is parsed through the editor schema before display. */
import { DOMParser as PMParser, DOMSerializer, type Node as PMNode } from "prosemirror-model";
import { mySchema } from "@/app/components/editor-schema";
import type { DocumentLayout } from "./document-layout";
export type RunningKind = "header" | "footer";
export type RunningVariant = "default" | "first" | "even";
export type RunningSlot = { html: string; linked: boolean; distance: number; height: number };
export type RunningSlots = Record<string, RunningSlot>;
export const runningKey = (section: number, variant: RunningVariant, kind: RunningKind) => `${section}:${variant}:${kind}`;
export function rawSections(doc: PMNode): string[] {
  const result: string[] = [];
  doc.forEach(node => { if (String(node.attrs.docxProperties || "").includes("sectPr")) result.push(node.attrs.docxProperties); });
  result.push(doc.attrs.layout?.section || ""); return result;
}
function numberedHtml(html: string, kind: RunningKind, position: DocumentLayout["pageNumbers"], format: DocumentLayout["pageNumberFormat"], append: boolean): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const paragraphs = new Set<Element>();
  for (const field of Array.from(doc.querySelectorAll('[data-doc-field="PAGE"],[data-doc-field="NUMPAGES"]'))) {
    const p = field.closest("p"); if (p) paragraphs.add(p); field.remove();
  }
  for (const p of paragraphs) {
    const staticText = (p.textContent || "").replace(/\b(?:page|pages|of|sayfa)\b/gi, "").replace(/[\s/|:–—-]/g, "");
    if (!staticText && !p.querySelector("img")) p.remove();
  }
  if (append && position === (kind === "header" ? "top" : "bottom")) {
    const p = doc.createElement("p"); p.style.textAlign = "right";
    const page = doc.createElement("span"); page.setAttribute("data-doc-field", "PAGE"); page.textContent = "1"; p.appendChild(page);
    if (format === "of") { p.appendChild(doc.createTextNode(" / ")); const total = doc.createElement("span"); total.setAttribute("data-doc-field", "NUMPAGES"); total.textContent = "…"; p.appendChild(total); }
    doc.body.appendChild(p);
  }
  return doc.body.innerHTML || "<p></p>";
}
export function updateRunningNumbering(layout: DocumentLayout): DocumentLayout {
  if (!layout.running) return layout;
  return { ...layout, running: Object.fromEntries(Object.entries(layout.running).map(([key, slot]) => {
    const [, variant, kind] = key.split(":");
    return [key, { ...slot, html: numberedHtml(slot.html, kind as RunningKind, layout.pageNumbers, layout.pageNumberFormat, variant === "default" || /data-doc-field="(?:PAGE|NUMPAGES)"/.test(slot.html)) }];
  })) };
}
export function runningSlot(original: RunningSlots, layout: DocumentLayout | null, section: number, variant: RunningVariant, kind: RunningKind): RunningSlot {
  const key = runningKey(section, variant, kind);
  const edited = layout?.running?.[key], slot = edited || original[key];
  if ((slot?.linked || !slot) && section > 0) return { ...runningSlot(original, layout, section - 1, variant, kind), linked: true };
  const result = slot || { html: "<p></p>", linked: false, distance: 283, height: 0 };
  if (!edited && (layout?.overrides?.pageNumbers || !layout?.source && layout?.pageNumbers && layout.pageNumbers !== "off")) return { ...result, html: numberedHtml(result.html, kind, layout.pageNumbers, layout.pageNumberFormat, variant === "default" || !!slot) };
  return result;
}
export function runningFragment(html: string, page: string | number = 1, total = 1): DocumentFragment {
  const input = new DOMParser().parseFromString(html, "text/html");
  const node = PMParser.fromSchema(mySchema).parse(input.body);
  const fragment = document.createDocumentFragment();
  DOMSerializer.fromSchema(mySchema).serializeFragment(node.content, {}, fragment);
  fragment.querySelectorAll<HTMLElement>("[data-doc-field]").forEach(field => { field.classList.remove("edtr-document-field"); if (field.dataset.docField === "PAGE") field.textContent = String(page); else if (field.dataset.docField === "NUMPAGES") field.textContent = String(total); });
  return fragment;
}
export function runningHeight(html: string, width: number): number {
  const box = document.createElement("div"); box.className = "edtr-running-content";
  box.style.cssText = `position:fixed;left:-100000px;top:0;visibility:hidden;width:${Math.max(40, width)}px`;
  box.appendChild(runningFragment(html)); document.body.appendChild(box);
  const height = Math.ceil(box.getBoundingClientRect().height * 15); box.remove(); return height;
}
