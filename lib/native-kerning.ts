/** Word's kern value is a half-point activation threshold; zero disables it.
 * Absence in native documents also disables kerning, unlike browser auto.
 */
import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { MarkSpec, Node as PMNode } from 'prosemirror-model';
export function nativeKerningValue(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 3276 ? n : undefined;
}
export function nativeKerningCSS(threshold: number, size: number): 'normal' | 'none' {
  return threshold > 0 && size * 2 >= threshold ? 'normal' : 'none';
}
export const nativeKerningMark: MarkSpec = {
  attrs: { threshold: { validate: (value: unknown) => { if (typeof value !== "number" || nativeKerningValue(value) === undefined) throw new Error("Invalid native kerning threshold"); } } },
  parseDOM: [{ tag: 'span[data-edtr-native-kern]', getAttrs: dom => { const threshold = nativeKerningValue((dom as HTMLElement).getAttribute('data-edtr-native-kern')); return threshold === undefined ? false : { threshold }; } }],
  toDOM: mark => ['span', { 'data-edtr-native-kern': mark.attrs.threshold }, 0],
};
function pointSize(value: string | undefined, fallback: number): number {
  const m = /^(\d+(?:\.\d+)?)(pt|px)$/.exec(value || '');
  return m ? Number(m[1]) * (m[2] === 'px' ? .75 : 1) : fallback;
}
/** Derived paint only: font edits and undo never rewrite native source data. */
export function nativeKerningPlugin(): Plugin {
  let previous: PMNode | undefined, cached = DecorationSet.empty;
  return new Plugin({ props: { decorations(state) {
    if (previous === state.doc) return cached;
    previous = state.doc; const decorations: Decoration[] = [];
    state.doc.descendants((node, pos, parent) => {
      if (!node.isInline || ['tab','hard_break','column_break','image'].includes(node.type.name) || node.type.name.startsWith('bookmark_')) return;
      const threshold = nativeKerningValue(node.marks.find(m => m.type.name === 'nativeKerning')?.attrs.threshold ?? parent?.attrs.styleText?.kerning);
      if (threshold === undefined) return;
      const size = pointSize(node.marks.find(m => m.type.name === 'fontSize')?.attrs.size, parent?.attrs.styleText?.size || 12);
      decorations.push(Decoration.inline(pos, pos + node.nodeSize, { style: `font-kerning:${nativeKerningCSS(threshold, size)}` }));
    });
    return cached = DecorationSet.create(state.doc, decorations);
  } } });
}
/** Detached persisted/exported HTML has no editor decorations. Resolve using
 * the serialized inline/paragraph font cascade, without measuring glyphs.
 */
export function resolveNativeKerningHTML(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-edtr-native-kern]')) {
    const threshold = nativeKerningValue(el.getAttribute('data-edtr-native-kern')); if (threshold === undefined) continue;
    let size = 12;
    for (let at: HTMLElement | null = el; at; at = at.parentElement) if (at.style.fontSize) { size = pointSize(at.style.fontSize, size); break; }
    el.style.fontKerning = nativeKerningCSS(threshold, size);
  }
}
