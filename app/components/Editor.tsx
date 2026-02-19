"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Schema, DOMParser as PMParser, DOMSerializer, Node as PMNode, Mark } from "prosemirror-model";
import { EditorState, Transaction, AllSelection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { wrapInList, splitListItem, liftListItem, sinkListItem } from "prosemirror-schema-list";
import { inputRules, wrappingInputRule, textblockTypeInputRule } from "prosemirror-inputrules";
import { tableEditing, columnResizing, tableNodes, isInTable, findTable, CellSelection, TableMap, TableView } from "prosemirror-tables";
import MenuBar from "./MenuBar";
import Toolbar from "./Toolbar";
import TableContextMenu from "./TableContextMenu";

// ── Schema ────────────────────────────────────────────────────────────────
const mySchema = new Schema({
  nodes: (addListNodes(basicSchema.spec.nodes, "paragraph block*", "block") as any)
    .append(tableNodes({ tableGroup: "block", cellContent: "block+", cellAttributes: {} })),
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
          const table = findTable(state.selection);
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
      "Tab":       sinkListItem(mySchema.nodes.list_item),
      "Shift-Tab": liftListItem(mySchema.nodes.list_item),
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

export { mySchema };

export default function Editor() {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef   = useRef<EditorView | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tick, setTick] = useState(0);

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

  useEffect(() => {
    if (!editorRef.current) return;
    const stored = localStorage.getItem("wordpad-content-pm");
    let doc: PMNode | undefined;
    if (stored) {
      try {
        const dom = new DOMParser().parseFromString(stored, "text/html");
        doc = PMParser.fromSchema(mySchema).parse(dom.body);
      } catch { doc = undefined; }
    }
    const state = EditorState.create({ schema: mySchema, doc, plugins: buildPlugins() });
    const view = new EditorView(editorRef.current, {
      state,
      nodeViews: {
        table: (node, v, getPos) => new TableNodeView(node, v, getPos as () => number | undefined),
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
      dispatchTransaction(tr) {
        const next = view.state.apply(tr);
        view.updateState(next);
        setTick(n => n + 1);
        if (tr.docChanged) save(next);
      },
    });
    viewRef.current = view;
    view.focus();
    return () => { view.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInsertTable = useCallback((rows: number, cols: number) => {
    const v = viewRef.current;
    if (!v) return;
    insertTable(rows, cols)(v.state, v.dispatch);
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

  return (
    <div className="flex flex-col h-screen">
      <MenuBar viewRef={viewRef} schema={mySchema} />
      <Toolbar
        viewRef={viewRef}
        schema={mySchema}
        onInsertTable={handleInsertTable}
        onLinkAdd={handleLinkAdd}
        tick={tick}
      />
      <div className="editor-shell">
        <TableContextMenu viewRef={viewRef}>
          <div className="pm-page" ref={editorRef} />
        </TableContextMenu>
      </div>
    </div>
  );
}
