"use client";

import { useEffect, useRef, useCallback, useMemo, useState, lazy, Suspense } from "react";
import { useReactToPrint } from "react-to-print";
import { DOMParser as PMParser, DOMSerializer, Node as PMNode } from "prosemirror-model";
import { EditorState, Transaction, AllSelection, TextSelection, NodeSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import type { CropperRef } from "react-advanced-cropper";

// react-colorful ships only when the paper-background popover is opened.
const HexColorPicker = lazy(() =>
  import("react-colorful").then((m) => ({ default: m.HexColorPicker }))
);
const HexColorInput = lazy(() =>
  import("react-colorful").then((m) => ({ default: m.HexColorInput }))
);

// Heavy and rarely used — LazyCropper pulls in react-advanced-cropper AND its
// stylesheet, so neither loads until the crop dialog opens.
const Cropper = lazy(() => import("./LazyCropper"));
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, toggleMark, setBlockType, wrapIn } from "prosemirror-commands";
import { wrapInList, splitListItem, liftListItem, sinkListItem } from "prosemirror-schema-list";
import { inputRules, wrappingInputRule, textblockTypeInputRule, InputRule } from "prosemirror-inputrules";
import { tableEditing, columnResizing, isInTable, findTable, CellSelection, TableMap, TableView } from "prosemirror-tables";
import { mySchema, sanitizeHref, normalizeIndent } from "./editor-schema";
import MenuBar from "./MenuBar";
import Toolbar from "./Toolbar";
import TableContextMenu from "./TableContextMenu";
import {
  paginationPlugin, remeasurePagination,
  type PageLayoutConfig, type PageNumberPosition, type PageNumberFormat,
} from "./paginationPlugin";
import {
  searchPlugin, setSearch, findNext, findPrev,
  replaceCurrent, replaceAll, clearSearch, getSearchState,
} from "./searchPlugin";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowClockwise, Crop, FlipHorizontal, FlipVertical,
  TextAlignLeft, TextAlignCenter, TextAlignRight,
  Sun, Moon, PencilSimple, Warning, X,
  ArrowSquareOut, LinkBreak,
  ArrowsInSimple,
} from "./icons";
import { cn } from "@/lib/utils";
import { authClient, useSession } from "@/lib/auth-client";
import { prepareImageFile, insertWidth } from "@/lib/image-util";
import { OPEN_ACCEPT } from "@/lib/doc-import";
import WelcomeScreen from "./WelcomeScreen";

// Auth/profile dialogs are closed for the vast majority of a session — load
// their chunks only when they are first opened.
const AuthModal = lazy(() => import("./AuthModal"));
const ProfileDialog = lazy(() => import("./ProfileDialog"));
import { toast, Toaster } from "./toast";
import { useAskDialogs } from "./AskDialogs";
import { useT, useLocale } from "./I18nProvider";
import { isLocale, LOCALE_TAGS, type Dictionary } from "@/lib/i18n";
import { VARIABLE_INPUT_RULE, resolveVariable, type VariableContext } from "@/lib/doc-variables";
import {
  listDocuments, createDocument, updateDocument, renameDocument, deleteDocument,
  getDocumentHtml, getPreferences, savePreferences,
  saveVersion, listVersions, getVersionHtml, type DocListItem,
} from "@/app/actions/user-data";
import { saveGuestVersion, listGuestVersions, removeGuestVersions } from "@/lib/versions";
import { ensureFontsInHtml } from "@/lib/editor-fonts";


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

// CSS reference pixel: 96px per inch, 2.54cm per inch.
const CM_TO_PX = 96 / 2.54;

// Current page geometry for the pagination plugin (single-editor app, same
// pattern as editorHandlers). Updated from React state; read at measure time.
const pageLayoutConfig: PageLayoutConfig = {
  pageHeightPx: 1123, marginPx: CM_TO_PX, pageNumbers: "off", pageNumberFormat: "plain",
};

/* How long the account dialog's close animation runs. Declared here rather
   than imported from ProfileDialog, which is lazy — a static import for one
   number would pull the whole chunk into the initial bundle. Must match
   .dialog-panel-out / .dialog-overlay-out in globals.css. */
const PROFILE_EXIT_MS = 180;

/** Filename for the bulk "download selected" archive. */
const ZIP_NAME = "edtrpad-documents.zip";

/** Shown in Help ▸ About. Must be a mailbox that actually receives. */
const CONTACT_EMAIL = "hello@wordpad.info";

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
    paginationPlugin(() => pageLayoutConfig),
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
      variableRule(),
    ]}),
  ];
}

/**
 * Session values the `[[name]]`/`[[email]]` variables read. Plugins are built
 * once per document, so — like `pageLayoutConfig` — this is a module-level box
 * the Editor keeps current instead of a captured value.
 */
const variableContext: VariableContext & { locale?: string } = {};

/** Typing the closing `]]` of a known `[[token]]` swaps it for its value. */
function variableRule(): InputRule {
  return new InputRule(VARIABLE_INPUT_RULE, (state, match, start, end) => {
    if (state.doc.resolve(end).parent.type === mySchema.nodes.code_block) return null;
    const value = resolveVariable(match[1], match[2], variableContext, variableContext.locale);
    // Unknown name, or known but empty (a guest has no email): leave the text
    // as typed rather than silently swallowing it.
    if (!value) return null;
    return state.tr.insertText(value, start, end);
  });
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
// `html` is always present for guests (localStorage keeps full documents) but
// optional for members: the DB list ships metadata only and each document's
// html is fetched on demand, then cached here.
type FileItem = { id: string; name: string; html?: string; folder?: string | null };
const ZOOM_PRESETS = [50, 75, 90, 100, 110, 125, 150];
const MARGIN_PRESETS = [0.5, 1, 1.5, 2];

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
  let stored = false;
  try {
    const raw = localStorage.getItem(FILES_KEY);
    if (raw) { list = JSON.parse(raw); stored = true; }
  } catch { list = []; }
  if (!Array.isArray(list)) { list = []; stored = false; }
  // An empty stored list means the visitor deleted everything — respect that
  // and let the start screen offer a new document instead of conjuring one.
  // First visit ever: a blank page, ready to type into.
  if (!list.length && !stored) {
    const legacy = localStorage.getItem("wordpad-content-pm");
    const legacyTitle = localStorage.getItem("wordpad-title");
    list = [{
      id: newId(),
      name: legacy ? (legacyTitle || "Untitled document") : "Untitled document",
      html: legacy || "<p></p>",
    }];
  }
  let active = localStorage.getItem(ACTIVE_KEY) || "";
  if (!list.find((f) => f.id === active)) active = list[0]?.id ?? "";
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

function prettySelectionType(state: EditorState, t: Dictionary): string {
  const sel = state.selection;
  if (sel instanceof NodeSelection) {
    const nodeName = sel.node.type.name;
    if (nodeName === "image") return t.blockType.image;
    if (nodeName === "table") return t.blockType.table;
    return nodeName;
  }
  const parent = sel.$from.parent;
  if (parent.type.name === "paragraph") return t.blockType.paragraph;
  if (parent.type.name === "heading") return t.blockType.heading(parent.attrs.level || "");
  if (parent.type.name === "blockquote") return t.blockType.blockquote;
  if (parent.type.name === "code_block") return t.blockType.codeBlock;
  if (parent.type.name === "list_item") return t.blockType.listItem;
  return parent.type.name;
}

function computeDocInfo(state: EditorState, t: Dictionary): DocInfo {
  const text = state.doc.textBetween(0, state.doc.content.size, " ", " ").trim();
  const words = text ? text.split(/\s+/).length : 0;
  const characters = text.length;
  return {
    selectedType: prettySelectionType(state, t),
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

export default function Editor({
  googleEnabled = false,
  initialHome = false,
}: {
  googleEnabled?: boolean;
  /** True when mounted on /welcome — the start screen opens with the page. */
  initialHome?: boolean;
}) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  // Read inside ProseMirror callbacks, which are created once and would
  // otherwise close over the dictionary from the first render.
  const tRef = useRef(t);
  tRef.current = t;
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
  const [pageOrientation, setPageOrientation] = useState<"portrait" | "landscape">("portrait");
  const [zoomPercent, setZoomPercent] = useState(100);
  const [paperBgColor, setPaperBgColor] = useState("#ccd6e5");
  const [docTitle, setDocTitle] = useState("Untitled document");
  const [showToolbar, setShowToolbar] = useState(true);
  const [showRuler, setShowRuler] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const filesRef = useRef<FileItem[]>([]);
  const activeIdRef = useRef<string>("");
  // Id of the document whose content is currently inside the editor view.
  // Equals activeIdRef except during the short window where a member switch is
  // still fetching html — saves/commits always target the doc the content
  // actually belongs to, so a slow fetch can never cross-write documents.
  const loadedIdRef = useRef<string>("");
  // Id whose html fetch is in flight (member doc switch), null otherwise.
  const htmlFetchRef = useRef<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  // Kept mounted for the length of the exit animation after `profileOpen`
  // flips off — the dialog is lazy, so unmounting it immediately would cut the
  // close animation off at the first frame.
  const [profileMounted, setProfileMounted] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  // The account's sign-in methods are fetched when the dialog opens; until they
  // land the password section would guess wrong, so it shows a skeleton.
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(initialHome);
  // Documents whose server-side deletion is in flight (welcome-screen rows).
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  // True while a bulk zip is being built, so the start screen can say so.
  const [bulkBusy, setBulkBusy] = useState(false);
  // True until the first document (DB or localStorage) lands in the editor,
  // so visitors see a loading page instead of a flash of empty paper.
  const [initialLoading, setInitialLoading] = useState(true);
  const { confirm: confirmDialog, prompt: promptDialog, dialogs: askDialogs } = useAskDialogs();
  const [verifyDismissed, setVerifyDismissed] = useState(false);
  const { data: session, isPending: sessionPending } = useSession();
  const authUser = session?.user;
  const isAuthed = !!authUser;
  const isAuthedRef = useRef(false);
  const prefsLoadedRef = useRef(false);
  const prefsErrorShownRef = useRef(false);
  // Referentially stable across renders so the memoized MenuBar (and
  // ProfileDialog) only re-render when the account itself changes.
  const user = useMemo(() => authUser
    ? {
        name: authUser.name || authUser.email,
        email: authUser.email,
        emailVerified: !!authUser.emailVerified,
        initials: (authUser.name || authUser.email)
          .trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase(),
      }
    : null,
  [authUser]);
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
  const [aboutOpen, setAboutOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  // Scrolling down thins the toolbar out — shorter buttons, smaller icons — to
  // hand the page a little vertical space back; scrolling up restores it. The
  // menu bar above it is left alone.
  const [chromeCollapsed, setChromeCollapsed] = useState(false);
  const chromeCollapsedRef = useRef(false);
  const editorShellRef = useRef<HTMLDivElement>(null);
  const [printHeaderFooter, setPrintHeaderFooter] = useState(false);
  const [pageNumbers, setPageNumbers] = useState<PageNumberPosition>("off");
  const [pageNumberFormat, setPageNumberFormat] = useState<PageNumberFormat>("plain");
  const lastAutoNameRef = useRef<string | null>(null);
  const [readingAloud, setReadingAloud] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);

  // A4 at 96dpi: 794×1123px (21×29.7cm). Landscape swaps the two.
  const isLandscape = pageOrientation === "landscape";
  const pageWidthPx = isLandscape ? 1123 : 794;
  const pageHeightPx = isLandscape ? 794 : 1123;
  const pageWidthCm = isLandscape ? 29.7 : 21;

  // Keep the pagination plugin's geometry in sync; an empty transaction pokes
  // its update hook so pages re-flow right away.
  useEffect(() => {
    pageLayoutConfig.pageHeightPx = pageHeightPx;
    pageLayoutConfig.marginPx = pageMarginCm * CM_TO_PX;
    pageLayoutConfig.pageNumbers = pageNumbers;
    pageLayoutConfig.pageNumberFormat = pageNumberFormat;
    const v = viewRef.current;
    if (v && !v.isDestroyed) v.dispatch(v.state.tr);
  }, [pageHeightPx, pageMarginCm, pageNumbers, pageNumberFormat]);

  // Same idea for the `[[name]]`/`[[email]]`/`[[today]]` input rule: it reads
  // the box rather than a value captured when the plugins were built.
  useEffect(() => {
    variableContext.name = authUser?.name ?? null;
    variableContext.email = authUser?.email ?? null;
    variableContext.locale = LOCALE_TAGS[locale];
  }, [authUser?.name, authUser?.email, locale]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    pageStyle: `
      @page { size: A4 ${pageOrientation}; margin: ${pageMarginCm}cm; }
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
      /* On-screen pagination spacers: print uses real CSS page breaks instead. */
      .pm-page-spacer { display: none !important; }
      /* The simulated pages are gone in print, so the numbers anchored to them
         would land in the wrong places. CSS cannot count printed pages
         (@page margin boxes are unsupported in Chromium) — export to PDF for
         numbered pages. */
      .pm-page-number { display: none !important; }
      .pm-page .ProseMirror { padding-bottom: 0 !important; min-height: unset !important; }
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
    setDocInfo((prev) => ({ ...prev, selectedType: prettySelectionType(state, tRef.current) }));
    if (docInfoTimer.current) clearTimeout(docInfoTimer.current);
    docInfoTimer.current = setTimeout(() => {
      const v = viewRef.current;
      if (v) setDocInfo(computeDocInfo(v.state, tRef.current));
    }, 300);
  }, []);

  // ── Deep links: every document has its own URL (/pad?doc=<id>) ────────────
  // Always /pad, even when the editor is mounted on /welcome — document links
  // must stay canonical.
  const docUrl = useCallback((id: string) => `/pad?doc=${encodeURIComponent(id)}`, []);

  // Reflect the open document in the address bar so it can be bookmarked and shared.
  // `push` adds a history entry (user navigation); otherwise the current one is replaced.
  const syncUrlToDoc = useCallback((id: string, push = false) => {
    if (!id) return;
    const url = docUrl(id);
    if (window.location.pathname + window.location.search === url) return;
    if (push) window.history.pushState({ docId: id }, "", url);
    else window.history.replaceState({ docId: id }, "", url);
  }, [docUrl]);

  // Drop ?doc=… — used when no document is open (e.g. the last one was deleted).
  const clearDocUrl = useCallback(() => {
    if (!window.location.search) return;
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  // ── Start screen ↔ URL sync: the welcome screen lives at /welcome ────────
  // `push` = user navigation (Home button → back returns to the editor);
  // auto-opens (sign-in, empty library) replace instead, adding no entry.
  const openHome = useCallback((push = true) => {
    setWelcomeOpen(true);
    if (window.location.pathname !== "/welcome") {
      if (push) window.history.pushState({ home: true }, "", "/welcome");
      else window.history.replaceState({ home: true }, "", "/welcome");
    }
  }, []);

  const closeHome = useCallback(() => {
    setWelcomeOpen(false);
    // Leaving /welcome lands on the active document's canonical URL.
    if (window.location.pathname === "/welcome") {
      const id = activeIdRef.current;
      window.history.replaceState({}, "", id ? docUrl(id) : "/pad");
    }
  }, [docUrl]);

  const copyDocLink = useCallback(async (id: string) => {
    const url = `${window.location.origin}${docUrl(id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t.toast.linkCopied);
    } catch {
      toast.error(t.toast.linkCopyFailed);
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
    pendingSaveRef.current = { id: loadedIdRef.current, state };
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

  // The block-type label in the status bar is derived text, so it has to be
  // recomputed when the language changes.
  useEffect(() => {
    const v = viewRef.current;
    if (v) setDocInfo(computeDocInfo(v.state, t));
  }, [t]);

  // Scrolling happens inside .editor-shell rather than the window, so the
  // direction is read from that element. Small deltas are ignored to avoid
  // flicker, and near the top the chrome is always shown.
  useEffect(() => {
    const el = editorShellRef.current;
    if (!el) return;
    let lastY = el.scrollTop;
    let raf = 0;
    // Shrinking the bars gives the shell more height, so the browser clamps
    // scrollTop and fires a scroll event pointing the other way — which would
    // restore them again, and so on. Ignore events for the length of the
    // transition after a toggle so the two can't chase each other.
    let settleUntil = 0;
    const read = () => {
      raf = 0;
      const y = el.scrollTop;
      const now = performance.now();
      if (now < settleUntil) { lastY = y; return; }
      const delta = y - lastY;
      if (Math.abs(delta) < 8) return;
      lastY = y;
      // Nothing to win back on a document that barely scrolls.
      if (el.scrollHeight - el.clientHeight < 160) return;
      const next = y > 48 && delta > 0;
      if (next === chromeCollapsedRef.current) return;
      chromeCollapsedRef.current = next;
      settleUntil = now + 350;
      setChromeCollapsed(next);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    editorHandlers.flushSave = flushSave;
    return () => { editorHandlers.flushSave = undefined; };
  }, [flushSave]);

  const setDocFromHtml = useCallback((html: string) => {
    const v = viewRef.current;
    if (!v) return;
    // Google fonts load on demand — fetch the ones this document uses.
    ensureFontsInHtml(html);
    const dom = new DOMParser().parseFromString(html || "<p></p>", "text/html");
    const doc = PMParser.fromSchema(mySchema).parse(dom.body);
    // Replace the content through a transaction rather than swapping in a fresh
    // EditorState. A new state means a new plugin set, which tears down and
    // rebuilds every plugin view — pagination then loses the measurement it had
    // queued and never re-runs, leaving the page padded out to the *previous*
    // document's height. Going through a transaction keeps the plugin views
    // alive, so they see the change and re-measure.
    // `addToHistory: false` keeps loading a document out of the undo stack.
    const tr = v.state.tr
      .replaceWith(0, v.state.doc.content.size, doc.content)
      .setMeta("addToHistory", false);
    // Land the cursor inside the first text block, not on the doc node itself.
    tr.setSelection(TextSelection.near(tr.doc.resolve(0)));
    v.dispatch(tr);
    refreshDocInfo(v.state);
    v.focus();
    // Ask pagination to re-measure directly: after a full-document replacement
    // its plugin view may have been rebuilt and miss this change, which would
    // leave the page padded out to the previous document's height.
    remeasurePagination(v);
  }, [refreshDocInfo]);

  // Snapshot the current editor html into the file list, persisting the previous doc if signed in.
  // Cancels any pending debounced save first — this snapshot supersedes it.
  const commitCurrent = useCallback((list: FileItem[]): FileItem[] => {
    const v = viewRef.current;
    if (!v) return list;
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    pendingSaveRef.current = null;
    const html = serializeDoc(v.state.doc);
    // The editor may briefly hold a different doc than the active one (while a
    // switch fetches html) — commit to the doc the content belongs to.
    const id = loadedIdRef.current;
    if (isAuthedRef.current && id) updateDocument(id, html).catch(() => setSaveStatus("error"));
    return list.map((f) => (f.id === id ? { ...f, html } : f));
  }, []);

  // Put a document's content into the editor. Guests (and already-visited
  // member docs) have html in the list and swap synchronously; a member doc
  // opened for the first time fetches its html, shows the paper skeleton
  // meanwhile, and caches the result so re-opening is instant.
  const loadIntoEditor = useCallback((target: FileItem) => {
    setDocTitle(target.name);
    if (target.html !== undefined) {
      htmlFetchRef.current = null; // supersedes any in-flight fetch
      loadedIdRef.current = target.id;
      setDocFromHtml(target.html);
      setInitialLoading(false);
      return;
    }
    const id = target.id;
    htmlFetchRef.current = id;
    setInitialLoading(true);
    getDocumentHtml(id)
      .then((html) => {
        if (htmlFetchRef.current !== id || activeIdRef.current !== id) return;
        const resolved = html ?? "<p></p>";
        const list = filesRef.current.map((f) => (f.id === id ? { ...f, html: resolved } : f));
        filesRef.current = list;
        setFiles(list);
        // Anything typed into the (hidden) previous document while the fetch
        // was in flight still belongs to it — flush before swapping.
        flushSave();
        loadedIdRef.current = id;
        setDocFromHtml(resolved);
      })
      .catch(() => {
        toast.error(tRef.current.toast.openFailed);
      })
      .finally(() => {
        if (htmlFetchRef.current === id) {
          htmlFetchRef.current = null;
          setInitialLoading(false);
        }
      });
  }, [flushSave, setDocFromHtml]);

  // `history` = false when the switch itself came from a browser back/forward event.
  const switchFile = useCallback((id: string, history = true) => {
    // Re-opening the document that's already active still stamps the URL, so
    // picking it from the start screen leaves a shareable address behind.
    if (id === activeIdRef.current) {
      if (history) syncUrlToDoc(id);
      // A failed html fetch can leave the active document unloaded — selecting
      // it again retries.
      if (loadedIdRef.current !== id && htmlFetchRef.current !== id) {
        const target = filesRef.current.find((f) => f.id === id);
        if (target) loadIntoEditor(target);
      }
      return;
    }
    const list = commitCurrent(filesRef.current);
    const target = list.find((f) => f.id === id);
    if (!target) return;
    lastAutoNameRef.current = null;
    applyFiles(list, id);
    loadIntoEditor(target);
    if (history) syncUrlToDoc(id, true);
  }, [applyFiles, commitCurrent, loadIntoEditor, syncUrlToDoc]);

  // Browser back/forward moves between documents opened in this tab, and in
  // and out of the start screen (/welcome).
  useEffect(() => {
    const onPop = () => {
      setWelcomeOpen(window.location.pathname === "/welcome");
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
      // The start screen closes the moment a template is picked, so without the
      // skeleton the previous document sits there in full view for as long as
      // the round trip takes. Clearing the fetch ref supersedes any in-flight
      // html load so its `finally` can't clear the skeleton out from under us.
      htmlFetchRef.current = null;
      setInitialLoading(true);
      try {
        const doc = await createDocument(name, html);
        applyFiles([doc, ...list], doc.id);
        loadedIdRef.current = doc.id;
        setDocFromHtml(doc.html);
        setDocTitle(doc.name);
        syncUrlToDoc(doc.id);
      } catch {
        toast.error(t.toast.createFailed);
      } finally {
        setInitialLoading(false);
      }
    } else {
      const v = viewRef.current;
      const active = filesRef.current.find((f) => f.id === activeIdRef.current);
      const hasContent =
        !!v && active?.html !== DEFAULT_REF_CONTENT && v.state.doc.textContent.trim().length > 0;
      if (hasContent && !(await confirmDialog({
        title: t.dialog.replaceDocTitle,
        description: t.dialog.replaceDocBody,
        confirmLabel: t.dialog.replaceDocConfirm,
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
      loadedIdRef.current = id;
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

  // Deleting is permanent and confirmed up front: the document goes from the
  // list, from local storage, from its version history, and (for members) from
  // the database before this resolves. Deleting the last document leaves the
  // library empty — only the start screen creates documents.
  const deleteFile = useCallback(async (id: string) => {
    const target = filesRef.current.find((f) => f.id === id);
    if (!target) return;
    const label = target.name || t.sidebar.untitled;
    if (!(await confirmDialog({
      title: t.dialog.deleteDocTitle,
      description: t.dialog.deleteDocBody(label),
      confirmLabel: t.dialog.deleteDocConfirm,
      destructive: true,
    }))) return;

    if (pendingSaveRef.current?.id === id) {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      pendingSaveRef.current = null;
    }
    const wasActive = activeIdRef.current === id;
    const list = filesRef.current.filter((f) => f.id !== id);

    if (isAuthedRef.current) {
      // The row stays in the list with a "deleting" badge until the server
      // confirms; only then is it removed (or restored with an error toast).
      setDeletingIds((ids) => [...ids, id]);
      try {
        await deleteDocument(id);
      } catch {
        toast.error(t.toast.deleteFailed);
        return;
      } finally {
        setDeletingIds((ids) => ids.filter((x) => x !== id));
      }
    } else {
      removeGuestVersions(id);
    }

    const nextActive = wasActive ? (list[0]?.id ?? "") : activeIdRef.current;
    applyFiles(list, nextActive);
    if (wasActive) {
      const next = list.find((f) => f.id === nextActive);
      if (next) {
        loadIntoEditor(next); // fetches html first if this doc was never opened
        syncUrlToDoc(next.id);
      } else {
        // Nothing left to show — clear the editor and hand over to the start screen.
        loadedIdRef.current = "";
        setDocFromHtml("<p></p>");
        setDocTitle("");
        clearDocUrl();
        openHome(false);
      }
    }
    toast.success(t.toast.deleted(label));
  }, [applyFiles, clearDocUrl, confirmDialog, loadIntoEditor, openHome, setDocFromHtml, syncUrlToDoc, t]);

  /**
   * Resolve a document's html the same way `exportFile` does: the open document
   * comes from the editor (so unsaved keystrokes are included), a visited one
   * from the cached list, and anything else is fetched.
   */
  const htmlForFile = useCallback(async (file: FileItem): Promise<string | null> => {
    const v = viewRef.current;
    if (file.id === loadedIdRef.current && v) return serializeDoc(v.state.doc);
    if (file.html !== undefined) return file.html;
    return await getDocumentHtml(file.id).catch(() => null);
  }, []);

  /** Bulk download: one .docx per selected document, delivered as a zip. */
  const downloadFiles = useCallback(async (ids: string[]) => {
    const targets = filesRef.current.filter((f) => ids.includes(f.id));
    if (!targets.length) return;
    setBulkBusy(true);
    try {
      const [{ default: JSZip }, { docToDocxBlob, downloadBlob }] = await Promise.all([
        import("jszip"),
        import("@/lib/doc-export"),
      ]);
      const zip = new JSZip();
      // Two documents may share a name; a zip with duplicate entries silently
      // loses all but one, so collisions get a numeric suffix.
      const used = new Set<string>();
      let failed = 0;
      for (const file of targets) {
        const html = await htmlForFile(file);
        if (html === null) { failed++; continue; }
        const base = (file.name || "document").replace(/[^\w.\- ]+/g, "").trim() || "document";
        let entry = `${base}.docx`;
        for (let n = 2; used.has(entry); n++) entry = `${base} (${n}).docx`;
        used.add(entry);
        zip.file(entry, await docToDocxBlob(parseHtmlToDoc(html), file.name || "Document", pageOrientation));
      }
      if (used.size === 0) {
        toast.error(tRef.current.toast.openFailed);
        return;
      }
      downloadBlob(await zip.generateAsync({ type: "blob" }), ZIP_NAME);
      // Partial success is still a download — say what didn't make it in.
      if (failed) toast.warning(tRef.current.welcome.downloadPartial(failed));
    } catch {
      toast.error(tRef.current.toast.downloadFailed);
    } finally {
      setBulkBusy(false);
    }
  }, [htmlForFile, pageOrientation]);

  /** Bulk delete: one confirmation for the whole selection, not one per row. */
  const deleteFiles = useCallback(async (ids: string[]) => {
    const targets = filesRef.current.filter((f) => ids.includes(f.id));
    if (!targets.length) return;
    if (!(await confirmDialog({
      title: t.dialog.deleteDocsTitle(targets.length),
      description: t.dialog.deleteDocsBody(targets.length),
      confirmLabel: t.dialog.deleteDocConfirm,
      destructive: true,
    }))) return;

    const doomed = new Set(targets.map((f) => f.id));
    if (pendingSaveRef.current && doomed.has(pendingSaveRef.current.id)) {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      pendingSaveRef.current = null;
    }
    const wasActive = doomed.has(activeIdRef.current);

    let removed: string[];
    if (isAuthedRef.current) {
      setDeletingIds((current) => [...current, ...doomed]);
      try {
        // Settled, not all: one failure shouldn't strand the rest in the
        // "deleting" state, and whatever did go through is really gone.
        const results = await Promise.allSettled(targets.map((f) => deleteDocument(f.id)));
        removed = targets.filter((_, i) => results[i].status === "fulfilled").map((f) => f.id);
        if (removed.length < targets.length) toast.error(t.toast.deleteFailed);
      } finally {
        setDeletingIds((current) => current.filter((x) => !doomed.has(x)));
      }
    } else {
      targets.forEach((f) => removeGuestVersions(f.id));
      removed = targets.map((f) => f.id);
    }
    if (!removed.length) return;

    const gone = new Set(removed);
    const list = filesRef.current.filter((f) => !gone.has(f.id));
    const stillActive = wasActive && gone.has(activeIdRef.current);
    const nextActive = stillActive ? (list[0]?.id ?? "") : activeIdRef.current;
    applyFiles(list, nextActive);
    if (stillActive) {
      const next = list.find((f) => f.id === nextActive);
      if (next) {
        loadIntoEditor(next);
        syncUrlToDoc(next.id);
      } else {
        loadedIdRef.current = "";
        setDocFromHtml("<p></p>");
        setDocTitle("");
        clearDocUrl();
        openHome(false);
      }
    }
    toast.success(t.toast.deletedCount(removed.length));
  }, [applyFiles, clearDocUrl, confirmDialog, loadIntoEditor, openHome, setDocFromHtml, syncUrlToDoc, t]);

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
      toast.error(t.toast.versionLoadFailed);
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
    // The restored content belongs to the active doc — supersede any pending
    // html fetch and point saves at it.
    htmlFetchRef.current = null;
    loadedIdRef.current = id;
    setDocFromHtml(html);
    if (viewRef.current) persistDoc(id, viewRef.current.state);
    setVersionsOpen(false);
    toast.success(t.toast.versionRestored);
  }, [loadVersionHtml, persistDoc, setDocFromHtml]);

  const exportFile = useCallback(async (file: FileItem, fmt: "html" | "txt" | "docx" | "rtf" | "md" | "pdf") => {
    const v = viewRef.current;
    // Compare against the doc the editor actually holds (not just the active
    // id) so a doc whose html is still being fetched exports from the DB.
    const isActiveDoc = file.id === loadedIdRef.current && !!v;
    let html: string;
    if (isActiveDoc) {
      html = serializeDoc(v!.state.doc);
    } else if (file.html !== undefined) {
      html = file.html;
    } else {
      // Member doc that was never opened this session — fetch (and cache) it.
      const fetched = await getDocumentHtml(file.id).catch(() => null);
      if (fetched === null) {
        toast.error(tRef.current.toast.openFailed);
        return;
      }
      html = fetched;
      const list = filesRef.current.map((f) => (f.id === file.id ? { ...f, html: fetched } : f));
      filesRef.current = list;
      setFiles(list);
    }
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
      const doc = isActiveDoc ? v!.state.doc : parseHtmlToDoc(html);
      if (fmt === "docx") {
        downloadBlob(await docToDocxBlob(doc, file.name || "Document", pageOrientation), `${safe}.docx`);
      } else if (fmt === "pdf") {
        // Real client-side PDF export — loaded on demand like the other exporters.
        const { docToPdfBlob } = await import("@/lib/pdf-export");
        downloadBlob(await docToPdfBlob(doc, {
          title: file.name || "Document",
          orientation: pageOrientation,
          marginCm: pageMarginCm,
          headerFooter: printHeaderFooter,
          pageNumbers,
          pageNumberFormat,
        }), `${safe}.pdf`);
      } else if (fmt === "md") {
        downloadBlob(new Blob([docToMarkdown(doc)], { type: "text/markdown" }), `${safe}.md`);
      } else {
        downloadBlob(new Blob([docToRtf(doc)], { type: "application/rtf" }), `${safe}.rtf`);
      }
    }
    toast.success(t.toast.downloaded(`${safe}.${fmt}`));
  }, [pageOrientation, pageMarginCm, printHeaderFooter, pageNumbers, pageNumberFormat]);

  // Export the document currently open in the editor (used by the File menu).
  const exportActive = useCallback((fmt: "html" | "txt" | "docx" | "rtf" | "md" | "pdf") => {
    const id = activeIdRef.current;
    const file = filesRef.current.find((f) => f.id === id) || { id, name: docTitle, html: "" };
    exportFile({ ...file, name: docTitle || file.name }, fmt);
  }, [exportFile, docTitle]);

  /** Single-row download — a lone .docx, no archive around it. */
  const downloadFile = useCallback((id: string) => {
    const file = filesRef.current.find((f) => f.id === id);
    if (file) exportFile(file, "docx");
  }, [exportFile]);

  // ── File open (.txt / .md / .html / .docx) ────────────────────────────────
  const openFileDialog = useCallback(() => openInputRef.current?.click(), []);

  const handleOpenFile = useCallback(async (file: File) => {
    try {
      const { fileToHtml } = await import("@/lib/doc-import");
      const { html, name } = await fileToHtml(file);
      await addNewDocument(name, html);
      // The start screen stays up while the picker is open; the imported
      // document is what closes it.
      closeHome();
    } catch {
      toast.error(t.toast.openFailed);
    }
  }, [addNewDocument, closeHome]);

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

  // Which credentials the account actually has decides what the profile dialog
  // can offer: a Google-only user has no current password to confirm against.
  const openProfile = useCallback(async () => {
    setProfileMounted(true);
    setProfileOpen(true);
    setAccountsLoading(true);
    try {
      const { data } = await authClient.listAccounts();
      setHasPassword(!!data?.some((a) => a.providerId === "credential"));
    } catch {
      setHasPassword(false);
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profileOpen || !profileMounted) return;
    const timer = setTimeout(() => setProfileMounted(false), PROFILE_EXIT_MS);
    return () => clearTimeout(timer);
  }, [profileOpen, profileMounted]);

  // The account and every document behind it are gone — reload into the guest
  // experience rather than leaving a dead session in memory.
  const onAccountDeleted = useCallback(() => {
    prefsLoadedRef.current = false;
    window.location.href = "/";
  }, []);

  const openAuth = useCallback(() => setAuthOpen(true), []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);
  const closeProfile = useCallback(() => setProfileOpen(false), []);

  // ── Stable handlers for the memoized MenuBar ───────────────────────────────
  // Every prop MenuBar receives must keep its identity across keystrokes, or
  // React.memo can't skip its ~700-line render. Former inline arrows live here.
  const showHome = useCallback(() => openHome(), [openHome]);
  const showShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const showAbout = useCallback(() => setAboutOpen(true), []);
  const changePageNumbers = useCallback((p: PageNumberPosition) => setPageNumbers(p), []);
  const changePageNumberFormat = useCallback((f: PageNumberFormat) => setPageNumberFormat(f), []);
  const toggleToolbar = useCallback(() => setShowToolbar((s) => !s), []);
  const toggleRuler = useCallback(() => setShowRuler((s) => !s), []);
  const toggleSpellcheck = useCallback(() => setSpellcheckOn((s) => !s), []);
  const toggleFocusMode = useCallback(() => setFocusMode((f) => !f), []);
  const saveNow = useCallback(() => { flushSave(); toast.success(t.toast.saved); }, [flushSave]);
  const copyActiveDocLink = useCallback(() => copyDocLink(activeIdRef.current), [copyDocLink]);
  const deleteActiveDoc = useCallback(() => deleteFile(activeIdRef.current), [deleteFile]);

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
      toast.success(t.toast.verificationSent);
    } catch {
      toast.error(t.toast.verificationFailed);
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
    return () => {
      view.destroy();
      // Clear the ref too: other effects dispatch through it, and dispatching
      // into a destroyed view throws inside updateState.
      if (viewRef.current === view) viewRef.current = null;
    };
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
    if (p.orientation === "portrait" || p.orientation === "landscape") setPageOrientation(p.orientation);
    if (typeof p.bg === "string") setPaperBgColor(p.bg);
    if (typeof p.spellLang === "string") setSpellLang(p.spellLang);
    if (typeof p.printHeader === "boolean") setPrintHeaderFooter(p.printHeader);
    if (p.pageNumbers === "off" || p.pageNumbers === "bottom" || p.pageNumbers === "top") {
      setPageNumbers(p.pageNumbers);
    }
    if (p.pageNumberFormat === "plain" || p.pageNumberFormat === "of") {
      setPageNumberFormat(p.pageNumberFormat);
    }
    if (typeof p.spellcheck === "boolean") setSpellcheckOn(p.spellcheck);
    if (typeof p.toolbar === "boolean") setShowToolbar(p.toolbar);
    if (typeof p.ruler === "boolean") setShowRuler(p.ruler);
    if (isLocale(p.locale)) setLocale(p.locale);
  }, [setLocale]);

  // Load documents + preferences once the session resolves (DB when signed in, localStorage for guests).
  useEffect(() => {
    if (sessionPending || !viewRef.current) return;
    let cancelled = false;
    // Show the start screen *before* the documents load, so signing in doesn't
    // flash the editor first. A ?doc=… deep link goes straight to the editor.
    const welcomeUid = authUser?.id ?? "";
    if (authUser && !initialDeepLinkId && welcomedForRef.current !== welcomeUid) {
      welcomedForRef.current = welcomeUid;
      openHome(false);
    }
    (async () => {
      if (authUser) {
        // Startup roundtrips run in parallel: the document list, the user's
        // preferences, and (when deep-linked) the target document's html all
        // start together instead of waterfalling.
        const deepLinkId = takeDeepLinkId();
        const prefsPromise = getPreferences().catch(() => null);
        const deepLinkHtmlPromise = deepLinkId
          ? getDocumentHtml(deepLinkId).catch(() => null)
          : null;
        let docs = await listDocuments().catch(() => [] as DocListItem[]);
        if (!docs.length) {
          // Migrate guest files from localStorage; fall back to a Welcome doc if nothing there.
          const { list: localFiles } = loadFiles();
          const stripped = (html: string) => html.replace(/<[^>]*>/g, "").trim();
          const hasRealContent =
            localFiles.length > 1 ||
            (localFiles.length === 1 &&
              localFiles[0].html !== DEFAULT_REF_CONTENT &&
              stripped(localFiles[0].html ?? "") !== "");
          if (hasRealContent) {
            const created = await Promise.all(
              localFiles.map((f) => createDocument(f.name, f.html ?? "<p></p>").catch(() => null))
            );
            docs = created.filter(Boolean) as DocListItem[];
            try {
              localStorage.removeItem(FILES_KEY);
              localStorage.removeItem(ACTIVE_KEY);
            } catch {}
          }
        }
        if (cancelled) return;
        // A ?doc=… deep link wins over the default document, when it still exists.
        const deepLinked = deepLinkId ? docs.find((d) => d.id === deepLinkId) : undefined;
        if (deepLinkId && !deepLinked) {
          toast.warning(t.toast.deepLinkMissing);
        }
        // An empty library is a valid state (everything was deleted): the start
        // screen is the only place that creates documents.
        const active = deepLinked ?? docs[0];
        // The list carries metadata only — fetch just the active doc's html
        // (already in flight for deep links; migrated docs carry it inline).
        let activeHtml = active?.html;
        if (active && activeHtml === undefined) {
          const fetched =
            deepLinkHtmlPromise && active.id === deepLinkId
              ? await deepLinkHtmlPromise
              : await getDocumentHtml(active.id).catch(() => null);
          activeHtml = fetched ?? "<p></p>";
          docs = docs.map((d) => (d.id === active.id ? { ...d, html: activeHtml } : d));
        }
        if (cancelled) return;
        filesRef.current = docs; activeIdRef.current = active?.id ?? "";
        setFiles(docs); setActiveId(active?.id ?? "");
        loadedIdRef.current = active?.id ?? "";
        if (active) { setDocFromHtml(activeHtml ?? "<p></p>"); setDocTitle(active.name); }
        else { setDocFromHtml("<p></p>"); setDocTitle(""); openHome(false); }
        // Only stamp the URL when the visitor actually arrived via a deep link.
        // Writing it on a plain /pad visit would make the next reload look like
        // a deep link and skip the start screen.
        if (deepLinked) syncUrlToDoc(active.id);
        setInitialLoading(false);
        const prefs = await prefsPromise;
        if (cancelled) return;
        if (prefs) applyPreferences(prefs);
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
        const activeId = activeFile?.id ?? "";
        filesRef.current = list; activeIdRef.current = activeId;
        setFiles(list); setActiveId(activeId);
        loadedIdRef.current = activeId;
        // Guest documents always carry html (localStorage stores them whole).
        if (activeFile) { setDocFromHtml(activeFile.html ?? "<p></p>"); setDocTitle(activeFile.name); }
        // Guest deleted their last document: start screen, no auto-created doc.
        else { setDocFromHtml("<p></p>"); setDocTitle(""); openHome(false); }
        if (deepLinked) syncUrlToDoc(activeId);
        try {
          localStorage.setItem(FILES_KEY, JSON.stringify(list));
          localStorage.setItem(ACTIVE_KEY, activeId);
        } catch {}
        setInitialLoading(false);
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
        orientation: pageOrientation,
        bg: paperBgColor,
        spellLang,
        printHeader: printHeaderFooter,
        pageNumbers,
        pageNumberFormat,
        spellcheck: spellcheckOn,
        toolbar: showToolbar,
        ruler: showRuler,
        locale,
      }).catch(() => {
        // Warn once per session — repeating it on every settings tweak would nag.
        if (prefsErrorShownRef.current) return;
        prefsErrorShownRef.current = true;
        toast.error(t.toast.prefsSaveFailed);
      });
    }, 700);
  }, [
    isAuthed, isDark, zoomPercent, pageMarginCm, pageOrientation, paperBgColor,
    spellLang, printHeaderFooter, pageNumbers, pageNumberFormat, spellcheckOn, showToolbar, showRuler, locale,
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
      toast.warning(t.toast.selectTextToLink);
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

  const handleInsertVariable = useCallback((name: string, format?: string) => {
    const value = resolveVariable(name, format, variableContext, variableContext.locale);
    if (value) handleInsertText(value);
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
      title: t.dialog.renameTitle,
      label: t.dialog.renameLabel,
      defaultValue: docTitle,
      confirmLabel: t.dialog.renameConfirm,
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
    if (empty) { toast.warning(t.toast.selectTextFirst); return; }
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
      toast.warning(t.toast.needHeadings);
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
      toast.error(t.toast.readAloudUnsupported);
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
      toast.error(t.toast.cropFailed);
      return;
    }
    try {
      const nextSrc = canvas.toDataURL("image/png");
      updateSelectedImageAttrs({ src: nextSrc });
      setCropDialogOpen(false);
      setCropSource(null);
    } catch {
      toast.error(t.toast.cropCrossOrigin);
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
      if (localStorage.getItem("wordpad-orientation") === "landscape") setPageOrientation("landscape");
    } catch {}
  }, []);

  const changeSpellLang = useCallback((lang: string) => {
    setSpellLang(lang);
    try { localStorage.setItem("wordpad-spelllang", lang); } catch {}
  }, []);

  const changePageOrientation = useCallback((o: "portrait" | "landscape") => {
    setPageOrientation(o);
    try { localStorage.setItem("wordpad-orientation", o); } catch {}
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
    if (!versionsOpen && !shortcutsOpen && !aboutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setVersionsOpen(false); setShortcutsOpen(false); setAboutOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [versionsOpen, shortcutsOpen, aboutOpen]);

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
      {/* Main column */}
      <div className="flex h-screen flex-1 min-w-0 flex-col overflow-hidden">
      {!focusMode && (
      <MenuBar
        viewRef={viewRef}
        schema={mySchema}
        pageMarginCm={pageMarginCm}
        onPageMarginChange={setPageMarginCm}
        pageOrientation={pageOrientation}
        onPageOrientationChange={changePageOrientation}
        onPrint={handlePrint}
        docTitle={docTitle}
        onTitleChange={renameActive}
        onNewDoc={createFile}
        onShowHome={showHome}
        onSave={saveNow}
        onCopyLink={copyActiveDocLink}
        onRenameDoc={renameActiveDoc}
        onDeleteDoc={deleteActiveDoc}
        onReplace={openReplace}
        onNewFromTemplate={createFromTemplate}
        onOpenFile={openFileDialog}
        onExport={exportActive}
        onShowVersions={openVersions}
        onShowShortcuts={showShortcuts}
        onShowAbout={showAbout}
        onFind={openFind}
        onInsertTable={handleInsertTable}
        onPageBreakAdd={handleInsertPageBreak}
        onLinkAdd={handleLinkAdd}
        onImageAdd={handleImageAdd}
        onImageUrlAdd={handleImageUrlAdd}
        onInsertDivider={handleInsertDivider}
        onInsertSymbol={handleInsertText}
        onInsertDate={handleInsertDate}
        onInsertVariable={handleInsertVariable}
        onLineSpacing={setLineSpacing}
        onClearFormatting={clearFormatting}
        zoomPercent={zoomPercent}
        onZoomChange={setZoomPercent}
        showToolbar={showToolbar}
        onToggleToolbar={toggleToolbar}
        showRuler={showRuler}
        onToggleRuler={toggleRuler}
        spellcheckOn={spellcheckOn}
        onToggleSpellcheck={toggleSpellcheck}
        spellLang={spellLang}
        onSpellLangChange={changeSpellLang}
        onChangeCase={changeCase}
        onInsertTOC={insertTOC}
        readingAloud={readingAloud}
        onToggleReadAloud={toggleReadAloud}
        focusMode={focusMode}
        onToggleFocusMode={toggleFocusMode}
        pageNumbers={pageNumbers}
        onPageNumbersChange={changePageNumbers}
        pageNumberFormat={pageNumberFormat}
        onPageNumberFormatChange={changePageNumberFormat}
        printHeaderFooter={printHeaderFooter}
        onTogglePrintHeaderFooter={togglePrintHeaderFooter}
        isDark={isDark}
        onToggleDark={toggleDark}
        user={user}
        onLogin={openAuth}
        onLogout={logout}
        onOpenProfile={openProfile}
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
          compact={chromeCollapsed}
        />
      )}
      {showRuler && !focusMode && (
        <div className="border-b border-border bg-card select-none overflow-hidden">
          <div className="mx-auto h-5 relative" style={{ width: pageWidthPx * (zoomPercent / 100) }}>
            <div className="absolute inset-0 flex">
              {Array.from({ length: Math.ceil(pageWidthCm) }, (_, i) => (
                <div key={i} className="relative shrink-0 border-l border-border/60"
                  style={{ width: (pageWidthPx / pageWidthCm) * (zoomPercent / 100) }}>
                  <span className="absolute left-0.5 top-0 text-[8px] leading-none text-muted-foreground/70">{i}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div
        ref={editorShellRef}
        className="editor-shell relative"
        style={{ backgroundColor: paperBgColor, ["--shell-bg" as any]: paperBgColor }}
      >
        {/* Blank documents already look blank, so the shimmer only matters for
            content that is still on its way; it clears the moment it lands. */}
        {initialLoading && (
          <div
            className="absolute inset-0 z-10 flex justify-center pt-10"
            style={{ backgroundColor: paperBgColor }}
            aria-hidden="true"
          >
            <div
              className="animate-pulse bg-white shadow-md dark:bg-[#262626]"
              style={{ width: pageWidthPx * (zoomPercent / 100), height: "100%" }}
            >
              <div className="mx-auto mt-16 w-4/5 space-y-3">
                <div className="h-4 w-2/3 rounded bg-gray-100 dark:bg-white/10" />
                <div className="h-3 rounded bg-gray-100 dark:bg-white/10" />
                <div className="h-3 rounded bg-gray-100 dark:bg-white/10" />
                <div className="h-3 w-3/4 rounded bg-gray-100 dark:bg-white/10" />
              </div>
            </div>
          </div>
        )}
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
                ["--page-w" as any]: `${pageWidthPx}px`,
                ["--page-h" as any]: `${pageHeightPx}px`,
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
          title={`${t.status.exitFocusMode} (Esc)`}
          className="fixed right-4 top-4 z-[1100] flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-md backdrop-blur hover:text-foreground"
        >
          <ArrowsInSimple size={14} /> {t.status.exitFocusMode}
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
          <div role="dialog" aria-modal="true" aria-label={t.dialog.cropImage} className="w-full max-w-4xl rounded-lg border border-border bg-card text-card-foreground p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t.dialog.cropImage}</h3>
              <button
                type="button"
                className="rounded border border-input px-2 py-1 text-xs hover:bg-accent/70"
                onClick={() => {
                  setCropDialogOpen(false);
                  setCropSource(null);
                }}
              >
                {t.dialog.close}
              </button>
            </div>
            <div className="h-[520px] w-full overflow-hidden rounded border border-border bg-muted">
              <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t.dialog.loadingCropper}</div>}>
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
                {t.dialog.cancel}
              </button>
              <button
                type="button"
                className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
                onClick={applyCrop}
              >
                {t.dialog.applyCrop}
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
          <div role="dialog" aria-modal="true" aria-label={linkDialog.mode === "link" ? t.dialog.insertLink : t.dialog.insertImageUrl} className="w-full max-w-sm rounded-lg border border-border bg-popover text-popover-foreground p-4 shadow-2xl">
            <h3 className="mb-2 text-sm font-semibold">
              {linkDialog.mode === "link" ? t.dialog.insertLink : t.dialog.insertImageUrl}
            </h3>
            <input
              autoFocus
              value={linkDialog.value}
              onChange={(e) => setLinkDialog((prev) => prev ? { ...prev, value: e.target.value } : prev)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); applyLinkDialog(); }
                else if (e.key === "Escape") { e.preventDefault(); setLinkDialog(null); }
              }}
              placeholder={linkDialog.mode === "link" ? t.dialog.linkPlaceholder : t.dialog.imagePlaceholder}
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              {linkDialog.mode === "link" && (
                <button
                  type="button"
                  onClick={removeLink}
                  className="mr-auto rounded px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                >
                  {t.dialog.removeLink}
                </button>
              )}
              <button
                type="button"
                onClick={() => setLinkDialog(null)}
                className="rounded border border-input px-3 py-1.5 text-sm hover:bg-accent/70"
              >
                {t.dialog.cancel}
              </button>
              <button
                type="button"
                onClick={applyLinkDialog}
                className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
              >
                {t.dialog.apply}
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
              placeholder={t.find.findPlaceholder}
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
              placeholder={t.find.replacePlaceholder}
              className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <button type="button"
              className="h-7 rounded border border-input bg-background px-2 text-xs hover:bg-accent/70 shrink-0"
              onClick={() => { const v = viewRef.current; if (v) replaceCurrent(v, replaceText); }}>{t.find.replace}</button>
            <button type="button"
              className="h-7 rounded border border-input bg-background px-2 text-xs hover:bg-accent/70 shrink-0"
              onClick={() => { const v = viewRef.current; if (v) replaceAll(v, replaceText); }}>{t.find.replaceAll}</button>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground select-none">
              <input type="checkbox" checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)} />
              {t.find.matchCase}
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground select-none">
              <input type="checkbox" checked={wholeWord}
                onChange={(e) => setWholeWord(e.target.checked)} />
              {t.find.wholeWord}
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
            placeholder={t.slash.placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls="slash-menu-list"
            aria-activedescendant={slashItems.length ? `slash-item-${slashMenu.selected}` : undefined}
            className="mb-1 w-full rounded border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          {slashItems.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">{t.slash.noResults}</div>
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
            <span>{t.status.words}: <span className="font-medium text-foreground">{docInfo.words}</span></span>
            <span className="max-[520px]:hidden">{t.status.chars}: <span className="font-medium text-foreground">{docInfo.characters}</span></span>
            {saveStatus !== "idle" && (
              <>
                <span
                  className={cn(
                    "max-[520px]:hidden",
                    saveStatus === "error" ? "font-medium text-destructive" : "text-muted-foreground"
                  )}
                >
                  {saveStatus === "saving" && t.status.saving}
                  {saveStatus === "saved" && t.status.saved}
                  {saveStatus === "error" && (isAuthed ? t.status.notSavedConnection : t.status.notSavedStorage)}
                </span>
                {/* Compact form for narrow screens — save failures must stay visible on phones. */}
                <span
                  className={cn(
                    "hidden max-[520px]:inline",
                    saveStatus === "error" ? "font-medium text-destructive" : "text-muted-foreground"
                  )}
                >
                  {saveStatus === "saving" && t.status.saving}
                  {saveStatus === "saved" && t.status.saved}
                  {saveStatus === "error" && t.status.notSavedShort}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{t.status.zoom}</span>
              <Select value={String(zoomPercent)} onValueChange={(v) => setZoomPercent(Number(v))}>
                <SelectTrigger size="sm" aria-label={t.status.zoom} className="h-6 w-[76px] px-1.5 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {/* A zoom restored from preferences may not be one of the presets. */}
                  {!ZOOM_PRESETS.includes(zoomPercent) && (
                    <SelectItem value={String(zoomPercent)} className="text-xs">{zoomPercent}%</SelectItem>
                  )}
                  {ZOOM_PRESETS.map((z) => (
                    <SelectItem key={z} value={String(z)} className="text-xs">{z}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5 max-[799px]:hidden">
              <span className="text-muted-foreground">{t.status.pageMargin}</span>
              <Select value={String(pageMarginCm)} onValueChange={(v) => setPageMarginCm(Number(v))}>
                <SelectTrigger size="sm" aria-label={t.status.pageMargin} className="h-6 w-[82px] px-1.5 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {MARGIN_PRESETS.map((m) => (
                    <SelectItem key={m} value={String(m)} className="text-xs">{m} cm</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!isDark && (
            <label className="flex items-center gap-1.5 max-[799px]:hidden">
              <span className="text-muted-foreground">{t.status.background}</span>
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
                  <Suspense
                    fallback={
                      <>
                        <div className="rounded bg-muted" style={{ width: 180, height: 130 }} />
                        <div className="h-7 w-full rounded border border-input bg-background" />
                      </>
                    }
                  >
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
                  </Suspense>
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
            aria-label={t.dialog.versionHistory}
            className={cn(
              "w-full rounded-lg border border-border bg-popover text-popover-foreground p-4 shadow-2xl",
              versionPreview ? "max-w-2xl" : "max-w-sm"
            )}
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t.dialog.versionHistory}</h3>
              <button type="button" onClick={() => setVersionsOpen(false)} aria-label={t.dialog.close} className="rounded p-1 hover:bg-accent">
                <X size={14} />
              </button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              {isAuthed
                ? t.dialog.versionsMember
                : t.dialog.versionsGuest}
            </p>
            {versions === null ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t.dialog.loading}</p>
            ) : versions.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t.dialog.versionsEmpty}
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
                        {t.dialog.restore}
                      </button>
                    </div>
                  ))}
                </div>
                {versionPreview && (
                  <div className="min-w-0 flex-1 overflow-hidden rounded-md border border-border bg-white text-black">
                    {versionPreview.html === null ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">{t.dialog.loadingPreview}</p>
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
          <div role="dialog" aria-modal="true" aria-label={t.dialog.shortcuts} className="w-full max-w-md rounded-lg border border-border bg-popover text-popover-foreground p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t.dialog.shortcuts}</h3>
              <button type="button" onClick={() => setShortcutsOpen(false)} aria-label={t.dialog.close} className="rounded p-1 hover:bg-accent">
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
      {aboutOpen && (
        <div
          className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setAboutOpen(false); }}
        >
          <div role="dialog" aria-modal="true" aria-label={t.help.about} className="w-full max-w-md rounded-lg border border-border bg-popover text-popover-foreground p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <span className="font-brand select-none leading-none">
                  <span className="text-2xl font-bold tracking-tight text-foreground">EDTR</span>
                  <span className="text-lg font-semibold tracking-wider text-muted-foreground">PAD</span>
                </span>
                <p className="mt-1 text-sm text-muted-foreground">{t.help.aboutTagline}</p>
              </div>
              <button type="button" onClick={() => setAboutOpen(false)} aria-label={t.dialog.close} className="-mr-1 -mt-1 shrink-0 rounded p-1 hover:bg-accent">
                <X size={14} />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{t.help.aboutBody}</p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t.help.aboutText}</p>
            <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">{t.help.aboutContact}</dt>
                <dd>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2 hover:no-underline">
                    {CONTACT_EMAIL}
                  </a>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">{t.help.aboutMadeBy}</dt>
                <dd>
                  <a href="https://ymg.digital" target="_blank" rel="noopener" className="underline underline-offset-2 hover:no-underline">
                    ymg.digital
                  </a>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
      {/* Mounted only while open so their lazy chunks stay out of the initial
          load; the null fallback covers the brief first-open fetch. */}
      {authOpen && (
        <Suspense fallback={null}>
          <AuthModal open={authOpen} onClose={closeAuth} googleEnabled={googleEnabled} />
        </Suspense>
      )}
      {profileMounted && (
        <Suspense fallback={null}>
          <ProfileDialog
            open={profileOpen}
            onClose={closeProfile}
            loading={accountsLoading}
            user={user}
            hasPassword={hasPassword}
            onDeleted={onAccountDeleted}
          />
        </Suspense>
      )}
      <WelcomeScreen
        open={welcomeOpen}
        onClose={closeHome}
        isAuthed={isAuthed}
        userName={authUser?.name || null}
        files={files.map((f) => ({ id: f.id, name: f.name, folder: f.folder }))}
        activeId={activeId}
        onNewDocument={createFile}
        onOpenFile={openFileDialog}
        onPickTemplate={createFromTemplate}
        onOpenDocument={switchFile}
        onCopyLink={copyDocLink}
        onDeleteDocument={deleteFile}
        onDownloadDocument={downloadFile}
        onDownloadDocuments={downloadFiles}
        onDeleteDocuments={deleteFiles}
        bulkBusy={bulkBusy}
        deletingIds={deletingIds}
        loading={initialLoading}
        docHref={docUrl}
        onSignIn={openAuth}
        onOpenProfile={openProfile}
        userEmail={authUser?.email || null}
        sessionLoading={sessionPending}
      />
      {askDialogs}
      <Toaster />
    </div>
  );
}
