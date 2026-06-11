"use client";

import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { EditorView } from "prosemirror-view";
import { undo, redo } from "prosemirror-history";
import { toggleMark } from "prosemirror-commands";
import { wrapInList } from "prosemirror-schema-list";
import { EditorState, Transaction, AllSelection } from "prosemirror-state";
import { DOMSerializer } from "prosemirror-model";
import { addColumnAfter, addRowAfter, deleteColumn, deleteRow, deleteTable } from "prosemirror-tables";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { SidebarSimple } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface MenuBarProps {
  viewRef: React.MutableRefObject<EditorView | null>;
  schema: any;
  pageMarginCm?: number;
  onPrint?: () => void;
  docTitle: string;
  onTitleChange: (title: string) => void;
  onFind: () => void;
  onInsertTable: (rows: number, cols: number) => void;
  onPageBreakAdd: () => void;
  onLinkAdd: () => void;
  onImageAdd: () => void;
  onInsertDivider: () => void;
  onInsertSymbol: (text: string) => void;
  onInsertDate: () => void;
  onLineSpacing: (lineHeight: number | null) => void;
  onClearFormatting: () => void;
  zoomPercent: number;
  onZoomChange: (zoom: number) => void;
  showToolbar: boolean;
  onToggleToolbar: () => void;
  showRuler: boolean;
  onToggleRuler: () => void;
  isDark: boolean;
  onToggleDark: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const TEXT_COLORS = ["#000000", "#e11d48", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#7c3aed", "#6b7280"];
const HIGHLIGHTS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa", "#e9d5ff"];
const SYMBOLS = ["©", "®", "™", "§", "¶", "•", "–", "—", "…", "€", "£", "¥", "°", "±", "×", "÷", "≈", "≠", "≤", "≥", "→", "←", "↑", "↓", "✓", "★"];
const ZOOM_LEVELS = [50, 75, 90, 100, 110, 125, 150];
const LINE_SPACINGS: Array<{ label: string; value: number | null }> = [
  { label: "Single (1.0)", value: 1 },
  { label: "1.15", value: 1.15 },
  { label: "1.5", value: 1.5 },
  { label: "Double (2.0)", value: 2 },
  { label: "Reset", value: null },
];

export default function MenuBar({
  viewRef, schema, pageMarginCm = 1, onPrint,
  docTitle, onTitleChange, onFind,
  onInsertTable, onPageBreakAdd, onLinkAdd, onImageAdd,
  onInsertDivider, onInsertSymbol, onInsertDate,
  onLineSpacing, onClearFormatting,
  zoomPercent, onZoomChange,
  showToolbar, onToggleToolbar, showRuler, onToggleRuler,
  isDark, onToggleDark,
  sidebarOpen, onToggleSidebar,
}: MenuBarProps) {
  const SidebarBtn = ({ className }: { className?: string }) => (
    <button
      type="button"
      onClick={onToggleSidebar}
      title="Toggle sidebar"
      aria-label="Toggle sidebar"
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded shrink-0 text-foreground/70 hover:bg-accent hover:text-accent-foreground transition-colors",
        className
      )}
    >
      <SidebarSimple size={18} />
    </button>
  );
  const cmd = (command: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean) => {
    const v = viewRef.current;
    if (!v) return;
    command(v.state, v.dispatch);
    v.focus();
  };

  const applyColor = (markName: "textColor" | "bgColor", color: string) => {
    const v = viewRef.current;
    if (!v || v.state.selection.empty) return;
    const mt = schema.marks[markName];
    const tr = v.state.tr;
    v.state.selection.ranges.forEach(({ $from, $to }: any) => {
      tr.removeMark($from.pos, $to.pos, mt);
      tr.addMark($from.pos, $to.pos, mt.create({ color }));
    });
    v.dispatch(tr); v.focus();
  };

  const removeColor = (markName: "textColor" | "bgColor") => {
    const v = viewRef.current;
    if (!v || v.state.selection.empty) return;
    const mt = schema.marks[markName];
    const tr = v.state.tr;
    v.state.selection.ranges.forEach(({ $from, $to }: any) => tr.removeMark($from.pos, $to.pos, mt));
    v.dispatch(tr); v.focus();
  };

  const safeName = (ext: string) =>
    `${(docTitle || "document").replace(/[^\w.\- ]+/g, "").trim() || "document"}.${ext}`;

  const newDoc = () => {
    if (!confirm("The current document will be deleted. Continue?")) return;
    localStorage.removeItem("wordpad-content-pm");
    window.location.reload();
  };

  const saveAsHtml = () => {
    const v = viewRef.current;
    if (!v) return;
    const s = DOMSerializer.fromSchema(schema);
    const frag = s.serializeFragment(v.state.doc.content);
    const tmp = document.createElement("div");
    tmp.appendChild(frag);
    const blob = new Blob([`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${docTitle}</title></head><body style="font-family:Arial;max-width:800px;margin:40px auto;padding:20px">${tmp.innerHTML}</body></html>`], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = safeName("html");
    a.click();
  };

  const saveAsTxt = () => {
    const v = viewRef.current;
    if (!v) return;
    const text = v.state.doc.textContent;
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = safeName("txt");
    a.click();
  };

  const saveAsDocx = async () => {
    const v = viewRef.current;
    if (!v) return;

    const text = v.state.doc.textBetween(0, v.state.doc.content.size, "\n\n", "\n");
    const lines = text.split("\n");

    const doc = new Document({
      sections: [
        {
          children: lines.length
            ? lines.map((line) => new Paragraph({ children: [new TextRun(line)] }))
            : [new Paragraph("")],
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = safeName("docx");
    a.click();
  };

  const print = () => onPrint?.();

  const TRIGGER = "text-sm font-normal px-0 py-1 h-7";

  return (
    <Menubar className="relative rounded-none border-x-0 border-t-0 border-b border-border bg-card h-8 px-0">
      {/* Brand + document title — sits in the left gutter beside the centered 800px menu box.
          Shown only when the gutter is wide enough to fit it without overlapping the menus. */}
      <div
        className="hidden min-[1180px]:flex absolute left-3 top-0 bottom-0 items-center gap-1 overflow-hidden"
        style={{ right: "calc(50% + 412px)" }}
      >
        {sidebarOpen && <SidebarBtn />}
        <span className="font-brand shrink-0 select-none leading-none">
          <span className="text-lg font-bold tracking-tight text-foreground">EDTR</span>
          <span className="text-sm font-semibold tracking-wider text-muted-foreground">PAD</span>
        </span>
        <input
          value={docTitle}
          onChange={(e) => onTitleChange(e.target.value)}
          onFocus={(e) => e.target.select()}
          spellCheck={false}
          aria-label="Document title"
          className="min-w-0 flex-1 rounded px-2 py-0.5 text-sm text-foreground/80 bg-transparent border border-transparent hover:border-border focus:border-border focus:bg-background outline-none truncate"
        />
      </div>
      {/* Menus — left-aligned inside a centered 800px box, 5px gap, no side padding */}
      <div className="max-w-[800px] w-full mx-auto flex items-center gap-[5px]">
      {/* Sidebar toggle — left of File when collapsed (or when the gutter is hidden) */}
      <SidebarBtn className={sidebarOpen ? "min-[1180px]:hidden" : undefined} />
      {/* File */}
      <MenubarMenu>
        <MenubarTrigger className={TRIGGER}>File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={newDoc}>
            New <MenubarShortcut>Ctrl+N</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>Export</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem onClick={saveAsHtml}>Save as HTML</MenubarItem>
              <MenubarItem onClick={saveAsTxt}>Plain text (.txt)</MenubarItem>
              <MenubarItem onClick={saveAsDocx}>Word (.docx)</MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem onClick={print}>
            Print <MenubarShortcut>Ctrl+P</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Edit */}
      <MenubarMenu>
        <MenubarTrigger className={TRIGGER}>Edit</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={() => cmd(undo)}>
            Undo <MenubarShortcut>Ctrl+Z</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => cmd(redo)}>
            Redo <MenubarShortcut>Ctrl+Y</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => document.execCommand("cut")}>
            Cut <MenubarShortcut>Ctrl+X</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => document.execCommand("copy")}>
            Copy <MenubarShortcut>Ctrl+C</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => document.execCommand("paste")}>
            Paste <MenubarShortcut>Ctrl+V</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={onFind}>
            Find <MenubarShortcut>Ctrl+F</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={onFind}>
            Replace <MenubarShortcut>Ctrl+H</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => {
            const v = viewRef.current;
            if (!v) return;
            const { tr, doc } = v.state;
            v.dispatch(tr.setSelection(new AllSelection(doc)));
            v.focus();
          }}>
            Select All <MenubarShortcut>Ctrl+A</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* View */}
      <MenubarMenu>
        <MenubarTrigger className={TRIGGER}>View</MenubarTrigger>
        <MenubarContent>
          <MenubarSub>
            <MenubarSubTrigger>Zoom</MenubarSubTrigger>
            <MenubarSubContent>
              {ZOOM_LEVELS.map((z) => (
                <MenubarCheckboxItem key={z} checked={zoomPercent === z} onClick={() => onZoomChange(z)}>
                  {z}%
                </MenubarCheckboxItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarCheckboxItem checked={showToolbar} onClick={onToggleToolbar}>
            Toolbar
          </MenubarCheckboxItem>
          <MenubarCheckboxItem checked={showRuler} onClick={onToggleRuler}>
            Ruler
          </MenubarCheckboxItem>
          <MenubarCheckboxItem checked={isDark} onClick={onToggleDark}>
            Dark mode
          </MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => document.documentElement.requestFullscreen?.()}>
            Full Screen <MenubarShortcut>F11</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={print}>Print Preview</MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Insert */}
      <MenubarMenu>
        <MenubarTrigger className={TRIGGER}>Insert</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={onLinkAdd}>Link</MenubarItem>
          <MenubarItem onClick={onImageAdd}>Picture</MenubarItem>
          <MenubarItem onClick={() => onInsertTable(3, 3)}>Table (3 × 3)</MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={onInsertDivider}>Horizontal line</MenubarItem>
          <MenubarItem onClick={onPageBreakAdd}>Page break</MenubarItem>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>Symbol</MenubarSubTrigger>
            <MenubarSubContent className="min-w-0">
              <div className="grid grid-cols-6 gap-0.5 p-1">
                {SYMBOLS.map((sym) => (
                  <button key={sym} type="button"
                    onClick={() => onInsertSymbol(sym)}
                    className="h-7 w-7 rounded text-sm hover:bg-accent hover:text-accent-foreground">
                    {sym}
                  </button>
                ))}
              </div>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarItem onClick={onInsertDate}>Date &amp; time</MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Format */}
      <MenubarMenu>
        <MenubarTrigger className={TRIGGER}>Format</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={() => cmd(toggleMark(schema.marks.strong))}>
            Bold <MenubarShortcut>Ctrl+B</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => cmd(toggleMark(schema.marks.em))}>
            Italic <MenubarShortcut>Ctrl+I</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => cmd(toggleMark(schema.marks.underline))}>
            Underline <MenubarShortcut>Ctrl+U</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => cmd(toggleMark(schema.marks.strikethrough))}>
            Strikethrough
          </MenubarItem>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>Text color</MenubarSubTrigger>
            <MenubarSubContent className="min-w-0">
              <div className="grid grid-cols-4 gap-1 p-1.5">
                {TEXT_COLORS.map((c) => (
                  <button key={c} type="button" title={c}
                    onClick={() => applyColor("textColor", c)}
                    className="h-6 w-6 rounded border border-black/10"
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              <MenubarSeparator />
              <MenubarItem onClick={() => removeColor("textColor")}>Automatic</MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger>Highlight</MenubarSubTrigger>
            <MenubarSubContent className="min-w-0">
              <div className="grid grid-cols-3 gap-1 p-1.5">
                {HIGHLIGHTS.map((c) => (
                  <button key={c} type="button" title={c}
                    onClick={() => applyColor("bgColor", c)}
                    className="h-6 w-6 rounded border border-black/10"
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              <MenubarSeparator />
              <MenubarItem onClick={() => removeColor("bgColor")}>No highlight</MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem onClick={() => cmd(wrapInList(schema.nodes.bullet_list))}>
            Bullet list
          </MenubarItem>
          <MenubarItem onClick={() => cmd(wrapInList(schema.nodes.ordered_list))}>
            Numbered list
          </MenubarItem>
          <MenubarSub>
            <MenubarSubTrigger>Line spacing</MenubarSubTrigger>
            <MenubarSubContent>
              {LINE_SPACINGS.map((ls) => (
                <MenubarItem key={ls.label} onClick={() => onLineSpacing(ls.value)}>
                  {ls.label}
                </MenubarItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem onClick={onClearFormatting}>
            Clear formatting
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Table */}
      <MenubarMenu>
        <MenubarTrigger className={TRIGGER}>Table</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={() => onInsertTable(3, 3)}>Insert Table (3 × 3)</MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => cmd(addColumnAfter)}>Add Column Right</MenubarItem>
          <MenubarItem onClick={() => cmd(addRowAfter)}>Add Row Below</MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => cmd(deleteColumn)}>Delete Column</MenubarItem>
          <MenubarItem onClick={() => cmd(deleteRow)}>Delete Row</MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => cmd(deleteTable)}>Delete Table</MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Help */}
      <MenubarMenu>
        <MenubarTrigger className={TRIGGER}>Help</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={() => alert("EDTRpad\nProseMirror-based web editor")}>
            About
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      </div>
    </Menubar>
  );
}
