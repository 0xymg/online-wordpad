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
import { addColumnAfter, addRowAfter, deleteColumn, deleteRow, deleteTable } from "prosemirror-tables";
import { SidebarSimple, SignIn, SignOut } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { TEMPLATES } from "@/lib/templates";

interface MenuBarProps {
  viewRef: React.MutableRefObject<EditorView | null>;
  schema: any;
  pageMarginCm?: number;
  onPrint?: () => void;
  docTitle: string;
  onTitleChange: (title: string) => void;
  onNewDoc: () => void;
  onNewFromTemplate: (t: { name: string; html: string }) => void;
  onOpenFile: () => void;
  onExport: (fmt: "html" | "txt" | "docx" | "rtf" | "md") => void;
  onShowVersions: () => void;
  onShowShortcuts: () => void;
  onFind: () => void;
  onInsertTable: (rows: number, cols: number) => void;
  onPageBreakAdd: () => void;
  onLinkAdd: () => void;
  onImageAdd: () => void;
  onImageUrlAdd: () => void;
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
  spellcheckOn: boolean;
  onToggleSpellcheck: () => void;
  spellLang: string;
  onSpellLangChange: (lang: string) => void;
  onChangeCase: (kind: "upper" | "lower" | "title" | "sentence") => void;
  onInsertTOC: () => void;
  readingAloud: boolean;
  onToggleReadAloud: () => void;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  printHeaderFooter: boolean;
  onTogglePrintHeaderFooter: () => void;
  isDark: boolean;
  onToggleDark: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  canUseSidebar: boolean;
  user: { name: string; initials: string } | null;
  onLogin: () => void;
  onLogout: () => void;
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

function SidebarBtn({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
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
}

const SPELL_LANGS: Array<{ value: string; label: string }> = [
  { value: "auto", label: "Automatic" },
  { value: "en", label: "English" },
  { value: "tr", label: "Türkçe" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "pt", label: "Português" },
  { value: "it", label: "Italiano" },
];

export default function MenuBar({
  viewRef, schema, onPrint,
  docTitle, onTitleChange, onNewDoc, onNewFromTemplate, onOpenFile, onExport,
  onShowVersions, onShowShortcuts, onFind,
  onInsertTable, onPageBreakAdd, onLinkAdd, onImageAdd, onImageUrlAdd,
  onInsertDivider, onInsertSymbol, onInsertDate,
  onLineSpacing, onClearFormatting,
  zoomPercent, onZoomChange,
  showToolbar, onToggleToolbar, showRuler, onToggleRuler,
  spellcheckOn, onToggleSpellcheck,
  spellLang, onSpellLangChange,
  onChangeCase, onInsertTOC,
  readingAloud, onToggleReadAloud,
  focusMode, onToggleFocusMode,
  printHeaderFooter, onTogglePrintHeaderFooter,
  isDark, onToggleDark,
  onToggleSidebar,
  canUseSidebar,
  user, onLogin, onLogout,
}: MenuBarProps) {
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

  // Programmatic paste via the async Clipboard API (execCommand("paste") is
  // blocked in modern browsers). Falls back to a hint when permission is denied.
  const pasteFromClipboard = async () => {
    const v = viewRef.current;
    if (!v) return;
    v.focus();
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.includes("text/html")) {
            const html = await (await item.getType("text/html")).text();
            v.pasteHTML(html);
            return;
          }
        }
      }
      const text = await navigator.clipboard.readText();
      if (text) v.pasteText(text);
    } catch {
      alert("Your browser blocked programmatic paste. Press Ctrl+V (⌘V) instead.");
    }
  };

  const cutOrCopy = (command: "cut" | "copy") => {
    const v = viewRef.current;
    if (!v) return;
    v.focus();
    document.execCommand(command);
  };

  const pastePlainFromClipboard = async () => {
    const v = viewRef.current;
    if (!v) return;
    v.focus();
    try {
      const text = await navigator.clipboard.readText();
      if (text) v.pasteText(text);
    } catch {
      alert("Your browser blocked programmatic paste. Press Ctrl+Shift+V (⇧⌘V) instead.");
    }
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
        {canUseSidebar && <SidebarBtn onClick={onToggleSidebar} />}
        <span className="font-brand shrink-0 select-none leading-none">
          <span className="text-lg font-bold tracking-tight text-foreground dark:text-[#FFFFE3]">EDTR</span>
          <span className="text-sm font-semibold tracking-wider text-muted-foreground dark:text-[#FFFFE3]/70">PAD</span>
        </span>
        <input
          value={docTitle}
          onChange={(e) => onTitleChange(e.target.value)}
          onFocus={(e) => e.target.select()}
          spellCheck={false}
          aria-label="Document title"
          className="min-w-0 w-[160px] rounded px-1.5 py-0.5 text-xs text-foreground/70 bg-transparent border border-transparent hover:border-border focus:border-border focus:bg-background outline-none truncate"
        />
      </div>
      {/* Menus — left-aligned inside a centered 800px box, 15px gap, no side padding */}
      <div className="max-w-[800px] w-full mx-auto flex items-center gap-[15px]">
      {/* 800–1179px: trigger + brand live inside the box (gutter too narrow, but brand still in header) */}
      <div className="hidden min-[800px]:flex min-[1180px]:hidden items-center gap-1.5 shrink-0">
        {canUseSidebar && <SidebarBtn onClick={onToggleSidebar} />}
        <span className="font-brand shrink-0 select-none leading-none">
          <span className="text-lg font-bold tracking-tight text-foreground dark:text-[#FFFFE3]">EDTR</span>
          <span className="text-sm font-semibold tracking-wider text-muted-foreground dark:text-[#FFFFE3]/70">PAD</span>
        </span>
      </div>
      {/* <800px: trigger only — brand moves to the status bar */}
      {canUseSidebar && <SidebarBtn onClick={onToggleSidebar} className="min-[800px]:hidden" />}
      {/* File */}
      <MenubarMenu>
        <MenubarTrigger className={TRIGGER}>File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={onNewDoc}>New</MenubarItem>
          <MenubarSub>
            <MenubarSubTrigger>New from template</MenubarSubTrigger>
            <MenubarSubContent>
              {TEMPLATES.map((t) => (
                <MenubarItem key={t.id} onClick={() => onNewFromTemplate({ name: t.name, html: t.html })}>
                  <div>
                    <div>{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.description}</div>
                  </div>
                </MenubarItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>
          <MenubarItem onClick={onOpenFile}>
            Open… <MenubarShortcut>Ctrl+O</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={onShowVersions}>Version history…</MenubarItem>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>Export</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem onClick={() => onExport("docx")}>Word (.docx)</MenubarItem>
              <MenubarItem onClick={() => onExport("rtf")}>Rich Text (.rtf)</MenubarItem>
              <MenubarItem onClick={() => onExport("html")}>Web page (.html)</MenubarItem>
              <MenubarItem onClick={() => onExport("md")}>Markdown (.md)</MenubarItem>
              <MenubarItem onClick={() => onExport("txt")}>Plain text (.txt)</MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarCheckboxItem checked={printHeaderFooter} onClick={onTogglePrintHeaderFooter}>
            Print header &amp; footer
          </MenubarCheckboxItem>
          <MenubarItem onClick={print}>
            Print <MenubarShortcut>Ctrl+P</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={print}>Save as PDF…</MenubarItem>
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
          <MenubarItem onClick={() => cutOrCopy("cut")}>
            Cut <MenubarShortcut>Ctrl+X</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => cutOrCopy("copy")}>
            Copy <MenubarShortcut>Ctrl+C</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={pasteFromClipboard}>
            Paste <MenubarShortcut>Ctrl+V</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={pastePlainFromClipboard}>
            Paste without formatting <MenubarShortcut>Ctrl+Shift+V</MenubarShortcut>
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
          <MenubarCheckboxItem checked={spellcheckOn} onClick={onToggleSpellcheck}>
            Spellcheck
          </MenubarCheckboxItem>
          <MenubarSub>
            <MenubarSubTrigger>Spellcheck language</MenubarSubTrigger>
            <MenubarSubContent>
              {SPELL_LANGS.map((l) => (
                <MenubarCheckboxItem key={l.value} checked={spellLang === l.value} onClick={() => onSpellLangChange(l.value)}>
                  {l.label}
                </MenubarCheckboxItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>
          <MenubarCheckboxItem checked={isDark} onClick={onToggleDark}>
            Dark mode
          </MenubarCheckboxItem>
          <MenubarCheckboxItem checked={focusMode} onClick={onToggleFocusMode}>
            Focus mode
          </MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarCheckboxItem checked={readingAloud} onClick={onToggleReadAloud}>
            Read aloud
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
          <MenubarItem onClick={onLinkAdd}>
            Link <MenubarShortcut>Ctrl+K</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={onImageAdd}>Picture from file…</MenubarItem>
          <MenubarItem onClick={onImageUrlAdd}>Picture from URL…</MenubarItem>
          <MenubarItem onClick={() => onInsertTable(3, 3)}>Table (3 × 3)</MenubarItem>
          <MenubarItem onClick={onInsertTOC}>Table of contents</MenubarItem>
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
          <MenubarItem onClick={() => cmd(toggleMark(schema.marks.superscript))}>
            Superscript <MenubarShortcut>Ctrl+.</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => cmd(toggleMark(schema.marks.subscript))}>
            Subscript <MenubarShortcut>Ctrl+,</MenubarShortcut>
          </MenubarItem>
          <MenubarSub>
            <MenubarSubTrigger>Change case</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem onClick={() => onChangeCase("sentence")}>Sentence case</MenubarItem>
              <MenubarItem onClick={() => onChangeCase("lower")}>lowercase</MenubarItem>
              <MenubarItem onClick={() => onChangeCase("upper")}>UPPERCASE</MenubarItem>
              <MenubarItem onClick={() => onChangeCase("title")}>Title Case</MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
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
          <MenubarItem onClick={onShowShortcuts}>Keyboard shortcuts</MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => alert("EDTRpad — Online WordPad\nFree word processor in your browser.\nhttps://wordpad.info")}>
            About
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <div className="ml-auto flex items-center">
        {user ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                title={user.name}
                aria-label="Account"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-semibold select-none"
              >
                {user.initials}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={6} className="w-48 p-1">
              <div className="px-2 py-1.5">
                <div className="truncate text-sm font-medium">{user.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">Free plan</div>
              </div>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                onClick={onLogout}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <SignOut size={15} /> Log out
              </button>
            </PopoverContent>
          </Popover>
        ) : (
          <button
            type="button"
            onClick={onLogin}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <SignIn size={13} /> Log in
          </button>
        )}
      </div>
      </div>

    </Menubar>
  );
}
