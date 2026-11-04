/** DOM-only tab measurement; no document state, history, or transactions. */
import type { Node as PMNode } from "prosemirror-model";
import { mySchema } from "@/app/components/editor-schema";
import { paragraphAttrs } from "./paragraph-format";
import { documentTabSettings, effectiveTabs, type TabSettings } from "./tab-stops";
import type { DocumentLayout } from "./document-layout";
export type TabContentGeometry = { originClientX: number; direction: "ltr" | "rtl"; availableWidthTwips: number; cssPixelsPerTwip: number };
type Chunk = { text: string; style: CSSStyleDeclaration };
type Entry = { dom: HTMLElement; chunks: Chunk[]; implicit: boolean };
export function tabElementGeometry(dom: HTMLElement, scale: number): TabContentGeometry | null {
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const rect = dom.getBoundingClientRect(), style = getComputedStyle(dom), direction = style.direction === "rtl" ? "rtl" : "ltr";
  // Word positions paragraph tab stops from the containing text origin, before
  // the paragraph's leading indent. First-line indent moves text, not stops.
  const leadingIndent = Math.max(0, Number.parseFloat(direction === "rtl" ? style.marginRight : style.marginLeft) || 0);
  return { originClientX: direction === "rtl" ? rect.right + leadingIndent * scale : rect.left - leadingIndent * scale, direction,
    availableWidthTwips: (rect.width / scale + leadingIndent) * 15, cssPixelsPerTwip: scale / 15 };
}
export function createTabProbe(): HTMLElement {
  const probe = document.createElement("span"); probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:fixed;left:-100000px;top:0;display:inline-block;white-space:pre;visibility:hidden;pointer-events:none";
  document.body.appendChild(probe); return probe;
}
/** Traversal crosses mark wrappers and stops at the next tab or hard break. */
function entries(paragraph: HTMLElement): Entry[] {
  const result: Entry[] = []; let current: Entry | null = null;
  const walk = (node: Node) => {
    if (node instanceof HTMLElement) {
      if (node.matches(".pm-tab[data-edtr-tab],.pm-tab-implicit")) { current = { dom: node, chunks: [], implicit: node.matches(".pm-tab-implicit") }; result.push(current); return; }
      if (node.tagName === "BR" || node.matches(".pm-image-wrapper,.pm-textbox-wrapper")) { current = null; return; }
      if (node.matches(".pm-section-marker,.ProseMirror-widget,.ProseMirror-separator")) return;
    }
    if (node.nodeType === Node.TEXT_NODE && current && node.parentElement && node.textContent) {
      current.chunks.push({ text: node.textContent, style: getComputedStyle(node.parentElement) }); return;
    }
    for (const child of Array.from(node.childNodes)) walk(child);
  };
  for (const child of Array.from(paragraph.childNodes)) walk(child);
  return result;
}
function measure(chunks: Chunk[], separator: string | null, probe: HTMLElement): number {
  probe.replaceChildren();
  for (const chunk of chunks) {
    let text = chunk.text, done = false;
    if (separator) { const at = text.indexOf(separator); if (at >= 0) { text = text.slice(0, at); done = true; } }
    if (text) {
      const el = document.createElement("span"), style = chunk.style;
      // Non-default kerning makes computed font shorthand empty in Chromium.
      // Copy its independent metrics so probes retain the actual run font.
      for (const property of ["font-family","font-size","font-weight","font-style","font-stretch","font-variant"]) el.style.setProperty(property,style.getPropertyValue(property));
      el.style.letterSpacing = style.letterSpacing; el.style.wordSpacing = style.wordSpacing;
      el.style.fontKerning = style.fontKerning; el.style.fontFeatureSettings = style.fontFeatureSettings;
      el.style.fontVariant = style.fontVariant; el.style.textTransform = style.textTransform;
      el.textContent = text; probe.appendChild(el);
    }
    if (done) break;
  }
  return probe.getBoundingClientRect().width;
}
export function measureTabParagraph(dom: HTMLElement, node: PMNode, geometry: TabContentGeometry, settings: TabSettings, probe: HTMLElement, resolveGeometry?: (tab: HTMLElement, fallback: TabContentGeometry) => TabContentGeometry): boolean {
  let changed = false;
  const explicit = effectiveTabs(node).filter(stop => stop.alignment !== "clear").sort((a, b) => a.position - b.position);
  const maxExplicit = explicit.at(-1)?.position || 0, interval = Math.max(1, settings.defaultTabStop);
  let afterImplicit = false;
  for (const entry of entries(dom)) {
    const entryGeometry = resolveGeometry?.(entry.dom, geometry) ?? geometry;
    const rect = entry.dom.getBoundingClientRect();
    const current = (entryGeometry.direction === "rtl" ? entryGeometry.originClientX - rect.right : rect.left - entryGeometry.originClientX) / entryGeometry.cssPixelsPerTwip;
    const stop = entry.implicit ? explicit.find(candidate => candidate.alignment === "decimal" && candidate.position > current + 0.5)
      : explicit.find(candidate => candidate.position > current + 0.5);
    const fallback = Math.max(Math.floor(current / interval) + 1, Math.floor(maxExplicit / interval) + 1) * interval;
    const position = stop?.position ?? (entry.implicit ? current : fallback), align = stop?.alignment ?? "left";
    const total = align === "decimal" || align === "right" || align === "center" ? measure(entry.chunks, null, probe) : 0;
    const prefix = align === "decimal" ? measure(entry.chunks, settings.decimalSeparator, probe) : 0;
    // First-strong isolation mirrors dir=auto without relying on a DOM wrapper
    // surviving across distinct mark boundaries.
    const firstStrong = Array.from(entry.chunks.map(chunk => chunk.text).join("")).find(char => /\p{Letter}/u.test(char));
    const segmentDirection = firstStrong ? (/[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/u.test(firstStrong) ? "rtl" : "ltr") : entryGeometry.direction;
    const segment = align === "decimal" ? (segmentDirection === entryGeometry.direction ? prefix : total - prefix) : total;
    const offset = align === "center" ? segment / 2 : segment;
    let width = Math.max(0, Math.min(entryGeometry.availableWidthTwips / 15, (position - current) / 15 - offset));
    // Word can retreat an aligned tab when the complete following field fits
    // on this line but its requested alignment would push the tail past the
    // text edge. Shorten only the tab gap; never squeeze glyphs or prevent a
    // genuinely overlong field from wrapping.
    const availableGap = entryGeometry.availableWidthTwips / 15 - current / 15 - total;
    if (total > 0 && availableGap >= 0) width = Math.min(width, availableGap);
    if (!entry.implicit && afterImplicit) {
      const text = entry.chunks.map(chunk => chunk.text).join("");
      const token = /^[+\-0-9٠-٩۰-۹.,٫]+/u.exec(text)?.[0];
      const decimalStop = explicit.find(candidate => candidate.alignment === "decimal");
      if (token && decimalStop) {
        const nextExplicit = explicit.find(candidate => candidate.position > decimalStop.position + 0.5);
        const nextStop = nextExplicit?.position ?? Math.max(Math.floor(decimalStop.position / interval) + 1, Math.floor(maxExplicit / interval) + 1) * interval;
        const tokenWidth = measure(entry.chunks, token.length < text.length ? text[token.length] : null, probe);
        const remaining = (entryGeometry.availableWidthTwips - nextStop) / 15;
        if (!nextExplicit && remaining >= 0 && tokenWidth > remaining + 0.2 && nextStop / 15 > entryGeometry.availableWidthTwips / 15 - decimalStop.position / 15)
          width = nextStop / 15;
      }
    }
    afterImplicit = entry.implicit;
    const previous = Number.parseFloat(entry.dom.style.width) || 0;
    if (Math.abs(previous - width) > 0.2) { entry.dom.style.width = `${Math.round(width * 100) / 100}px`; changed = true; }
    if (!entry.implicit) entry.dom.dataset.leader = stop?.leader || "none";
  }
  return changed;
}
/** The running layer is a disposable DOM clone, so isolate bidi segments there. */
const isolatedParagraphs = new WeakSet<HTMLElement>();
function isolateSegments(paragraph: HTMLElement) {
  const delimiters = Array.from(paragraph.querySelectorAll<HTMLElement>('.pm-tab[data-edtr-tab],br'));
  for (let i = delimiters.length - 1; i >= 0; i--) {
    const tab = delimiters[i]; if (!tab.matches('.pm-tab[data-edtr-tab]')) continue;
    const range = document.createRange(); range.setStartAfter(tab);
    if (delimiters[i + 1]) range.setEndBefore(delimiters[i + 1]); else range.setEnd(paragraph, paragraph.childNodes.length);
    if (range.collapsed) continue;
    const span = document.createElement('span'); span.className = 'pm-tab-segment'; span.dir = 'auto';
    span.appendChild(range.extractContents()); range.insertNode(span);
  }
}
/** Isolate only the proven first numeric field in a disposable running clone. */
function wrapFirstNumericField(paragraph: HTMLElement) {
  const firstTab = paragraph.querySelector<HTMLElement>('.pm-tab[data-edtr-tab]'); if (!firstTab) return;
  const nextTab = Array.from(paragraph.querySelectorAll<HTMLElement>('.pm-tab[data-edtr-tab]'))[1];
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT), nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!(firstTab.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) || node.parentElement?.closest('.pm-tab')) continue;
    if (nextTab && (nextTab.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
    if (node.data) nodes.push(node);
  }
  for (const node of nodes) {
    const match = /^[+\-0-9٠-٩۰-۹.,٫]+/u.exec(node.data); if (!match) break;
    const length = node.data.length;
    const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, match[0].length);
    const span = document.createElement('span'); span.className = 'pm-tab-numeric-wrap'; range.surroundContents(span);
    if (match[0].length < length) break;
  }
}
/** Measure serialized header/footer paragraphs after attaching them to the page. */
export function layoutRunningTabs(box: HTMLElement, layout: DocumentLayout | null, scale: number): boolean {
  if (!box.querySelector(".pm-tab[data-edtr-tab],td,th")) return true;
  // Running fragments use DOMSerializer instead of the editable TableView.
  // Recreate its preserved native grid on this disposable rendering only.
  for (const table of Array.from(box.querySelectorAll<HTMLTableElement>('table[data-docx-grid]'))) {
    if (table.querySelector(':scope > colgroup')) continue;
    try {
      const grid: unknown = JSON.parse(table.getAttribute('data-docx-grid') || 'null');
      if (!Array.isArray(grid) || !grid.length || !grid.every(n => typeof n === 'number' && Number.isFinite(n) && n > 0)) continue;
      const group = document.createElement('colgroup');
      for (const width of grid) { const col = document.createElement('col'); col.style.width = `${width / 15}px`; group.append(col); }
      table.prepend(group);
      table.style.width = `${grid.reduce((sum, width) => sum + width, 0) / 15}px`;
      table.style.maxWidth = '100%'; table.style.tableLayout = 'fixed';
    } catch { /* Invalid source grid is left to normal table layout. */ }
  }
  const settings = documentTabSettings(layout), probe = createTabProbe(); let stable = true;
  try {
    for (const paragraph of Array.from(box.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,h5,h6'))) {
      const attrs = { ...paragraphAttrs(paragraph), docxProperties: paragraph.getAttribute('data-docx-properties') };
      const node = mySchema.nodes.paragraph.create(attrs), inDecimalCell = !!paragraph.closest('td,th') && effectiveTabs(node).some(stop => stop.alignment === 'decimal');
      if (!paragraph.querySelector('.pm-tab[data-edtr-tab]') && !inDecimalCell) continue;
      if (!isolatedParagraphs.has(paragraph)) {
        isolateSegments(paragraph);
        const stops = effectiveTabs(node).filter(stop => stop.alignment !== 'clear');
        const decimal = stops.find(stop => stop.alignment === 'decimal');
        if (inDecimalCell && decimal && !stops.some(stop => stop.position > decimal.position)) wrapFirstNumericField(paragraph);
        isolatedParagraphs.add(paragraph);
      }
      const geometry = tabElementGeometry(paragraph, scale); if (!geometry) continue;
      if (inDecimalCell && !paragraph.querySelector('.pm-tab-implicit')) {
        const implicit = document.createElement('span'); implicit.className = 'pm-tab-implicit'; implicit.setAttribute('aria-hidden', 'true'); paragraph.prepend(implicit);
      }
      let settled = false;
      for (let pass = 0; pass < 6; pass++) if (!measureTabParagraph(paragraph, node, geometry, settings, probe)) { settled = true; break; }
      stable &&= settled;
    }
  } finally { probe.remove(); }
  return stable;
}
