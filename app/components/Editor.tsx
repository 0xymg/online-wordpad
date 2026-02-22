"use client";

import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { Schema, DOMParser as PMParser, DOMSerializer, Node as PMNode, Mark } from "prosemirror-model";
import { EditorState, Transaction, AllSelection, TextSelection, NodeSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Cropper, type CropperRef } from "react-advanced-cropper";
import { HexColorPicker, HexColorInput } from "react-colorful";
import "react-advanced-cropper/dist/style.css";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, toggleMark, setBlockType, wrapIn } from "prosemirror-commands";
import { wrapInList, splitListItem, liftListItem, sinkListItem } from "prosemirror-schema-list";
import { inputRules, wrappingInputRule, textblockTypeInputRule } from "prosemirror-inputrules";
import { tableEditing, columnResizing, tableNodes, isInTable, findTable, CellSelection, TableMap, TableView } from "prosemirror-tables";
import MenuBar from "./MenuBar";
import Toolbar from "./Toolbar";
import TableContextMenu from "./TableContextMenu";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowClockwise, Crop, FlipHorizontal, FlipVertical,
  TextAlignLeft, TextAlignCenter, TextAlignRight,
} from "@phosphor-icons/react";

// ── Schema ────────────────────────────────────────────────────────────────
const normalizeTextAlign = (value: string | null | undefined) => {
  if (!value) return "left";
  const v = value.trim().toLowerCase();
  if (v === "left" || v === "center" || v === "right" || v === "justify") return v;
  return "left";
};

const normalizeIndent = (value: unknown) => {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? "0"), 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(12, n));
};

const parseIndentFromDom = (el: HTMLElement) => {
  const dataIndent = el.getAttribute("data-indent");
  if (dataIndent !== null) return normalizeIndent(dataIndent);
  const marginLeft = el.style.marginLeft || "";
  if (!marginLeft) return 0;
  const px = Number.parseFloat(marginLeft);
  if (Number.isNaN(px)) return 0;
  return normalizeIndent(Math.round(px / 24));
};

const paragraphNodeSpec = {
  ...basicSchema.spec.nodes.get("paragraph"),
  attrs: {
    textAlign: { default: "left" },
    indent: { default: 0 },
  },
  parseDOM: [{
    tag: "p",
    getAttrs(dom: Node | string) {
      if (typeof dom === "string") return { textAlign: "left", indent: 0 };
      const el = dom as HTMLElement;
      return {
        textAlign: normalizeTextAlign(el.style.textAlign),
        indent: parseIndentFromDom(el),
      };
    },
  }],
  toDOM(node: PMNode) {
    const textAlign = normalizeTextAlign(node.attrs.textAlign);
    const indent = normalizeIndent(node.attrs.indent);
    const style: string[] = [];
    if (textAlign !== "left") style.push(`text-align:${textAlign}`);
    if (indent > 0) style.push(`margin-left:${indent * 24}px`);
    const attrs: Record<string, string> = {};
    if (style.length) attrs.style = style.join(";");
    if (indent > 0) attrs["data-indent"] = String(indent);
    return ["p", attrs, 0];
  },
};

const headingNodeSpec = {
  ...basicSchema.spec.nodes.get("heading"),
  attrs: {
    level: { default: 1 },
    textAlign: { default: "left" },
    indent: { default: 0 },
  },
  parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
    tag: `h${level}`,
    getAttrs(dom: Node | string) {
      if (typeof dom === "string") return { level, textAlign: "left", indent: 0 };
      const el = dom as HTMLElement;
      return {
        level,
        textAlign: normalizeTextAlign(el.style.textAlign),
        indent: parseIndentFromDom(el),
      };
    },
  })),
  toDOM(node: PMNode) {
    const level = node.attrs.level || 1;
    const textAlign = normalizeTextAlign(node.attrs.textAlign);
    const indent = normalizeIndent(node.attrs.indent);
    const style: string[] = [];
    if (textAlign !== "left") style.push(`text-align:${textAlign}`);
    if (indent > 0) style.push(`margin-left:${indent * 24}px`);
    const attrs: Record<string, string> = {};
    if (style.length) attrs.style = style.join(";");
    if (indent > 0) attrs["data-indent"] = String(indent);
    return [`h${level}`, attrs, 0];
  },
};

const imageNodeSpec = {
  inline: true,
  group: "inline",
  draggable: true,
  attrs: {
    src: {},
    alt: { default: null },
    title: { default: null },
    width: { default: "100%" },
    rotate: { default: 0 },
    flipX: { default: false },
    flipY: { default: false },
    align: { default: "left" },
  },
  parseDOM: [{
    tag: "img[src]",
    getAttrs(dom: Node | string) {
      const img = dom as HTMLImageElement;
      return {
        src: img.getAttribute("src"),
        alt: img.getAttribute("alt"),
        title: img.getAttribute("title"),
        width: img.getAttribute("data-width") || img.style.width || "100%",
        rotate: Number(img.getAttribute("data-rotate") || "0") || 0,
        flipX: img.getAttribute("data-flip-x") === "true",
        flipY: img.getAttribute("data-flip-y") === "true",
        align: img.getAttribute("data-align") || "left",
      };
    },
  }],
  toDOM(node: PMNode) {
    const a = node.attrs;
    const sx = a.flipX ? -1 : 1;
    const sy = a.flipY ? -1 : 1;
    const transform = `rotate(${Number(a.rotate || 0)}deg) scale(${sx}, ${sy})`;
    const align = String(a.align || "left");
    const alignStyle =
      align === "center"
        ? "display:block;margin:0 auto;"
        : align === "right"
          ? "display:block;margin-left:auto;margin-right:0;"
          : align === "justify"
            ? "display:block;width:100%;"
            : "display:block;margin:0;";
    return ["img", {
      src: a.src,
      alt: a.alt || "",
      title: a.title || "",
      "data-width": a.width || "100%",
      "data-rotate": String(Number(a.rotate || 0)),
      "data-flip-x": a.flipX ? "true" : "false",
      "data-flip-y": a.flipY ? "true" : "false",
      "data-align": align,
      style: `width:${a.width || "100%"};height:auto;max-width:100%;transform:${transform};transform-origin:center center;${alignStyle}`,
    }];
  },
};

const pageBreakNodeSpec = {
  group: "block",
  atom: true,
  selectable: true,
  parseDOM: [{
    tag: "hr[data-page-break]",
  }],
  toDOM() {
    return ["hr", { "data-page-break": "true", class: "pm-page-break" }];
  },
};

const mySchema = new Schema({
  nodes: (addListNodes(
    basicSchema.spec.nodes
      .update("paragraph", paragraphNodeSpec as any)
      .update("heading", headingNodeSpec as any)
      .update("image", imageNodeSpec as any),
    "paragraph block*",
    "block"
  ) as any)
    .append(tableNodes({ tableGroup: "block", cellContent: "block+", cellAttributes: {} }))
    .addToEnd("page_break", pageBreakNodeSpec as any),
  marks: basicSchema.spec.marks.append({
    underline:     { parseDOM: [{ tag: "u" }],                    toDOM: () => ["u", 0] },
    strikethrough: { parseDOM: [{ tag: "s" }, { tag: "strike" }],  toDOM: () => ["s", 0] },
    textColor: {
      attrs: { color: {} },
      parseDOM: [{ style: "color", getAttrs: (v) => ({ color: v }) }],
      toDOM: (mark: Mark) => ["span", { style: `color:${mark.attrs.color}` }, 0],
    },
    bgColor: {
      attrs: { color: {} },
      parseDOM: [{ style: "background-color", getAttrs: (v) => ({ color: v }) }],
      toDOM: (mark: Mark) => ["span", { style: `background-color:${mark.attrs.color}` }, 0],
    },
    fontSize: {
      attrs: { size: {} },
      parseDOM: [{ style: "font-size", getAttrs: (v) => ({ size: v }) }],
      toDOM: (mark: Mark) => ["span", { style: `font-size:${mark.attrs.size}` }, 0],
    },
    fontFamily: {
      attrs: { family: {} },
      parseDOM: [{ style: "font-family", getAttrs: (v) => ({ family: v }) }],
      toDOM: (mark: Mark) => ["span", { style: `font-family:${mark.attrs.family}` }, 0],
    },
    link: {
      attrs: { href: {}, title: { default: null } },
      inclusive: false,
      parseDOM: [{ tag: "a[href]", getAttrs: (dom) => ({
        href: (dom as HTMLElement).getAttribute("href"),
        title: (dom as HTMLElement).getAttribute("title"),
      })}],
      toDOM: (mark: Mark) => ["a", { href: mark.attrs.href, title: mark.attrs.title }, 0],
    },
  }),
});

export function insertTable(rows: number, cols: number) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
    if (!dispatch) return true;
    const makeCell = () => mySchema.nodes.table_cell.createAndFill()!;
    const makeHeader = () => mySchema.nodes.table_header.createAndFill()!;
    const headerRow = mySchema.nodes.table_row.create(
      null,
      Array.from({ length: cols }, makeHeader)
    );
    const bodyRows = Array.from({ length: rows - 1 }, () =>
      mySchema.nodes.table_row.create(null, Array.from({ length: cols }, makeCell))
    );
    const table = mySchema.nodes.table.create(null, [headerRow, ...bodyRows]);
    const paragraph = mySchema.nodes.paragraph.create();
    const { tr } = state;
    const insertPos = tr.selection.$from.end(1);
    // Tablo + arkasına boş paragraf ekle
    tr.insert(insertPos, [table, paragraph]);
    // Cursor'ı paragrafın başına taşı (tablo sonrası)
    const afterTable = insertPos + table.nodeSize;
    tr.setSelection(TextSelection.create(tr.doc, afterTable + 1));
    tr.scrollIntoView();
    dispatch(tr);
    return true;
  };
}

function adjustBlockIndentByTab(direction: 1 | -1) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
    // List item içindeyse native list indent/outdent
    const listCmd =
      direction > 0
        ? sinkListItem(mySchema.nodes.list_item)
        : liftListItem(mySchema.nodes.list_item);
    if (listCmd(state, dispatch)) return true;

    const { from, to } = state.selection;
    let tr = state.tr;
    let changed = false;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type === mySchema.nodes.paragraph || node.type === mySchema.nodes.heading) {
        const current = normalizeIndent(node.attrs.indent);
        const next = normalizeIndent(current + direction);
        if (next !== current) {
          tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
          changed = true;
        }
      }
    });
    if (!changed) return false;
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };
}

function buildPlugins() {
  return [
    history(),
    columnResizing(),
    tableEditing(),
    keymap({
      "Mod-z":       undo,
      "Mod-y":       redo,
      "Mod-Shift-z": redo,
      "Mod-b":       toggleMark(mySchema.marks.strong),
      "Mod-i":       toggleMark(mySchema.marks.em),
      "Mod-u":       toggleMark(mySchema.marks.underline),
      "Mod-a": (state, dispatch) => {
        // Tablo içindeyse tüm tabloyu seç, değilse tüm belgeyi seç
        if (isInTable(state)) {
          const table = findTable(state.selection.$from);
          if (table && dispatch) {
            const map = TableMap.get(table.node);
            const anchorCell = table.start + map.map[0];
            const headCell = table.start + map.map[map.map.length - 1];
            const sel = CellSelection.create(state.doc, anchorCell, headCell);
            dispatch(state.tr.setSelection(sel));
            return true;
          }
        }
        if (dispatch) dispatch(state.tr.setSelection(new AllSelection(state.doc)));
        return true;
      },
      "Tab":       adjustBlockIndentByTab(1),
      "Shift-Tab": adjustBlockIndentByTab(-1),
      "Enter":     splitListItem(mySchema.nodes.list_item),
    }),
    keymap(baseKeymap),
    inputRules({ rules: [
      wrappingInputRule(/^\s*([-*])\s$/,     mySchema.nodes.bullet_list),
      wrappingInputRule(/^(\d+)\.\s$/,       mySchema.nodes.ordered_list, m => ({ order: +m[1] })),
      textblockTypeInputRule(/^(#{1,6})\s$/, mySchema.nodes.heading, m => ({ level: m[1].length })),
    ]}),
  ];
}

export function insertPageBreak() {
  return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
    const pageBreakType = mySchema.nodes.page_break;
    const paragraphType = mySchema.nodes.paragraph;
    if (!pageBreakType || !paragraphType) return false;
    if (!dispatch) return true;

    const pageBreak = pageBreakType.create();
    const paragraph = paragraphType.create();
    let tr = state.tr.replaceSelectionWith(pageBreak);
    const insertPos = tr.selection.from;
    tr = tr.insert(insertPos, paragraph);
    tr = tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

// ── Table NodeView with drag handle ───────────────────────────────────────
class TableNodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private handle: HTMLElement;
  private tableView: TableView;

  constructor(
    node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined
  ) {
    // prosemirror-tables TableView'ını kullan (column resizing desteği için)
    this.tableView = new TableView(node, 25);

    // Wrapper
    this.dom = document.createElement("div");
    this.dom.className = "pm-table-wrapper";

    // Drag handle
    this.handle = document.createElement("div");
    this.handle.className = "pm-table-drag-handle";
    this.handle.setAttribute("contenteditable", "false");
    this.handle.draggable = true;
    this.handle.title = "Drag to move table";
    this.handle.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <circle cx="4" cy="3" r="1.2"/><circle cx="10" cy="3" r="1.2"/>
      <circle cx="4" cy="7" r="1.2"/><circle cx="10" cy="7" r="1.2"/>
      <circle cx="4" cy="11" r="1.2"/><circle cx="10" cy="11" r="1.2"/>
    </svg>`;

    this.handle.addEventListener("dragstart", (e) => {
      const pos = this.getPos();
      if (pos === undefined || !e.dataTransfer) return;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/pm-table-pos", String(pos));
      e.dataTransfer.setDragImage(this.dom, 20, 20);
      requestAnimationFrame(() => this.dom.classList.add("pm-table-dragging"));
    });

    this.handle.addEventListener("dragend", () => {
      this.dom.classList.remove("pm-table-dragging");
    });

    // TableView'ın dom'unu (table element + colgroup) wrapper'a ekle
    this.dom.appendChild(this.handle);
    this.dom.appendChild(this.tableView.dom);
    this.contentDOM = this.tableView.contentDOM;
  }

  update(node: PMNode) {
    return this.tableView.update(node);
  }

  stopEvent(event: Event) {
    return this.handle.contains(event.target as Node);
  }

  ignoreMutation(mutation: any) {
    return this.tableView.ignoreMutation(mutation);
  }

  destroy() {}
}

class ImageNodeView {
  dom: HTMLElement;
  private img: HTMLImageElement;
  private node: PMNode;
  private view: EditorView;
  private getPos: () => number | undefined;
  private onMove?: (event: MouseEvent) => void;
  private onUp?: () => void;

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement("span");
    this.dom.className = "pm-image-wrapper";

    this.img = document.createElement("img");
    this.applyAttrs(node);
    this.dom.appendChild(this.img);

    const handles = ["tl", "tr", "bl", "br"] as const;
    handles.forEach((corner) => {
      const handle = document.createElement("span");
      handle.className = `pm-image-handle pm-image-handle-${corner}`;
      handle.setAttribute("contenteditable", "false");
      handle.addEventListener("mousedown", (event) => this.startResize(event, corner));
      this.dom.appendChild(handle);
    });

    this.dom.addEventListener("mousedown", (event) => {
      if ((event.target as HTMLElement).classList.contains("pm-image-handle")) return;
      const pos = this.getPos();
      if (pos === undefined) return;
      event.preventDefault();
      this.view.dispatch(this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, pos)));
      this.view.focus();
    });
  }

  private applyAttrs(node: PMNode) {
    const width = node.attrs.width || "100%";
    const rotate = Number(node.attrs.rotate || 0);
    const flipX = !!node.attrs.flipX;
    const flipY = !!node.attrs.flipY;
    const align = String(node.attrs.align || "left");
    const sx = flipX ? -1 : 1;
    const sy = flipY ? -1 : 1;
    this.img.setAttribute("src", node.attrs.src);
    this.img.setAttribute("alt", node.attrs.alt || "");
    this.img.setAttribute("title", node.attrs.title || "");
    this.img.setAttribute("data-width", width);
    this.img.setAttribute("data-rotate", String(rotate));
    this.img.setAttribute("data-flip-x", flipX ? "true" : "false");
    this.img.setAttribute("data-flip-y", flipY ? "true" : "false");
    this.img.setAttribute("data-align", align);
    this.img.style.width = width;
    this.img.style.height = "auto";
    this.img.style.maxWidth = "100%";
    this.img.style.display = "block";
    this.img.style.transform = `rotate(${rotate}deg) scale(${sx}, ${sy})`;
    this.img.style.transformOrigin = "center center";
    this.dom.style.width = "fit-content";
    this.dom.style.display = "block";
    this.dom.style.marginLeft = "0";
    this.dom.style.marginRight = "0";
    if (align === "center") {
      this.dom.style.marginLeft = "auto";
      this.dom.style.marginRight = "auto";
    } else if (align === "right") {
      this.dom.style.marginLeft = "auto";
    } else if (align === "justify") {
      this.dom.style.width = "100%";
      this.img.style.width = "100%";
    }
  }

  private startResize(event: MouseEvent, corner: "tl" | "tr" | "bl" | "br") {
    event.preventDefault();
    event.stopPropagation();

    const pos = this.getPos();
    if (pos === undefined) return;
    this.view.dispatch(this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, pos)));

    const rect = this.img.getBoundingClientRect();
    const startX = event.clientX;
    const startWidth = rect.width;
    const resizeFromLeft = corner === "tl" || corner === "bl";
    const parentWidth = this.dom.parentElement?.getBoundingClientRect().width ?? window.innerWidth;
    const minWidth = 40;
    const maxWidth = Math.max(minWidth, Math.floor(parentWidth - 8));

    this.onMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const rawWidth = resizeFromLeft ? startWidth - dx : startWidth + dx;
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, rawWidth));
      this.img.style.width = `${Math.round(nextWidth)}px`;
      this.img.setAttribute("data-width", `${Math.round(nextWidth)}px`);
    };

    this.onUp = () => {
      if (!this.onMove || !this.onUp) return;
      window.removeEventListener("mousemove", this.onMove);
      window.removeEventListener("mouseup", this.onUp);
      const nextWidth = this.img.getAttribute("data-width") || `${Math.round(this.img.getBoundingClientRect().width)}px`;
      const latestPos = this.getPos();
      if (latestPos !== undefined) {
        const tr = this.view.state.tr.setNodeMarkup(latestPos, undefined, {
          ...this.node.attrs,
          width: nextWidth,
        });
        this.view.dispatch(tr);
      }
      this.onMove = undefined;
      this.onUp = undefined;
    };

    window.addEventListener("mousemove", this.onMove);
    window.addEventListener("mouseup", this.onUp);
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.applyAttrs(node);
    return true;
  }

  selectNode() {
    this.dom.classList.add("is-selected");
  }

  deselectNode() {
    this.dom.classList.remove("is-selected");
  }

  stopEvent(event: Event) {
    const target = event.target as HTMLElement;
    return !!target.closest(".pm-image-handle");
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    if (this.onMove) window.removeEventListener("mousemove", this.onMove);
    if (this.onUp) window.removeEventListener("mouseup", this.onUp);
  }
}

export { mySchema };

type SlashCommandId =
  | "text"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "numbered"
  | "quote"
  | "code"
  | "divider"
  | "page_break"
  | "table"
  | "emoji";

type SlashMenuState = {
  from: number;
  query: string;
  left: number;
  top: number;
  selected: number;
};

type ImagePopoverState = {
  left: number;
  top: number;
};

type DocInfo = {
  selectedType: string;
  words: number;
  characters: number;
};

const SLASH_MENU_OFFSET = 6;
const SLASH_MENU_ESTIMATED_HEIGHT = 210;
const SLASH_MENU_VIEWPORT_PADDING = 8;

const SLASH_COMMANDS: Array<{ id: SlashCommandId; title: string; hint: string; keywords: string[] }> = [
  { id: "text", title: "Text", hint: "Normal paragraph", keywords: ["paragraph", "normal", "text"] },
  { id: "h1", title: "Heading 1", hint: "Large section heading", keywords: ["h1", "heading", "title"] },
  { id: "h2", title: "Heading 2", hint: "Medium section heading", keywords: ["h2", "heading", "subtitle"] },
  { id: "h3", title: "Heading 3", hint: "Small section heading", keywords: ["h3", "heading"] },
  { id: "bullet", title: "Bullet List", hint: "Create a bulleted list", keywords: ["list", "bullet", "ul"] },
  { id: "numbered", title: "Numbered List", hint: "Create a numbered list", keywords: ["list", "numbered", "ol"] },
  { id: "quote", title: "Quote", hint: "Insert block quote", keywords: ["quote", "blockquote"] },
  { id: "code", title: "Code Block", hint: "Insert code block", keywords: ["code", "snippet"] },
  { id: "divider", title: "Divider", hint: "Insert horizontal divider", keywords: ["divider", "line", "hr", "separator"] },
  { id: "page_break", title: "Page Break", hint: "Insert printable page break", keywords: ["page", "break", "new page"] },
  { id: "table", title: "Table", hint: "Insert 3 × 3 table", keywords: ["table", "grid"] },
  { id: "emoji", title: "Emoji", hint: "Insert 😀 emoji", keywords: ["emoji", "smile", "icon"] },
];

function prettySelectionType(state: EditorState): string {
  const sel = state.selection;
  if (sel instanceof NodeSelection) {
    const nodeName = sel.node.type.name;
    if (nodeName === "image") return "Image";
    if (nodeName === "table") return "Table";
    return nodeName;
  }
  const parent = sel.$from.parent;
  if (parent.type.name === "paragraph") return "Paragraph";
  if (parent.type.name === "heading") return `Heading ${parent.attrs.level || ""}`.trim();
  if (parent.type.name === "blockquote") return "Blockquote";
  if (parent.type.name === "code_block") return "Code Block";
  if (parent.type.name === "list_item") return "List Item";
  return parent.type.name;
}

function computeDocInfo(state: EditorState): DocInfo {
  const text = state.doc.textBetween(0, state.doc.content.size, " ", " ").trim();
  const words = text ? text.split(/\s+/).length : 0;
  const characters = text.length;
  return {
    selectedType: prettySelectionType(state),
    words,
    characters,
  };
}

const DEFAULT_REF_CONTENT = `
  <h1>Welcome to Online Wordpad</h1>
  <p>This starter document demonstrates the core formatting and layout capabilities.</p>

  <h2>Page Properties</h2>
  <ul>
    <li>Paper size: A4 (794 × 1123 px)</li>
    <li>Adjustable page margins (0.5 / 1 / 1.5 / 2 cm)</li>
    <li>Default body font: Arial, 12pt</li>
    <li>Line height: 1.5</li>
  </ul>

  <h2>Headings and Paragraphs</h2>
  <h3>Section Heading (H3)</h3>
  <p>
    Use headings to structure long documents. Keep paragraphs short and focused
    so they are easier to scan and review.
  </p>

  <h2>Bullet List (Nested)</h2>
  <ul>
    <li>Main bullet item</li>
    <li>Another bullet item
      <ul>
        <li>Nested bullet (square marker)</li>
        <li>Second nested bullet</li>
      </ul>
    </li>
  </ul>

  <h2>Numbered List</h2>
  <ol>
    <li>Open the editor</li>
    <li>Apply formatting</li>
    <li>Review and export</li>
  </ol>

  <h2>Table Example</h2>
  <table>
    <tbody>
      <tr>
        <th>Feature</th>
        <th>Status</th>
        <th>Notes</th>
      </tr>
      <tr>
        <td>Slash Commands</td>
        <td>Ready</td>
        <td>Type "/" to open command menu</td>
      </tr>
      <tr>
        <td>Toolbar Groups</td>
        <td>Ready</td>
        <td>Logical grouping with overflow in "..."</td>
      </tr>
      <tr>
        <td>Lists</td>
        <td>Ready</td>
        <td>Bullets, nested bullets, and numbered lists</td>
      </tr>
    </tbody>
  </table>

  <h2>Code Block</h2>
  <pre><code>function greet(name) {
  return "Hello, " + name + "!";
}</code></pre>

  <h2>Blockquote</h2>
  <blockquote>
    Good structure makes documents easier to read, edit, and share.
  </blockquote>
`;

export default function Editor() {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef   = useRef<EditorView | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const slashListRef = useRef<HTMLDivElement>(null);
  const slashSearchInputRef = useRef<HTMLInputElement>(null);
  const cropperRef = useRef<CropperRef>(null);
  const slashMenuStateRef = useRef<SlashMenuState | null>(null);
  const slashItemsRef = useRef(SLASH_COMMANDS);
  const [tick, setTick] = useState(0);
  const [pageMarginCm, setPageMarginCm] = useState(1);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [paperBgColor, setPaperBgColor] = useState("#ccd6e5");

  const handlePrint = useReactToPrint({
    contentRef: editorRef,
    pageStyle: `
      @page { size: A4; margin: ${pageMarginCm}cm; }
      body { margin: 0 !important; padding: 0 !important; background: white !important; }
      .pm-page {
        zoom: 1 !important;
        box-shadow: none !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        min-height: unset !important;
      }
      hr.pm-page-break {
        border: 0 !important;
        margin: 0 !important;
        height: 0 !important;
        page-break-after: always !important;
        break-after: page !important;
      }
      hr.pm-page-break::after { content: "" !important; display: none !important; }
    `,
  });
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [imagePopover, setImagePopover] = useState<ImagePopoverState | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [docInfo, setDocInfo] = useState<DocInfo>({ selectedType: "Paragraph", words: 0, characters: 0 });

  const slashItems = useMemo(() => {
    const q = (slashMenu?.query || "").trim().toLowerCase();
    if (!q) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter((item) => {
      if (item.title.toLowerCase().includes(q)) return true;
      if (item.hint.toLowerCase().includes(q)) return true;
      return item.keywords.some((k) => k.includes(q));
    });
  }, [slashMenu?.query]);

  const getSlashMenuCoords = useCallback((view: EditorView, pos: number) => {
    const coords = view.coordsAtPos(pos);
    const openUp =
      coords.bottom > (window.innerHeight - SLASH_MENU_ESTIMATED_HEIGHT);

    let top = openUp
      ? coords.top - SLASH_MENU_ESTIMATED_HEIGHT - SLASH_MENU_OFFSET
      : coords.bottom + SLASH_MENU_OFFSET;

    top = Math.max(
      SLASH_MENU_VIEWPORT_PADDING,
      Math.min(top, window.innerHeight - SLASH_MENU_ESTIMATED_HEIGHT - SLASH_MENU_VIEWPORT_PADDING)
    );

    const left = Math.max(
      SLASH_MENU_VIEWPORT_PADDING,
      Math.min(coords.left, window.innerWidth - 300 - SLASH_MENU_VIEWPORT_PADDING)
    );

    return { left, top };
  }, []);

  useEffect(() => {
    slashMenuStateRef.current = slashMenu;
  }, [slashMenu]);

  useEffect(() => {
    slashItemsRef.current = slashItems;
  }, [slashItems]);

  const refreshSlashMenu = useCallback((view: EditorView) => {
    setSlashMenu((prev) => {
      if (!prev) return null;
      const sel = view.state.selection;
      if (!sel.empty || sel.from < prev.from + 1) return null;

      const slashText = view.state.doc.textBetween(prev.from, sel.from, "", "");
      if (!slashText.startsWith("/")) return null;

      const query = slashText.slice(1);
      if (/\s/.test(query)) return null;

      const coords = getSlashMenuCoords(view, sel.from);
      return {
        ...prev,
        query,
        left: coords.left,
        top: coords.top,
        selected: query === prev.query ? prev.selected : 0,
      };
    });
  }, [getSlashMenuCoords]);

  const openSlashMenu = useCallback((view: EditorView, fromPos: number) => {
    const selPos = fromPos + 1;
    const coords = getSlashMenuCoords(view, selPos);
    setSlashMenu({
      from: fromPos,
      query: "",
      left: coords.left,
      top: coords.top,
      selected: 0,
    });
  }, [getSlashMenuCoords]);

  const closeSlashMenu = useCallback(() => setSlashMenu(null), []);

  const refreshImagePopover = useCallback((view: EditorView) => {
    const sel = view.state.selection;
    if (!(sel instanceof NodeSelection) || sel.node.type !== mySchema.nodes.image) {
      setImagePopover(null);
      return;
    }
    const domAtPos = view.nodeDOM(sel.from) as HTMLElement | null;
    if (domAtPos) {
      const rect = domAtPos.getBoundingClientRect();
      setImagePopover({
        left: Math.round(rect.left + rect.width / 2),
        top: Math.round(rect.top + 8),
      });
      return;
    }
    const from = view.coordsAtPos(sel.from);
    const to = view.coordsAtPos(sel.to);
    setImagePopover({
      left: Math.round((from.left + to.right) / 2),
      top: Math.round(from.top + 8),
    });
  }, []);

  const runSlashCommand = useCallback((id: SlashCommandId) => {
    const v = viewRef.current;
    const activeSlashMenu = slashMenuStateRef.current;
    if (!v || !activeSlashMenu) return;

    const selTo = v.state.selection.from;
    if (selTo < activeSlashMenu.from) {
      setSlashMenu(null);
      return;
    }

    v.dispatch(v.state.tr.delete(activeSlashMenu.from, selTo));

    if (id === "text") setBlockType(mySchema.nodes.paragraph)(v.state, v.dispatch);
    else if (id === "h1") setBlockType(mySchema.nodes.heading, { level: 1 })(v.state, v.dispatch);
    else if (id === "h2") setBlockType(mySchema.nodes.heading, { level: 2 })(v.state, v.dispatch);
    else if (id === "h3") setBlockType(mySchema.nodes.heading, { level: 3 })(v.state, v.dispatch);
    else if (id === "bullet") wrapInList(mySchema.nodes.bullet_list)(v.state, v.dispatch);
    else if (id === "numbered") wrapInList(mySchema.nodes.ordered_list)(v.state, v.dispatch);
    else if (id === "quote") wrapIn(mySchema.nodes.blockquote)(v.state, v.dispatch);
    else if (id === "code") setBlockType(mySchema.nodes.code_block)(v.state, v.dispatch);
    else if (id === "divider") {
      const hr = mySchema.nodes.horizontal_rule.create();
      const paragraph = mySchema.nodes.paragraph.create();
      const insertPos = v.state.selection.from;
      const tr = v.state.tr.insert(insertPos, [hr, paragraph]);
      v.dispatch(tr.scrollIntoView());
    }
    else if (id === "page_break") insertPageBreak()(v.state, v.dispatch);
    else if (id === "table") insertTable(3, 3)(v.state, v.dispatch);
    else if (id === "emoji") v.dispatch(v.state.tr.insertText("😀"));

    setSlashMenu(null);
    v.focus();
  }, []);

  const save = useCallback((state: EditorState) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const s = DOMSerializer.fromSchema(mySchema);
      const frag = s.serializeFragment(state.doc.content);
      const tmp = document.createElement("div");
      tmp.appendChild(frag);
      localStorage.setItem("wordpad-content-pm", tmp.innerHTML);
    }, 800);
  }, []);

  const refreshDocInfo = useCallback((state: EditorState) => {
    setDocInfo(computeDocInfo(state));
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;
    const stored = localStorage.getItem("wordpad-content-pm");
    let doc: PMNode | undefined;
    if (stored) {
      try {
        const dom = new DOMParser().parseFromString(stored, "text/html");
        doc = PMParser.fromSchema(mySchema).parse(dom.body);
      } catch { doc = undefined; }
    } else {
      const dom = new DOMParser().parseFromString(DEFAULT_REF_CONTENT, "text/html");
      doc = PMParser.fromSchema(mySchema).parse(dom.body);
    }
    const state = EditorState.create({ schema: mySchema, doc, plugins: buildPlugins() });
    const view = new EditorView(editorRef.current, {
      state,
      nodeViews: {
        table: (node, v, getPos) => new TableNodeView(node, v, getPos as () => number | undefined),
        image: (node, v, getPos) => new ImageNodeView(node, v, getPos as () => number | undefined),
      },
      handleClickOn(view, pos, node, _nodePos, event, direct) {
        if (!direct || node.type !== mySchema.nodes.image) return false;
        event.preventDefault();
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
        view.focus();
        return true;
      },
      handleDrop(v, event, _slice, moved) {
        const e = event as DragEvent;
        if (!e.dataTransfer) return false;
        const posStr = e.dataTransfer.getData("application/pm-table-pos");
        if (!posStr) return false;

        const fromPos = parseInt(posStr, 10);
        const dropCoords = v.posAtCoords({ left: e.clientX, top: e.clientY });
        if (!dropCoords) return false;

        const { state: st, dispatch } = v;
        const $from = st.doc.resolve(fromPos);
        const tableNode = $from.nodeAfter;
        if (!tableNode || tableNode.type !== mySchema.nodes.table) return false;

        let toPos = dropCoords.pos;
        // Tablo kendi üzerine bırakılıyorsa iptal
        if (toPos >= fromPos && toPos <= fromPos + tableNode.nodeSize) return false;

        const tr = st.tr;
        // Tabloyu sil, sonra hedef pozisyona ekle
        tr.delete(fromPos, fromPos + tableNode.nodeSize);
        // Silme sonrası pos'u güncelle
        const mappedTo = tr.mapping.map(toPos);
        tr.insert(mappedTo, tableNode);
        dispatch(tr.scrollIntoView());
        return true;
      },
      handleTextInput(v, from, _to, text) {
        if (text !== "/") return false;
        setTimeout(() => {
          if (!viewRef.current) return;
          openSlashMenu(viewRef.current, from);
        }, 0);
        return false;
      },
      handlePaste(v, event) {
        const e = event as ClipboardEvent;
        const dt = e.clipboardData;
        if (!dt) return false;

        const fileFromItems =
          Array.from(dt.items)
            .find((item) => item.kind === "file" && item.type.startsWith("image/"))
            ?.getAsFile() || null;
        const fileFromFiles =
          Array.from(dt.files).find((file) => file.type.startsWith("image/")) || null;
        const imageFile = fileFromItems || fileFromFiles;
        if (!imageFile) return false;

        e.preventDefault();
        const reader = new FileReader();
        reader.onload = () => {
          const src = typeof reader.result === "string" ? reader.result : "";
          if (!src) return;
          const imageNode = mySchema.nodes.image.create({
            src,
            alt: imageFile.name || "pasted-image",
            title: "",
            width: "100%",
          });
          v.dispatch(v.state.tr.replaceSelectionWith(imageNode).scrollIntoView());
          v.focus();
        };
        reader.readAsDataURL(imageFile);
        return true;
      },
      handleKeyDown(v, event) {
        const activeSlashMenu = slashMenuStateRef.current;
        if (!activeSlashMenu) return false;
        const activeItems = slashItemsRef.current;
        if (event.key === "Escape") {
          event.preventDefault();
          closeSlashMenu();
          return true;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (!activeItems.length) return true;
          setSlashMenu((prev) => prev ? ({ ...prev, selected: (prev.selected + 1) % activeItems.length }) : prev);
          return true;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          if (!activeItems.length) return true;
          setSlashMenu((prev) => prev ? ({
            ...prev,
            selected: (prev.selected - 1 + activeItems.length) % activeItems.length,
          }) : prev);
          return true;
        }
        if (event.key === "Enter") {
          if (!activeItems.length) return false;
          event.preventDefault();
          const picked = activeItems[Math.max(0, Math.min(activeSlashMenu.selected, activeItems.length - 1))];
          if (picked) runSlashCommand(picked.id);
          return true;
        }
        return false;
      },
      dispatchTransaction(tr) {
        const next = view.state.apply(tr);
        view.updateState(next);
        setTick(n => n + 1);
        refreshSlashMenu(view);
        refreshImagePopover(view);
        refreshDocInfo(next);
        if (tr.docChanged) save(next);
      },
    });
    viewRef.current = view;
    refreshImagePopover(view);
    refreshDocInfo(view.state);
    view.focus();
    return () => { view.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshDocInfo, refreshImagePopover, refreshSlashMenu, save]);

  const handleInsertTable = useCallback((rows: number, cols: number) => {
    const v = viewRef.current;
    if (!v) return;
    insertTable(rows, cols)(v.state, v.dispatch);
    v.focus();
  }, []);

  const handleInsertPageBreak = useCallback(() => {
    const v = viewRef.current;
    if (!v) return;
    insertPageBreak()(v.state, v.dispatch);
    v.focus();
  }, []);

  const handleLinkAdd = useCallback(() => {
    const v = viewRef.current;
    if (!v || v.state.selection.empty) { alert("Please select text first."); return; }
    const url = prompt("Link URL:");
    if (!url) return;
    const mt = mySchema.marks.link;
    const { ranges } = v.state.selection;
    const tr = v.state.tr;
    ranges.forEach(({ $from, $to }) => {
      tr.removeMark($from.pos, $to.pos, mt);
      tr.addMark($from.pos, $to.pos, mt.create({ href: url, title: "" }));
    });
    v.dispatch(tr);
    v.focus();
  }, []);

  const handleImageAdd = useCallback(() => {
    const v = viewRef.current;
    if (!v) return;
    const src = prompt("Image URL:");
    if (!src) return;
    const alt = prompt("Alt text (optional):") || "";
    const node = mySchema.nodes.image.create({ src, alt, title: "", width: "100%" });
    v.dispatch(v.state.tr.replaceSelectionWith(node).scrollIntoView());
    v.focus();
  }, []);

  const updateSelectedImageAttrs = useCallback((patch: Record<string, unknown>) => {
    const v = viewRef.current;
    if (!v) return;
    const sel = v.state.selection;
    if (!(sel instanceof NodeSelection) || sel.node.type !== mySchema.nodes.image) return;
    v.dispatch(v.state.tr.setNodeMarkup(sel.from, undefined, {
      ...sel.node.attrs,
      ...patch,
    }));
    v.focus();
  }, []);

  const rotateImage = useCallback(() => {
    const v = viewRef.current;
    if (!v) return;
    const sel = v.state.selection;
    if (!(sel instanceof NodeSelection) || sel.node.type !== mySchema.nodes.image) return;
    const current = Number(sel.node.attrs.rotate || 0);
    updateSelectedImageAttrs({ rotate: (current + 90) % 360 });
  }, [updateSelectedImageAttrs]);

  const flipImageHorizontal = useCallback(() => {
    const v = viewRef.current;
    if (!v) return;
    const sel = v.state.selection;
    if (!(sel instanceof NodeSelection) || sel.node.type !== mySchema.nodes.image) return;
    updateSelectedImageAttrs({ flipX: !sel.node.attrs.flipX });
  }, [updateSelectedImageAttrs]);

  const flipImageVertical = useCallback(() => {
    const v = viewRef.current;
    if (!v) return;
    const sel = v.state.selection;
    if (!(sel instanceof NodeSelection) || sel.node.type !== mySchema.nodes.image) return;
    updateSelectedImageAttrs({ flipY: !sel.node.attrs.flipY });
  }, [updateSelectedImageAttrs]);

  const setImageAlign = useCallback((align: "left" | "center" | "right") => {
    updateSelectedImageAttrs({ align });
  }, [updateSelectedImageAttrs]);

  const openCropDialog = useCallback(() => {
    const v = viewRef.current;
    if (!v) return;
    const sel = v.state.selection;
    if (!(sel instanceof NodeSelection) || sel.node.type !== mySchema.nodes.image) return;
    const src = String(sel.node.attrs.src || "");
    if (!src) return;
    setCropSource(src);
    setCropDialogOpen(true);
  }, []);

  const applyCrop = useCallback(() => {
    const cropper = cropperRef.current;
    if (!cropper) return;
    const canvas = cropper.getCanvas();
    if (!canvas) {
      alert("Crop sonucu alınamadı.");
      return;
    }
    try {
      const nextSrc = canvas.toDataURL("image/png");
      updateSelectedImageAttrs({ src: nextSrc });
      setCropDialogOpen(false);
      setCropSource(null);
    } catch {
      alert("Bu görsel cross-origin nedeniyle kırpılamadı.");
    }
  }, [updateSelectedImageAttrs]);

  useEffect(() => {
    if (!slashMenu) return;
    requestAnimationFrame(() => slashSearchInputRef.current?.focus());
  }, [slashMenu]);

  useEffect(() => {
    if (!slashMenu) return;
    const list = slashListRef.current;
    if (!list) return;
    const activeItem = list.querySelector(`[data-slash-index="${slashMenu.selected}"]`) as HTMLElement | null;
    activeItem?.scrollIntoView({ block: "nearest" });
  }, [slashMenu?.selected, slashItems.length, slashMenu]);

  useEffect(() => {
    if (!slashMenu) return;
    const onPointerDown = (event: MouseEvent) => {
      if (slashMenuRef.current?.contains(event.target as Node)) return;
      closeSlashMenu();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [slashMenu, closeSlashMenu]);

  useEffect(() => {
    const updatePosition = () => {
      const v = viewRef.current;
      if (!v) return;
      refreshImagePopover(v);
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [refreshImagePopover]);

  useEffect(() => {
    if (!cropDialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setCropDialogOpen(false);
      setCropSource(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cropDialogOpen]);

  // Ctrl+P → menüdeki Print ile aynı şeyi çağır
  useEffect(() => {
    const onPrintKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener("keydown", onPrintKey);
    return () => window.removeEventListener("keydown", onPrintKey);
  }, [handlePrint]);

  return (
    <div className="flex flex-col h-screen">
      <MenuBar viewRef={viewRef} schema={mySchema} pageMarginCm={pageMarginCm} onPrint={handlePrint} />
      <Toolbar
        viewRef={viewRef}
        schema={mySchema}
        onInsertTable={handleInsertTable}
        onPageBreakAdd={handleInsertPageBreak}
        onLinkAdd={handleLinkAdd}
        onImageAdd={handleImageAdd}
        tick={tick}
      />
      <div className="editor-shell" style={{ backgroundColor: paperBgColor }}>
        <TableContextMenu viewRef={viewRef}>
          <div
            className="pm-page"
            ref={editorRef}
            style={{
              ["--page-margin" as any]: `${pageMarginCm}cm`,
              ["zoom" as any]: zoomPercent / 100,
            }}
          />
        </TableContextMenu>
      </div>
      {imagePopover && (
        <Popover open>
          <PopoverAnchor asChild>
            <span
              aria-hidden="true"
              style={{
                position: "fixed",
                left: imagePopover.left,
                top: imagePopover.top,
                width: 1,
                height: 1,
                pointerEvents: "none",
              }}
            />
          </PopoverAnchor>
          <PopoverContent side="bottom" align="center" sideOffset={8} className="w-auto p-1">
            <div className="flex items-center gap-1">
              <button type="button" className="h-8 w-8 rounded hover:bg-accent/70" title="Rotate" aria-label="Rotate" onMouseDown={(e) => e.preventDefault()} onClick={rotateImage}>
                <ArrowClockwise className="mx-auto h-4 w-4" />
              </button>
              <button type="button" className="h-8 w-8 rounded hover:bg-accent/70" title="Crop" aria-label="Crop" onMouseDown={(e) => e.preventDefault()} onClick={openCropDialog}>
                <Crop className="mx-auto h-4 w-4" />
              </button>
              <button type="button" className="h-8 w-8 rounded hover:bg-accent/70" title="Flip" aria-label="Flip" onMouseDown={(e) => e.preventDefault()} onClick={flipImageHorizontal}>
                <FlipHorizontal className="mx-auto h-4 w-4" />
              </button>
              <button type="button" className="h-8 w-8 rounded hover:bg-accent/70" title="Flip Vertical" aria-label="Flip Vertical" onMouseDown={(e) => e.preventDefault()} onClick={flipImageVertical}>
                <FlipVertical className="mx-auto h-4 w-4" />
              </button>
              <div className="mx-1 h-5 w-px bg-border" />
              <button type="button" className="h-8 w-8 rounded hover:bg-accent/70" title="Align Left" aria-label="Align Left" onMouseDown={(e) => e.preventDefault()} onClick={() => setImageAlign("left")}>
                <TextAlignLeft className="mx-auto h-4 w-4" />
              </button>
              <button type="button" className="h-8 w-8 rounded hover:bg-accent/70" title="Align Center" aria-label="Align Center" onMouseDown={(e) => e.preventDefault()} onClick={() => setImageAlign("center")}>
                <TextAlignCenter className="mx-auto h-4 w-4" />
              </button>
              <button type="button" className="h-8 w-8 rounded hover:bg-accent/70" title="Align Right" aria-label="Align Right" onMouseDown={(e) => e.preventDefault()} onClick={() => setImageAlign("right")}>
                <TextAlignRight className="mx-auto h-4 w-4" />
              </button>
            </div>
          </PopoverContent>
        </Popover>
      )}
      {cropDialogOpen && cropSource && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-lg border bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Crop Image</h3>
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs hover:bg-accent/70"
                onClick={() => {
                  setCropDialogOpen(false);
                  setCropSource(null);
                }}
              >
                Close
              </button>
            </div>
            <div className="h-[520px] w-full overflow-hidden rounded border bg-slate-50">
              <Cropper
                ref={cropperRef}
                src={cropSource}
                className="h-full w-full"
              />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border px-3 py-1.5 text-sm hover:bg-accent/70"
                onClick={() => {
                  setCropDialogOpen(false);
                  setCropSource(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded border border-blue-600 bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                onClick={applyCrop}
              >
                Apply Crop
              </button>
            </div>
          </div>
        </div>
      )}
      {slashMenu && (
        <div
          ref={slashMenuRef}
          className="fixed z-[1200] w-[300px] rounded-md border border-border bg-white shadow-lg p-1"
          style={{ left: slashMenu.left, top: slashMenu.top }}
        >
          <input
            ref={slashSearchInputRef}
            value={slashMenu.query}
            onChange={(e) => setSlashMenu((prev) => prev ? ({ ...prev, query: e.target.value, selected: 0 }) : prev)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSlashMenu((prev) => {
                  if (!prev || !slashItems.length) return prev;
                  return { ...prev, selected: (prev.selected + 1) % slashItems.length };
                });
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSlashMenu((prev) => {
                  if (!prev || !slashItems.length) return prev;
                  return { ...prev, selected: (prev.selected - 1 + slashItems.length) % slashItems.length };
                });
              } else if (e.key === "Enter") {
                e.preventDefault();
                const picked = slashItems[Math.max(0, Math.min(slashMenu.selected, slashItems.length - 1))];
                if (picked) runSlashCommand(picked.id);
              } else if (e.key === "Escape") {
                e.preventDefault();
                closeSlashMenu();
                viewRef.current?.focus();
              }
            }}
            placeholder="Search commands..."
            className="mb-1 w-full rounded border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          {slashItems.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">No command found</div>
          ) : (
            <div ref={slashListRef} className="max-h-[132px] overflow-y-auto">
              {slashItems.map((item, idx) => (
                <button
                  key={item.id}
                  data-slash-index={idx}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    runSlashCommand(item.id);
                  }}
                  className={`w-full text-left rounded px-2 py-1.5 ${
                    idx === slashMenu.selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                  }`}
                >
                  <div className="text-sm font-medium">{item.title}</div>
                  <div className="text-xs text-muted-foreground">{item.hint}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="border-t border-border bg-background/95 px-2 py-1 text-[11px] leading-none relative">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[11px] font-semibold tracking-[0.18em] text-muted-foreground/50 select-none">
          ONLINE WORDPAD
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span><span className="font-medium text-foreground">{docInfo.selectedType}</span></span>
            <span>Words: <span className="font-medium text-foreground">{docInfo.words}</span></span>
            <span>Chars: <span className="font-medium text-foreground">{docInfo.characters}</span></span>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Zoom</span>
              <select
                className="h-6 rounded border border-input bg-background px-1.5 text-[11px]"
                value={String(zoomPercent)}
                onChange={(e) => setZoomPercent(Number(e.target.value))}
              >
                <option value="50">50%</option>
                <option value="75">75%</option>
                <option value="90">90%</option>
                <option value="100">100%</option>
                <option value="110">110%</option>
                <option value="125">125%</option>
                <option value="150">150%</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Page Margin</span>
              <select
                className="h-6 rounded border border-input bg-background px-1.5 text-[11px]"
                value={String(pageMarginCm)}
                onChange={(e) => setPageMarginCm(Number(e.target.value))}
              >
                <option value="0.5">0.5 cm</option>
                <option value="1">1 cm</option>
                <option value="1.5">1.5 cm</option>
                <option value="2">2 cm</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Background</span>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-6 items-center gap-1 rounded border border-input bg-background px-1.5"
                    title="Paper background color"
                  >
                    <span
                      className="inline-block h-3 w-3 rounded border border-black/15"
                      style={{ backgroundColor: paperBgColor }}
                    />
                    <span className="text-[10px] uppercase text-muted-foreground">{paperBgColor}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="end" className="w-auto p-2 space-y-2">
                  <HexColorPicker
                    color={paperBgColor}
                    onChange={setPaperBgColor}
                    style={{ width: 180, height: 130 }}
                  />
                  <HexColorInput
                    color={paperBgColor}
                    onChange={setPaperBgColor}
                    prefixed
                    className="h-7 w-full rounded border border-input bg-background px-2 text-[11px] uppercase focus:outline-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="h-7 rounded border border-input bg-background px-2 text-[11px] hover:bg-accent/70"
                      onClick={() => setPaperBgColor("#ccd6e5")}
                    >
                      Reset
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
