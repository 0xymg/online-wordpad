import { nativeKerningPlugin, resolveNativeKerningHTML } from "./native-kerning";
import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import { DOMSerializer, type Mark, type Node as PMNode } from 'prosemirror-model';
import { tabLayoutPlugin, createTabNodeView, flushTabLayout } from './tab-layout';
import type { MeasuredNoteUnit } from './note-layout';
import { waitForEditorFontStyles } from './editor-fonts';
import { textDirection } from './text-direction';

export type MeasuredNoteLine = MeasuredNoteUnit & {
  top: number; left: number; width: number; lineHeight: number; leading: number;
  html: string; style: string; inList: boolean;
  marker?: { text: string; left: number; top: number; style: string; width?: number };
};
export type MeasuredNoteBody = { lines: MeasuredNoteLine[]; width: number };
export type NoteBodyMeasureOptions = { from?: number; prefix?: { marks: readonly Mark[]; trailingSpace: boolean } | null; preserveTrailingSpacing?: boolean };
const textCSS = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'word-spacing', 'font-kerning', 'font-feature-settings', 'font-variant', 'text-transform', 'direction'];
const css = (style: CSSStyleDeclaration, names: readonly string[]) => names.map(name => `${name}:${style.getPropertyValue(name)}`).join(';');
function rangeAt(view: EditorView, from: number, to: number): Range {
  const start = view.domAtPos(from, 1), end = view.domAtPos(to, -1), range = view.dom.ownerDocument.createRange();
  range.setStart(start.node, start.offset); range.setEnd(end.node, end.offset); return range;
}
function inkBounds(root: HTMLElement): DOMRect | null {
  const range = root.ownerDocument.createRange(); range.selectNodeContents(root);
  const rects = Array.from(range.getClientRects()).filter(rect => rect.height > 0.1 && rect.width > 0.01);
  if (!rects.length) return null;
  const left = Math.min(...rects.map(rect => rect.left)), top = Math.min(...rects.map(rect => rect.top));
  return new DOMRect(left, top, Math.max(...rects.map(rect => rect.right)) - left, Math.max(...rects.map(rect => rect.bottom)) - top);
}

/** Same schema, fonts and real tab engine; explicit note-local line ranges are
 * the only output. Suffix reflow retains ancestors but maps every range back to
 * the ORIGINAL body, so a new physical width never repeats prior note text. */
export async function measureNoteBody(source: EditorView, body: PMNode, width: number, label: string, options: NoteBodyMeasureOptions = {}): Promise<MeasuredNoteBody> {
  if (source.isDestroyed || !source.dom.isConnected || !Number.isFinite(width) || width <= 0) throw new Error('note-layout-stale');
  const originalDoc = source.state.doc, from = options.from ?? 0;
  if (body.type !== source.state.schema.nodes.doc || !Number.isInteger(from) || from < 0 || from >= body.content.size) throw new Error('note-invalid-body');
  const originalStart = body.resolve(from);
  if (from > 0 && !originalStart.parent.isTextblock) throw new Error('note-suffix-structure-unsupported');
  const offset = from > 0 ? from - originalStart.depth : 0;
  const suffix = from > 0 ? body.cut(from) : body;
  // Tab defaults belong to the parent document, not a new default subdocument.
  const measuredDoc = suffix.type.create({ ...suffix.attrs, layout: originalDoc.attrs.layout }, suffix.content, suffix.marks);
  let first = -1;
  measuredDoc.descendants((node, pos) => { if (first < 0 && node.isTextblock) first = pos + 1; });
  if (first < 0 || from > 0 && first + offset !== from) throw new Error('note-suffix-structure-unsupported');
  const owner = source.dom.ownerDocument, shell = owner.createElement('div');
  shell.className = 'pm-page pm-note-measure';
  shell.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:auto;visibility:hidden;pointer-events:none;overflow:visible;`;
  shell.setAttribute('aria-hidden', 'true'); shell.inert = true; owner.body.appendChild(shell);
  const prefixSpec = options.prefix === undefined ? { marks: source.state.schema.marks.superscript ? [source.state.schema.marks.superscript.create()] : [], trailingSpace: true } : options.prefix;
  const makePrefix = () => {
    const span = owner.createElement('span'); span.className = 'pm-note-measure-prefix';
    if (prefixSpec) {
      span.appendChild(DOMSerializer.fromSchema(source.state.schema).serializeNode(source.state.schema.text(label, prefixSpec.marks), { document: owner }));
      if (prefixSpec.trailingSpace) span.appendChild(owner.createTextNode(' '));
    }
    resolveNativeKerningHTML(span);
    return span;
  };
  const prefix = new Plugin({ props: { decorations(state) {
    if (from > 0 || !prefixSpec) return DecorationSet.empty;
    return DecorationSet.create(state.doc, [Decoration.widget(first, () => {
      return makePrefix();
    }, { side: -1 })]);
  } } });
  let view: EditorView | undefined;
  try {
    view = new EditorView(shell, { state: EditorState.create({ doc: measuredDoc, plugins: [nativeKerningPlugin(), prefix, tabLayoutPlugin()] }), editable: () => false, nodeViews: { tab: createTabNodeView } });
    // The page editor suppresses the final block's margin for sheet flow. A
    // native note body is an independent story, so retain its explicit final
    // paragraph spacing when computing the bottom-anchored band.
    if (options.preserveTrailingSpacing) {
      const last = view.dom.lastElementChild as HTMLElement | null;
      const margin = last?.style.getPropertyValue('margin-bottom');
      if (last && margin) last.style.setProperty('margin-bottom', margin, 'important');
    }
    const sourceStyle = owner.defaultView!.getComputedStyle(source.dom);
    Object.assign(view.dom.style, { width: `${width}px`, minHeight: '0', padding: '0', margin: '0', display: 'flow-root', boxSizing: 'border-box', fontFamily: sourceStyle.fontFamily, fontSize: sourceStyle.fontSize, lineHeight: sourceStyle.lineHeight, direction: sourceStyle.direction });
    // The app uses CSS counters. Honor canonical starts in this disposable view,
    // including skipped ancestor items in a reflowed suffix.
    const firstPath = measuredDoc.resolve(first);
    measuredDoc.descendants((node, pos) => {
      if (node.type.name !== 'ordered_list') return;
      const element = view!.nodeDOM(pos); if (!(element instanceof HTMLElement)) return;
      let start = Number(node.attrs.order) || 1;
      for (let depth = 1; from > 0 && depth < firstPath.depth; depth++) if (firstPath.before(depth) === pos && originalStart.node(depth).type.name === 'ordered_list') start += originalStart.index(depth);
      element.setAttribute('start', String(start)); element.style.counterReset = `pm-ol-counter ${start - 1}`;
    });
    if (from > 0) {
      // Continuing a paragraph/list does not replay its first-line indent,
      // leading paragraph spacing or outer list spacing on the new sheet.
      const block = view.nodeDOM(first - 1);
      if (block instanceof HTMLElement) {
        block.dir = ['ltr', 'rtl'].includes(block.style.direction) ? block.style.direction : textDirection(originalStart.parent.textContent);
        if (originalStart.parentOffset > 0) { block.style.marginTop = '0'; block.style.textIndent = '0'; }
      }
      for (let depth = 1; depth < firstPath.depth; depth++) {
        const ancestor = view.nodeDOM(firstPath.before(depth));
        if (ancestor instanceof HTMLElement && ['OL', 'UL', 'LI'].includes(ancestor.tagName)) ancestor.style.marginTop = '0';
      }
    }
    const families = new Set<string>([sourceStyle.fontFamily]);
    body.descendants(node => { if (node.attrs.styleText?.family) families.add(node.attrs.styleText.family); for (const mark of node.marks) if (mark.type.name === 'fontFamily') families.add(mark.attrs.family); });
    await waitForEditorFontStyles([...families]);
    view.dom.getBoundingClientRect();
    await owner.fonts.ready; await flushTabLayout(view);
    if (source.isDestroyed || !source.dom.isConnected || source.state.doc !== originalDoc) throw new Error('note-layout-stale');
    const rect = view.dom.getBoundingClientRect(), lines: MeasuredNoteLine[] = [];
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    measuredDoc.descendants((node, pos) => {
      if (!node.isTextblock) return;
      const start = pos + 1, end = start + node.content.size, units: { from: number; to: number; hardBreak?: boolean }[] = [];
      node.forEach((child, relative) => {
        const at = start + relative;
        if (child.isText) for (const part of segmenter.segment(child.text || '')) units.push({ from: at + part.index, to: at + part.index + part.segment.length });
        else units.push({ from: at, to: at + child.nodeSize, hardBreak: child.type.name === 'hard_break' });
      });
      if (!units.length) units.push({ from: start, to: end });
      let current: MeasuredNoteLine | undefined;
      for (const unit of units) {
        // Real tabs are zero-height inline boxes. A zero-height caret at their
        // baseline is not a new visual line; keep the tab with the overlapping
        // glyph line so its leader/field is not split into artificial rows.
        if (measuredDoc.nodeAt(unit.from)?.type.name === 'tab' && current) {
          const tab = view!.nodeDOM(unit.from);
          if (tab instanceof HTMLElement) {
            const box = tab.getBoundingClientRect(), baseline = box.top - rect.top;
            if (baseline >= current.top - 1 && baseline <= current.top + current.lineHeight + 1) { current.to = unit.to + offset; current.left = Math.min(current.left, box.left - rect.left); current.width = Math.max(current.width, box.right - rect.left - current.left); continue; }
          }
        }
        const range = rangeAt(view!, unit.from, unit.to), ink = Array.from(range.getClientRects()).find(box => box.height > 0.1 && box.width > 0.01), caret = view!.coordsAtPos(unit.from, 1);
        const box = ink || caret, top = box.top - rect.top, bottom = box.bottom - rect.top;
        const overlap = current && Math.min(current.top + current.lineHeight, bottom) - Math.max(current.top, top);
        if (current && current.to === unit.from + offset && (unit.hardBreak || overlap! > Math.min(current.lineHeight, bottom - top) * 0.3)) {
          current.to = unit.to + offset; current.left = Math.min(current.left, box.left - rect.left); current.width = Math.max(current.width, box.right - rect.left - current.left); current.lineHeight = Math.max(current.lineHeight, bottom - top);
        } else {
          current = { from: unit.from + offset, to: unit.to + offset, top, left: box.left - rect.left, width: Math.max(0, box.right - box.left), lineHeight: Math.max(1, bottom - top), leading: 0, height: 0, html: '', style: '', inList: false }; lines.push(current);
        }
      }
      return false;
    });
    for (const line of lines) {
      const localFrom = line.from - offset, localTo = line.to - offset, range = rangeAt(view, localFrom, localTo);
      const resolved = measuredDoc.resolve(localFrom), blockPos = resolved.depth ? resolved.before(resolved.depth) : -1, block = blockPos >= 0 ? view.nodeDOM(blockPos) : null;
      if (!(block instanceof HTMLElement)) throw new Error('note-unmeasurable-body');
      const container = owner.createElement('span'); container.appendChild(range.cloneContents());
      // cloneContents omits a shared ancestor when both endpoints are inside
      // one marked run. Restore its inline chain (including live tab bidi
      // decorations), rather than silently flattening bold/color/font/link.
      let ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer as HTMLElement : range.commonAncestorContainer.parentElement;
      while (ancestor && ancestor !== block && block.contains(ancestor)) {
        const wrapper = ancestor.cloneNode(false) as HTMLElement; wrapper.removeAttribute('id');
        while (container.firstChild) wrapper.appendChild(container.firstChild);
        container.appendChild(wrapper); ancestor = ancestor.parentElement;
      }
      container.querySelectorAll('.pm-note-measure-prefix,.ProseMirror-separator,.ProseMirror-trailingBreak,br').forEach(node => node.remove());
      const item = block.closest('li'), style = owner.defaultView!.getComputedStyle(block);
      line.inList = !!item; line.lineHeight = Math.max(line.lineHeight, Number.parseFloat(style.lineHeight) || 0);
      // Inherited theme ink must remain inherited in the light print frame.
      // Semantic paragraph colors and explicit inline color marks are retained.
      line.style = `${css(style, textCSS)};color:${block.style.color || 'inherit'}`;
      const prefixElement = from === 0 && line === lines[0] ? view.dom.querySelector<HTMLElement>('.pm-note-measure-prefix') : null;
      if (prefixElement) {
        const anchor = owner.createElement('a'); anchor.className = 'pm-footnote-backlink'; anchor.href = '#'; anchor.style.cssText = `${css(owner.defaultView!.getComputedStyle(prefixElement), textCSS)};color:${prefixElement.style.color || 'inherit'}`;
        for (const child of Array.from(prefixElement.childNodes)) anchor.appendChild(child.cloneNode(true));
        container.prepend(anchor);
        range.setStartBefore(prefixElement);
      }
      const sourceRects = Array.from(range.getClientRects()).filter(box => box.height > 0.1 && box.width > 0.01);
      if (sourceRects.length) {
        line.left = Math.min(...sourceRects.map(box => box.left)) - rect.left;
        line.width = Math.max(...sourceRects.map(box => box.right)) - rect.left - line.left;
      }
      line.html = container.innerHTML;
      // Measure the exact output fragment once. This compensates line-box font
      // leading and superscript baseline offsets without a hidden body clone.
      const probe = owner.createElement('div'); probe.className = 'pm-footnote-line';
      probe.style.cssText = `${line.style};position:absolute;left:0;top:0;width:${Math.max(0, line.width)}px;white-space:pre;`;
      probe.innerHTML = line.html || '<br>'; shell.appendChild(probe);
      const probeRect = probe.getBoundingClientRect(), probeInk = inkBounds(probe);
      const sourceTop = sourceRects.length ? Math.min(...sourceRects.map(box => box.top)) - rect.top : line.top;
      line.top = sourceTop - (probeInk ? probeInk.top - probeRect.top : 0); probe.remove();
      const canonical = body.resolve(line.from), itemDepth = Array.from({ length: canonical.depth }, (_, i) => i + 1).filter(depth => canonical.node(depth).type.name === 'list_item').at(-1);
      const canonicalBlockStart = canonical.depth ? canonical.before(canonical.depth) + 1 : -1;
      if (item && line.from === canonicalBlockStart && itemDepth !== undefined && canonical.index(itemDepth) === 0) {
        const list = item.parentElement, pseudo = owner.defaultView!.getComputedStyle(item, '::before'), itemStyle = owner.defaultView!.getComputedStyle(item), itemRect = item.getBoundingClientRect();
        const siblings = Array.from(list?.children || []).filter(child => child.tagName === 'LI'), start = list?.tagName === 'OL' ? Number(list.getAttribute('start') || '1') : 1;
        const literal = /^['"](.*)['"]$/.exec(pseudo.content)?.[1];
        const text = list?.tagName === 'OL' ? `${start + siblings.indexOf(item)}.` : literal || (list?.parentElement?.closest('ul') ? '▪' : '•');
        const markerStyle = `${css(pseudo, [...textCSS, 'text-align'])};color:${list?.style.color || block.style.color || 'inherit'};min-width:${pseudo.minWidth}`;
        const markerProbe = owner.createElement('span'); markerProbe.style.cssText = `${markerStyle};position:absolute;white-space:pre;`; markerProbe.textContent = text; shell.appendChild(markerProbe);
        const markerWidth = Math.max(markerProbe.getBoundingClientRect().width, Number.parseFloat(pseudo.minWidth) || 0); markerProbe.remove();
        const inset = Number.parseFloat(pseudo.insetInlineStart) || 0, left = itemStyle.direction === 'rtl' ? itemRect.right - rect.left - inset - markerWidth : itemRect.left - rect.left + inset;
        line.marker = { text, left, width: markerWidth, top: itemRect.top - rect.top + (Number.parseFloat(pseudo.top) || 0) - line.top, style: markerStyle };
      }
    }
    for (let i = 0; i < lines.length; i++) lines[i].height = Math.max(lines[i].lineHeight, (lines[i + 1]?.top ?? rect.height) - lines[i].top);
    // Preserve literal first-paragraph spacing, including leading list spacing.
    if (lines.length) { lines[0].leading = Math.max(0, lines[0].top); lines[0].height += lines[0].leading; }
    if (!lines.length || lines.some(line => !Number.isFinite(line.height) || line.height <= 0)) throw new Error('note-unmeasurable-body');
    return { lines, width };
  } finally { view?.destroy(); shell.remove(); }
}
