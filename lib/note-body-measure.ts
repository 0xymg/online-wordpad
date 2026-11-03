import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { tabLayoutPlugin, createTabNodeView, flushTabLayout } from './tab-layout';
import type { MeasuredNoteUnit } from './note-layout';

export type MeasuredNoteLine = MeasuredNoteUnit & { top: number; left: number; width: number; lineHeight: number; leading: number; html: string; style: string; inList: boolean; marker?: { text: string; left: number; top: number; style: string } };
export type MeasuredNoteBody = { lines: MeasuredNoteLine[]; width: number };

/** Measure a note-local document with the same schema, font CSS, tab engine and
 * real superscript label as the main editor. This view is inert and temporary;
 * it is not a second document model or an output surface. */
export async function measureNoteBody(source: EditorView, body: PMNode, width: number, label: string): Promise<MeasuredNoteBody> {
  if (source.isDestroyed || !source.dom.isConnected || !Number.isFinite(width) || width <= 0) throw new Error('note-layout-stale');
  const originalDoc = source.state.doc;
  if (body.type !== source.state.schema.nodes.doc) throw new Error('note-invalid-body');
  let first = -1;
  body.descendants((node, pos) => { if (first < 0 && node.isTextblock) first = pos + 1; });
  if (first < 0) throw new Error('note-invalid-body');
  const owner = source.dom.ownerDocument, shell = owner.createElement('div');
  shell.className = 'pm-page pm-note-measure';
  shell.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:auto;visibility:hidden;pointer-events:none;overflow:visible;`;
  shell.setAttribute('aria-hidden', 'true'); shell.inert = true; owner.body.appendChild(shell);
  const position = first;
  const prefix = new Plugin({ props: { decorations(state) {
    return DecorationSet.create(state.doc, [Decoration.widget(position, () => {
      const span = owner.createElement('span'), sup = owner.createElement('sup');
      span.className = 'pm-note-measure-prefix'; sup.textContent = label; span.append(sup, owner.createTextNode(' ')); return span;
    }, { side: -1 })]);
  } } });
  let view: EditorView | undefined;
  try {
    view = new EditorView(shell, { state: EditorState.create({ doc: body, plugins: [prefix, tabLayoutPlugin()] }), editable: () => false, nodeViews: { tab: createTabNodeView } });
    // Use the exact text-area width; inherited editor font/style rules remain
    // in effect and the font barrier prevents sampling fallback typography.
    const sourceStyle = owner.defaultView!.getComputedStyle(source.dom);
    Object.assign(view.dom.style, { width: `${width}px`, minHeight: '0', padding: '0', margin: '0', display: 'flow-root', boxSizing: 'border-box', fontFamily: sourceStyle.fontFamily, fontSize: sourceStyle.fontSize, lineHeight: sourceStyle.lineHeight, direction: sourceStyle.direction });
    await owner.fonts.ready; await flushTabLayout(view);
    if (source.isDestroyed || !source.dom.isConnected || source.state.doc !== originalDoc) throw new Error('note-layout-stale');
    const rect = view.dom.getBoundingClientRect(), lines: MeasuredNoteLine[] = [];
    body.descendants((node, pos) => {
      if (!node.isTextblock) return;
      const start = pos + 1, end = start + node.content.size;
      for (let at = start; at <= end; at++) {
        if (at === end && at !== start) continue;
        const caret = view!.coordsAtPos(at, 1), top = caret.top - rect.top, prior = lines.at(-1);
        if (prior && Math.abs(prior.top - top) < 0.5 && prior.to === at) {
          prior.to = Math.min(end, at + 1); prior.left = Math.min(prior.left, caret.left - rect.left);
          prior.width = Math.max(prior.width, caret.right - rect.left - prior.left);
          prior.lineHeight = Math.max(prior.lineHeight, caret.bottom - caret.top);
        } else lines.push({ from: at, to: Math.min(end, at + 1), top, left: caret.left - rect.left, width: Math.max(0, caret.right - caret.left), lineHeight: Math.max(1, caret.bottom - caret.top), leading: 0, height: 0, html: '', style: '', inList: false });
      }
      return false;
    });
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const start = view.domAtPos(line.from, 1), end = view.domAtPos(line.to, -1), range = owner.createRange();
      range.setStart(start.node, start.offset); range.setEnd(end.node, end.offset);
      const container = owner.createElement('span'); container.appendChild(range.cloneContents());
      container.querySelectorAll('.pm-note-measure-prefix').forEach(node => node.remove());
      line.html = container.innerHTML;
      const resolved = body.resolve(line.from), blockPos = resolved.depth ? resolved.before(resolved.depth) : -1;
      const block = blockPos >= 0 ? view.nodeDOM(blockPos) : null;
      if (block instanceof HTMLElement) {
        const item = block.closest('li'); line.inList = !!item;
        const style = owner.defaultView!.getComputedStyle(block);
        line.lineHeight = Math.max(line.lineHeight, Number.parseFloat(style.lineHeight) || 0);
        line.style = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'color', 'direction'].map(name => `${name}:${style.getPropertyValue(name)}`).join(';');
        if (item && line.from === blockPos + 1 && item.querySelector('p') === block) {
          const list = item.parentElement, pseudo = owner.defaultView!.getComputedStyle(item, '::before'), itemRect = item.getBoundingClientRect();
          const ordered = list?.tagName === 'OL';
          const siblings = Array.from(list?.children || []).filter(child => child.tagName === 'LI');
          const nested = !!item.parentElement?.parentElement?.closest('ul');
          const text = ordered ? `${siblings.indexOf(item) + 1}.` : nested ? '▪' : '•';
          const offset = Number.parseFloat(pseudo.insetInlineStart) || 0;
          const left = style.direction === 'rtl' ? itemRect.right - rect.left - offset : itemRect.left - rect.left + offset;
          line.marker = { text, left, top: itemRect.top - rect.top + (Number.parseFloat(pseudo.top) || 0) - line.top,
            style: ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'color', 'direction'].map(name => `${name}:${pseudo.getPropertyValue(name)}`).join(';') };
        }
      }
      line.height = Math.max(line.lineHeight, (lines[i + 1]?.top ?? line.top + line.lineHeight) - line.top);
    }
    // The first paragraph may have spacing-before; unlike inter-line gaps it
    // has no preceding unit to carry it into the physical reservation.
    if (lines.length) { lines[0].leading = Math.max(0, lines[0].top); lines[0].height += lines[0].leading; }
    // The label is derived, never written into the canonical note body.
    const prefixElement = view.dom.querySelector<HTMLElement>('.pm-note-measure-prefix');
    if (prefixElement && lines.length) {
      const prefixLeft = prefixElement.getBoundingClientRect().left - rect.left;
      lines[0].left = Math.min(lines[0].left, prefixLeft);
      const labelElement = owner.createElement('a'), sup = owner.createElement('sup');
      labelElement.className = 'pm-footnote-backlink'; labelElement.href = '#';
      sup.textContent = label; labelElement.append(sup, owner.createTextNode(' '));
      lines[0].html = labelElement.outerHTML + lines[0].html;
    }
    if (!lines.length || lines.some(line => !Number.isFinite(line.height) || line.height <= 0)) throw new Error('note-unmeasurable-body');
    return { lines, width };
  } finally { view?.destroy(); shell.remove(); }
}
