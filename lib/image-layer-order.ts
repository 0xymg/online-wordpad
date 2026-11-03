import { closeHistory } from "prosemirror-history";
import { NodeSelection, type Transaction } from "prosemirror-state";
import { imageLayer } from "./image-layout";

/** Shared image-only stacking order; geometry and other image attributes stay intact. */
export function reorderPageImage(tr: Transaction, pos: number, action: "front" | "back"): Transaction {
  const selected = tr.doc.nodeAt(pos);
  if (selected?.type.name !== "image" || selected.attrs.position !== "page") return tr;
  const images: { pos: number; layer: number }[] = [];
  tr.doc.descendants((node, imagePos) => {
    if (node.type.name === "image" && node.attrs.position === "page") images.push({ pos: imagePos, layer: imageLayer(node.attrs.layer) });
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
