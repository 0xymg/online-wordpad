"use client";

import { memo, useCallback, useState, useEffect, lazy, Suspense } from "react";
import { EditorView } from "prosemirror-view";
import { EditorState, Transaction, TextSelection } from "prosemirror-state";
import { toggleMark, setBlockType, wrapIn } from "prosemirror-commands";
import { wrapInList } from "prosemirror-schema-list";
import { setTextAlign as applyTextAlign, adjustIndent as applyIndent } from "@/lib/editor-commands";
import { undo, redo } from "prosemirror-history";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import ColorPicker from "./ColorPicker";
import { ensureEditorFont } from "@/lib/editor-fonts";
import { useT } from "./I18nProvider";
import type { EmojiClickData } from "emoji-picker-react";

// Emoji picker is a large chunk — load it only when the popover opens.
const EmojiPicker = lazy(() => import("emoji-picker-react"));
import {
  ArrowCounterClockwise, ArrowClockwise,
  TextB, TextItalic, TextUnderline, TextStrikethrough,
  TextAlignLeft, TextAlignCenter, TextAlignRight, TextAlignJustify,
  ListBullets, ListNumbers, TextOutdent, TextIndent,
  Link, Quotes, Table, TextT, Highlighter, Smiley, ImageSquare, Minus, Code,
} from "./icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/* ── Constants ─────────────────────────────────────────────────────────── */
const GRID_ROWS = 8;
const GRID_COLS = 10;

const FONTS = [
  { label: "Arial",             value: "Arial, sans-serif" },
  { label: "Times New Roman",   value: "'Times New Roman', serif" },
  { label: "Courier New",       value: "'Courier New', monospace" },
  { label: "Georgia",           value: "Georgia, serif" },
  { label: "Verdana",           value: "Verdana, sans-serif" },
  { label: "Tahoma",            value: "Tahoma, sans-serif" },
  { label: "Trebuchet MS",      value: "'Trebuchet MS', sans-serif" },
  { label: "Inter",             value: "'Inter', sans-serif" },
  { label: "Roboto",            value: "'Roboto', sans-serif" },
  { label: "Open Sans",         value: "'Open Sans', sans-serif" },
  { label: "Lato",              value: "'Lato', sans-serif" },
  { label: "Montserrat",        value: "'Montserrat', sans-serif" },
  { label: "Raleway",           value: "'Raleway', sans-serif" },
  { label: "Nunito",            value: "'Nunito', sans-serif" },
  { label: "Poppins",           value: "'Poppins', sans-serif" },
  { label: "Josefin Sans",      value: "'Josefin Sans', sans-serif" },
  { label: "Oswald",            value: "'Oswald', sans-serif" },
  { label: "Playfair Display",  value: "'Playfair Display', serif" },
  { label: "Merriweather",      value: "'Merriweather', serif" },
  { label: "PT Serif",          value: "'PT Serif', serif" },
  { label: "Libre Baskerville", value: "'Libre Baskerville', serif" },
  { label: "Crimson Text",      value: "'Crimson Text', serif" },
  { label: "Source Code Pro",   value: "'Source Code Pro', monospace" },
  { label: "Dancing Script",    value: "'Dancing Script', cursive" },
  { label: "Pacifico",          value: "'Pacifico', cursive" },
  { label: "Lobster",           value: "'Lobster', cursive" },
  { label: "Caveat",            value: "'Caveat', cursive" },
];

const FONT_SIZES = ["8","9","10","11","12","14","16","18","20","24","28","36","48","72"];

const FONT_GROUPS = [
  { label: "Classic",    fonts: FONTS.slice(0, 7) },
  { label: "Sans-serif", fonts: FONTS.slice(7, 17) },
  { label: "Serif",      fonts: FONTS.slice(17, 22) },
  { label: "Monospace",  fonts: FONTS.slice(22, 23) },
  { label: "Decorative", fonts: FONTS.slice(23) },
];

const BLOCK_VALUES = ["paragraph", "h1", "h2", "h3", "h4", "code_block"] as const;

/** Icon sizes, full-size and compact. The button box stays flex-centred, so a
    smaller icon sits in the same place — nothing else has to move. */
const SZ = 22, SZ_COMPACT = 16;
const SZ_MD = 18, SZ_MD_COMPACT = 13;   // colour-picker glyphs
const SZ_SM = 16, SZ_SM_COMPACT = 12;   // table picker

/* ── Button ─────────────────────────────────────────────────────────────── */
// Sized from --tb-ctl, which the toolbar root sets — that is the whole of the
// compact switch, so the memoized groups never need to know about it.
const BTN = cn(
  "inline-flex items-center justify-center size-(--tb-ctl) rounded cursor-pointer shrink-0",
  "transition-[width,height,color,background-color] duration-300 ease-in-out motion-reduce:transition-none",
  "hover:bg-accent hover:text-accent-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
);

function TBtn({ onClick, active, tip, children }: {
  onClick: () => void; active?: boolean; tip: string; children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* mousedown only prevents focus theft from the editor; the action runs
            on click so keyboard activation (Enter/Space) works too. */}
        <button
          type="button"
          aria-label={tip}
          aria-pressed={active}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          className={cn(BTN, active && "bg-accent text-accent-foreground")}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}

/* ── Row: a horizontal line of buttons inside a group ───────────────────── */
function Row({ children, between }: { children: React.ReactNode; between?: boolean }) {
  return <div className={`flex items-center gap-0.5${between ? " justify-between" : ""}`}>{children}</div>;
}

/* ── Group: stacks rows vertically, label pinned to bottom ──────────────── */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between shrink-0 self-stretch">
      <div className="flex flex-col gap-0.5">{children}</div>
      <span className="text-[9px] leading-none text-center text-muted-foreground tracking-wide select-none pt-(--tb-label-pt,0.25rem) transition-[padding] duration-300 ease-in-out motion-reduce:transition-none">
        {label}
      </span>
    </div>
  );
}

/* ── Vertical separator between groups ──────────────────────────────────── */
function Sep() {
  return <div className="mx-1.5 self-stretch w-px bg-border shrink-0" />;
}

/* ── TablePicker ─────────────────────────────────────────────────────────── */
// Memoized: `onPick` and `t` are stable, so the 80-cell grid is not re-rendered
// on every editor transaction.
const TablePicker = memo(function TablePicker({ onPick, t, sz }: { onPick: (rows: number, cols: number) => void; t: ReturnType<typeof useT>; sz: number }) {
  const [hovered, setHovered] = useState({ r: 0, c: 0 });
  const [open, setOpen] = useState(false);
  const pick = (r: number, c: number) => { setOpen(false); onPick(r, c); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button type="button" aria-label={t.toolbar.insertTable} onMouseDown={(e) => e.preventDefault()} className={cn(BTN, open && "bg-accent text-accent-foreground")}>
              <Table size={sz} />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">{t.toolbar.insertTable}</TooltipContent>
      </Tooltip>
      <PopoverContent side="bottom" align="start" className="w-auto p-2 space-y-1.5"
        onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()}>
        <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1.25rem)` }}
          onMouseLeave={() => setHovered({ r: 0, c: 0 })}>
          {Array.from({ length: GRID_ROWS }, (_, ri) =>
            Array.from({ length: GRID_COLS }, (_, ci) => {
              const active = ri < hovered.r && ci < hovered.c;
              return (
                <button key={`${ri}-${ci}`} type="button"
                  aria-label={t.tableMenu.insertSized(ri + 1, ci + 1)}
                  className={cn("w-5 h-5 border rounded-sm cursor-pointer transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "bg-blue-500 border-blue-600" : "bg-background border-border hover:border-blue-400")}
                  onMouseEnter={() => setHovered({ r: ri + 1, c: ci + 1 })}
                  onFocus={() => setHovered({ r: ri + 1, c: ci + 1 })}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(ri + 1, ci + 1)}
                />
              );
            })
          )}
        </div>
        <p className="text-xs text-center text-muted-foreground">
          {hovered.r > 0 && hovered.c > 0 ? t.tableMenu.rowsByCols(hovered.r, hovered.c) : t.tableMenu.selectSize}
        </p>
      </PopoverContent>
    </Popover>
  );
});

/* ── HistoryGroup ────────────────────────────────────────────────────────── */
// No active-state to mirror — memoized so per-tick renders skip it entirely.
const HistoryGroup = memo(function HistoryGroup({ onUndo, onRedo, t, sz }: {
  onUndo: () => void; onRedo: () => void; t: ReturnType<typeof useT>; sz: number;
}) {
  return (
    <Group label={t.toolbar.groupHistory}>
      <Row>
        <TBtn onClick={onUndo} tip={`${t.edit.undo} (Ctrl+Z)`}><ArrowCounterClockwise size={sz} /></TBtn>
        <TBtn onClick={onRedo} tip={`${t.edit.redo} (Ctrl+Y)`}><ArrowClockwise size={sz} /></TBtn>
      </Row>
    </Group>
  );
});

/* ── InsertGroup ─────────────────────────────────────────────────────────── */
// Static buttons + the emoji popover (lazy chunk) + table grid — none of it
// depends on the selection, so it is memoized out of the per-tick render.
const InsertGroup = memo(function InsertGroup({
  onLinkAdd, onImageAdd, onInsertDivider, onPageBreakAdd, onInsertEmoji, onInsertTable, t, sz,
}: {
  onLinkAdd: () => void;
  onImageAdd: () => void;
  onInsertDivider: () => void;
  onPageBreakAdd: () => void;
  onInsertEmoji: (emojiData: EmojiClickData) => void;
  onInsertTable: (rows: number, cols: number) => void;
  t: ReturnType<typeof useT>;
  sz: number;
}) {
  return (
    <Group label={t.toolbar.groupInsert}>
      {/* Row 1: link image divider pagebreak */}
      <Row>
        <TBtn onClick={onLinkAdd}       tip={t.toolbar.insertLink}>       <Link size={sz} /></TBtn>
        <TBtn onClick={onImageAdd}      tip={t.toolbar.insertImage}>      <ImageSquare size={sz} /></TBtn>
        <TBtn onClick={onInsertDivider} tip={t.toolbar.insertDivider}>    <Minus size={sz} /></TBtn>
        <TBtn onClick={onPageBreakAdd}  tip={t.toolbar.insertPageBreak}>
          <span className="text-[9px] font-bold leading-none tracking-tight">PB</span>
        </TBtn>
      </Row>
      {/* Row 2: emoji + table */}
      <Row>
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button type="button" aria-label={t.toolbar.insertEmoji} onMouseDown={(e) => e.preventDefault()} className={BTN}>
                  <Smiley size={sz} />
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">{t.toolbar.insertEmoji}</TooltipContent>
          </Tooltip>
          <PopoverContent side="bottom" align="start" className="w-auto p-0">
            <Suspense fallback={<div className="flex h-[300px] w-[300px] items-center justify-center text-sm text-muted-foreground">{t.dialog.loading}</div>}>
              <EmojiPicker onEmojiClick={onInsertEmoji} autoFocusSearch={false} skinTonesDisabled lazyLoadEmojis />
            </Suspense>
          </PopoverContent>
        </Popover>
        <TablePicker t={t} onPick={onInsertTable} /* the grid glyph is deliberately smaller; keep the ratio */
          sz={sz === SZ_COMPACT ? SZ_SM_COMPACT : SZ_SM} />
      </Row>
    </Group>
  );
});

/* ── Props ───────────────────────────────────────────────────────────────── */
interface ToolbarProps {
  viewRef: React.MutableRefObject<EditorView | null>;
  schema: any;
  onInsertTable: (rows: number, cols: number) => void;
  onPageBreakAdd: () => void;
  onLinkAdd: () => void;
  onImageAdd: () => void;
  tick: number;
  /** Scrolled down: shrink the bar slightly to give the page more room. */
  compact?: boolean;
}

/* ── Main ────────────────────────────────────────────────────────────────── */
// Memoized: still re-renders whenever `tick` changes (active marks/block state
// must track every transaction), but unrelated Editor state (dialogs, toasts,
// save status, word count) no longer reaches it.
function Toolbar({
  viewRef, schema, onInsertTable, onPageBreakAdd, onLinkAdd, onImageAdd, tick, compact,
}: ToolbarProps) {
  const t = useT();
  const blockLabel = (value: string) =>
    value === "paragraph" ? t.toolbar.normal
      : value === "code_block" ? t.toolbar.code
      : t.toolbar.heading(Number(value[1]));
  const [textColor, setTextColor] = useState("#000000");
  const [bgColor,   setBgColor]   = useState("#ffff00");

  const cmd = (command: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean) => {
    const v = viewRef.current; if (!v) return;
    command(v.state, v.dispatch); v.focus();
  };

  const isActive = (markName: string) => {
    const v = viewRef.current; if (!v) return false;
    const { from, $from, to, empty } = v.state.selection;
    const mt = schema.marks[markName]; if (!mt) return false;
    if (empty) return !!mt.isInSet(v.state.storedMarks || $from.marks());
    return v.state.doc.rangeHasMark(from, to, mt);
  };

  const applyMark = (markName: string, attrs: Record<string, string>) => {
    const v = viewRef.current; if (!v) return;
    const mt = schema.marks[markName]; if (!mt) return;
    if (v.state.selection.empty) {
      // Collapsed cursor: store the mark so it applies to whatever is typed next.
      v.dispatch(v.state.tr.addStoredMark(mt.create(attrs)));
      v.focus();
      return;
    }
    const tr = v.state.tr;
    v.state.selection.ranges.forEach(({ $from, $to }: any) => {
      tr.removeMark($from.pos, $to.pos, mt);
      tr.addMark($from.pos, $to.pos, mt.create(attrs));
    });
    v.dispatch(tr); v.focus();
  };

  // Attrs of the given mark at the cursor (or on the first marked text in the
  // selection) — lets the font/size selects mirror where the cursor is.
  const activeMarkAttrs = (markName: string): Record<string, string> | null => {
    const v = viewRef.current; if (!v) return null;
    const mt = schema.marks[markName]; if (!mt) return null;
    const { empty, $from, from, to } = v.state.selection;
    if (empty) {
      const m = mt.isInSet(v.state.storedMarks || $from.marks());
      return m ? m.attrs : null;
    }
    let attrs: Record<string, string> | null = null;
    v.state.doc.nodesBetween(from, to, (node: any) => {
      if (attrs) return false;
      if (node.isText) {
        const m = mt.isInSet(node.marks);
        if (m) { attrs = m.attrs; return false; }
      }
      return true;
    });
    return attrs;
  };

  // Mirror the cursor's formatting in the selects/buttons. Recomputed per editor
  // transaction (tick) in an effect — refs must not be read during render.
  // No fontFamily mark means the editor's base font (Arial) — show it in the
  // select instead of an empty placeholder.
  const DEFAULT_FONT = FONTS[0].value;
  const [selFmt, setSelFmt] = useState({ fontFamily: DEFAULT_FONT, fontSize: "12", block: "paragraph", align: "left" });
  useEffect(() => {
    const v = viewRef.current; if (!v) return;
    const parent = v.state.selection.$from.parent;
    setSelFmt({
      fontFamily: activeMarkAttrs("fontFamily")?.family ?? DEFAULT_FONT,
      fontSize: (activeMarkAttrs("fontSize")?.size ?? "12pt").replace("pt", ""),
      block: parent.type === schema.nodes.heading ? `h${parent.attrs.level}`
        : parent.type === schema.nodes.code_block ? "code_block"
        : "paragraph",
      align: (parent.attrs?.textAlign as string) || "left",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  const { fontFamily: currentFontFamily, fontSize: currentFontSize, block: currentBlock, align: currentAlign } = selFmt;

  const setTextAlign = (align: string) => applyTextAlign(viewRef.current, schema, align);
  const adjustIndent = (direction: 1 | -1) => applyIndent(viewRef.current, schema, direction);

  // Stable identities so the memoized HistoryGroup / InsertGroup never
  // re-render on a tick (viewRef and schema never change).
  const onUndo = useCallback(() => {
    const v = viewRef.current; if (!v) return;
    undo(v.state, v.dispatch); v.focus();
  }, [viewRef]);

  const onRedo = useCallback(() => {
    const v = viewRef.current; if (!v) return;
    redo(v.state, v.dispatch); v.focus();
  }, [viewRef]);

  const insertEmoji = useCallback((emojiData: EmojiClickData) => {
    const v = viewRef.current; if (!v) return;
    v.dispatch(v.state.tr.insertText(emojiData.emoji)); v.focus();
  }, [viewRef]);

  const insertDivider = useCallback(() => {
    const v = viewRef.current; if (!v) return;
    const hrType = schema.nodes.horizontal_rule;
    const paragraphType = schema.nodes.paragraph;
    if (!hrType || !paragraphType) return;
    let tr = v.state.tr.replaceSelectionWith(hrType.create());
    const pos = tr.selection.from;
    tr = tr.insert(pos, paragraphType.create());
    tr = tr.setSelection(TextSelection.create(tr.doc, pos + 1));
    v.dispatch(tr.scrollIntoView()); v.focus();
  }, [viewRef, schema]);

  const sz = compact ? SZ_COMPACT : SZ;

  /* select shared class */
  // Important: shadcn's SelectTrigger carries data-[size=default]:h-9, which
  // outranks a plain height utility — without this the selects would stay 36px
  // and set the row height no matter how far the buttons shrank.
  const SEL = "h-(--tb-ctl)! text-xs border border-input rounded px-1.5 bg-background hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring shrink-0 cursor-pointer transition-[height] duration-300 ease-in-out motion-reduce:transition-none";

  return (
    <div className="border-b border-border bg-card select-none overflow-x-auto">
    {/* Scrolled down the bar thins out: shorter controls, smaller icons. Control
        boxes size off --tb-ctl (one variable beats threading a prop through
        every group); icon sizes are passed explicitly, because a CSS rule broad
        enough to reach them also reaches the select triggers' carets, which
        must keep their own size. */}
    <div
      // The bar's own vertical padding is fixed — only the controls inside it
      // change size, so the bar never shifts on its own.
      className="max-w-[850px] mx-auto px-3 pt-1.5 pb-1 flex items-stretch justify-center gap-0"
      style={{
        "--tb-ctl": compact ? "1.75rem" : "2.5rem",
        // The strip between the last button row and the group labels.
        "--tb-label-pt": compact ? "0.125rem" : "0.25rem",
      } as React.CSSProperties}
    >

      {/* ── History ── */}
      <HistoryGroup onUndo={onUndo} onRedo={onRedo} t={t} sz={sz} />

      <Sep />

      {/* ── Font ── */}
      <Group label={t.toolbar.groupFont}>
        {/* Row 1: font family + size + highlight */}
        <Row between>
          <Select
            value={FONTS.some(f => f.value === currentFontFamily) ? currentFontFamily : ""}
            onValueChange={(val) => { ensureEditorFont(val); applyMark("fontFamily", { family: val }); }}
          >
            <SelectTrigger
              className={cn(SEL, "w-[120px] justify-between")}
              aria-label={t.toolbar.fontFamily}
              title={t.toolbar.fontFamily}
            >
              <SelectValue placeholder={t.toolbar.fontPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {FONT_GROUPS.map((g) => (
                <SelectGroup key={g.label}>
                  <SelectLabel>{g.label}</SelectLabel>
                  {g.fonts.map((f) => (
                    <SelectItem key={f.value} value={f.value} className="text-xs">
                      <span style={{ fontFamily: f.value }}>{f.label}</span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={currentFontSize}
            onValueChange={(val) => applyMark("fontSize", { size: val + "pt" })}
          >
            <SelectTrigger
              className={cn(SEL, "w-[58px] justify-between")}
              aria-label={t.toolbar.fontSize}
              title={t.toolbar.fontSize}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {!FONT_SIZES.includes(currentFontSize) && (
                <SelectItem value={currentFontSize} className="text-xs">{currentFontSize}</SelectItem>
              )}
              {FONT_SIZES.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ColorPicker color={bgColor}   onChange={(c) => { setBgColor(c);   applyMark("bgColor",   { color: c }); }} tip={t.toolbar.highlightColor} icon={<Highlighter size={compact ? SZ_MD_COMPACT : SZ_MD} />} />
        </Row>
        {/* Row 2: B I U S + text color */}
        <Row between>
          <TBtn onClick={() => cmd(toggleMark(schema.marks.strong))}        active={isActive("strong")}        tip={`${t.format.bold} (Ctrl+B)`}>      <TextB size={sz} weight="bold" /></TBtn>
          <TBtn onClick={() => cmd(toggleMark(schema.marks.em))}            active={isActive("em")}            tip={`${t.format.italic} (Ctrl+I)`}>    <TextItalic size={sz} /></TBtn>
          <TBtn onClick={() => cmd(toggleMark(schema.marks.underline))}     active={isActive("underline")}     tip={`${t.format.underline} (Ctrl+U)`}> <TextUnderline size={sz} /></TBtn>
          <TBtn onClick={() => cmd(toggleMark(schema.marks.strikethrough))} active={isActive("strikethrough")} tip={t.format.strikethrough}>       <TextStrikethrough size={sz} /></TBtn>
          <ColorPicker color={textColor} onChange={(c) => { setTextColor(c); applyMark("textColor", { color: c }); }} tip={t.toolbar.textColor}      icon={<TextT size={compact ? SZ_MD_COMPACT : SZ_MD} />} />
        </Row>
      </Group>

      <Sep />

      {/* ── Paragraph ── */}
      <Group label={t.toolbar.groupParagraph}>
        {/* Row 1: block style + alignment */}
        <Row>
          <Select
            value={(BLOCK_VALUES as readonly string[]).includes(currentBlock) ? currentBlock : "paragraph"}
            onValueChange={(val) => {
              const { nodes } = schema;
              if (val === "paragraph")       cmd(setBlockType(nodes.paragraph));
              else if (/^h\d$/.test(val))    cmd(setBlockType(nodes.heading, { level: +val[1] }));
              else if (val === "code_block") cmd(setBlockType(nodes.code_block));
            }}
          >
            <SelectTrigger
              className={cn(SEL, "w-[86px] justify-between")}
              aria-label={t.toolbar.blockStyle}
              title={t.toolbar.blockStyle}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BLOCK_VALUES.map((v) => (
                <SelectItem key={v} value={v} className="text-xs">{blockLabel(v)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TBtn onClick={() => setTextAlign("left")}    active={currentAlign === "left"}    tip={t.format.alignLeft}>    <TextAlignLeft size={sz} /></TBtn>
          <TBtn onClick={() => setTextAlign("center")}  active={currentAlign === "center"}  tip={t.format.alignCenter}>  <TextAlignCenter size={sz} /></TBtn>
          <TBtn onClick={() => setTextAlign("right")}   active={currentAlign === "right"}   tip={t.format.alignRight}>   <TextAlignRight size={sz} /></TBtn>
          <TBtn onClick={() => setTextAlign("justify")} active={currentAlign === "justify"} tip={t.format.alignJustify}>       <TextAlignJustify size={sz} /></TBtn>
        </Row>
        {/* Row 2: list + indent + code + quote */}
        <Row>
          <TBtn onClick={() => cmd(wrapInList(schema.nodes.bullet_list))}  tip={t.toolbar.bulletedList}>   <ListBullets size={sz} /></TBtn>
          <TBtn onClick={() => cmd(wrapInList(schema.nodes.ordered_list))} tip={t.toolbar.numberedList}>  <ListNumbers size={sz} /></TBtn>
          <TBtn onClick={() => adjustIndent(-1)}                           tip={t.format.decreaseIndent}> <TextOutdent size={sz} /></TBtn>
          <TBtn onClick={() => adjustIndent(1)}                            tip={t.format.increaseIndent}> <TextIndent size={sz} /></TBtn>
          <TBtn onClick={() => cmd(setBlockType(schema.nodes.code_block))} tip={t.toolbar.codeBlock}>     <Code size={sz} /></TBtn>
          <TBtn onClick={() => cmd(wrapIn(schema.nodes.blockquote))}       tip={t.toolbar.blockquote}>     <Quotes size={sz} /></TBtn>
        </Row>
      </Group>

      <Sep />

      {/* ── Insert ── */}
      <InsertGroup
        onLinkAdd={onLinkAdd}
        onImageAdd={onImageAdd}
        onInsertDivider={insertDivider}
        onPageBreakAdd={onPageBreakAdd}
        onInsertEmoji={insertEmoji}
        onInsertTable={onInsertTable}
        t={t}
        sz={sz}
      />

    </div>
    </div>
  );
}

export default memo(Toolbar);
