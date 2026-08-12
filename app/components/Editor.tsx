"use client";

import { useEffect, useRef, useCallback, useMemo, useState, lazy, Suspense } from "react";
import { useReactToPrint } from "react-to-print";
import { Schema, DOMParser as PMParser, DOMSerializer, Node as PMNode, Mark } from "prosemirror-model";
import { EditorState, Transaction, AllSelection, TextSelection, NodeSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import type { CropperRef } from "react-advanced-cropper";
import { HexColorPicker, HexColorInput } from "react-colorful";
import "react-advanced-cropper/dist/style.css";

// Heavy and rarely used — load only when the crop dialog opens.
const Cropper = lazy(async () => {
  const m = await import("react-advanced-cropper");
  return { default: m.Cropper };
});
import { schema as basicSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, toggleMark, setBlockType, wrapIn } from "prosemirror-commands";
import { wrapInList, splitListItem, liftListItem, sinkListItem } from "prosemirror-schema-list";
import { inputRules, wrappingInputRule, textblockTypeInputRule, InputRule } from "prosemirror-inputrules";
import { tableEditing, columnResizing, tableNodes, isInTable, findTable, CellSelection, TableMap, TableView } from "prosemirror-tables";
import MenuBar from "./MenuBar";
import Toolbar from "./Toolbar";
import TableContextMenu from "./TableContextMenu";
import {
  searchPlugin, setSearch, findNext, findPrev,
  replaceCurrent, replaceAll, clearSearch, getSearchState,
} from "./searchPlugin";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowClockwise, Crop, FlipHorizontal, FlipVertical,
  TextAlignLeft, TextAlignCenter, TextAlignRight,
  Sun, Moon, FileText, Trash, Plus, MagnifyingGlass, PencilSimple, DownloadSimple, SignIn, Warning, X,
  ArrowSquareOut, LinkBreak, LinkSimple,
  FolderSimple, ClockCounterClockwise, CaretRight, ArrowsInSimple,
} from "@phosphor-icons/react";
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { authClient, useSession } from "@/lib/auth-client";
import { prepareImageFile, insertWidth } from "@/lib/image-util";
import { OPEN_ACCEPT } from "@/lib/doc-import";
import AuthModal from "./AuthModal";
import WelcomeScreen from "./WelcomeScreen";
import { toast, Toaster } from "./toast";
import { useAskDialogs } from "./AskDialogs";
import {
  listDocuments, createDocument, updateDocument, renameDocument, deleteDocument,
  getPreferences, savePreferences, setDocumentFolder,
  saveVersion, listVersions, getVersionHtml, type DocRow,
} from "@/app/actions/user-data";
import { saveGuestVersion, listGuestVersions, removeGuestVersions } from "@/lib/versions";

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

const normalizeLineHeight = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number.parseFloat(String(value));
  if (Number.isNaN(n) || n <= 0) return null;
  return String(n);
};

const paragraphNodeSpec = {
  ...basicSchema.spec.nodes.get("paragraph"),
  attrs: {
    textAlign: { default: "left" },
    indent: { default: 0 },
    lineHeight: { default: null },
  },
  parseDOM: [{
    tag: "p",
    getAttrs(dom: Node | string) {
      if (typeof dom === "string") return { textAlign: "left", indent: 0, lineHeight: null };
      const el = dom as HTMLElement;
      return {
        textAlign: normalizeTextAlign(el.style.textAlign),
        indent: parseIndentFromDom(el),
        lineHeight: normalizeLineHeight(el.style.lineHeight),
      };
    },
  }],
  toDOM(node: PMNode) {
    const textAlign = normalizeTextAlign(node.attrs.textAlign);
    const indent = normalizeIndent(node.attrs.indent);
    const lineHeight = normalizeLineHeight(node.attrs.lineHeight);
    const style: string[] = [];
    if (textAlign !== "left") style.push(`text-align:${textAlign}`);
    if (indent > 0) style.push(`margin-left:${indent * 24}px`);
    if (lineHeight) style.push(`line-height:${lineHeight}`);
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
    lineHeight: { default: null },
  },
  parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
    tag: `h${level}`,
    getAttrs(dom: Node | string) {
      if (typeof dom === "string") return { level, textAlign: "left", indent: 0, lineHeight: null };
      const el = dom as HTMLElement;
      return {
        level,
        textAlign: normalizeTextAlign(el.style.textAlign),
        indent: parseIndentFromDom(el),
        lineHeight: normalizeLineHeight(el.style.lineHeight),
      };
    },
  })),
  toDOM(node: PMNode) {
    const level = node.attrs.level || 1;
    const textAlign = normalizeTextAlign(node.attrs.textAlign);
    const indent = normalizeIndent(node.attrs.indent);
    const lineHeight = normalizeLineHeight(node.attrs.lineHeight);
    const style: string[] = [];
    if (textAlign !== "left") style.push(`text-align:${textAlign}`);
    if (indent > 0) style.push(`margin-left:${indent * 24}px`);
    if (lineHeight) style.push(`line-height:${lineHeight}`);
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
    superscript: {
      parseDOM: [{ tag: "sup" }],
      toDOM: () => ["sup", 0],
      excludes: "superscript subscript",
    },
    subscript: {
      parseDOM: [{ tag: "sub" }],
      toDOM: () => ["sub", 0],
      excludes: "superscript subscript",
    },
    link: {
      attrs: { href: {}, title: { default: null } },
      inclusive: false,
      parseDOM: [{ tag: "a[href]", getAttrs: (dom) => {
        const href = sanitizeHref((dom as HTMLElement).getAttribute("href"));
        if (!href) return false;
        return { href, title: (dom as HTMLElement).getAttribute("title") };
      }}],
      toDOM: (mark: Mark) => ["a", { href: mark.attrs.href, title: mark.attrs.title, rel: "noopener noreferrer" }, 0],
    },
  }),
});

/** Reject javascript:/data:/vbscript: URLs so pasted HTML can't smuggle scripts. */
function sanitizeHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return null;
  return trimmed;
}

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

// Bridge between the ProseMirror keymap (module scope) and React callbacks.
// Single-editor app, so a module-level mutable ref is safe.
const editorHandlers: {
  openLinkDialog?: () => void;
  flushSave?: () => void;
} = {};

function setTextAlignCmd(align: "left" | "center" | "right" | "justify") {
  return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
    const { from, to } = state.selection;
    let found = false;
    const tr = state.tr;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type === mySchema.nodes.paragraph || node.type === mySchema.nodes.heading) {
        found = true;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, textAlign: align });
      }
    });
    if (!found) return false;
    if (dispatch) dispatch(tr);
    return true;
  };
}

function parseHtmlToDoc(html: string): PMNode {
  const dom = new DOMParser().parseFromString(html || "<p></p>", "text/html");
  return PMParser.fromSchema(mySchema).parse(dom.body);
}

function buildPlugins() {
  return [
    history(),
    columnResizing(),
    tableEditing(),
    searchPlugin(),
    keymap({
      "Mod-z":       undo,
      "Mod-y":       redo,
      "Mod-Shift-z": redo,
      "Mod-b":       toggleMark(mySchema.marks.strong),
      "Mod-i":       toggleMark(mySchema.marks.em),
      "Mod-u":       toggleMark(mySchema.marks.underline),
      "Mod-.":       toggleMark(mySchema.marks.superscript),
      "Mod-,":       toggleMark(mySchema.marks.subscript),
      "Mod-Shift-l": setTextAlignCmd("left"),
      "Mod-Shift-e": setTextAlignCmd("center"),
      "Mod-Shift-r": setTextAlignCmd("right"),
      "Mod-Shift-j": setTextAlignCmd("justify"),
      "Mod-k": () => { editorHandlers.openLinkDialog?.(); return true; },
      "Mod-s": () => { editorHandlers.flushSave?.(); return true; },
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
      // AutoCorrect (skipped inside code blocks). The last char of each match is
      // the just-typed character; `replacedLen` counts the chars being replaced.
      autoReplace(/--$/, "—", 2),
      autoReplace(/\.\.\.$/, "…", 3),
      autoReplace(/\(c\)$/i, "©", 3),
      autoReplace(/\(r\)$/i, "®", 3),
      autoReplace(/\(tm\)$/i, "™", 4),
      // Smart quotes: opener needs leading whitespace/bracket context, closer is the fallback.
      autoReplace(/(?:^|[\s{[(<'"‘“])"$/, "“", 1),
      autoReplace(/"$/, "”", 1),
      autoReplace(/(?:^|[\s{[(<'"‘“])'$/, "‘", 1),
      autoReplace(/'$/, "’", 1),
      autoLinkRule(),
    ]}),
  ];
}

/** Replace the trailing `replacedLen` chars of the match with `replacement`. */
function autoReplace(regex: RegExp, replacement: string, replacedLen: number): InputRule {
  return new InputRule(regex, (state, _match, _start, end) => {
    if (state.doc.resolve(end).parent.type === mySchema.nodes.code_block) return null;
    return state.tr.insertText(replacement, end - (replacedLen - 1), end);
  });
}

/** Typing a space after a URL turns the URL into a link. */
function autoLinkRule(): InputRule {
  return new InputRule(/(?:^|\s)((?:https?:\/\/|www\.)[^\s]{3,})\s$/, (state, match, start, end) => {
    if (state.doc.resolve(end).parent.type === mySchema.nodes.code_block) return null;
    const url = match[1];
    const href = sanitizeHref(url.startsWith("www.") ? `https://${url}` : url);
    if (!href) return null;
    // Doc range [start, end] holds the match minus the just-typed space.
    const urlStart = start + match[0].indexOf(url);
    const urlEnd = urlStart + url.length;
    const linkMark = mySchema.marks.link;
    if (state.doc.rangeHasMark(urlStart, urlEnd, linkMark)) return null;
    return state.tr
      .insertText(" ", end)
      .addMark(urlStart, urlEnd, linkMark.create({ href, title: "" }))
      .removeStoredMark(linkMark);
  });
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

// The contiguous link range (same href) containing pos, or null if pos isn't inside a link.
function linkRangeAt(doc: PMNode, pos: number): { from: number; to: number; href: string } | null {
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  const start = $pos.start();
  const ranges: Array<{ from: number; to: number; href: string }> = [];
  parent.forEach((child, offset) => {
    const mk = mySchema.marks.link.isInSet(child.marks);
    if (!mk) return;
    const href = String(mk.attrs.href || "");
    const s = start + offset;
    const e = s + child.nodeSize;
    const last = ranges[ranges.length - 1];
    if (last && last.href === href && last.to === s) last.to = e;
    else ranges.push({ from: s, to: e, href });
  });
  return ranges.find((r) => pos >= r.from && pos <= r.to) ?? null;
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
      // touch-action:none + pointer events so resizing also works on touch screens.
      handle.style.touchAction = "none";
      handle.addEventListener("pointerdown", (event) => this.startResize(event, corner));
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

  private startResize(event: PointerEvent, corner: "tl" | "tr" | "bl" | "br") {
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
      window.removeEventListener("pointermove", this.onMove);
      window.removeEventListener("pointerup", this.onUp);
      window.removeEventListener("pointercancel", this.onUp);
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

    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
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
    if (this.onMove) window.removeEventListener("pointermove", this.onMove);
    if (this.onUp) {
      window.removeEventListener("pointerup", this.onUp);
      window.removeEventListener("pointercancel", this.onUp);
    }
  }
}

export { mySchema };

// ── File management ─────────────────────────────────────────────────────────
type FileItem = { id: string; name: string; html: string; folder?: string | null };
const FILES_KEY = "wordpad-files";
const ACTIVE_KEY = "wordpad-active";

function newId(): string {
  try { return crypto.randomUUID(); } catch { return `f-${Date.now()}-${Math.floor(Math.random() * 1e6)}`; }
}

function serializeDoc(doc: PMNode): string {
  const s = DOMSerializer.fromSchema(mySchema);
  const frag = s.serializeFragment(doc.content);
  const tmp = document.createElement("div");
  tmp.appendChild(frag);
  return tmp.innerHTML;
}

function loadFiles(): { list: FileItem[]; active: string } {
  let list: FileItem[] = [];
  try {
    const raw = localStorage.getItem(FILES_KEY);
    if (raw) list = JSON.parse(raw);
  } catch { list = []; }
  if (!Array.isArray(list) || list.length === 0) {
    const legacy = localStorage.getItem("wordpad-content-pm");
    const legacyTitle = localStorage.getItem("wordpad-title");
    list = [{
      id: newId(),
      name: legacy ? (legacyTitle || "Untitled document") : "Welcome",
      html: legacy || DEFAULT_REF_CONTENT,
    }];
  }
  let active = localStorage.getItem(ACTIVE_KEY) || "";
  if (!list.find((f) => f.id === active)) active = list[0].id;
  return { list, active };
}

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

type CaseKind = "upper" | "lower" | "title" | "sentence";

function transformCase(text: string, kind: CaseKind): string {
  switch (kind) {
    case "upper": return text.toLocaleUpperCase();
    case "lower": return text.toLocaleLowerCase();
    case "title":
      return text.toLocaleLowerCase().replace(/\p{L}[\p{L}\p{N}'’]*/gu, (w) => w[0].toLocaleUpperCase() + w.slice(1));
    case "sentence":
      return text.toLocaleLowerCase().replace(/(^\s*\p{L})|([.!?]\s+\p{L})/gu, (m) => m.toLocaleUpperCase());
  }
}

function timeAgo(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return new Date(t).toLocaleString();
}

const SHORTCUT_GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: "Editing",
    items: [
      ["Ctrl+Z / Ctrl+Y", "Undo / Redo"],
      ["Ctrl+A", "Select all (table-aware)"],
      ["Ctrl+Shift+V", "Paste without formatting"],
      ["Ctrl+F / Ctrl+H", "Find & replace"],
      ["Tab / Shift+Tab", "Indent / outdent"],
      ["/", "Slash command menu"],
    ],
  },
  {
    title: "Formatting",
    items: [
      ["Ctrl+B / I / U", "Bold / Italic / Underline"],
      ["Ctrl+. / Ctrl+,", "Superscript / Subscript"],
      ["Ctrl+Shift+L / E / R / J", "Align left / center / right / justify"],
      ["Ctrl+K", "Insert or edit link"],
    ],
  },
  {
    title: "File",
    items: [
      ["Ctrl+O", "Open file"],
      ["Ctrl+S", "Save now"],
      ["Ctrl+P", "Print / Save as PDF"],
    ],
  },
];

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
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [docTitle, setDocTitle] = useState("Untitled document");
  const [showToolbar, setShowToolbar] = useState(true);
  const [showRuler, setShowRuler] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const filesRef = useRef<FileItem[]>([]);
  const activeIdRef = useRef<string>("");
  const [fileSearch, setFileSearch] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const { confirm: confirmDialog, prompt: promptDialog, dialogs: askDialogs } = useAskDialogs();
  const [verifyDismissed, setVerifyDismissed] = useState(false);
  const { data: session, isPending: sessionPending } = useSession();
  const authUser = session?.user;
  const isAuthed = !!authUser;
  const isAuthedRef = useRef(false);
  const prefsLoadedRef = useRef(false);
  const prefsErrorShownRef = useRef(false);
  const user = authUser
    ? {
        name: authUser.name || authUser.email,
        email: authUser.email,
        emailVerified: !!authUser.emailVerified,
        initials: (authUser.name || authUser.email)
          .trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase(),
      }
    : null;
  useEffect(() => { isAuthedRef.current = isAuthed; }, [isAuthed]);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const findInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const pendingSaveRef = useRef<{ id: string; state: EditorState } | null>(null);
  const [linkDialog, setLinkDialog] = useState<{ mode: "link" | "image"; value: string } | null>(null);
  const [spellcheckOn, setSpellcheckOn] = useState(true);
  const [spellLang, setSpellLang] = useState("auto");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const openInputRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const docInfoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<Array<{ id: string; t: number }> | null>(null);
  // Selected version in the history modal; html === null while it loads.
  const [versionPreview, setVersionPreview] = useState<{ id: string; html: string | null } | null>(null);
  // Small popover shown when the caret is placed inside a link (open / edit / remove).
  const [linkCard, setLinkCard] = useState<{ href: string; from: number; to: number; left: number; top: number } | null>(null);
  // Document id requested via ?doc=… when this page was opened (deep link).
  // Captured once at first render, before any effect can rewrite the URL.
  const [initialDeepLinkId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("doc")
  );
  // The id is applied only once, so reloading the list (e.g. after signing in)
  // doesn't re-apply an id that belonged to the previous storage.
  const deepLinkUsedRef = useRef(false);
  const takeDeepLinkId = useCallback(() => {
    if (deepLinkUsedRef.current) return null;
    deepLinkUsedRef.current = true;
    return initialDeepLinkId;
  }, [initialDeepLinkId]);
  const lastSnapAtRef = useRef<Record<string, number>>({});
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [printHeaderFooter, setPrintHeaderFooter] = useState(false);
  const lastAutoNameRef = useRef<string | null>(null);
  const [readingAloud, setReadingAloud] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
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
      /* position:fixed repeats on every printed page (Chromium/Firefox) */
      .pm-print-header, .pm-print-footer {
        display: flex !important;
        position: fixed;
        left: 0; right: 0;
        justify-content: space-between;
        font-family: Arial, sans-serif;
        font-size: 9px;
        color: #777;
      }
      .pm-print-header { top: -${Math.max(0, pageMarginCm - 0.15)}cm; }
      .pm-print-footer { bottom: -${Math.max(0, pageMarginCm - 0.15)}cm; }
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

  // Selection type updates instantly (cheap); word/char counts are debounced so
  // large documents aren't re-scanned on every keystroke.
  const refreshDocInfo = useCallback((state: EditorState) => {
    setDocInfo((prev) => ({ ...prev, selectedType: prettySelectionType(state) }));
    if (docInfoTimer.current) clearTimeout(docInfoTimer.current);
    docInfoTimer.current = setTimeout(() => {
      const v = viewRef.current;
      if (v) setDocInfo(computeDocInfo(v.state));
    }, 300);
  }, []);

  // ── Deep links: every document has its own URL (/pad?doc=<id>) ────────────
  const docUrl = useCallback((id: string) => `${window.location.pathname}?doc=${encodeURIComponent(id)}`, []);

  // Reflect the open document in the address bar so it can be bookmarked and shared.
  // `push` adds a history entry (user navigation); otherwise the current one is replaced.
  const syncUrlToDoc = useCallback((id: string, push = false) => {
    if (!id) return;
    const url = docUrl(id);
    if (window.location.pathname + window.location.search === url) return;
    if (push) window.history.pushState({ docId: id }, "", url);
    else window.history.replaceState({ docId: id }, "", url);
  }, [docUrl]);

  const copyDocLink = useCallback(async (id: string) => {
    const url = `${window.location.origin}${docUrl(id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied — it opens this document directly.");
    } catch {
      toast.error("Could not copy the link. Your browser blocked clipboard access.");
    }
  }, [docUrl]);

  // Update in-memory file list; persist to localStorage only for guests (DB handled by callers).
  const applyFiles = useCallback((list: FileItem[], active?: string) => {
    filesRef.current = list;
    setFiles(list);
    if (active !== undefined) { activeIdRef.current = active; setActiveId(active); }
    if (!isAuthedRef.current) {
      try {
        localStorage.setItem(FILES_KEY, JSON.stringify(list));
        if (active) localStorage.setItem(ACTIVE_KEY, active);
      } catch {}
    }
  }, []);

  // Version snapshots: at most one every 5 minutes per document, taken on save.
  const maybeSnapshot = useCallback((id: string, html: string) => {
    const now = Date.now();
    const last = lastSnapAtRef.current[id] || 0;
    if (now - last < 5 * 60_000) return;
    lastSnapAtRef.current[id] = now;
    if (isAuthedRef.current) saveVersion(id, html).catch(() => {});
    else saveGuestVersion(id, html);
  }, []);

  // Persist one document's current editor state (id captured at schedule time,
  // so a pending save can never write into a different document after a switch).
  const persistDoc = useCallback((id: string, state: EditorState) => {
    if (!id) return;
    const html = serializeDoc(state.doc);
    maybeSnapshot(id, html);
    const list = filesRef.current.map((f) => (f.id === id ? { ...f, html } : f));
    filesRef.current = list;
    setFiles(list);
    if (isAuthedRef.current) {
      setSaveStatus("saving");
      updateDocument(id, html)
        .then(() => setSaveStatus("saved"))
        .catch(() => setSaveStatus("error"));
    } else {
      try {
        localStorage.setItem(FILES_KEY, JSON.stringify(list));
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }
  }, [maybeSnapshot]);

  const flushSave = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    persistDoc(pending.id, pending.state);
  }, [persistDoc]);

  const save = useCallback((state: EditorState) => {
    pendingSaveRef.current = { id: activeIdRef.current, state };
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      flushSave();
    }, 800);
  }, [flushSave]);

  // Flush pending edits when the tab is hidden or closed so nothing is lost.
  useEffect(() => {
    const flush = () => flushSave();
    const onVisibility = () => { if (document.visibilityState === "hidden") flushSave(); };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flushSave]);

  useEffect(() => {
    editorHandlers.flushSave = flushSave;
    return () => { editorHandlers.flushSave = undefined; };
  }, [flushSave]);

  const setDocFromHtml = useCallback((html: string) => {
    const v = viewRef.current;
    if (!v) return;
    const dom = new DOMParser().parseFromString(html || "<p></p>", "text/html");
    const doc = PMParser.fromSchema(mySchema).parse(dom.body);
    const state = EditorState.create({ schema: mySchema, doc, plugins: buildPlugins() });
    v.updateState(state);
    refreshDocInfo(state);
    v.focus();
  }, [refreshDocInfo]);

  // Snapshot the current editor html into the file list, persisting the previous doc if signed in.
  // Cancels any pending debounced save first — this snapshot supersedes it.
  const commitCurrent = useCallback((list: FileItem[]): FileItem[] => {
    const v = viewRef.current;
    if (!v) return list;
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    pendingSaveRef.current = null;
    const html = serializeDoc(v.state.doc);
    const id = activeIdRef.current;
    if (isAuthedRef.current && id) updateDocument(id, html).catch(() => setSaveStatus("error"));
    return list.map((f) => (f.id === id ? { ...f, html } : f));
  }, []);

  // `history` = false when the switch itself came from a browser back/forward event.
  const switchFile = useCallback((id: string, history = true) => {
    // Re-opening the document that's already active still stamps the URL, so
    // picking it from the start screen leaves a shareable address behind.
    if (id === activeIdRef.current) { if (history) syncUrlToDoc(id); return; }
    const list = commitCurrent(filesRef.current);
    const target = list.find((f) => f.id === id);
    if (!target) return;
    lastAutoNameRef.current = null;
    applyFiles(list, id);
    setDocFromHtml(target.html);
    setDocTitle(target.name);
    if (history) syncUrlToDoc(id, true);
  }, [applyFiles, commitCurrent, setDocFromHtml, syncUrlToDoc]);

  // Browser back/forward moves between documents opened in this tab.
  useEffect(() => {
    const onPop = () => {
      const id = new URLSearchParams(window.location.search).get("doc");
      if (id && filesRef.current.some((f) => f.id === id)) switchFile(id, false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [switchFile]);

  // Shared path for new blank documents, templates, and opened files.
  // Members get a new document in their list; guests have exactly ONE document,
  // so this replaces it (confirm + a safety snapshot into version history first).
  const addNewDocument = useCallback(async (name: string, html: string) => {
    if (isAuthedRef.current) {
      const list = commitCurrent(filesRef.current);
      lastAutoNameRef.current = null;
      try {
        const doc = await createDocument(name, html);
        applyFiles([doc, ...list], doc.id);
        setDocFromHtml(doc.html);
        setDocTitle(doc.name);
        syncUrlToDoc(doc.id);
      } catch {
        toast.error("Could not create the document — check your connection and try again.");
      }
    } else {
      const v = viewRef.current;
      const active = filesRef.current.find((f) => f.id === activeIdRef.current);
      const hasContent =
        !!v && active?.html !== DEFAULT_REF_CONTENT && v.state.doc.textContent.trim().length > 0;
      if (hasContent && !(await confirmDialog({
        title: "Replace your current document?",
        description:
          "Without an account you have a single document, so starting a new one replaces it. A snapshot is kept in version history. Export first if you want a file copy.",
        confirmLabel: "Replace document",
        destructive: true,
      }))) return;
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      pendingSaveRef.current = null;
      lastAutoNameRef.current = null;
      const id = activeIdRef.current || newId();
      if (v && hasContent) {
        saveGuestVersion(id, serializeDoc(v.state.doc));
        lastSnapAtRef.current[id] = Date.now();
      }
      applyFiles([{ id, name, html }], id);
      setDocFromHtml(html);
      setDocTitle(name);
      syncUrlToDoc(id);
      try { localStorage.setItem(ACTIVE_KEY, id); } catch {}
    }
  }, [applyFiles, commitCurrent, confirmDialog, setDocFromHtml, syncUrlToDoc]);

  const createFile = useCallback(() => {
    return addNewDocument("Untitled document", "<p></p>");
  }, [addNewDocument]);

  const createFromTemplate = useCallback((t: { name: string; html: string }) => {
    return addNewDocument(t.name, t.html);
  }, [addNewDocument]);

  // Bring a just-deleted document back (Undo in the delete toast). For signed-in
  // users the server row is gone, so it is recreated as a new document.
  const restoreDeleted = useCallback(async (target: FileItem) => {
    if (isAuthedRef.current) {
      try {
        const doc = await createDocument(target.name, target.html);
        if (target.folder) setDocumentFolder(doc.id, target.folder).catch(() => {});
        applyFiles([{ ...doc, folder: target.folder ?? null }, ...filesRef.current], doc.id);
        setDocFromHtml(doc.html);
        setDocTitle(doc.name);
        syncUrlToDoc(doc.id);
      } catch {
        toast.error("Could not restore the document — check your connection.");
      }
    } else {
      applyFiles([target, ...filesRef.current.filter((f) => f.id !== target.id)], target.id);
      setDocFromHtml(target.html);
      setDocTitle(target.name);
      syncUrlToDoc(target.id);
    }
  }, [applyFiles, setDocFromHtml, syncUrlToDoc]);

  const deleteFile = useCallback(async (id: string) => {
    const target = filesRef.current.find((f) => f.id === id);
    if (pendingSaveRef.current?.id === id) {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      pendingSaveRef.current = null;
    }
    if (!isAuthedRef.current) removeGuestVersions(id);
    const wasActive = activeIdRef.current === id;
    let list = filesRef.current.filter((f) => f.id !== id);
    const notifyDeleted = () => {
      if (!target) return;
      toast(`Deleted "${target.name || "Untitled"}"`, {
        action: { label: "Undo", onClick: () => restoreDeleted(target) },
      });
    };
    if (isAuthedRef.current) {
      deleteDocument(id).catch(() => {
        toast.error("Could not delete on the server — the document may reappear after reload.");
      });
      if (list.length === 0) {
        try {
          const doc = await createDocument("Untitled document", "<p></p>");
          applyFiles([doc], doc.id);
          setDocFromHtml(doc.html);
          setDocTitle(doc.name);
          syncUrlToDoc(doc.id);
        } catch {}
        notifyDeleted();
        return;
      }
    } else if (list.length === 0) {
      list = [{ id: newId(), name: "Untitled 1", html: "<p></p>" }];
    }
    const nextActive = wasActive ? list[0].id : activeIdRef.current;
    applyFiles(list, nextActive);
    if (wasActive) {
      const t = list.find((f) => f.id === nextActive);
      if (t) { setDocFromHtml(t.html); setDocTitle(t.name); syncUrlToDoc(t.id); }
    }
    notifyDeleted();
  }, [applyFiles, restoreDeleted, setDocFromHtml, syncUrlToDoc]);

  const renameFile = useCallback((id: string, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    if (id === activeIdRef.current) setDocTitle(clean);
    applyFiles(filesRef.current.map((f) => (f.id === id ? { ...f, name: clean } : f)));
    if (isAuthedRef.current) renameDocument(id, clean).catch(() => {
      toast.error("Could not save the new name — check your connection.");
    });
  }, [applyFiles]);

  // Live title input: reflect typing immediately, debounce the persisted rename.
  const renameActive = useCallback((name: string) => {
    setDocTitle(name);
    const id = activeIdRef.current;
    applyFiles(filesRef.current.map((f) => (f.id === id ? { ...f, name } : f)));
    if (renameTimer.current) clearTimeout(renameTimer.current);
    renameTimer.current = setTimeout(() => {
      const clean = name.trim();
      if (clean && isAuthedRef.current) renameDocument(id, clean).catch(() => {
        toast.error("Could not save the new name — check your connection.");
      });
    }, 600);
  }, [applyFiles]);

  // Auto-title "Untitled" documents from their first line. Stops as soon as the
  // user renames the document manually (title no longer matches the auto value).
  const maybeAutoName = useCallback((state: EditorState) => {
    const current = filesRef.current.find((f) => f.id === activeIdRef.current)?.name ?? "";
    const isAuto =
      /^untitled( document| \d+)?$/i.test(current.trim()) ||
      (lastAutoNameRef.current !== null && current === lastAutoNameRef.current);
    if (!isAuto) return;
    let text = "";
    state.doc.descendants((node) => {
      if (text) return false;
      if (node.isTextblock) { text = node.textContent.trim(); return false; }
      return true;
    });
    if (!text) return;
    const name = text.length > 40 ? text.slice(0, 40).trimEnd() + "…" : text;
    if (!name || name === current) return;
    lastAutoNameRef.current = name;
    renameActive(name);
  }, [renameActive]);

  // Move a document into a folder (null = ungrouped). Folder is a flat label.
  const moveToFolder = useCallback((id: string, folder: string | null) => {
    applyFiles(filesRef.current.map((f) => (f.id === id ? { ...f, folder } : f)));
    if (isAuthedRef.current) setDocumentFolder(id, folder).catch(() => {
      toast.error("Could not move the document — check your connection.");
    });
  }, [applyFiles]);

  // ── Version history ──────────────────────────────────────────────────────
  const openVersions = useCallback(async () => {
    setVersionsOpen(true);
    setVersions(null);
    setVersionPreview(null);
    const id = activeIdRef.current;
    if (isAuthedRef.current) {
      try {
        const rows = await listVersions(id);
        setVersions(rows.map((r) => ({ id: r.id, t: new Date(r.createdAt).getTime() })));
      } catch {
        setVersions([]);
      }
    } else {
      setVersions(listGuestVersions(id).map((v, i) => ({ id: String(i), t: v.t })));
    }
  }, []);

  const loadVersionHtml = useCallback(async (versionId: string): Promise<string | null> => {
    if (isAuthedRef.current) {
      try { return await getVersionHtml(versionId); } catch { return null; }
    }
    return listGuestVersions(activeIdRef.current)[Number(versionId)]?.html ?? null;
  }, []);

  // Load a version's content into the preview pane of the history modal.
  const previewVersion = useCallback(async (versionId: string) => {
    setVersionPreview({ id: versionId, html: null });
    const html = await loadVersionHtml(versionId);
    if (html === null) {
      setVersionPreview(null);
      toast.error("Could not load this version.");
      return;
    }
    setVersionPreview({ id: versionId, html });
  }, [loadVersionHtml]);

  const restoreVersion = useCallback(async (versionId: string) => {
    const v = viewRef.current;
    if (!v) return;
    const id = activeIdRef.current;
    const html: string | null = await loadVersionHtml(versionId);
    if (!html) { toast.error("Could not load this version."); return; }
    // Safety snapshot of the current state before overwriting it.
    const currentHtml = serializeDoc(v.state.doc);
    if (isAuthedRef.current) saveVersion(id, currentHtml).catch(() => {});
    else saveGuestVersion(id, currentHtml);
    lastSnapAtRef.current[id] = Date.now();
    setDocFromHtml(html);
    if (viewRef.current) persistDoc(id, viewRef.current.state);
    setVersionsOpen(false);
    toast.success("Version restored — the previous state was saved to history.");
  }, [loadVersionHtml, persistDoc, setDocFromHtml]);

  const exportFile = useCallback(async (file: FileItem, fmt: "html" | "txt" | "docx" | "rtf" | "md") => {
    const v = viewRef.current;
    const isActiveDoc = file.id === activeIdRef.current && !!v;
    const html = isActiveDoc ? serializeDoc(v!.state.doc) : file.html;
    const safe = (file.name || "document").replace(/[^\w.\- ]+/g, "").trim() || "document";
    const { docToDocxBlob, docToRtf, docToMarkdown, downloadBlob } = await import("@/lib/doc-export");
    if (fmt === "html") {
      const blob = new Blob([`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${file.name}</title></head><body style="font-family:Arial;max-width:800px;margin:40px auto;padding:20px">${html}</body></html>`], { type: "text/html" });
      downloadBlob(blob, `${safe}.html`);
    } else if (fmt === "txt") {
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      downloadBlob(new Blob([tmp.innerText || tmp.textContent || ""], { type: "text/plain" }), `${safe}.txt`);
    } else {
      const doc = isActiveDoc ? v!.state.doc : parseHtmlToDoc(file.html);
      if (fmt === "docx") {
        downloadBlob(await docToDocxBlob(doc, file.name || "Document"), `${safe}.docx`);
      } else if (fmt === "md") {
        downloadBlob(new Blob([docToMarkdown(doc)], { type: "text/markdown" }), `${safe}.md`);
      } else {
        downloadBlob(new Blob([docToRtf(doc)], { type: "application/rtf" }), `${safe}.rtf`);
      }
    }
    toast.success(`Downloaded ${safe}.${fmt}`);
  }, []);

  // Export the document currently open in the editor (used by the File menu).
  const exportActive = useCallback((fmt: "html" | "txt" | "docx" | "rtf" | "md") => {
    const id = activeIdRef.current;
    const file = filesRef.current.find((f) => f.id === id) || { id, name: docTitle, html: "" };
    exportFile({ ...file, name: docTitle || file.name }, fmt);
  }, [exportFile, docTitle]);

  // ── File open (.txt / .md / .html / .docx) ────────────────────────────────
  const openFileDialog = useCallback(() => openInputRef.current?.click(), []);

  const handleOpenFile = useCallback(async (file: File) => {
    try {
      const { fileToHtml } = await import("@/lib/doc-import");
      const { html, name } = await fileToHtml(file);
      await addNewDocument(name, html);
    } catch {
      toast.error("Could not open this file. Supported formats: .txt, .md, .html, .docx");
    }
  }, [addNewDocument]);

  // ── Image insert (file picker, paste, drag-drop share this path) ─────────
  const insertImageFromFile = useCallback(async (imageFile: File) => {
    const v = viewRef.current;
    if (!v) return;
    try {
      const prepared = await prepareImageFile(imageFile);
      if (!prepared.src) return;
      const node = mySchema.nodes.image.create({
        src: prepared.src,
        alt: imageFile.name || "image",
        title: "",
        width: insertWidth(prepared.widthPx),
      });
      v.dispatch(v.state.tr.replaceSelectionWith(node).scrollIntoView());
      v.focus();
    } catch {}
  }, []);

  const logout = useCallback(async () => {
    await authClient.signOut();
    prefsLoadedRef.current = false;
  }, []);

  const openAuth = useCallback(() => setAuthOpen(true), []);

  // The start screen is for signed-in users, who have a document library worth
  // landing on. Guests have a single document, so it would only be a detour —
  // they go straight to the editor. Opening is driven by the document loader
  // below (so the list is already populated); this ref keeps it to once per
  // signed-in session rather than on every session-state settle.
  const welcomedForRef = useRef<string | null>(null);

  const resendVerification = useCallback(async () => {
    if (!authUser?.email) return;
    try {
      await authClient.sendVerificationEmail({ email: authUser.email, callbackURL: "/pad" });
      toast.success("Verification email sent — check your inbox.");
    } catch {
      toast.error("Could not send verification email.");
    }
  }, [authUser?.email]);


  useEffect(() => {
    if (!editorRef.current) return;
    // Start with an empty document; the session-driven effect below loads the
    // real content (DB for signed-in users, localStorage for guests).
    const state = EditorState.create({ schema: mySchema, plugins: buildPlugins() });
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
      handleClick(v, pos) {
        const range = linkRangeAt(v.state.doc, pos);
        if (!range || !range.href) { setLinkCard(null); return false; }
        const coords = v.coordsAtPos(range.from);
        setLinkCard({
          ...range,
          left: Math.max(8, Math.min(coords.left, window.innerWidth - 340)),
          top: coords.bottom + 6,
        });
        return false;
      },
      handleDrop(v, event, _slice, moved) {
        const e = event as DragEvent;
        if (!e.dataTransfer) return false;

        // Dropped image files → insert at drop position
        const droppedImages = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith("image/"));
        if (droppedImages.length) {
          e.preventDefault();
          const dropCoords = v.posAtCoords({ left: e.clientX, top: e.clientY });
          if (dropCoords) {
            const $pos = v.state.doc.resolve(dropCoords.pos);
            v.dispatch(v.state.tr.setSelection(TextSelection.near($pos)));
          }
          droppedImages.forEach((f) => insertImageFromFile(f));
          return true;
        }

        const posStr = e.dataTransfer.getData("application/pm-table-pos");
        if (!posStr) return false;

        const fromPos = parseInt(posStr, 10);
        const dropCoords = v.posAtCoords({ left: e.clientX, top: e.clientY });
        if (!dropCoords) return false;

        const { state: st, dispatch } = v;
        const $from = st.doc.resolve(fromPos);
        const tableNode = $from.nodeAfter;
        if (!tableNode || tableNode.type !== mySchema.nodes.table) return false;

        const toPos = dropCoords.pos;
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
        // "/" inside a code block is just code — no command menu there.
        if (v.state.doc.resolve(from).parent.type === mySchema.nodes.code_block) return false;
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
        insertImageFromFile(imageFile);
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
        if (tr.docChanged) {
          save(next);
          maybeAutoName(next);
          setLinkCard(null); // positions may have shifted
        }
      },
    });
    viewRef.current = view;
    refreshImagePopover(view);
    refreshDocInfo(view.state);
    view.focus();
    return () => { view.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshDocInfo, refreshImagePopover, refreshSlashMenu, save, insertImageFromFile, maybeAutoName]);

  const applyPreferences = useCallback((p: Record<string, unknown>) => {
    if (p.theme === "dark" || p.theme === "light") {
      const dark = p.theme === "dark";
      setIsDark(dark);
      document.documentElement.classList.toggle("dark", dark);
    }
    if (typeof p.zoom === "number") setZoomPercent(p.zoom);
    if (typeof p.margin === "number") setPageMarginCm(p.margin);
    if (typeof p.bg === "string") setPaperBgColor(p.bg);
    if (p.sidebar === "open" || p.sidebar === "closed") setSidebarOpen(p.sidebar === "open");
    if (typeof p.spellLang === "string") setSpellLang(p.spellLang);
    if (typeof p.printHeader === "boolean") setPrintHeaderFooter(p.printHeader);
    if (typeof p.spellcheck === "boolean") setSpellcheckOn(p.spellcheck);
    if (typeof p.toolbar === "boolean") setShowToolbar(p.toolbar);
    if (typeof p.ruler === "boolean") setShowRuler(p.ruler);
  }, []);

  // Load documents + preferences once the session resolves (DB when signed in, localStorage for guests).
  useEffect(() => {
    if (sessionPending || !viewRef.current) return;
    let cancelled = false;
    (async () => {
      if (authUser) {
        let docs = await listDocuments().catch(() => [] as DocRow[]);
        if (!docs.length) {
          // Migrate guest files from localStorage; fall back to a Welcome doc if nothing there.
          const { list: localFiles } = loadFiles();
          const hasRealContent =
            localFiles.length > 1 ||
            (localFiles.length === 1 && localFiles[0].name !== "Welcome" && localFiles[0].html !== DEFAULT_REF_CONTENT);
          if (hasRealContent) {
            const created = await Promise.all(
              localFiles.map((f) => createDocument(f.name, f.html).catch(() => null))
            );
            docs = created.filter(Boolean) as DocRow[];
            try {
              localStorage.removeItem(FILES_KEY);
              localStorage.removeItem(ACTIVE_KEY);
            } catch {}
          }
          if (!docs.length) {
            try { docs = [await createDocument("Welcome", DEFAULT_REF_CONTENT)]; } catch { docs = []; }
          }
        }
        if (cancelled || !docs.length) return;
        // A ?doc=… deep link wins over the default document, when it still exists.
        const deepLinkId = takeDeepLinkId();
        const deepLinked = deepLinkId ? docs.find((d) => d.id === deepLinkId) : undefined;
        if (deepLinkId && !deepLinked) {
          toast.warning("That document link is no longer available — opening your latest document.");
        }
        const active = deepLinked ?? docs[0];
        filesRef.current = docs; activeIdRef.current = active.id;
        setFiles(docs); setActiveId(active.id);
        setDocFromHtml(active.html); setDocTitle(active.name);
        // Only stamp the URL when the visitor actually arrived via a deep link.
        // Writing it on a plain /pad visit would make the next reload look like
        // a deep link and skip the start screen.
        if (deepLinked) syncUrlToDoc(active.id);
        // Every sign-in lands on the start screen, unless a deep link asked for
        // one specific document.
        const uid = authUser?.id ?? "";
        if (!deepLinked && welcomedForRef.current !== uid) {
          welcomedForRef.current = uid;
          setWelcomeOpen(true);
        }
        try { const prefs = await getPreferences(); if (!cancelled) applyPreferences(prefs); } catch {}
        prefsLoadedRef.current = true;
      } else {
        // Signed out: arm the start screen again for the next sign-in.
        welcomedForRef.current = null;
        const { list, active } = loadFiles();
        const deepLinkId = takeDeepLinkId();
        const deepLinked = deepLinkId ? list.find((f) => f.id === deepLinkId) : undefined;
        if (deepLinkId && !deepLinked) {
          toast.warning("That document link is no longer available — opening your latest document.");
        }
        const activeFile = deepLinked ?? list.find((f) => f.id === active) ?? list[0];
        const activeId = activeFile.id;
        filesRef.current = list; activeIdRef.current = activeId;
        setFiles(list); setActiveId(activeId);
        setDocFromHtml(activeFile.html); setDocTitle(activeFile.name);
        if (deepLinked) syncUrlToDoc(activeId);
        try {
          localStorage.setItem(FILES_KEY, JSON.stringify(list));
          localStorage.setItem(ACTIVE_KEY, activeId);
        } catch {}
        prefsLoadedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id, sessionPending]);

  // Persist preferences to the user's metadata (signed-in only), debounced.
  useEffect(() => {
    if (!isAuthed || !prefsLoadedRef.current) return;
    if (prefsSaveTimer.current) clearTimeout(prefsSaveTimer.current);
    prefsSaveTimer.current = setTimeout(() => {
      savePreferences({
        theme: isDark ? "dark" : "light",
        zoom: zoomPercent,
        margin: pageMarginCm,
        bg: paperBgColor,
        sidebar: sidebarOpen ? "open" : "closed",
        spellLang,
        printHeader: printHeaderFooter,
        spellcheck: spellcheckOn,
        toolbar: showToolbar,
        ruler: showRuler,
      }).catch(() => {
        // Warn once per session — repeating it on every settings tweak would nag.
        if (prefsErrorShownRef.current) return;
        prefsErrorShownRef.current = true;
        toast.error("Could not save your editor settings — they may not carry over to your next visit.");
      });
    }, 700);
  }, [
    isAuthed, isDark, zoomPercent, pageMarginCm, paperBgColor, sidebarOpen,
    spellLang, printHeaderFooter, spellcheckOn, showToolbar, showRuler,
  ]);

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
    if (!v) return;
    if (v.state.selection.empty) {
      toast.warning("Select the text you want to link first.");
      return;
    }
    // Prefill with an existing link's href when editing.
    let existing = "";
    const linkMark = mySchema.marks.link;
    v.state.doc.nodesBetween(v.state.selection.from, v.state.selection.to, (node) => {
      if (!existing) {
        const mk = linkMark.isInSet(node.marks);
        if (mk) existing = String(mk.attrs.href || "");
      }
      return true;
    });
    setLinkDialog({ mode: "link", value: existing });
  }, []);

  useEffect(() => {
    editorHandlers.openLinkDialog = handleLinkAdd;
    return () => { editorHandlers.openLinkDialog = undefined; };
  }, [handleLinkAdd]);

  const removeLink = useCallback(() => {
    const v = viewRef.current;
    if (!v) return;
    const { from, to } = v.state.selection;
    v.dispatch(v.state.tr.removeMark(from, to, mySchema.marks.link));
    setLinkDialog(null);
    v.focus();
  }, []);

  // ── Link card actions (popover shown when clicking a link in the doc) ─────
  const editLinkFromCard = useCallback(() => {
    const v = viewRef.current;
    const card = linkCard;
    if (!v || !card) return;
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, card.from, card.to)));
    setLinkCard(null);
    handleLinkAdd();
  }, [linkCard, handleLinkAdd]);

  const removeLinkFromCard = useCallback(() => {
    const v = viewRef.current;
    const card = linkCard;
    if (!v || !card) return;
    v.dispatch(v.state.tr.removeMark(card.from, card.to, mySchema.marks.link));
    setLinkCard(null);
    v.focus();
  }, [linkCard]);

  // Dismiss the link card on Escape or when clicking outside it and the editor.
  useEffect(() => {
    if (!linkCard) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-link-card]") || t?.closest(".ProseMirror")) return;
      setLinkCard(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLinkCard(null); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [linkCard]);

  const applyLinkDialog = useCallback(() => {
    const v = viewRef.current;
    const dialog = linkDialog;
    if (!v || !dialog) return;
    const raw = dialog.value.trim();
    if (!raw) { setLinkDialog(null); return; }
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    const href = sanitizeHref(withScheme);
    if (!href) { setLinkDialog(null); return; }

    if (dialog.mode === "image") {
      const node = mySchema.nodes.image.create({ src: href, alt: "", title: "", width: "480px" });
      v.dispatch(v.state.tr.replaceSelectionWith(node).scrollIntoView());
    } else {
      const mt = mySchema.marks.link;
      const tr = v.state.tr;
      v.state.selection.ranges.forEach(({ $from, $to }) => {
        tr.removeMark($from.pos, $to.pos, mt);
        tr.addMark($from.pos, $to.pos, mt.create({ href, title: "" }));
      });
      v.dispatch(tr);
    }
    setLinkDialog(null);
    v.focus();
  }, [linkDialog]);

  const handleImageAdd = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  const handleImageUrlAdd = useCallback(() => {
    setLinkDialog({ mode: "image", value: "" });
  }, []);

  const handleInsertDivider = useCallback(() => {
    const v = viewRef.current;
    if (!v) return;
    const hr = mySchema.nodes.horizontal_rule.create();
    const paragraph = mySchema.nodes.paragraph.create();
    const pos = v.state.selection.from;
    v.dispatch(v.state.tr.insert(pos, [hr, paragraph]).scrollIntoView());
    v.focus();
  }, []);

  const handleInsertText = useCallback((text: string) => {
    const v = viewRef.current;
    if (!v) return;
    v.dispatch(v.state.tr.insertText(text).scrollIntoView());
    v.focus();
  }, []);

  const handleInsertDate = useCallback(() => {
    const stamp = new Date().toLocaleDateString(undefined, {
      year: "numeric", month: "long", day: "numeric",
    });
    handleInsertText(stamp);
  }, [handleInsertText]);

  const openFind = useCallback(() => {
    setFindOpen(true);
    requestAnimationFrame(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    });
  }, []);

  // Same panel as Find, but focus starts in the replace field.
  const openReplace = useCallback(() => {
    setFindOpen(true);
    requestAnimationFrame(() => {
      replaceInputRef.current?.focus();
      replaceInputRef.current?.select();
    });
  }, []);

  // Rename from the File menu: focus the title input when it's on screen,
  // otherwise fall back to a dialog (narrow screens hide the header input).
  const renameActiveDoc = useCallback(async () => {
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Document title"]');
    if (input && input.offsetParent !== null) {
      input.focus();
      input.select();
      return;
    }
    const next = await promptDialog({
      title: "Rename document",
      label: "Document name",
      defaultValue: docTitle,
      confirmLabel: "Rename",
    });
    if (next) renameActive(next);
  }, [docTitle, promptDialog, renameActive]);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    const v = viewRef.current;
    if (v) { clearSearch(v); v.focus(); }
  }, []);

  const setLineSpacing = useCallback((lineHeight: number | null) => {
    const v = viewRef.current;
    if (!v) return;
    const { from, to } = v.state.selection;
    const tr = v.state.tr;
    v.state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type === mySchema.nodes.paragraph || node.type === mySchema.nodes.heading) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, lineHeight });
      }
    });
    v.dispatch(tr); v.focus();
  }, []);

  const clearFormatting = useCallback(() => {
    const v = viewRef.current;
    if (!v) return;
    const { from, to, empty } = v.state.selection;
    if (empty) return;
    const tr = v.state.tr;
    Object.values(mySchema.marks).forEach((markType) => tr.removeMark(from, to, markType));
    v.state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type === mySchema.nodes.heading || node.type === mySchema.nodes.code_block) {
        tr.setNodeMarkup(pos, mySchema.nodes.paragraph, {
          textAlign: node.attrs.textAlign ?? "left", indent: node.attrs.indent ?? 0, lineHeight: null,
        });
      }
    });
    v.dispatch(tr); v.focus();
  }, []);

  // ── Change case ──────────────────────────────────────────────────────────
  const changeCase = useCallback((kind: CaseKind) => {
    const v = viewRef.current;
    if (!v) return;
    const { from, to, empty } = v.state.selection;
    if (empty) { toast.warning("Select some text first."); return; }
    const tr = v.state.tr;
    v.state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText || !node.text) return true;
      const s = Math.max(from, pos);
      const e = Math.min(to, pos + node.text.length);
      if (s >= e) return true;
      const slice = node.text.slice(s - pos, e - pos);
      const next = transformCase(slice, kind);
      if (next !== slice) {
        tr.replaceWith(tr.mapping.map(s), tr.mapping.map(e), mySchema.text(next, node.marks));
      }
      return true;
    });
    if (tr.docChanged) v.dispatch(tr);
    v.focus();
  }, []);

  // ── Table of contents ────────────────────────────────────────────────────
  const insertTOC = useCallback(() => {
    const v = viewRef.current;
    if (!v) return;
    const entries: Array<{ level: number; text: string }> = [];
    v.state.doc.forEach((node) => {
      if (node.type === mySchema.nodes.heading && Number(node.attrs.level) <= 3) {
        const text = node.textContent.trim();
        if (text && text !== "Contents") entries.push({ level: Number(node.attrs.level), text });
      }
    });
    if (!entries.length) {
      toast.warning("Add some headings first — the table of contents is built from headings (H1–H3).");
      return;
    }
    const nodes: PMNode[] = [
      mySchema.nodes.heading.create({ level: 2 }, mySchema.text("Contents")),
      ...entries.map((e) =>
        mySchema.nodes.paragraph.create({ indent: Math.max(0, e.level - 1) }, mySchema.text(e.text))
      ),
      mySchema.nodes.horizontal_rule.create(),
    ];
    const tr = v.state.tr;
    let insertPos: number;
    try { insertPos = tr.selection.$from.after(1); } catch { insertPos = tr.selection.from; }
    tr.insert(insertPos, nodes);
    v.dispatch(tr.scrollIntoView());
    v.focus();
  }, []);

  // ── Read aloud (speechSynthesis) ─────────────────────────────────────────
  const toggleReadAloud = useCallback(() => {
    if (readingAloud) {
      window.speechSynthesis?.cancel();
      setReadingAloud(false);
      return;
    }
    const v = viewRef.current;
    if (!v) return;
    if (!("speechSynthesis" in window)) {
      toast.error("Read aloud isn't supported in this browser.");
      return;
    }
    const sel = v.state.selection;
    const text = (sel.empty
      ? v.state.doc.textBetween(0, v.state.doc.content.size, ". ", " ")
      : v.state.doc.textBetween(sel.from, sel.to, ". ", " ")
    ).trim();
    if (!text) return;
    window.speechSynthesis.cancel();
    // Chunk into short utterances — some engines cut off long single utterances.
    const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
    const groups: string[] = [];
    let cur = "";
    for (const s of sentences) {
      if ((cur + s).length > 250 && cur) { groups.push(cur); cur = s; }
      else cur += s;
    }
    if (cur.trim()) groups.push(cur);
    groups.forEach((g, i) => {
      const u = new SpeechSynthesisUtterance(g);
      if (spellLang !== "auto") u.lang = spellLang;
      if (i === groups.length - 1) u.onend = () => setReadingAloud(false);
      u.onerror = () => setReadingAloud(false);
      window.speechSynthesis.speak(u);
    });
    setReadingAloud(true);
  }, [readingAloud, spellLang]);

  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);

  const toggleDark = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      try { localStorage.setItem("wordpad-theme", next ? "dark" : "light"); } catch {}
      return next;
    });
  }, []);

  // Sync dark-mode state with the class applied pre-paint by the layout script
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem("wordpad-sidebar", next ? "open" : "closed"); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    if (localStorage.getItem("wordpad-sidebar") === "closed") setSidebarOpen(false);
  }, []);


  // Browser tab title reflects the active document
  useEffect(() => {
    document.title = `${docTitle || "Untitled document"} — EDTRpad`;
  }, [docTitle]);

  // Keep the search plugin in sync with the find panel inputs
  useEffect(() => {
    const v = viewRef.current;
    if (!v) return;
    if (findOpen) setSearch(v, findQuery, caseSensitive, wholeWord);
  }, [findQuery, caseSensitive, wholeWord, findOpen]);

  // Ctrl+F / Ctrl+H open the find panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "h")) {
        e.preventDefault();
        if (e.key === "h") openReplace();
        else openFind();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openFind, openReplace]);

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
      toast.error("Could not crop this image.");
      return;
    }
    try {
      const nextSrc = canvas.toDataURL("image/png");
      updateSelectedImageAttrs({ src: nextSrc });
      setCropDialogOpen(false);
      setCropSource(null);
    } catch {
      toast.error("This image can't be cropped because it comes from another site.");
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

  // Global shortcuts: Ctrl+P print, Ctrl+S flush save, Ctrl+O open file
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "p") { e.preventDefault(); handlePrint(); }
      else if (e.key === "s") { e.preventDefault(); flushSave(); }
      else if (e.key === "o") { e.preventDefault(); openFileDialog(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlePrint, flushSave, openFileDialog]);

  // Spellcheck toggle + language apply directly to the contenteditable element
  useEffect(() => {
    const el = editorRef.current?.querySelector(".ProseMirror");
    if (!el) return;
    el.setAttribute("spellcheck", spellcheckOn ? "true" : "false");
    if (spellLang === "auto") el.removeAttribute("lang");
    else el.setAttribute("lang", spellLang);
  }, [spellcheckOn, spellLang]);

  // Guest-side persistence for spell language & print header preference
  useEffect(() => {
    try {
      const lang = localStorage.getItem("wordpad-spelllang");
      if (lang) setSpellLang(lang);
      if (localStorage.getItem("wordpad-printheader") === "1") setPrintHeaderFooter(true);
    } catch {}
  }, []);

  const changeSpellLang = useCallback((lang: string) => {
    setSpellLang(lang);
    try { localStorage.setItem("wordpad-spelllang", lang); } catch {}
  }, []);

  const togglePrintHeaderFooter = useCallback(() => {
    setPrintHeaderFooter((prev) => {
      try { localStorage.setItem("wordpad-printheader", prev ? "0" : "1"); } catch {}
      return !prev;
    });
  }, []);

  // Focus mode: Esc leaves it
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode]);

  // Esc closes the version-history / shortcuts dialogs
  useEffect(() => {
    if (!versionsOpen && !shortcutsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setVersionsOpen(false); setShortcutsOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [versionsOpen, shortcutsOpen]);

  // Small screens: fit the A4 page to the viewport once on load
  useEffect(() => {
    if (window.innerWidth < 834) {
      setZoomPercent(Math.max(50, Math.floor(((window.innerWidth - 16) / 794) * 100)));
    }
  }, []);

  // Installable/offline shell (production only)
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  void tick; // re-render on every transaction so the match counter stays fresh
  const searchInfo = findOpen && viewRef.current ? getSearchState(viewRef.current) : undefined;
  const matchTotal = searchInfo?.matches.length ?? 0;
  const matchCurrent = matchTotal > 0 ? (searchInfo!.current + 1) : 0;

  return (
    <div className="flex h-screen">
      {/* Hidden inputs for image insert and file open */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) insertImageFromFile(f);
        }}
      />
      <input
        ref={openInputRef}
        type="file"
        accept={OPEN_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) handleOpenFile(f);
        }}
      />
      {/* Collapsible sidebar — members only; guests work on a single document */}
      {isAuthed && (
      <aside
        className={cn(
          "h-full shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out",
          sidebarOpen && !focusMode ? "w-64" : "w-0"
        )}
      >
        <div className="flex h-full w-64 flex-col">
          {/* New document */}
          <div className="p-2 pb-1">
            <button
              type="button"
              onClick={createFile}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-sidebar-border px-2.5 py-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            >
              <Plus size={16} weight="bold" /> New document
            </button>
          </div>

          {/* Search */}
          <div className="px-2 pb-1">
            <div className="flex items-center gap-2 rounded-md border border-sidebar-border px-2.5">
              <MagnifyingGlass size={15} className="shrink-0 opacity-60" />
              <input
                value={fileSearch}
                onChange={(e) => setFileSearch(e.target.value)}
                placeholder="Search documents"
                className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Document list, grouped by folder */}
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {(() => {
              const q = fileSearch.trim().toLowerCase();
              const visible = files.filter((f) => (f.name || "").toLowerCase().includes(q));
              const folders = Array.from(
                new Set(visible.map((f) => f.folder).filter(Boolean) as string[])
              ).sort((a, b) => a.localeCompare(b));
              const allFolders = Array.from(
                new Set(files.map((f) => f.folder).filter(Boolean) as string[])
              ).sort((a, b) => a.localeCompare(b));

              const renderItem = (f: FileItem) => (
                <ContextMenu key={f.id}>
                  <ContextMenuTrigger asChild>
                    <div
                      className={cn(
                        "group flex items-center gap-2 rounded-md pl-2.5 pr-1.5 transition-colors",
                        f.id === activeId ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60"
                      )}
                    >
                      {renamingId === f.id ? (
                        <input
                          autoFocus
                          defaultValue={f.name}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { renameFile(f.id, e.currentTarget.value); setRenamingId(null); }
                            else if (e.key === "Escape") setRenamingId(null);
                          }}
                          onBlur={(e) => { renameFile(f.id, e.currentTarget.value); setRenamingId(null); }}
                          className="my-1 min-w-0 flex-1 rounded border border-input bg-background px-1.5 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => switchFile(f.id)}
                            onDoubleClick={() => setRenamingId(f.id)}
                            className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-sm"
                          >
                            <FileText size={16} className="shrink-0 opacity-70" />
                            <span className="truncate">{f.name || "Untitled"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteFile(f.id)}
                            title="Delete document"
                            aria-label="Delete document"
                            className="shrink-0 rounded p-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring hover:bg-destructive/15 hover:text-destructive transition"
                          >
                            <Trash size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48">
                    <ContextMenuItem onClick={() => { switchFile(f.id); setRenamingId(f.id); }}>
                      <PencilSimple size={15} /> Rename
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => { switchFile(f.id); openVersions(); }}>
                      <ClockCounterClockwise size={15} /> Version history
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => copyDocLink(f.id)}>
                      <LinkSimple size={15} /> Copy link
                    </ContextMenuItem>
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>
                        <FolderSimple size={15} /> Move to folder
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent>
                        {allFolders.map((folder) => (
                          <ContextMenuItem key={folder} onClick={() => moveToFolder(f.id, folder)}>
                            {folder}
                          </ContextMenuItem>
                        ))}
                        {allFolders.length > 0 && <ContextMenuSeparator />}
                        <ContextMenuItem
                          onClick={async () => {
                            const name = await promptDialog({
                              title: "New folder",
                              label: "Folder name",
                              placeholder: "e.g. Work",
                              confirmLabel: "Create",
                            });
                            if (name) moveToFolder(f.id, name);
                          }}
                        >
                          New folder…
                        </ContextMenuItem>
                        {f.folder && (
                          <ContextMenuItem onClick={() => moveToFolder(f.id, null)}>
                            Remove from folder
                          </ContextMenuItem>
                        )}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>
                        <DownloadSimple size={15} /> Export
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent>
                        <ContextMenuItem onClick={() => exportFile(f, "docx")}>Word (.docx)</ContextMenuItem>
                        <ContextMenuItem onClick={() => exportFile(f, "rtf")}>Rich Text (.rtf)</ContextMenuItem>
                        <ContextMenuItem onClick={() => exportFile(f, "html")}>HTML (.html)</ContextMenuItem>
                        <ContextMenuItem onClick={() => exportFile(f, "md")}>Markdown (.md)</ContextMenuItem>
                        <ContextMenuItem onClick={() => exportFile(f, "txt")}>Plain text (.txt)</ContextMenuItem>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onClick={() => deleteFile(f.id)}>
                      <Trash size={15} /> Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );

              return (
                <>
                  {folders.map((folder) => (
                    <details key={folder} open>
                      <summary className="flex cursor-pointer list-none items-center gap-1 px-2.5 pt-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground select-none [&::-webkit-details-marker]:hidden">
                        <CaretRight size={10} className="transition-transform [details[open]>summary>&]:rotate-90" />
                        <FolderSimple size={12} />
                        <span className="truncate">{folder}</span>
                      </summary>
                      <div className="flex flex-col gap-0.5 pb-1">
                        {visible.filter((f) => f.folder === folder).map(renderItem)}
                      </div>
                    </details>
                  ))}
                  <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Documents</p>
                  <div className="flex flex-col gap-0.5">
                    {visible.filter((f) => !f.folder).map(renderItem)}
                    {visible.length === 0 && (
                      <p className="px-2.5 py-2 text-xs text-muted-foreground">No documents</p>
                    )}
                  </div>
                </>
              );
            })()}
          </div>

          {/* User / auth */}
          <div className="border-t border-sidebar-border p-2">
            {user ? (
              <button
                type="button"
                onClick={logout}
                title="Log out"
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent transition-colors"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold select-none">
                  {user.initials}
                </div>
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-sm font-medium">{user.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">Free plan</div>
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={openAuth}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-sidebar-accent transition-colors"
              >
                <SignIn size={18} className="shrink-0 opacity-80" />
                <span>Log in</span>
              </button>
            )}
          </div>
        </div>
      </aside>
      )}

      {/* Main column */}
      <div className="flex h-screen flex-1 min-w-0 flex-col overflow-hidden">
      {!focusMode && (
      <MenuBar
        viewRef={viewRef}
        schema={mySchema}
        pageMarginCm={pageMarginCm}
        onPrint={handlePrint}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        docTitle={docTitle}
        onTitleChange={renameActive}
        onNewDoc={createFile}
        onShowHome={() => setWelcomeOpen(true)}
        onSave={() => { flushSave(); toast.success("Saved"); }}
        onCopyLink={() => copyDocLink(activeIdRef.current)}
        onRenameDoc={renameActiveDoc}
        onDeleteDoc={() => deleteFile(activeIdRef.current)}
        onReplace={openReplace}
        onNewFromTemplate={createFromTemplate}
        onOpenFile={openFileDialog}
        onExport={exportActive}
        onShowVersions={openVersions}
        onShowShortcuts={() => setShortcutsOpen(true)}
        onFind={openFind}
        onInsertTable={handleInsertTable}
        onPageBreakAdd={handleInsertPageBreak}
        onLinkAdd={handleLinkAdd}
        onImageAdd={handleImageAdd}
        onImageUrlAdd={handleImageUrlAdd}
        onInsertDivider={handleInsertDivider}
        onInsertSymbol={handleInsertText}
        onInsertDate={handleInsertDate}
        onLineSpacing={setLineSpacing}
        onClearFormatting={clearFormatting}
        zoomPercent={zoomPercent}
        onZoomChange={setZoomPercent}
        showToolbar={showToolbar}
        onToggleToolbar={() => setShowToolbar((s) => !s)}
        showRuler={showRuler}
        onToggleRuler={() => setShowRuler((s) => !s)}
        spellcheckOn={spellcheckOn}
        onToggleSpellcheck={() => setSpellcheckOn((s) => !s)}
        spellLang={spellLang}
        onSpellLangChange={changeSpellLang}
        onChangeCase={changeCase}
        onInsertTOC={insertTOC}
        readingAloud={readingAloud}
        onToggleReadAloud={toggleReadAloud}
        focusMode={focusMode}
        onToggleFocusMode={() => setFocusMode((f) => !f)}
        printHeaderFooter={printHeaderFooter}
        onTogglePrintHeaderFooter={togglePrintHeaderFooter}
        isDark={isDark}
        onToggleDark={toggleDark}
        canUseSidebar={isAuthed}
        user={user}
        onLogin={openAuth}
        onLogout={logout}
      />
      )}
      {user && !user.emailVerified && !verifyDismissed && (
        <div className="flex items-center gap-2 border-b border-amber-300/60 bg-amber-50 px-3 py-1.5 text-[12px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <Warning size={15} weight="fill" className="shrink-0" />
          <span className="min-w-0 flex-1">Please verify your email address to secure your account.</span>
          <button type="button" onClick={resendVerification} className="shrink-0 font-medium underline-offset-2 hover:underline">
            Resend
          </button>
          <button type="button" onClick={() => setVerifyDismissed(true)} aria-label="Dismiss" className="shrink-0 rounded p-0.5 hover:bg-amber-500/20">
            <X size={13} />
          </button>
        </div>
      )}
      {showToolbar && !focusMode && (
        <Toolbar
          viewRef={viewRef}
          schema={mySchema}
          onInsertTable={handleInsertTable}
          onPageBreakAdd={handleInsertPageBreak}
          onLinkAdd={handleLinkAdd}
          onImageAdd={handleImageAdd}
          tick={tick}
        />
      )}
      {showRuler && !focusMode && (
        <div className="border-b border-border bg-card select-none overflow-hidden">
          <div className="mx-auto h-5 relative" style={{ width: 794 * (zoomPercent / 100) }}>
            <div className="absolute inset-0 flex">
              {Array.from({ length: 21 }, (_, i) => (
                <div key={i} className="relative shrink-0 border-l border-border/60"
                  style={{ width: (794 / 21) * (zoomPercent / 100) }}>
                  <span className="absolute left-0.5 top-0 text-[8px] leading-none text-muted-foreground/70">{i}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="editor-shell" style={{ backgroundColor: paperBgColor }}>
        <TableContextMenu viewRef={viewRef}>
          <div ref={printRef}>
            {printHeaderFooter && (
              <div className="pm-print-header" aria-hidden="true">
                <span>{docTitle || "Untitled document"}</span>
                <span>{new Date().toLocaleDateString()}</span>
              </div>
            )}
            <div
              className="pm-page"
              ref={editorRef}
              style={{
                ["--page-margin" as any]: `${pageMarginCm}cm`,
                ["zoom" as any]: zoomPercent / 100,
              }}
            />
            {printHeaderFooter && (
              <div className="pm-print-footer" aria-hidden="true">
                <span>EDTRpad</span>
                <span>wordpad.info</span>
              </div>
            )}
          </div>
        </TableContextMenu>
      </div>
      {focusMode && (
        <button
          type="button"
          onClick={() => setFocusMode(false)}
          title="Exit focus mode (Esc)"
          className="fixed right-4 top-4 z-[1100] flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-md backdrop-blur hover:text-foreground"
        >
          <ArrowsInSimple size={14} /> Exit focus (Esc)
        </button>
      )}
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
          <div role="dialog" aria-modal="true" aria-label="Crop image" className="w-full max-w-4xl rounded-lg border border-border bg-card text-card-foreground p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Crop Image</h3>
              <button
                type="button"
                className="rounded border border-input px-2 py-1 text-xs hover:bg-accent/70"
                onClick={() => {
                  setCropDialogOpen(false);
                  setCropSource(null);
                }}
              >
                Close
              </button>
            </div>
            <div className="h-[520px] w-full overflow-hidden rounded border border-border bg-muted">
              <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading cropper…</div>}>
                <Cropper
                  ref={cropperRef}
                  src={cropSource}
                  className="h-full w-full"
                />
              </Suspense>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-input px-3 py-1.5 text-sm hover:bg-accent/70"
                onClick={() => {
                  setCropDialogOpen(false);
                  setCropSource(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
                onClick={applyCrop}
              >
                Apply Crop
              </button>
            </div>
          </div>
        </div>
      )}
      {linkDialog && (
        <div
          className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setLinkDialog(null); }}
        >
          <div role="dialog" aria-modal="true" aria-label={linkDialog.mode === "link" ? "Insert link" : "Insert image from URL"} className="w-full max-w-sm rounded-lg border border-border bg-popover text-popover-foreground p-4 shadow-2xl">
            <h3 className="mb-2 text-sm font-semibold">
              {linkDialog.mode === "link" ? "Insert link" : "Insert image from URL"}
            </h3>
            <input
              autoFocus
              value={linkDialog.value}
              onChange={(e) => setLinkDialog((prev) => prev ? { ...prev, value: e.target.value } : prev)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); applyLinkDialog(); }
                else if (e.key === "Escape") { e.preventDefault(); setLinkDialog(null); }
              }}
              placeholder={linkDialog.mode === "link" ? "https://example.com" : "https://example.com/image.png"}
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              {linkDialog.mode === "link" && (
                <button
                  type="button"
                  onClick={removeLink}
                  className="mr-auto rounded px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                >
                  Remove link
                </button>
              )}
              <button
                type="button"
                onClick={() => setLinkDialog(null)}
                className="rounded border border-input px-3 py-1.5 text-sm hover:bg-accent/70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyLinkDialog}
                className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
      {linkCard && (
        <div
          data-link-card
          className="fixed z-[1250] flex items-center gap-1 rounded-md border border-border bg-popover px-2 py-1.5 text-popover-foreground shadow-lg"
          style={{ left: linkCard.left, top: linkCard.top }}
        >
          <a
            href={linkCard.href}
            target="_blank"
            rel="noopener noreferrer"
            className="max-w-[200px] truncate text-xs text-blue-600 underline underline-offset-2 dark:text-blue-400"
            title={linkCard.href}
          >
            {linkCard.href.replace(/^https?:\/\//, "")}
          </a>
          <span className="mx-0.5 h-4 w-px bg-border" />
          <a
            href={linkCard.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open link in new tab"
            className="rounded p-1 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ArrowSquareOut size={14} />
          </a>
          <button
            type="button"
            onClick={editLinkFromCard}
            aria-label="Edit link"
            className="rounded p-1 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            <PencilSimple size={14} />
          </button>
          <button
            type="button"
            onClick={removeLinkFromCard}
            aria-label="Remove link"
            className="rounded p-1 hover:bg-destructive/15 hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
          >
            <LinkBreak size={14} />
          </button>
        </div>
      )}
      {findOpen && (
        <div className="fixed right-4 top-20 z-[1250] w-[330px] rounded-md border border-border bg-popover text-popover-foreground shadow-lg p-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <input
              ref={findInputRef}
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const v = viewRef.current;
                  if (v) (e.shiftKey ? findPrev : findNext)(v);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  closeFind();
                }
              }}
              placeholder="Find"
              className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-[11px] tabular-nums text-muted-foreground w-12 text-center shrink-0">
              {matchTotal ? `${matchCurrent}/${matchTotal}` : findQuery ? "0/0" : ""}
            </span>
            <button type="button" title="Previous (Shift+Enter)"
              className="h-7 w-7 rounded hover:bg-accent/70 text-sm shrink-0"
              onClick={() => { const v = viewRef.current; if (v) findPrev(v); }}>↑</button>
            <button type="button" title="Next (Enter)"
              className="h-7 w-7 rounded hover:bg-accent/70 text-sm shrink-0"
              onClick={() => { const v = viewRef.current; if (v) findNext(v); }}>↓</button>
            <button type="button" title="Close (Esc)"
              className="h-7 w-7 rounded hover:bg-accent/70 text-sm shrink-0"
              onClick={closeFind}>✕</button>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              ref={replaceInputRef}
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replace with"
              className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <button type="button"
              className="h-7 rounded border border-input bg-background px-2 text-xs hover:bg-accent/70 shrink-0"
              onClick={() => { const v = viewRef.current; if (v) replaceCurrent(v, replaceText); }}>Replace</button>
            <button type="button"
              className="h-7 rounded border border-input bg-background px-2 text-xs hover:bg-accent/70 shrink-0"
              onClick={() => { const v = viewRef.current; if (v) replaceAll(v, replaceText); }}>All</button>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground select-none">
              <input type="checkbox" checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)} />
              Match case
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground select-none">
              <input type="checkbox" checked={wholeWord}
                onChange={(e) => setWholeWord(e.target.checked)} />
              Whole word
            </label>
          </div>
        </div>
      )}
      {slashMenu && (
        <div
          ref={slashMenuRef}
          className="fixed z-[1200] w-[300px] rounded-md border border-border bg-popover text-popover-foreground shadow-lg p-1"
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
              } else if (e.key === "Backspace" && slashMenu.query.length === 0) {
                // Backspacing over the "/" cancels the command menu and removes it from the doc.
                e.preventDefault();
                const v = viewRef.current;
                if (v) {
                  v.dispatch(v.state.tr.delete(slashMenu.from, slashMenu.from + 1));
                  v.focus();
                }
                closeSlashMenu();
              } else if (e.key === "Escape") {
                e.preventDefault();
                closeSlashMenu();
                viewRef.current?.focus();
              }
            }}
            placeholder="Search commands..."
            role="combobox"
            aria-expanded="true"
            aria-controls="slash-menu-list"
            aria-activedescendant={slashItems.length ? `slash-item-${slashMenu.selected}` : undefined}
            className="mb-1 w-full rounded border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          {slashItems.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">No command found</div>
          ) : (
            <div ref={slashListRef} id="slash-menu-list" role="listbox" className="max-h-[132px] overflow-y-auto">
              {slashItems.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  id={`slash-item-${idx}`}
                  role="option"
                  aria-selected={idx === slashMenu.selected}
                  data-slash-index={idx}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runSlashCommand(item.id)}
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
      {!focusMode && (
      <div className="border-t border-border bg-card/95 px-2 py-1 text-[11px] leading-none relative">
        {/* Brand watermark, centered — only on small screens where the header brand is hidden */}
        <div className="font-brand pointer-events-none absolute inset-x-0 top-1/2 z-0 -translate-y-1/2 hidden max-[799px]:flex items-center justify-center select-none leading-none opacity-60">
          <span className="text-sm font-bold tracking-tight text-muted-foreground">EDTR</span>
          <span className="text-xs font-semibold tracking-wider text-muted-foreground">PAD</span>
        </div>
        <div className="relative z-10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="max-[520px]:hidden"><span className="font-medium text-foreground">{docInfo.selectedType}</span></span>
            <span>Words: <span className="font-medium text-foreground">{docInfo.words}</span></span>
            <span className="max-[520px]:hidden">Chars: <span className="font-medium text-foreground">{docInfo.characters}</span></span>
            {saveStatus !== "idle" && (
              <>
                <span
                  className={cn(
                    "max-[520px]:hidden",
                    saveStatus === "error" ? "font-medium text-destructive" : "text-muted-foreground"
                  )}
                >
                  {saveStatus === "saving" && "Saving…"}
                  {saveStatus === "saved" && "Saved"}
                  {saveStatus === "error" && (isAuthed ? "Not saved — check your connection" : "Not saved — storage is full, export your work")}
                </span>
                {/* Compact form for narrow screens — save failures must stay visible on phones. */}
                <span
                  className={cn(
                    "hidden max-[520px]:inline",
                    saveStatus === "error" ? "font-medium text-destructive" : "text-muted-foreground"
                  )}
                >
                  {saveStatus === "saving" && "Saving…"}
                  {saveStatus === "saved" && "Saved"}
                  {saveStatus === "error" && "Not saved!"}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Zoom</span>
              <select
                className="h-6 rounded border border-input bg-background px-1.5 text-[11px]"
                value={String(zoomPercent)}
                onChange={(e) => setZoomPercent(Number(e.target.value))}
              >
                {![50, 75, 90, 100, 110, 125, 150].includes(zoomPercent) && (
                  <option value={String(zoomPercent)}>{zoomPercent}%</option>
                )}
                <option value="50">50%</option>
                <option value="75">75%</option>
                <option value="90">90%</option>
                <option value="100">100%</option>
                <option value="110">110%</option>
                <option value="125">125%</option>
                <option value="150">150%</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 max-[799px]:hidden">
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
            {!isDark && (
            <label className="flex items-center gap-1.5 max-[799px]:hidden">
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
            )}
            <button
              type="button"
              onClick={toggleDark}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              aria-label="Toggle dark mode"
              className="inline-flex h-6 w-6 items-center justify-center rounded border border-input bg-background text-muted-foreground hover:bg-accent/70 hover:text-foreground transition-colors"
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>
      </div>
      )}
      </div>
      {versionsOpen && (
        <div
          className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setVersionsOpen(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Version history"
            className={cn(
              "w-full rounded-lg border border-border bg-popover text-popover-foreground p-4 shadow-2xl",
              versionPreview ? "max-w-2xl" : "max-w-sm"
            )}
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Version history</h3>
              <button type="button" onClick={() => setVersionsOpen(false)} aria-label="Close" className="rounded p-1 hover:bg-accent">
                <X size={14} />
              </button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              {isAuthed
                ? "Versions are saved automatically every few minutes while you edit. Click one to preview it."
                : "The last 5 versions are kept on this device. Click one to preview it. Sign in to keep more."}
            </p>
            {versions === null ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
            ) : versions.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No versions yet — keep editing and they will appear here.
              </p>
            ) : (
              <div className={cn("flex gap-3", !versionPreview && "flex-col")}>
                <div className={cn("max-h-72 space-y-1 overflow-y-auto", versionPreview && "w-44 shrink-0")}>
                  {versions.map((ver) => (
                    <div
                      key={ver.id}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5",
                        versionPreview?.id === ver.id ? "border-ring bg-accent/60" : "border-border"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => previewVersion(ver.id)}
                        className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                      >
                        {timeAgo(ver.t)}
                      </button>
                      <button
                        type="button"
                        onClick={() => restoreVersion(ver.id)}
                        className="shrink-0 rounded border border-input px-2 py-1 text-xs hover:bg-accent/70"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
                {versionPreview && (
                  <div className="min-w-0 flex-1 overflow-hidden rounded-md border border-border bg-white text-black">
                    {versionPreview.html === null ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">Loading preview…</p>
                    ) : (
                      <div
                        className="version-preview max-h-72 overflow-y-auto px-4 py-3"
                        dangerouslySetInnerHTML={{ __html: versionPreview.html }}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {shortcutsOpen && (
        <div
          className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShortcutsOpen(false); }}
        >
          <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="w-full max-w-md rounded-lg border border-border bg-popover text-popover-foreground p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Keyboard shortcuts</h3>
              <button type="button" onClick={() => setShortcutsOpen(false)} aria-label="Close" className="rounded p-1 hover:bg-accent">
                <X size={14} />
              </button>
            </div>
            <div className="max-h-[60vh] space-y-4 overflow-y-auto">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.title}>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{group.title}</p>
                  <div className="space-y-1">
                    {group.items.map(([keys, label]) => (
                      <div key={keys} className="flex items-center justify-between gap-4">
                        <span className="text-sm">{label}</span>
                        <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {keys}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <WelcomeScreen
        open={welcomeOpen}
        onClose={() => setWelcomeOpen(false)}
        isAuthed={isAuthed}
        userName={authUser?.name || null}
        files={files.map((f) => ({ id: f.id, name: f.name, folder: f.folder }))}
        activeId={activeId}
        onNewDocument={createFile}
        onOpenFile={openFileDialog}
        onPickTemplate={createFromTemplate}
        onOpenDocument={switchFile}
        onCopyLink={copyDocLink}
        docHref={docUrl}
        onSignIn={openAuth}
      />
      {askDialogs}
      <Toaster />
    </div>
  );
}
