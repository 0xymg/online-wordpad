/** Plain, editable text boxes. Text is data, never raw HTML. */
import type { DOMOutputSpec, NodeSpec } from "prosemirror-model";
import { NodeSelection, type Transaction } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import type { EditorView } from "prosemirror-view";
import { DEFAULT_DOCUMENT_FONT_CSS } from "./document-font";

export type TextBoxAttrs = {
  text: string; position: "page"; x: number; y: number; width: string; height: number;
  layer: number; textPlane: "front" | "behind"; fontSize: number; fontFamily: string;
  color: string; background: string; borderColor: string; padding: number;
};
const number = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const color = (value: unknown, fallback: string) => /^#[\da-f]{6}$/i.test(String(value)) ? String(value) : fallback;
export function textBoxAttrs(raw: Record<string, unknown> = {}): TextBoxAttrs {
  const width = Number.parseFloat(String(raw.width ?? "240px"));
  const family = String(raw.fontFamily ?? DEFAULT_DOCUMENT_FONT_CSS);
  return {
    text: String(raw.text ?? "").replace(/\r\n?/g, "\n"), position: "page",
    x: number(raw.x, 96, 0, 100000), y: number(raw.y, 96, 0, 100000),
    width: `${Number.isFinite(width) ? Math.max(40, Math.min(3000, width)) : 240}px`,
    height: number(raw.height, 96, 32, 100000), layer: Math.floor(number(raw.layer, 0, 0, 1000000)),
    textPlane: raw.textPlane === "behind" ? "behind" : "front",
    fontSize: number(raw.fontSize, 12, 6, 144),
    fontFamily: family.length <= 200 && /^[\p{L}\p{N}\s,'"-]+$/u.test(family) ? family : DEFAULT_DOCUMENT_FONT_CSS,
    color: color(raw.color, "#000000"), background: raw.background === "transparent" ? "transparent" : color(raw.background, "#ffffff"),
    borderColor: color(raw.borderColor, "#666666"), padding: number(raw.padding, 8, 0, 72),
  };
}
export const textBoxWrapperStyle = "position:relative;display:inline-block;width:0;height:0;max-width:none;vertical-align:baseline;line-height:0;";
export function textBoxFrameStyle(raw: Record<string, unknown>): string {
  const a = textBoxAttrs(raw);
  return `position:absolute;display:block;box-sizing:border-box;left:${a.x}px;top:${a.y}px;width:${a.width};min-height:${a.height}px;height:auto;max-width:none;white-space:pre-wrap;overflow-wrap:anywhere;overflow:visible;line-height:1.2;font-size:${a.fontSize}pt;font-family:${a.fontFamily};color:${a.color};background:${a.background};border:1px solid ${a.borderColor};padding:${a.padding}px;z-index:${a.textPlane === "behind" ? -1000001 + a.layer : 1 + a.layer};`;
}
export function textBoxDOM(raw: Record<string, unknown>): DOMOutputSpec {
  const a = textBoxAttrs(raw);
  return ["span", { "data-edtr-textbox": JSON.stringify(a), "data-position": "page", "data-text-plane": a.textPlane,
    class: "pm-textbox-wrapper", style: textBoxWrapperStyle },
  ["span", { class: "pm-textbox-frame", style: textBoxFrameStyle(a), dir: "auto" }, a.text || "\u200b"]];
}
const defaults = textBoxAttrs();
export const textBoxNodeSpec: NodeSpec = {
  inline: true, group: "inline", atom: true, selectable: true, draggable: false,
  attrs: Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, { default: value }])),
  parseDOM: [{ tag: "span[data-edtr-textbox]", getAttrs(dom) {
    try { return textBoxAttrs(JSON.parse((dom as HTMLElement).getAttribute("data-edtr-textbox") || "{}")); }
    catch { return false; }
  } }],
  toDOM: node => textBoxDOM(node.attrs),
  leafText: node => String(node.attrs.text || ""),
};
export function applyTextBoxLayout(wrapper: HTMLElement, raw: Record<string, unknown>) {
  const a = textBoxAttrs(raw);
  wrapper.style.cssText = textBoxWrapperStyle;
  wrapper.dataset.edtrTextbox = JSON.stringify(a);
  wrapper.dataset.position = "page";
  wrapper.dataset.textPlane = a.textPlane;
  const frame = wrapper.querySelector<HTMLElement>(".pm-textbox-frame");
  if (frame) { frame.style.cssText = textBoxFrameStyle(a); frame.textContent = a.text || "\u200b"; frame.dir = "auto"; }
}
/** Isolate both sides of an explicit box edit from subsequent typing/deletion. */
export function commitTextBoxChange(view: EditorView, tr: Transaction) {
  view.dispatch(closeHistory(tr));
  if (!view.isDestroyed) view.dispatch(closeHistory(view.state.tr));
}
/** Creates one atom in the current paragraph, with one undo boundary. */
export function insertTextBox(view: EditorView, attrs: Record<string, unknown> = {}): number | null {
  const type = view.state.schema.nodes.text_box;
  if (!type || view.isDestroyed) return null;
  const tr = closeHistory(view.state.tr).replaceSelectionWith(type.create(textBoxAttrs(attrs)));
  const pos = tr.selection.from - 1;
  if (tr.doc.nodeAt(pos)?.type !== type) return null;
  tr.setSelection(NodeSelection.create(tr.doc, pos));
  commitTextBoxChange(view, tr); view.focus();
  return pos;
}

/** Read-only rendering has exactly the same text metrics as the live node view. */
export function createReadonlyTextBoxView(node: import("prosemirror-model").Node) {
  const dom = document.createElement("span"), frame = document.createElement("span");
  dom.className = "pm-textbox-wrapper"; frame.className = "pm-textbox-frame";
  dom.appendChild(frame); applyTextBoxLayout(dom, node.attrs);
  return { dom, ignoreMutation: () => true };
}
