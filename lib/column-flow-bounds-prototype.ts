// @ts-nocheck
/* A3.0 experiment only: a single editable DOM with line-range decorations. */
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
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
    props: {
      decorations(state) { return key.getState(state); },
      handleKeyDown(view, event) {
        if (!['ArrowDown','ArrowUp'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || view.composing) return false;
        const lines = JSON.parse(view.dom.dataset.flowFragments || '[]'), head = view.state.selection.head;
        const at = lines.findIndex(line => head >= line.from && head < line.to), step = event.key === 'ArrowDown' ? 1 : -1;
        const line = lines[at], next = lines[at + step];
        if (!line || !next || (line.page === next.page && line.column === next.column)) return false;
        const scale = view.dom.getBoundingClientRect().width / view.dom.clientWidth;
        const desired = view.coordsAtPos(head).left + (next.dx - line.dx) * scale;
        let best = next.from, distance = Infinity;
        for (let p = next.from; p < next.to; p++) { const caret = view.coordsAtPos(p); const d = Math.abs(caret.left - desired); if (d < distance) { distance = d; best = p; } }
        const anchor = event.shiftKey ? view.state.selection.anchor : best;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor, best)).scrollIntoView());
        return true;
      },
    },
    view(editor) {
      view = editor;
      function measure() {
        scheduled = false;
        if (view.composing) return;
        applying = true;
        view.dispatch(view.state.tr.setMeta(key, DecorationSet.empty).setMeta('addToHistory', false));
        const root = view.dom.getBoundingClientRect(), width = columnWidth, scale = root.width / view.dom.clientWidth;
        const decorations = [], fragments = [], blocks = [];
        view.state.doc.descendants((node, pos) => { if (!node.isBlock) return; const dom = view.nodeDOM(pos); if (!(dom instanceof HTMLElement)) return; const rect = dom.getBoundingClientRect(); blocks.push({pos, node, naturalTop:(rect.top-root.top)/scale, from:pos+1, to:pos+node.nodeSize-1}); });
        view.state.doc.descendants((node, pos) => {
          if (!node.isTextblock) return;
          let line = null;
          const finish = () => {
            if (!line || line.to <= line.from) return;
            const natural = (line.top - root.top) / scale, region = Math.max(0, Math.floor((natural + 0.1) / height));
            const column = region % 2, page = Math.floor(region / 2);
            const dx = column * (width + gap), dy = page * (height + pageGap) + (natural - region * height) - natural;
            const resolved = view.state.doc.resolve(line.from), block = resolved.before(1);
            fragments.push({ ...line, page, column, dx, dy, block, target:(natural + dy), lineHeight:(line.bottom-line.top)/scale });
          };
          for (let p = pos + 1; p < pos + node.nodeSize - 1; p++) {
            const a = view.coordsAtPos(p), b = view.coordsAtPos(p + 1);
            const previous = p > pos + 1 ? view.coordsAtPos(p - 1) : null;
            const distance = rect => !rect ? Infinity : Math.max(rect.top-a.top, 0, a.top-rect.bottom);
            const beforeWrap = previous && b.top > previous.bottom && a.top <= b.top;
            const caret = Math.abs(a.bottom-a.top) < 1 ? (beforeWrap || distance(previous) <= distance(b) ? previous : b) : a;
            const top = caret.top;
            if (!line || Math.abs(top - line.top) > 2) { finish(); line = { from:p, to:p+1, top, bottom:caret.bottom }; }
            else line.to = p+1;
          }
          finish();
          return false;
        });
        for (const block of blocks) {
          const own = fragments.filter(f => f.from >= block.from && f.to <= block.to);
          if (!own.length) continue;
          block.top = Math.min(...own.map(f => f.target));
          block.bottom = Math.max(...own.map(f => f.target + f.lineHeight));
        }
        for (const block of blocks) {
          if (block.top === undefined) continue;
          const parents = blocks.filter(parent => parent.pos < block.pos && parent.to >= block.to && parent.top !== undefined);
          const parent = parents.at(-1), offset = block.top - (parent?.top ?? 0);
          decorations.push(Decoration.node(block.pos, block.pos + block.node.nodeSize, {style:`position:absolute;top:${offset}px;height:${block.bottom-block.top}px;${block.node.type.name === 'list_item' ? 'width:calc(100% - 25px);' : ''}box-sizing:border-box`}));
        }
        const runs = [];
        for (const f of fragments) {
          const textblock = blocks.filter(candidate => candidate.node.isTextblock && f.from >= candidate.from && f.to <= candidate.to).at(-1);
          const inlineTop = f.target - textblock.top - ((f.top-root.top)/scale - textblock.naturalTop);
          const last = runs.at(-1);
          if (last && last.to === f.from && last.block === textblock.pos && last.dx === f.dx && Math.abs(last.top-inlineTop) < 0.1) last.to = f.to;
          else runs.push({from:f.from,to:f.to,block:textblock.pos,dx:f.dx,top:inlineTop,page:f.page,column:f.column});
        }
        for (const run of runs) decorations.push(Decoration.inline(run.from, run.to, {style:`position:relative;left:${run.dx}px;top:${run.top}px`,'data-flow-fragment':`${run.page}:${run.column}`}));
        view.dispatch(view.state.tr.setMeta(key, DecorationSet.create(view.state.doc, decorations)).setMeta('addToHistory', false));
        // A2's tab is deliberately zero-height. Give its experimental hit area
        // the actual adjacent caret line's bounds without changing line flow.
        for (const tab of view.dom.querySelectorAll('.pm-tab[data-edtr-tab]')) {
          const pos = view.posAtDOM(tab, 0), baseline = view.coordsAtPos(pos), rect = tab.getBoundingClientRect();
          const previous = pos > 0 ? view.coordsAtPos(pos - 1) : null;
          const next = pos < view.state.doc.content.size ? view.coordsAtPos(pos + 1) : null;
          const distance = candidate => !candidate ? Infinity : Math.max(candidate.top-baseline.top, 0, baseline.top-candidate.bottom);
          const beforeWrap = previous && next && next.top > previous.bottom && baseline.top <= next.top;
          const line = beforeWrap || distance(previous) <= distance(next) ? previous : next;
          if (line && line.bottom > line.top) {
            const top = Math.min(line.top, baseline.top - scale);
            const bottom = beforeWrap ? Math.min(next.top, Math.max(line.bottom, baseline.top + scale)) : Math.max(line.bottom, baseline.top + scale);
            tab.style.setProperty('--flow-hit-top', `${(top - rect.top) / scale}px`);
            tab.style.setProperty('--flow-hit-height', `${(bottom - top) / scale}px`);
          }
        }
        const lastPage = Math.max(0, ...fragments.map(fragment => fragment.page));
        view.dom.style.position = 'relative';
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
