import type { Node as PMNode } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import type { EditorView, NodeView } from "prosemirror-view";
import { applyTextBoxLayout, textBoxAttrs, commitTextBoxChange } from "./text-box";
import { imagePageContext, placePageImages } from "./page-image-position";
import { ensureEditorFont } from "./editor-fonts";
import { textBoxLabels } from "./text-box-i18n";
import { getLocaleSnapshot, subscribeLocale } from "./i18n/store";

type Options = { onEdit: (pos: number) => void };
/** Selection UI is a sibling of artwork so behind-text boxes remain editable. */
export function syncTextBoxControls(wrapper: HTMLElement) {
  const frame = wrapper.querySelector<HTMLElement>(".pm-textbox-frame");
  const controls = wrapper.querySelector<HTMLElement>(".pm-textbox-controls");
  if (!frame || !controls) return;
  controls.style.left = frame.style.left; controls.style.top = frame.style.top;
  controls.style.width = frame.style.width; controls.style.height = `${frame.offsetHeight}px`;
}

export function createTextBoxNodeView(node: PMNode, view: EditorView, getPos: () => number | undefined, options: Options): NodeView {
  return new TextBoxNodeView(node, view, getPos, options);
}

class TextBoxNodeView implements NodeView {
  dom: HTMLSpanElement;
  private frame: HTMLSpanElement;
  private controls: HTMLSpanElement;
  private warning: HTMLSpanElement;
  private resizeObserver: ResizeObserver;
  private styleObserver: MutationObserver;
  private cancelGesture?: () => void;
  private gestureDoc?: PMNode;
  private destroyed = false;
  private unsubscribeLocale: () => void;
  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined, private options: Options) {
    this.dom = document.createElement("span"); this.dom.className = "pm-textbox-wrapper"; this.dom.contentEditable = "false";
    this.frame = document.createElement("span"); this.frame.className = "pm-textbox-frame";
    this.controls = document.createElement("span"); this.controls.className = "pm-textbox-controls pm-textbox-ui";
    this.warning = document.createElement("span"); this.warning.className = "pm-textbox-warning pm-textbox-ui"; this.warning.setAttribute("role", "status");
    this.warning.textContent = "Text box exceeds this page. Edit the text or size before printing.";
    const move = this.button("Move text box", "Move", "pm-textbox-move");
    move.addEventListener("pointerdown", e => this.gesture(e));
    move.addEventListener("keydown", e => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation(); const pos = this.getPos(); if (pos === undefined) return;
      const page = imagePageContext(this.view, pos), step = e.shiftKey ? 10 : 1;
      const a = textBoxAttrs(this.node.attrs);
      const x = Math.max(0, Math.min(page.width - this.frame.offsetWidth, a.x + (e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0)));
      const y = Math.max(0, Math.min(Math.max(0, page.height - this.frame.offsetHeight), a.y + (e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0)));
      commitTextBoxChange(this.view, closeHistory(this.view.state.tr).setNodeMarkup(pos, undefined, { ...this.node.attrs, x, y }));
    });
    const edit = this.button("Edit text box", "Edit text", "pm-textbox-edit");
    edit.addEventListener("click", e => { e.preventDefault(); this.edit(); });
    const actions = document.createElement("span"); actions.className = "pm-textbox-actions";
    actions.append(move, edit); this.controls.appendChild(actions);
    for (const corner of ["tl", "tr", "bl", "br"] as const) {
      const handle = this.button(`Resize text box ${corner}; press Enter to edit size`, "", `pm-textbox-handle pm-textbox-handle-${corner}`);
      handle.addEventListener("pointerdown", e => this.gesture(e, corner));
      handle.addEventListener("click", e => { if (e.detail === 0) this.edit(); });
      this.controls.appendChild(handle);
    }
    this.dom.append(this.frame, this.controls, this.warning);
    this.frame.addEventListener("pointerdown", e => { if (e.button !== 0) return; e.preventDefault(); this.select(); });
    this.frame.addEventListener("dblclick", e => { e.preventDefault(); this.edit(); });
    this.dom.addEventListener("dragstart", e => e.preventDefault());
    this.resizeObserver = new ResizeObserver(() => this.sync()); this.resizeObserver.observe(this.frame);
    this.styleObserver = new MutationObserver(() => this.sync()); this.styleObserver.observe(this.frame, { attributes: true, attributeFilter: ["style"] });
    this.unsubscribeLocale = subscribeLocale(() => this.localize()); this.localize();
    this.apply();
  }
  private localize() {
    const labels = textBoxLabels(getLocaleSnapshot());
    this.warning.textContent = labels.overflow;
    const move = this.controls.querySelector<HTMLButtonElement>(".pm-textbox-move")!;
    const edit = this.controls.querySelector<HTMLButtonElement>(".pm-textbox-edit")!;
    move.textContent = labels.move; move.setAttribute("aria-label", labels.moveLabel); move.title = labels.moveLabel;
    edit.textContent = labels.edit; edit.setAttribute("aria-label", labels.title); edit.title = labels.title;
    const names = { tl: labels.topLeft, tr: labels.topRight, bl: labels.bottomLeft, br: labels.bottomRight };
    for (const corner of ["tl", "tr", "bl", "br"] as const) {
      const handle = this.controls.querySelector<HTMLButtonElement>(`.pm-textbox-handle-${corner}`)!;
      handle.setAttribute("aria-label", `${labels.resize} (${names[corner]})`); handle.title = `${labels.resize} (${names[corner]})`;
    }
  }
  private button(label: string, text: string, className: string) {
    const el = document.createElement("button"); el.type = "button"; el.className = className;
    el.setAttribute("aria-label", label); el.title = label; el.textContent = text; el.style.touchAction = "none"; return el;
  }
  private select() {
    const pos = this.getPos(); if (pos === undefined || this.view.isDestroyed) return;
    this.view.dispatch(this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, pos))); this.view.focus();
  }
  private edit() { this.select(); const pos = this.getPos(); if (pos !== undefined) this.options.onEdit(pos); }
  private sync() {
    if (this.destroyed || this.view.isDestroyed) return;
    syncTextBoxControls(this.dom);
    const pos = this.getPos(); if (pos === undefined) return;
    const page = imagePageContext(this.view, pos);
    const overflow = this.frame.offsetHeight > page.height + 1;
    this.dom.classList.toggle("has-page-overflow", overflow);
    this.warning.style.left = this.frame.style.left;
    // Keep the warning at the box's start, even when its bottom is off the page.
    this.warning.style.top = this.frame.style.top;
  }
  private apply() { ensureEditorFont(this.node.attrs.fontFamily); applyTextBoxLayout(this.dom, this.node.attrs); this.sync(); }
  private gesture(event: PointerEvent, corner?: "tl" | "tr" | "bl" | "br") {
    if (!event.isPrimary || event.button !== 0 || this.view.isDestroyed) return;
    event.preventDefault(); event.stopPropagation(); this.cancelGesture?.(); this.select();
    const pos = this.getPos(); if (pos === undefined) return;
    const page = imagePageContext(this.view, pos), a = textBoxAttrs(this.node.attrs);
    const scale = this.view.dom.getBoundingClientRect().width / Number.parseFloat(getComputedStyle(this.view.dom).width) || 1;
    const startLeft = Number.parseFloat(this.frame.style.left || "0"), startTop = Number.parseFloat(this.frame.style.top || "0");
    const startWidth = this.frame.offsetWidth, startHeight = this.frame.offsetHeight;
    const doc = this.view.state.doc; this.gestureDoc = doc;
    let moved = false, next = { x: page.x, y: page.y, width: startWidth, height: a.height };
    const cleanup = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel); window.removeEventListener("keydown", key);
      this.cancelGesture = undefined; this.gestureDoc = undefined;
      this.dom.classList.remove("is-manipulating");
    };
    const cancel = () => { cleanup(); if (!this.destroyed) { this.apply(); if (!this.view.isDestroyed) placePageImages(this.view); } };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); } };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      if (this.view.isDestroyed || this.view.state.doc !== doc) { cancel(); return; }
      const dx = (e.clientX - event.clientX) / scale, dy = (e.clientY - event.clientY) / scale;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true; this.dom.classList.add("is-manipulating");
      if (!corner) {
        next.x = Math.max(0, Math.min(page.width - startWidth, page.x + dx));
        next.y = Math.max(0, Math.min(Math.max(0, page.height - startHeight), page.y + dy));
      } else {
        const left = corner.endsWith("l"), top = corner.startsWith("t");
        const maxWidth = left ? page.x + startWidth : page.width - page.x;
        next.width = Math.max(Math.min(40, maxWidth), Math.min(maxWidth, startWidth + (left ? -dx : dx)));
        next.x = left ? page.x + startWidth - next.width : page.x;
        const maxHeight = top ? page.y + startHeight : page.height - page.y;
        next.height = Math.max(Math.min(32, maxHeight), Math.min(maxHeight, startHeight + (top ? -dy : dy)));
        next.y = top ? page.y + startHeight - next.height : page.y;
        this.frame.style.width = `${next.width}px`; this.frame.style.minHeight = `${next.height}px`;
        next.y = Math.max(0, Math.min(Math.max(0, page.height - this.frame.offsetHeight), next.y));
      }
      this.frame.style.left = `${startLeft + next.x - page.x}px`; this.frame.style.top = `${startTop + next.y - page.y}px`; this.sync();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      cleanup();
      if (!moved || this.view.isDestroyed || this.view.state.doc !== doc || this.getPos() !== pos) { cancel(); return; }
      next = Object.fromEntries(Object.entries(next).map(([key, n]) => [key, Math.round(n * 100) / 100])) as typeof next;
      const tr = closeHistory(this.view.state.tr).setNodeMarkup(pos, undefined, { ...a, ...next, width: `${next.width}px` });
      tr.setSelection(NodeSelection.create(tr.doc, pos)); commitTextBoxChange(this.view, tr); this.view.focus();
    };
    this.cancelGesture = cancel;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel); window.addEventListener("keydown", key, { capture: false });
  }
  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    if (this.gestureDoc && this.view.state.doc !== this.gestureDoc) this.cancelGesture?.();
    this.node = node; this.apply(); return true;
  }
  selectNode() { this.dom.classList.add("is-selected"); }
  deselectNode() { this.dom.classList.remove("is-selected"); }
  stopEvent(event: Event) { return event.type !== "keydown" || !!(event.target as HTMLElement)?.closest(".pm-textbox-controls"); }
  ignoreMutation() { return true; }
  destroy() { this.destroyed = true; this.cancelGesture?.(); this.resizeObserver.disconnect(); this.styleObserver.disconnect(); this.unsubscribeLocale(); }
}
