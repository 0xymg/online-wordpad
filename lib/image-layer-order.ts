import { closeHistory } from "prosemirror-history";
import { NodeSelection, type Transaction } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { imageLayer, imageTextPlane } from "./image-layout";

const isPageObject = (node: PMNode | null) => node?.type.name === "text_box" || node?.type.name === "image" && node.attrs.position === "page";

/** Images and text boxes share stacking order within their current text plane. */
export function reorderPageObject(tr: Transaction, pos: number, action: "front" | "back"): Transaction {
  const selected = tr.doc.nodeAt(pos);
  if (!selected || !isPageObject(selected)) return tr;
  const images: { pos: number; layer: number }[] = [];
  tr.doc.descendants((node, imagePos) => {
    if (isPageObject(node) && imageTextPlane(node.attrs.textPlane) === imageTextPlane(selected.attrs.textPlane)) images.push({ pos: imagePos, layer: imageLayer(node.attrs.layer) });
  });
  images.sort((a, b) => a.layer - b.layer || a.pos - b.pos);
  const ordered = images.filter(image => image.pos !== pos);
  if (action === "front") ordered.push({ pos, layer: 0 });
  else ordered.unshift({ pos, layer: 0 });
  closeHistory(tr);
  ordered.forEach((image, layer) => {
    const node = tr.doc.nodeAt(image.pos)!;
    if (node.attrs.layer !== layer) tr.setNodeMarkup(image.pos, undefined, { ...node.attrs, layer });
  });
  tr.setSelection(NodeSelection.create(tr.doc, pos));
  return tr;
}

export function setObjectTextPlane(tr: Transaction, pos: number, textPlane: "front" | "behind"): Transaction {
  const node = tr.doc.nodeAt(pos);
  if (!node || !isPageObject(node) || imageTextPlane(node.attrs.textPlane) === textPlane) return tr;
  closeHistory(tr);
  tr.setNodeMarkup(pos, undefined, { ...node.attrs, textPlane });
  tr.setSelection(NodeSelection.create(tr.doc, pos));
  return tr;
}

// Existing image-specific dialogs use the same object-order implementation.
export const reorderPageImage = reorderPageObject;
export const setImageTextPlane = setObjectTextPlane;
