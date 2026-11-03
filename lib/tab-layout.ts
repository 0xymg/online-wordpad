/** Transient tab measurements shared by the live and read-only editors. */
import { Plugin } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { Decoration, DecorationSet, type EditorView, type NodeView } from "prosemirror-view";
import { remeasurePagination } from "@/app/components/paginationPlugin";
import { documentTabSettings, effectiveTabs } from "./tab-stops";
import { createTabProbe, measureTabParagraph, tabElementGeometry, type TabContentGeometry } from "./tab-dom-layout";
export type { TabContentGeometry } from "./tab-dom-layout";

/** Section/cell content origin before the paragraph's leading indent. */
export function tabContentGeometry(view: EditorView, paragraphPos: number): TabContentGeometry | null {
  if (view.isDestroyed || !view.dom.isConnected) return null;
  const node = view.state.doc.nodeAt(paragraphPos), dom = view.nodeDOM(paragraphPos);
  if (!node?.isTextblock || !(dom instanceof HTMLElement)) return null;
  const root = view.dom.getBoundingClientRect(), width = Number.parseFloat(getComputedStyle(view.dom).width);
  return tabElementGeometry(dom, root.width / width);
}

export function createTabNodeView(): NodeView {
  const dom = document.createElement("span");
  dom.className = "pm-tab"; dom.setAttribute("data-edtr-tab", "true");
  dom.setAttribute("contenteditable", "false"); dom.setAttribute("aria-label", "Tab");
  dom.textContent = "\t";
  return { dom, ignoreMutation: () => true };
}

type Pending = { schedule: () => void; run: () => boolean; wait: () => Promise<boolean>; destroy: () => void };
const instances = new WeakMap<EditorView, Pending>();
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
/** Wait for current fonts, tab widths and pagination before snapshot/print. */
export async function flushTabLayout(view: EditorView): Promise<void> {
  const instance = instances.get(view); if (!instance) return;
  await document.fonts.ready;
  if (!await instance.wait()) throw new Error("Tab layout could not settle before export");
}
export function tabLayoutPlugin(): Plugin {
  return new Plugin({
    props: { decorations(state) {
      const decorations: Decoration[] = [];
      state.doc.descendants((node, pos) => {
        if (!node.isTextblock) return;
        const $pos = state.doc.resolve(pos);
        const inCell = Array.from({ length: $pos.depth }, (_, i) => $pos.node(i + 1)).some(parent => ["cell", "header_cell"].includes(parent.type.spec.tableRole || ""));
        const activeStops = effectiveTabs(node).filter(stop => stop.alignment !== "clear");
        const decimalStop = activeStops.find(stop => stop.alignment === "decimal");
        if (inCell && decimalStop) {
          decorations.push(Decoration.widget(pos + 1, () => {
            const dom = document.createElement("span"); dom.className = "pm-tab-implicit"; dom.setAttribute("aria-hidden", "true"); dom.setAttribute("contenteditable", "false"); return dom;
          }, { side: -1, key: "implicit-decimal-cell", ignoreSelection: true }));
        }
        let start: number | null = null, firstEnd = 0, lastStart = 0;
        const addSegment = (end: number) => {
          if (start === null || end <= start) return;
          // Pseudo FSI/PDI surround the whole field, even when ProseMirror
          // splits inline decorations at mark boundaries. No controls enter text.
          decorations.push(Decoration.inline(start, firstEnd, { class: "pm-tab-segment-start" }));
          decorations.push(Decoration.inline(lastStart, end, { class: "pm-tab-segment-end" }));
        };
        node.forEach((child, offset) => {
          const at = pos + 1 + offset;
          if (child.type.name === "tab" || child.type.name === "hard_break") {
            addSegment(at); start = child.type.name === "tab" ? at + child.nodeSize : null;
            firstEnd = 0; lastStart = 0;
          } else if (start !== null) {
            if (!firstEnd) firstEnd = at + child.nodeSize;
            lastStart = at;
          }
        });
        addSegment(pos + 1 + node.content.size);
        // In a narrow decimal-aligned cell Word can split the numeric token at
        // the cell edge instead of moving the whole number to another line.
        // Only the first field after the implicit decimal stop has been
        // established against Word; later explicit stops retain normal wrapping.
        if (inCell && decimalStop && !activeStops.some(stop => stop.position > decimalStop.position)) {
          let numericStart: number | null = null, numericEnd = 0, reading = false, seenTab = false;
          const addNumeric = () => { if (numericStart !== null && numericEnd > numericStart) decorations.push(Decoration.inline(numericStart, numericEnd, { class: "pm-tab-numeric-wrap" })); };
          node.forEach((child, offset) => {
            const at = pos + 1 + offset;
            if (child.type.name === "tab") { addNumeric(); numericStart = null; numericEnd = 0; reading = !seenTab; seenTab = true; return; }
            if (!reading || !child.isText) { if (reading) { addNumeric(); reading = false; } return; }
            const match = /^[+\-0-9٠-٩۰-۹.,٫]+/u.exec(child.text || "");
            if (!match) { addNumeric(); reading = false; return; }
            if (numericStart === null) numericStart = at;
            numericEnd = at + match[0].length;
            if (match[0].length < (child.text || "").length) { addNumeric(); reading = false; }
          });
          if (reading) addNumeric();
        }
        return false;
      });
      return decorations.length ? DecorationSet.create(state.doc, decorations) : null;
    } },
    view(view) {
    let raf = 0, destroyed = false;
    const probe = createTabProbe();
    const measurePass = () => {
      let changed = false;
      const settings = documentTabSettings(view.state.doc.attrs.layout);
      view.state.doc.descendants((node: PMNode, pos: number) => {
        if (!node.isTextblock) return;
        const dom = view.nodeDOM(pos); if (!(dom instanceof HTMLElement) || !dom.querySelector(".pm-tab[data-edtr-tab],.pm-tab-implicit")) return false;
        const geometry = tabContentGeometry(view, pos); if (!geometry) return false;
        changed = measureTabParagraph(dom, node, geometry, settings, probe) || changed;
        return false;
      });
      return changed;
    };
    const run = () => {
      if (destroyed || view.isDestroyed || !view.dom.isConnected) return true;
      let changed = false, stable = false;
      for (let pass = 0; pass < 6; pass++) { const next = measurePass(); changed ||= next; if (!next) { stable = true; break; } }
      if (changed) remeasurePagination(view);
      return stable;
    };
    const schedule = () => { if (!destroyed && !raf) raf = requestAnimationFrame(() => { raf = 0; run(); }); };
    const observer = new ResizeObserver(schedule); observer.observe(view.dom); if (view.dom.parentElement) observer.observe(view.dom.parentElement);
    window.addEventListener("resize", schedule); document.fonts.addEventListener("loadingdone", schedule);
    void document.fonts.ready.then(schedule); schedule();
    const instance: Pending = { schedule, run, async wait() {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      run(); await frame(); await frame(); const stable = run(); await frame();
      return stable;
    }, destroy() { destroyed = true; cancelAnimationFrame(raf); observer.disconnect(); window.removeEventListener("resize", schedule); document.fonts.removeEventListener("loadingdone", schedule); probe.remove(); } };
    instances.set(view, instance);
    return { update: schedule, destroy() { if (instances.get(view) === instance) instances.delete(view); instance.destroy(); } };
  } });
}
