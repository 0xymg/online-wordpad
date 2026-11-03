// @ts-nocheck
/* A3.0 experiment only: a single editable DOM with line-range decorations. */
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

const key = new PluginKey('column-flow-prototype');
export function columnFlowPrototype({ height = 160, gap = 24, pageGap = 40, columnWidth = 260 } = {}) {
  let view, scheduled = false, applying = false, frame = 0;
  const plugin = new Plugin({
    key,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, old) { const next = tr.getMeta(key); return next === undefined ? old.map(tr.mapping, tr.doc) : next; },
    },
    props: { decorations(state) { return key.getState(state); } },
    view(editor) {
      view = editor;
      function measure() {
        scheduled = false;
        if (view.composing) return;
        applying = true;
        view.dispatch(view.state.tr.setMeta(key, DecorationSet.empty).setMeta('addToHistory', false));
        const root = view.dom.getBoundingClientRect(), width = columnWidth, scale = root.width / view.dom.clientWidth;
        const decorations = [], fragments = [];
        view.state.doc.descendants((node, pos) => {
          if (!node.isTextblock) return;
          let line = null;
          const finish = () => {
            if (!line || line.to <= line.from) return;
            const natural = (line.top - root.top) / scale, region = Math.max(0, Math.floor((natural + 0.1) / height));
            const column = region % 2, page = Math.floor(region / 2);
            const dx = column * (width + gap), dy = page * (height + pageGap) + (natural - region * height) - natural;
            const resolved = view.state.doc.resolve(line.from), block = resolved.before(1);
            fragments.push({ ...line, page, column, dx, dy, block });
          };
          for (let p = pos + 1; p < pos + node.nodeSize - 1; p++) {
            const a = view.coordsAtPos(p), b = view.coordsAtPos(p + 1);
            const top = a.top;
            if (!line || Math.abs(top - line.top) > 2) { finish(); line = { from:p, to:p+1, top }; }
            else line.to = p+1;
          }
          finish();
          return false;
        });
        const blockOffsets = new Map();
        for (const fragment of fragments) if (!blockOffsets.has(fragment.block)) blockOffsets.set(fragment.block, fragment.dy);
        for (const [pos, dy] of blockOffsets) { const node = view.state.doc.nodeAt(pos); if (node) decorations.push(Decoration.node(pos, pos + node.nodeSize, { style: `position:relative;top:${dy}px` })); }
        for (const f of fragments) decorations.push(Decoration.inline(f.from, f.to, { style: `position:relative;left:${f.dx}px;top:${f.dy - blockOffsets.get(f.block)}px`, 'data-flow-fragment': `${f.page}:${f.column}` }));
        view.dispatch(view.state.tr.setMeta(key, DecorationSet.create(view.state.doc, decorations)).setMeta('addToHistory', false));
        const lastPage = Math.max(0, ...fragments.map(fragment => fragment.page));
        view.dom.style.height = `${(lastPage + 1) * (height + pageGap) - pageGap}px`;
        view.dom.style.overflow = 'hidden';
        view.dom.dataset.flowFragments = JSON.stringify(fragments);
        view.dom.dataset.flowRevision = String(Number(view.dom.dataset.flowRevision || 0) + 1);
        applying = false;
      }
      function schedule() { if (!scheduled) { scheduled = true; frame = requestAnimationFrame(measure); } }
      editor.dom.addEventListener('compositionend', schedule);
      window.addEventListener('resize', schedule);
      schedule();
      return { update(v, previous) { if (!applying && !previous.doc.eq(v.state.doc)) schedule(); }, destroy() { cancelAnimationFrame(frame); editor.dom.removeEventListener('compositionend', schedule); window.removeEventListener('resize', schedule); view = null; } };
    },
  });
  return plugin;
}
