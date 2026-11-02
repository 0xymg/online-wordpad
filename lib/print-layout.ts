/** Print the measured editor sheets, including rich running content. */
import type { EditorView } from "prosemirror-view";
import { paginationKey, remeasurePagination } from "@/app/components/paginationPlugin";

const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

export async function preparePrintLayout(view: EditorView, host: HTMLElement, credit?: { title: string; date: string }) {
  const doc = view.state.doc;
  const { readRunningSource } = await import("./header-footer-source");
  await Promise.all([readRunningSource(doc), document.fonts.ready]);
  remeasurePagination(view);
  await frame(); await frame(); await frame();
  const source = view.dom.parentElement;
  if (view.isDestroyed || view.state.doc !== doc || !source) throw new Error("Document changed while preparing print");
  await Promise.all(Array.from(source.querySelectorAll("img")).map(img => img.decode().catch(() => {})));
  remeasurePagination(view); await frame(); await frame();
  const pages = paginationKey.getState(view.state)?.pages;
  if (!pages?.length || view.state.doc !== doc) throw new Error("Page layout is not ready");
  const maximumWidth = Math.max(...pages.map(page => page.geometry.width)) / 15;
  const rootStyle = getComputedStyle(source);
  const template = source.cloneNode(true) as HTMLElement;
  template.classList.remove("pm-measuring");
  for (const [name, value] of Object.entries({ width: `${maximumWidth}px`, margin: "0", zoom: "1", position: "absolute", minHeight: "0", paddingTop: rootStyle.paddingTop, paddingBottom: rootStyle.paddingBottom, paddingLeft: rootStyle.paddingLeft, paddingRight: rootStyle.paddingRight, background: "white", color: "black", boxShadow: "none" })) {
    template.style.setProperty(name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`), value, "important");
  }
  // These screen measurements must survive the legacy natural-flow print CSS.
  const originals = source.querySelectorAll<HTMLElement>(".pm-section-block,.pm-paginated-source-row");
  template.querySelectorAll<HTMLElement>(".pm-section-block,.pm-paginated-source-row").forEach((el, index) => {
    const css = getComputedStyle(originals[index]);
    for (const prop of el.classList.contains("pm-section-block") ? ["width", "left", "max-width"] : ["height"]) el.style.setProperty(prop, css.getPropertyValue(prop), "important");
  });
  template.querySelectorAll<HTMLElement>(".pm-page-number-edge").forEach((el, index) => {
    const edge = source.querySelectorAll<HTMLElement>(".pm-page-number-edge")[index];
    el.style.top = `${edge.offsetTop}px`; el.style.bottom = "auto";
  });
  template.querySelectorAll(".pm-table-drag-handle,.pm-image-handle,.column-resize-handle,.search-match-overlay").forEach(el => el.remove());
  template.querySelectorAll("[contenteditable]").forEach(el => el.removeAttribute("contenteditable"));
  template.querySelectorAll(".selectedCell,.ProseMirror-selectednode,.is-selected").forEach(el => el.classList.remove("selectedCell", "ProseMirror-selectednode", "is-selected"));
  const output = document.createDocumentFragment(), style = document.createElement("style");
  style.textContent = pages.map(({ geometry: g }, index) => `@page edtr${index} { size:${g.width / 20}pt ${g.height / 20}pt; margin:0; }`).join("\n");
  output.appendChild(style);
  pages.forEach((page, index) => {
    const g = page.geometry, sheet = document.createElement("section");
    sheet.className = "edtr-print-sheet";
    // Leave a sub-point tolerance for the print engine's paper-size rounding.
    const height = g.height / 15 - 1;
    sheet.style.cssText = `page:edtr${index};position:relative;width:${g.width / 15}px;height:${height}px;overflow:hidden;break-after:${index === pages.length - 1 ? "auto" : "page"};background:white`;
    const clone = template.cloneNode(true) as HTMLElement;
    // Prevent Chromium from separately fragmenting the translated document.
    // Without layout containment later-page body text can disappear in print.
    clone.style.contain = "size layout";
    clone.style.setProperty("height", `${height}px`, "important");
    clone.style.setProperty("top", `${-page.top}px`, "important");
    clone.style.setProperty("left", `${-(maximumWidth - g.width / 15) / 2}px`, "important");
    sheet.appendChild(clone);
    if (credit) for (const kind of ["header", "footer"]) {
      const band = document.createElement("div");
      band.style.cssText = `position:absolute;left:${g.margins.left / 15}px;right:${g.margins.right / 15}px;${kind === "header" ? "top" : "bottom"}:4px;display:flex;justify-content:space-between;font:9px Calibri,Carlito,Arial,sans-serif;color:#777`;
      for (const text of kind === "header" ? [credit.title, credit.date] : ["EDTRpad", "wordpad.info"]) { const span = document.createElement("span"); span.textContent = text; band.appendChild(span); }
      sheet.appendChild(band);
    }
    output.appendChild(sheet);
  });
  host.replaceChildren(output);
}

