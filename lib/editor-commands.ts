// Block-level commands shared by the toolbar and the menu bar, so both stay in
// step instead of each keeping its own copy of the logic.

import { documentSections } from "./document-sections";
import { fixedImageAlignedX } from "./page-image-position";
import type { Node as PMNode } from "prosemirror-model";
import { NodeSelection, type EditorState, type Transaction } from "prosemirror-state";
import { effectiveParagraph } from "./paragraph-format";
import type { EditorView } from "prosemirror-view";
import { sinkListItem, liftListItem } from "prosemirror-schema-list";

type Schema = {
  nodes: Record<string, { name: string }>;
};

const MAX_INDENT = 12;

/** Inline images have no independent alignment; floating images follow their wrap side. */
export function imageAlignment(attrs: Record<string, unknown>): string {
  if (attrs.position === "page") return ["left", "center", "right"].includes(String(attrs.align)) ? String(attrs.align) : "";
  return attrs.wrap === "inline" ? "" : attrs.wrap === "wrapLeft" ? "left" : attrs.wrap === "wrapRight" ? "right" : String(attrs.align || "left");
}

/** Use an image's placement for an image-only paragraph, including a caret beside it. */
export function paragraphAlignmentImage(parent: PMNode): PMNode | null {
  let image: PMNode | null = null;
  let otherContent = false;
  parent.forEach(node => {
    if (node.type.name === "image" && !image) image = node;
    else if (node.type.name !== "hard_break") otherContent = true;
  });
  return otherContent ? null : image;
}

export function paragraphHasImage(parent: PMNode): boolean {
  let found = false;
  parent.forEach(node => { if (node.type.name === "image") found = true; });
  return found;
}

/** Update a paragraph and its images together so caret and image controls agree. */
export function alignParagraphImages(tr: Transaction, pos: number, align: string, keepInline = false) {
  const paragraph = tr.doc.nodeAt(pos);
  if (!paragraph || !["paragraph", "heading"].includes(paragraph.type.name)) return;
  tr.setNodeMarkup(pos, undefined, { ...paragraph.attrs, textAlign: align,
    paragraphFormat: { ...paragraph.attrs.paragraphFormat, alignment: align } });
  paragraph.forEach((node, offset) => {
    if (node.type.name !== "image" || !["left", "center", "right"].includes(align)) return;
    const attrs = node.attrs;
    if (attrs.position === "page") {
      const sections = documentSections(tr.doc);
      const geometry = (sections.find(section => pos >= section.from && pos < section.to) || sections[0]).geometry;
      tr.setNodeMarkup(pos + 1 + offset, undefined, { ...attrs, align, x: fixedImageAlignedX(attrs, geometry, align) });
      return;
    }
    const floating = attrs.wrap === "wrapLeft" || attrs.wrap === "wrapRight";
    const wrap = floating ? (align === "center" ? "topBottom" : align === "left" ? "wrapLeft" : "wrapRight")
      : attrs.wrap === "inline" && !keepInline ? "topBottom" : attrs.wrap;
    tr.setNodeMarkup(pos + 1 + offset, undefined, { ...attrs, align, wrap });
  });
}

/** Shared alignment command for paragraphs, images, menus and keyboard shortcuts. */
export function alignSelection(state: EditorState, dispatch: ((tr: Transaction) => void) | undefined, align: string): boolean {
  const { from, to } = state.selection;
  const paragraphs: { node: PMNode; pos: number }[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!["paragraph", "heading"].includes(node.type.name)) return;
    paragraphs.push({ node, pos });
    return false;
  });
  if (!paragraphs.length) return false;
  if (align === "justify" && paragraphs.some(({ node }) => paragraphHasImage(node))) return true;
  const tr = state.tr;
  for (const { pos } of paragraphs) alignParagraphImages(tr, pos, align);
  const selection = state.selection;
  tr.setSelection(selection instanceof NodeSelection
    ? NodeSelection.create(tr.doc, selection.from)
    : selection.map(tr.doc, tr.mapping));
  dispatch?.(tr);
  return true;
}

/** Align the touched paragraphs and their images in one undoable transaction. */
export function setTextAlign(view: EditorView | null, _schema: Schema, align: string) {
  if (!view) return;
  alignSelection(view.state, view.dispatch, align);
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
      const current = Number(effectiveParagraph(node).left || 0) / 360;
      const next = Math.max(0, Math.min(MAX_INDENT, current + direction));
      if (next !== current) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next, paragraphFormat: { ...node.attrs.paragraphFormat,left:next*360 } });
        changed = true;
      }
    }
  });
  if (changed) view.dispatch(tr);
  view.focus();
}
