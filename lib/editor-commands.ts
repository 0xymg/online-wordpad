// Block-level commands shared by the toolbar and the menu bar, so both stay in
// step instead of each keeping its own copy of the logic.

import type { EditorView } from "prosemirror-view";
import { sinkListItem, liftListItem } from "prosemirror-schema-list";

type Schema = {
  nodes: Record<string, { name: string }>;
};

const MAX_INDENT = 12;

/** Set text-align on every paragraph/heading touched by the selection. */
export function setTextAlign(view: EditorView | null, schema: Schema, align: string) {
  if (!view) return;
  const { from, to } = view.state.selection;
  const tr = view.state.tr;
  let changed = false;
  view.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type === schema.nodes.paragraph || node.type === schema.nodes.heading) {
      if (node.attrs.textAlign !== align) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, textAlign: align });
        changed = true;
      }
    }
  });
  if (changed) view.dispatch(tr);
  view.focus();
}

/**
 * Indent or outdent the selection. Inside a list this nests/unnests the item;
 * elsewhere it bumps the block's `indent` attribute.
 */
export function adjustIndent(view: EditorView | null, schema: Schema, direction: 1 | -1) {
  if (!view) return;
  const listItem = schema.nodes.list_item as never;
  const listCmd = direction > 0 ? sinkListItem(listItem) : liftListItem(listItem);
  if (listCmd(view.state, view.dispatch)) { view.focus(); return; }

  const { from, to } = view.state.selection;
  const tr = view.state.tr;
  let changed = false;
  view.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type === schema.nodes.paragraph || node.type === schema.nodes.heading) {
      const current = Number(node.attrs.indent || 0);
      const next = Math.max(0, Math.min(MAX_INDENT, current + direction));
      if (next !== current) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
        changed = true;
      }
    }
  });
  if (changed) view.dispatch(tr);
  view.focus();
}
