import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet, EditorView } from "prosemirror-view";
import { Node as PMNode } from "prosemirror-model";

export interface SearchMatch {
  from: number;
  to: number;
}

export interface SearchPluginState {
  query: string;
  caseSensitive: boolean;
  matches: SearchMatch[];
  current: number; // index into matches, -1 when none
  decorations: DecorationSet;
}

export const searchKey = new PluginKey<SearchPluginState>("wordpad-search");

function findMatches(doc: PMNode, query: string, caseSensitive: boolean): SearchMatch[] {
  const matches: SearchMatch[] = [];
  if (!query) return matches;
  const needle = caseSensitive ? query : query.toLowerCase();

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const haystack = caseSensitive ? node.text : node.text.toLowerCase();
    let idx = 0;
    while ((idx = haystack.indexOf(needle, idx)) !== -1) {
      matches.push({ from: pos + idx, to: pos + idx + query.length });
      idx += query.length;
    }
  });
  return matches;
}

function buildDecorations(doc: PMNode, matches: SearchMatch[], current: number): DecorationSet {
  if (!matches.length) return DecorationSet.empty;
  const decos = matches.map((m, i) =>
    Decoration.inline(m.from, m.to, {
      class: i === current ? "search-match search-match-current" : "search-match",
    })
  );
  return DecorationSet.create(doc, decos);
}

export function searchPlugin(): Plugin<SearchPluginState> {
  return new Plugin<SearchPluginState>({
    key: searchKey,
    state: {
      init() {
        return {
          query: "",
          caseSensitive: false,
          matches: [],
          current: -1,
          decorations: DecorationSet.empty,
        };
      },
      apply(tr, value, _oldState, newState) {
        const meta = tr.getMeta(searchKey) as
          | { query?: string; caseSensitive?: boolean; current?: number }
          | undefined;

        if (meta) {
          const query = meta.query !== undefined ? meta.query : value.query;
          const caseSensitive =
            meta.caseSensitive !== undefined ? meta.caseSensitive : value.caseSensitive;
          const matches = findMatches(newState.doc, query, caseSensitive);
          let current =
            meta.current !== undefined ? meta.current : matches.length ? 0 : -1;
          if (current >= matches.length) current = matches.length ? 0 : -1;
          if (current < 0 && matches.length) current = 0;
          return {
            query,
            caseSensitive,
            matches,
            current,
            decorations: buildDecorations(newState.doc, matches, current),
          };
        }

        if (tr.docChanged && value.query) {
          const matches = findMatches(newState.doc, value.query, value.caseSensitive);
          let current = value.current;
          if (current >= matches.length) current = matches.length ? matches.length - 1 : -1;
          if (current < 0 && matches.length) current = 0;
          return {
            ...value,
            matches,
            current,
            decorations: buildDecorations(newState.doc, matches, current),
          };
        }

        return value;
      },
    },
    props: {
      decorations(state) {
        return searchKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
  });
}

/* ── Imperative helpers driven by the find panel ──────────────────────────── */

function scrollToCurrent(view: EditorView, focusEditor = false) {
  const st = searchKey.getState(view.state);
  if (!st || st.current < 0) return;
  const match = st.matches[st.current];
  if (!match) return;
  const tr = view.state.tr.setSelection(
    TextSelection.create(view.state.doc, match.from, match.to)
  );
  view.dispatch(tr.scrollIntoView());
  if (focusEditor) view.focus();
}

export function setSearch(view: EditorView, query: string, caseSensitive: boolean) {
  view.dispatch(view.state.tr.setMeta(searchKey, { query, caseSensitive, current: 0 }));
}

export function getSearchState(view: EditorView): SearchPluginState | undefined {
  return searchKey.getState(view.state);
}

export function findNext(view: EditorView) {
  const st = searchKey.getState(view.state);
  if (!st || !st.matches.length) return;
  const current = (st.current + 1) % st.matches.length;
  view.dispatch(view.state.tr.setMeta(searchKey, { current }));
  scrollToCurrent(view);
}

export function findPrev(view: EditorView) {
  const st = searchKey.getState(view.state);
  if (!st || !st.matches.length) return;
  const current = (st.current - 1 + st.matches.length) % st.matches.length;
  view.dispatch(view.state.tr.setMeta(searchKey, { current }));
  scrollToCurrent(view);
}

export function replaceCurrent(view: EditorView, replacement: string) {
  const st = searchKey.getState(view.state);
  if (!st || st.current < 0) return;
  const match = st.matches[st.current];
  if (!match) return;
  const tr = view.state.tr.insertText(replacement, match.from, match.to);
  view.dispatch(tr);
  // After replace the plugin recomputes matches; advance to the same index.
  const after = searchKey.getState(view.state);
  if (after && after.matches.length) {
    const next = Math.min(st.current, after.matches.length - 1);
    view.dispatch(view.state.tr.setMeta(searchKey, { current: next }));
    scrollToCurrent(view);
  }
}

export function replaceAll(view: EditorView, replacement: string) {
  const st = searchKey.getState(view.state);
  if (!st || !st.matches.length) return;
  const tr = view.state.tr;
  // Replace from last to first so earlier positions stay valid.
  for (let i = st.matches.length - 1; i >= 0; i--) {
    const m = st.matches[i];
    tr.insertText(replacement, m.from, m.to);
  }
  view.dispatch(tr);
}

export function clearSearch(view: EditorView) {
  view.dispatch(view.state.tr.setMeta(searchKey, { query: "", current: -1 }));
}
