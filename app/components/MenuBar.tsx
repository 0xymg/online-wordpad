"use client";

import { useRef } from "react";
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
import {
  addColumnAfter, addColumnBefore, addRowAfter, addRowBefore,
  deleteColumn, deleteRow, deleteTable,
  mergeCells, splitCell, toggleHeaderRow, toggleHeaderColumn,
} from "prosemirror-tables";
import { setTextAlign, adjustIndent } from "@/lib/editor-commands";
import { SidebarSimple, SignIn, SignOut, House, PencilSimple } from "@phosphor-icons/react";
import { toast } from "./toast";
import { useT, useLocale } from "./I18nProvider";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  onShowHome: () => void;
  onSave: () => void;
  onCopyLink: () => void;
  onRenameDoc: () => void;
  onDeleteDoc: () => void;
  onReplace: () => void;
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
const LINE_SPACINGS: Array<{ key: "single" | "num" | "double" | "reset"; num?: string; value: number | null }> = [
  { key: "single", value: 1 },
  { key: "num", num: "1.15", value: 1.15 },
  { key: "num", num: "1.5", value: 1.5 },
  { key: "double", value: 2 },
  { key: "reset", value: null },
];

function SidebarBtn({ onClick, className, label }: { onClick: () => void; className?: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded shrink-0 text-foreground/70 hover:bg-accent hover:text-accent-foreground transition-colors",
        className
      )}
    >
      <SidebarSimple size={18} />
    </button>
  );
}

/** Back to the start screen — documents, templates, and recent files. */
function HomeBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
    >
      <House size={17} weight="regular" />
    </button>
  );
}

const SPELL_LANGS: Array<{ value: string; label: string }> = [
  { value: "auto", label: "" }, // filled from the dictionary at render time
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
  docTitle, onTitleChange, onNewDoc, onShowHome, onNewFromTemplate, onOpenFile, onExport,
  onSave, onCopyLink, onRenameDoc, onDeleteDoc, onReplace,
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
  const t = useT();
  const { locale, setLocale } = useLocale();
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
      toast.warning(t.toast.pasteBlocked);
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
      toast.warning(t.toast.pastePlainBlocked);
    }
  };

  const print = () => onPrint?.();

  const TRIGGER = "text-sm font-normal px-0 py-1 h-7";

  // Signed-in users get the start screen; guests have no document library, so
  // Home simply takes them to the landing page.
  const titleInputRef = useRef<HTMLInputElement>(null);

  const goHome = () => {
    if (user) onShowHome();
    else window.location.href = "/";
  };

  return (
    <div className="border-b border-border bg-card">
      {/* Top bar: brand on the left, document title centered, account on the right */}
      <div className="relative flex h-9 items-center border-b border-border/60 px-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {canUseSidebar && <SidebarBtn onClick={onToggleSidebar} label={t.header.toggleSidebar} />}
          <span className="font-brand shrink-0 select-none leading-none">
            <span className="text-lg font-bold tracking-tight text-foreground dark:text-[#FFFFE3]">EDTR</span>
            <span className="text-sm font-semibold tracking-wider text-muted-foreground dark:text-[#FFFFE3]/70">PAD</span>
          </span>
        </div>
        <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center">
          <div className="group pointer-events-auto flex items-center">
            <input
              ref={titleInputRef}
              value={docTitle}
              onChange={(e) => onTitleChange(e.target.value)}
              onFocus={(e) => e.target.select()}
              spellCheck={false}
              aria-label={t.header.documentTitle}
              className="w-[220px] max-w-[42vw] truncate rounded border border-transparent bg-transparent px-2 py-0.5 text-center text-[13px] text-foreground/80 outline-none hover:border-border focus:border-border focus:bg-background"
            />
            <button
              type="button"
              aria-label={t.header.renameDocument}
              onClick={() => { titleInputRef.current?.focus(); titleInputRef.current?.select(); }}
              className="ml-0.5 rounded p-1 text-muted-foreground opacity-60 transition-opacity hover:bg-accent hover:text-foreground group-focus-within:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <PencilSimple size={13} />
            </button>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Select value={locale} onValueChange={(v) => setLocale(v as typeof locale)}>
            <SelectTrigger
              size="sm"
              aria-label={t.locale.label}
              title={t.locale.label}
              className="h-6 border-transparent bg-transparent px-1.5 text-[11px] text-foreground/70 shadow-none hover:border-border hover:bg-background"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {LOCALES.map((code) => (
                <SelectItem key={code} value={code} className="text-xs">
                  {LOCALE_NAMES[code]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {user ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title={user.name}
                  aria-label={t.header.account}
                  className="flex h-6 w-6 select-none items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
                >
                  {user.initials}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={6} className="w-48 p-1">
                <div className="px-2 py-1.5">
                  <div className="truncate text-sm font-medium">{user.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{t.header.freePlan}</div>
                </div>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <SignOut size={15} /> {t.header.logOut}
                </button>
              </PopoverContent>
            </Popover>
          ) : (
            <button
              type="button"
              onClick={onLogin}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <SignIn size={13} /> {t.header.logIn}
            </button>
          )}
        </div>
      </div>
      {/* Menu row */}
      <Menubar className="h-8 rounded-none border-0 bg-transparent px-0">
      <div className="max-w-[800px] w-full mx-auto flex items-center gap-[15px]">
      <HomeBtn onClick={goHome} label={t.header.home} />
      {/* File */}
      <MenubarMenu>
        <MenubarTrigger className={TRIGGER}>{t.menu.file}</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={goHome}>{t.file.home}</MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={onNewDoc}>{t.file.new}</MenubarItem>
          <MenubarSub>
            <MenubarSubTrigger>{t.file.newFromTemplate}</MenubarSubTrigger>
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
            {t.file.open} <MenubarShortcut>Ctrl+O</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={onSave}>
            {t.file.saveNow} <MenubarShortcut>Ctrl+S</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={onShowVersions}>{t.file.versionHistory}</MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={onRenameDoc}>{t.file.rename}</MenubarItem>
          <MenubarItem onClick={onCopyLink}>{t.file.copyLink}</MenubarItem>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>{t.file.export}</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem onClick={() => onExport("docx")}>{t.file.exportDocx}</MenubarItem>
              <MenubarItem onClick={() => onExport("rtf")}>{t.file.exportRtf}</MenubarItem>
              <MenubarItem onClick={() => onExport("html")}>{t.file.exportHtml}</MenubarItem>
              <MenubarItem onClick={() => onExport("md")}>{t.file.exportMd}</MenubarItem>
              <MenubarItem onClick={() => onExport("txt")}>{t.file.exportTxt}</MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarCheckboxItem checked={printHeaderFooter} onClick={onTogglePrintHeaderFooter}>
            {t.file.printHeaderFooter}
          </MenubarCheckboxItem>
          <MenubarItem onClick={print}>
            {t.file.print} <MenubarShortcut>Ctrl+P</MenubarShortcut>
          </MenubarItem>
          {/* Browsers only expose PDF export through the print dialog, so this
              opens print and says where to find it rather than pretending. */}
          <MenubarItem
            onClick={() => {
              toast(t.toast.pdfHint);
              print();
            }}
          >
            {t.file.saveAsPdf}
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem variant="destructive" onClick={onDeleteDoc}>
            {t.file.deleteDoc}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Edit */}
      <MenubarMenu>
        <MenubarTrigger className={TRIGGER}>{t.menu.edit}</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={() => cmd(undo)}>
            {t.edit.undo} <MenubarShortcut>Ctrl+Z</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => cmd(redo)}>
            {t.edit.redo} <MenubarShortcut>Ctrl+Y</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => cutOrCopy("cut")}>
            {t.edit.cut} <MenubarShortcut>Ctrl+X</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => cutOrCopy("copy")}>
            {t.edit.copy} <MenubarShortcut>Ctrl+C</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={pasteFromClipboard}>
            {t.edit.paste} <MenubarShortcut>Ctrl+V</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={pastePlainFromClipboard}>
            {t.edit.pastePlain} <MenubarShortcut>Ctrl+Shift+V</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={onFind}>
            {t.edit.find} <MenubarShortcut>Ctrl+F</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={onReplace}>
            {t.edit.replace} <MenubarShortcut>Ctrl+H</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => {
            const v = viewRef.current;
            if (!v) return;
            const { tr, doc } = v.state;
            v.dispatch(tr.setSelection(new AllSelection(doc)));
            v.focus();
          }}>
            {t.edit.selectAll} <MenubarShortcut>Ctrl+A</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* View */}
      <MenubarMenu>
        <MenubarTrigger className={TRIGGER}>{t.menu.view}</MenubarTrigger>
        <MenubarContent>
          <MenubarSub>
            <MenubarSubTrigger>{t.view.zoom}</MenubarSubTrigger>
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
            {t.view.toolbar}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem checked={showRuler} onClick={onToggleRuler}>
            {t.view.ruler}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem checked={spellcheckOn} onClick={onToggleSpellcheck}>
            {t.view.spellcheck}
          </MenubarCheckboxItem>
          <MenubarSub>
            <MenubarSubTrigger>{t.locale.label}</MenubarSubTrigger>
            <MenubarSubContent>
              {LOCALES.map((code) => (
                <MenubarCheckboxItem
                  key={code}
                  checked={locale === code}
                  onClick={() => setLocale(code)}
                >
                  {LOCALE_NAMES[code]}
                </MenubarCheckboxItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger>{t.view.spellcheckLanguage}</MenubarSubTrigger>
            <MenubarSubContent>
              {SPELL_LANGS.map((l) => (
                <MenubarCheckboxItem key={l.value} checked={spellLang === l.value} onClick={() => onSpellLangChange(l.value)}>
                  {l.value === "auto" ? t.view.automatic : l.label}
                </MenubarCheckboxItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>
          <MenubarCheckboxItem checked={isDark} onClick={onToggleDark}>
            {t.view.darkMode}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem checked={focusMode} onClick={onToggleFocusMode}>
            {t.view.focusMode}
          </MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarCheckboxItem checked={readingAloud} onClick={onToggleReadAloud}>
            {t.view.readAloud}
          </MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarItem
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen?.();
              else document.documentElement.requestFullscreen?.();
            }}
          >
            {t.view.fullScreen} <MenubarShortcut>F11</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Insert */}
      <MenubarMenu>
        <MenubarTrigger className={TRIGGER}>{t.menu.insert}</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={onLinkAdd}>
            {t.insert.link} <MenubarShortcut>Ctrl+K</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={onImageAdd}>{t.insert.pictureFile}</MenubarItem>
          <MenubarItem onClick={onImageUrlAdd}>{t.insert.pictureUrl}</MenubarItem>
          <MenubarItem onClick={() => onInsertTable(3, 3)}>{`${t.insert.table} (${t.tableMenu.rowsByCols(3, 3)})`}</MenubarItem>
          <MenubarItem onClick={onInsertTOC}>{t.insert.tableOfContents}</MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={onInsertDivider}>{t.insert.horizontalLine}</MenubarItem>
          <MenubarItem onClick={onPageBreakAdd}>{t.insert.pageBreak}</MenubarItem>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>{t.insert.symbol}</MenubarSubTrigger>
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
          <MenubarItem onClick={onInsertDate}>{t.insert.dateTime}</MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Format */}
      <MenubarMenu>
        <MenubarTrigger className={TRIGGER}>{t.menu.format}</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={() => cmd(toggleMark(schema.marks.strong))}>
            {t.format.bold} <MenubarShortcut>Ctrl+B</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => cmd(toggleMark(schema.marks.em))}>
            {t.format.italic} <MenubarShortcut>Ctrl+I</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => cmd(toggleMark(schema.marks.underline))}>
            {t.format.underline} <MenubarShortcut>Ctrl+U</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => cmd(toggleMark(schema.marks.strikethrough))}>
            {t.format.strikethrough}
          </MenubarItem>
          <MenubarItem onClick={() => cmd(toggleMark(schema.marks.superscript))}>
            {t.format.superscript} <MenubarShortcut>Ctrl+.</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => cmd(toggleMark(schema.marks.subscript))}>
            {t.format.subscript} <MenubarShortcut>Ctrl+,</MenubarShortcut>
          </MenubarItem>
          <MenubarSub>
            <MenubarSubTrigger>{t.format.changeCase}</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem onClick={() => onChangeCase("sentence")}>{t.format.sentenceCase}</MenubarItem>
              <MenubarItem onClick={() => onChangeCase("lower")}>{t.format.lowercase}</MenubarItem>
              <MenubarItem onClick={() => onChangeCase("upper")}>{t.format.uppercase}</MenubarItem>
              <MenubarItem onClick={() => onChangeCase("title")}>{t.format.titleCase}</MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>{t.format.textColor}</MenubarSubTrigger>
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
              <MenubarItem onClick={() => removeColor("textColor")}>{t.format.automatic}</MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger>{t.format.highlight}</MenubarSubTrigger>
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
              <MenubarItem onClick={() => removeColor("bgColor")}>{t.format.noHighlight}</MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>{t.format.align}</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem onClick={() => setTextAlign(viewRef.current, schema, "left")}>
                {t.format.alignLeft} <MenubarShortcut>Ctrl+Shift+L</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={() => setTextAlign(viewRef.current, schema, "center")}>
                {t.format.alignCenter} <MenubarShortcut>Ctrl+Shift+E</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={() => setTextAlign(viewRef.current, schema, "right")}>
                {t.format.alignRight} <MenubarShortcut>Ctrl+Shift+R</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={() => setTextAlign(viewRef.current, schema, "justify")}>
                {t.format.alignJustify} <MenubarShortcut>Ctrl+Shift+J</MenubarShortcut>
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarItem onClick={() => adjustIndent(viewRef.current, schema, 1)}>
            {t.format.increaseIndent} <MenubarShortcut>Tab</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => adjustIndent(viewRef.current, schema, -1)}>
            {t.format.decreaseIndent} <MenubarShortcut>Shift+Tab</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => cmd(wrapInList(schema.nodes.bullet_list))}>
            {t.format.bulletList}
          </MenubarItem>
          <MenubarItem onClick={() => cmd(wrapInList(schema.nodes.ordered_list))}>
            {t.format.numberedList}
          </MenubarItem>
          <MenubarSub>
            <MenubarSubTrigger>{t.format.lineSpacing}</MenubarSubTrigger>
            <MenubarSubContent>
              {LINE_SPACINGS.map((ls) => {
                const label =
                  ls.key === "single" ? `${t.format.single} (1.0)`
                  : ls.key === "double" ? "2.0"
                  : ls.key === "reset" ? t.format.default
                  : ls.num!;
                return (
                  <MenubarItem key={label} onClick={() => onLineSpacing(ls.value)}>
                    {label}
                  </MenubarItem>
                );
              })}
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem onClick={onClearFormatting}>
            {t.format.clearFormatting}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Table */}
      <MenubarMenu>
        <MenubarTrigger className={TRIGGER}>{t.menu.table}</MenubarTrigger>
        <MenubarContent>
          <MenubarSub>
            <MenubarSubTrigger>{t.tableMenu.insertTable}</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem onClick={() => onInsertTable(2, 2)}>{t.tableMenu.rowsByCols(2, 2)}</MenubarItem>
              <MenubarItem onClick={() => onInsertTable(3, 3)}>{t.tableMenu.rowsByCols(3, 3)}</MenubarItem>
              <MenubarItem onClick={() => onInsertTable(4, 4)}>{t.tableMenu.rowsByCols(4, 4)}</MenubarItem>
              <MenubarItem onClick={() => onInsertTable(5, 3)}>{t.tableMenu.rowsByCols(5, 3)}</MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem onClick={() => cmd(addRowBefore)}>{t.tableMenu.rowAbove}</MenubarItem>
          <MenubarItem onClick={() => cmd(addRowAfter)}>{t.tableMenu.rowBelow}</MenubarItem>
          <MenubarItem onClick={() => cmd(addColumnBefore)}>{t.tableMenu.columnLeft}</MenubarItem>
          <MenubarItem onClick={() => cmd(addColumnAfter)}>{t.tableMenu.columnRight}</MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => cmd(mergeCells)}>{t.tableMenu.mergeCells}</MenubarItem>
          <MenubarItem onClick={() => cmd(splitCell)}>{t.tableMenu.splitCell}</MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => cmd(toggleHeaderRow)}>{t.tableMenu.toggleHeaderRow}</MenubarItem>
          <MenubarItem onClick={() => cmd(toggleHeaderColumn)}>{t.tableMenu.toggleHeaderColumn}</MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => cmd(deleteRow)}>{t.tableMenu.deleteRow}</MenubarItem>
          <MenubarItem onClick={() => cmd(deleteColumn)}>{t.tableMenu.deleteColumn}</MenubarItem>
          <MenubarItem variant="destructive" onClick={() => cmd(deleteTable)}>{t.tableMenu.deleteTable}</MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Help */}
      <MenubarMenu>
        <MenubarTrigger className={TRIGGER}>{t.menu.help}</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={onShowShortcuts}>{t.help.shortcuts}</MenubarItem>
          <MenubarSeparator />
          <MenubarItem
            onClick={() =>
              toast(t.help.aboutText, { position: "top", duration: 6000 })
            }
          >
            {t.help.about}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      </div>
      </Menubar>
    </div>
  );
}
