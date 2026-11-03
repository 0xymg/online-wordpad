import type { NodeSpec } from "prosemirror-model";
import type { Command } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";

/** A real column break occupies one inline position. */
export const columnBreakNodeSpec: NodeSpec = {
  inline: true, group: "inline", atom: true, selectable: false,
  leafText: () => "\n",
  parseDOM: [{ tag: "br[data-edtr-column-break]", priority: 100 }],
  toDOM: () => ["br", { "data-edtr-column-break": "true" }],
};
export const insertColumnBreak: Command = (state, dispatch) => {
  const { $from, $to } = state.selection;
  if ($from.depth !== 1 || $to.depth !== 1 || $from.parent !== $to.parent || !["paragraph", "heading"].includes($from.parent.type.name) || !state.schema.nodes.column_break) return false;
  if (dispatch) dispatch(closeHistory(state.tr).setMeta("edtr-column-break-command", true).replaceSelectionWith(state.schema.nodes.column_break.create()).scrollIntoView());
  return true;
};
