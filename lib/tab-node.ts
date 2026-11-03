/** A tab is one editable document position and one literal U+0009 character. */
import { Fragment, Slice, type Node as PMNode, type NodeSpec, type Schema } from "prosemirror-model";
import { Plugin, type Command } from "prosemirror-state";

export const tabNodeSpec: NodeSpec = {
  inline: true, group: "inline", atom: true, selectable: false,
  leafText: () => "\t",
  parseDOM: [{ tag: 'span[data-edtr-tab="true"]' }],
  toDOM: () => ["span", { "data-edtr-tab": "true", class: "pm-tab" }, "\t"],
};
function tabFragment(content: Fragment, schema: Schema, allowTabs: boolean): Fragment {
  const children: PMNode[] = [];
  let changed = false;
  content.forEach(node => {
    if (allowTabs && node.isText && node.text?.includes("\t")) {
      changed = true;
      node.text.split("\t").forEach((part, index) => {
        if (index) children.push(schema.nodes.tab.create(null, null, node.marks));
        if (part) children.push(schema.text(part, node.marks));
      });
    } else if (node.childCount) {
      const inlineTabs = !!node.type.contentMatch.matchType(schema.nodes.tab);
      const inner = tabFragment(node.content, schema, inlineTabs);
      if (inner !== node.content) { children.push(node.copy(inner)); changed = true; }
      else children.push(node);
    } else children.push(node);
  });
  return changed ? Fragment.fromArray(children) : content;
}
/** Code blocks retain literal text tabs because their schema only accepts text. */
export function normalizeTabCharacters(doc: PMNode): PMNode {
  if (!doc.type.schema.nodes.tab) return doc;
  const content = tabFragment(doc.content, doc.type.schema, !!doc.type.contentMatch.matchType(doc.type.schema.nodes.tab));
  return content === doc.content ? doc : doc.copy(content);
}
export function tabCharactersPlugin(): Plugin {
  return new Plugin({ props: {
    transformPasted(slice, view) {
      if (view.state.selection.$from.parent.type.spec.code) return slice;
      const schema = view.state.schema;
      const allowed = !!view.state.selection.$from.parent.type.contentMatch.matchType(schema.nodes.tab);
      return new Slice(tabFragment(slice.content, schema, allowed), slice.openStart, slice.openEnd);
    },
  } });
}
export const insertTabCharacter: Command = (state, dispatch) => {
  const parent = state.selection.$from.parent;
  if (!parent.isTextblock) return false;
  if (parent.type.spec.code) {
    if (dispatch) dispatch(state.tr.insertText("\t").scrollIntoView());
    return true;
  }
  if (!parent.type.contentMatch.matchType(state.schema.nodes.tab)) return false;
  if (dispatch) dispatch(state.tr.replaceSelectionWith(state.schema.nodes.tab.create(), true).scrollIntoView());
  return true;
};
