import type { EditorView } from "prosemirror-view";
import type { ImagePage } from "./page-image-position";

/** Find an existing inline insertion point whose rendered line belongs to the sheet. */
export function imageAnchorOnPage(view: EditorView, page: ImagePage, clientY: number): number | null {
  const host = view.dom.parentElement;
  if (!host) return null;
  const hostRect = host.getBoundingClientRect();
  const scale = view.dom.getBoundingClientRect().width / Number.parseFloat(getComputedStyle(view.dom).width) || 1;
  const top = hostRect.top + page.top * scale;
  const bottom = top + page.geometry.height / 15 * scale;
  let best: number | null = null, distance = Infinity;
  view.state.doc.descendants((node, pos) => {
    if (!node.isTextblock || !node.canReplaceWith(0, 0, view.state.schema.nodes.image)) return;
    const start = pos + 1, end = start + node.content.size;
    // Include both ends and sample long paragraphs so a paragraph crossing a
    // physical page boundary can still serve as that page's anchor.
    const candidates = new Set<number>([start, end]);
    for (let p = start + 16; p < end; p += 16) candidates.add(p);
    for (const candidate of candidates) {
      try {
        const rect = view.coordsAtPos(candidate);
        const mid = (rect.top + rect.bottom) / 2;
        if (mid < top || mid >= bottom) continue;
        const d = Math.abs(mid - clientY);
        if (d < distance) { best = candidate; distance = d; }
      } catch { /* A transiently unrendered position cannot be an anchor. */ }
    }
    return false;
  });
  return best;
}
