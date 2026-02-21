"use client";

import { useState } from "react";
import { EditorView } from "prosemirror-view";
import { EditorState, Transaction, TextSelection } from "prosemirror-state";
import { toggleMark, setBlockType, wrapIn } from "prosemirror-commands";
import { wrapInList, sinkListItem, liftListItem } from "prosemirror-schema-list";
import { undo, redo } from "prosemirror-history";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import ColorPicker from "./ColorPicker";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import {
  ArrowCounterClockwise, ArrowClockwise,
  TextB, TextItalic, TextUnderline, TextStrikethrough,
  TextAlignLeft, TextAlignCenter, TextAlignRight, TextAlignJustify,
  ListBullets, ListNumbers, TextOutdent, TextIndent,
  Link, Quotes, Table, TextT, Highlighter, Smiley, ImageSquare, Minus, Code,
} from "@phosphor-icons/react";

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

const BLOCK_STYLES = [
  { value: "paragraph",  label: "Normal" },
  { value: "h1",         label: "Heading 1" },
  { value: "h2",         label: "Heading 2" },
  { value: "h3",         label: "Heading 3" },
  { value: "h4",         label: "Heading 4" },
  { value: "code_block", label: "Code" },
];

/* ── Button ─────────────────────────────────────────────────────────────── */
const BTN = cn(
  "inline-flex items-center justify-center w-10 h-10 rounded cursor-pointer shrink-0 transition-colors",
  "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none"
);

function TBtn({ onClick, active, tip, children }: {
  onClick: () => void; active?: boolean; tip: string; children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onMouseDown={(e) => { e.preventDefault(); onClick(); }}
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
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

/* ── Group: stacks rows vertically, label pinned to bottom ──────────────── */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between shrink-0 self-stretch">
      <div className="flex flex-col gap-0.5">{children}</div>
      <span className="text-[9px] leading-none text-center text-muted-foreground tracking-wide select-none pt-1">
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
function TablePicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hovered, setHovered] = useState({ r: 0, c: 0 });
  const [open, setOpen] = useState(false);
  const pick = (r: number, c: number) => { setOpen(false); onPick(r, c); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button onMouseDown={(e) => e.preventDefault()} className={cn(BTN, open && "bg-accent text-accent-foreground")}>
              <Table size={16} />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Insert table</TooltipContent>
      </Tooltip>
      <PopoverContent side="bottom" align="start" className="w-auto p-2 space-y-1.5"
        onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()}>
        <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1.25rem)` }}
          onMouseLeave={() => setHovered({ r: 0, c: 0 })}>
          {Array.from({ length: GRID_ROWS }, (_, ri) =>
            Array.from({ length: GRID_COLS }, (_, ci) => {
              const active = ri < hovered.r && ci < hovered.c;
              return (
                <div key={`${ri}-${ci}`}
                  className={cn("w-5 h-5 border rounded-sm cursor-pointer transition-colors",
                    active ? "bg-blue-500 border-blue-600" : "bg-background border-border hover:border-blue-400")}
                  onMouseEnter={() => setHovered({ r: ri + 1, c: ci + 1 })}
                  onMouseDown={(e) => { e.preventDefault(); pick(ri + 1, ci + 1); }}
                />
              );
            })
          )}
        </div>
        <p className="text-xs text-center text-muted-foreground">
          {hovered.r > 0 && hovered.c > 0 ? `${hovered.r} × ${hovered.c}` : "Select table size"}
        </p>
      </PopoverContent>
    </Popover>
  );
}

/* ── Props ───────────────────────────────────────────────────────────────── */
interface ToolbarProps {
  viewRef: React.MutableRefObject<EditorView | null>;
  schema: any;
  onInsertTable: (rows: number, cols: number) => void;
  onPageBreakAdd: () => void;
  onLinkAdd: () => void;
  onImageAdd: () => void;
  tick: number;
}

/* ── Main ────────────────────────────────────────────────────────────────── */
export default function Toolbar({
  viewRef, schema, onInsertTable, onPageBreakAdd, onLinkAdd, onImageAdd, tick,
}: ToolbarProps) {
  void tick;
  const [textColor, setTextColor] = useState("#000000");
  const [bgColor,   setBgColor]   = useState("#ffff00");
  const SZ = 22;

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
    const mt = schema.marks[markName]; if (!mt || v.state.selection.empty) return;
    const tr = v.state.tr;
    v.state.selection.ranges.forEach(({ $from, $to }: any) => {
      tr.removeMark($from.pos, $to.pos, mt);
      tr.addMark($from.pos, $to.pos, mt.create(attrs));
    });
    v.dispatch(tr); v.focus();
  };

  const setTextAlign = (align: string) => {
    const v = viewRef.current; if (!v) return;
    const { from, to } = v.state.selection;
    const tr = v.state.tr;
    v.state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type === schema.nodes.paragraph || node.type === schema.nodes.heading)
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, textAlign: align });
    });
    v.dispatch(tr); v.focus();
  };

  const adjustIndent = (direction: 1 | -1) => {
    const v = viewRef.current; if (!v) return;
    const listCmd = direction > 0 ? sinkListItem(schema.nodes.list_item) : liftListItem(schema.nodes.list_item);
    if (listCmd(v.state, v.dispatch)) { v.focus(); return; }
    const { from, to } = v.state.selection;
    const tr = v.state.tr; let changed = false;
    v.state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type === schema.nodes.paragraph || node.type === schema.nodes.heading) {
        const next = Math.max(0, Math.min(12, Number(node.attrs.indent || 0) + direction));
        if (next !== Number(node.attrs.indent || 0)) { tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next }); changed = true; }
      }
    });
    if (!changed) return;
    v.dispatch(tr); v.focus();
  };

  const insertEmoji = (emojiData: EmojiClickData) => {
    const v = viewRef.current; if (!v) return;
    v.dispatch(v.state.tr.insertText(emojiData.emoji)); v.focus();
  };

  const insertDivider = () => {
    const v = viewRef.current; if (!v) return;
    const hrType = schema.nodes.horizontal_rule;
    const paragraphType = schema.nodes.paragraph;
    if (!hrType || !paragraphType) return;
    let tr = v.state.tr.replaceSelectionWith(hrType.create());
    const pos = tr.selection.from;
    tr = tr.insert(pos, paragraphType.create());
    tr = tr.setSelection(TextSelection.create(tr.doc, pos + 1));
    v.dispatch(tr.scrollIntoView()); v.focus();
  };

  /* select shared class */
  const SEL = "h-10 text-xs border border-input rounded px-1.5 bg-background hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring shrink-0 cursor-pointer";

  return (
    <div className="border-b border-border bg-background select-none">
    <div className="max-w-[850px] mx-auto px-3 pt-1.5 pb-1 flex items-stretch justify-center gap-0">

      {/* ── History ── */}
      <Group label="History">
        <Row>
          <TBtn onClick={() => cmd(undo)} tip="Undo (Ctrl+Z)"><ArrowCounterClockwise size={SZ} /></TBtn>
          <TBtn onClick={() => cmd(redo)} tip="Redo (Ctrl+Y)"><ArrowClockwise size={SZ} /></TBtn>
        </Row>
      </Group>

      <Sep />

      {/* ── Font ── */}
      <Group label="Font">
        {/* Row 1: font family + size */}
        <Row>
          <select className={cn(SEL, "w-[120px]")}
            onChange={(e) => applyMark("fontFamily", { family: e.target.value })}
            defaultValue="" title="Font family">
            <option value="" disabled>Font</option>
            <optgroup label="Classic">
              {FONTS.slice(0, 7).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </optgroup>
            <optgroup label="Sans-serif">
              {FONTS.slice(7, 17).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </optgroup>
            <optgroup label="Serif">
              {FONTS.slice(17, 22).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </optgroup>
            <optgroup label="Monospace">
              {FONTS.slice(22, 23).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </optgroup>
            <optgroup label="Decorative">
              {FONTS.slice(23).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </optgroup>
          </select>
          <select className={cn(SEL, "w-[40px]")}
            onChange={(e) => applyMark("fontSize", { size: e.target.value + "pt" })}
            defaultValue="12" title="Font size">
            {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Row>
        {/* Row 2: B I U S + colors */}
        <Row>
          <TBtn onClick={() => cmd(toggleMark(schema.marks.strong))}        active={isActive("strong")}        tip="Bold (Ctrl+B)">      <TextB size={SZ} weight="bold" /></TBtn>
          <TBtn onClick={() => cmd(toggleMark(schema.marks.em))}            active={isActive("em")}            tip="Italic (Ctrl+I)">    <TextItalic size={SZ} /></TBtn>
          <TBtn onClick={() => cmd(toggleMark(schema.marks.underline))}     active={isActive("underline")}     tip="Underline (Ctrl+U)"> <TextUnderline size={SZ} /></TBtn>
          <TBtn onClick={() => cmd(toggleMark(schema.marks.strikethrough))} active={isActive("strikethrough")} tip="Strikethrough">       <TextStrikethrough size={SZ} /></TBtn>
          <ColorPicker color={textColor} onChange={(c) => { setTextColor(c); applyMark("textColor", { color: c }); }} tip="Text color"      icon={<TextT size={18} />} />
          <ColorPicker color={bgColor}   onChange={(c) => { setBgColor(c);   applyMark("bgColor",   { color: c }); }} tip="Highlight color" icon={<Highlighter size={18} />} />
        </Row>
      </Group>

      <Sep />

      {/* ── Paragraph ── */}
      <Group label="Paragraph">
        {/* Row 1: block style + alignment */}
        <Row>
          <select className={cn(SEL, "w-[80px]")}
            onChange={(e) => {
              const val = e.target.value; const { nodes } = schema;
              if (val === "paragraph")       cmd(setBlockType(nodes.paragraph));
              else if (/^h\d$/.test(val))    cmd(setBlockType(nodes.heading, { level: +val[1] }));
              else if (val === "code_block") cmd(setBlockType(nodes.code_block));
            }}
            defaultValue="paragraph" title="Block style">
            {BLOCK_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <TBtn onClick={() => setTextAlign("left")}    tip="Align left">    <TextAlignLeft size={SZ} /></TBtn>
          <TBtn onClick={() => setTextAlign("center")}  tip="Align center">  <TextAlignCenter size={SZ} /></TBtn>
          <TBtn onClick={() => setTextAlign("right")}   tip="Align right">   <TextAlignRight size={SZ} /></TBtn>
          <TBtn onClick={() => setTextAlign("justify")} tip="Justify">       <TextAlignJustify size={SZ} /></TBtn>
        </Row>
        {/* Row 2: list + indent + code + quote */}
        <Row>
          <TBtn onClick={() => cmd(wrapInList(schema.nodes.bullet_list))}  tip="Bulleted list">   <ListBullets size={SZ} /></TBtn>
          <TBtn onClick={() => cmd(wrapInList(schema.nodes.ordered_list))} tip="Numbered list">  <ListNumbers size={SZ} /></TBtn>
          <TBtn onClick={() => adjustIndent(-1)}                           tip="Decrease indent"> <TextOutdent size={SZ} /></TBtn>
          <TBtn onClick={() => adjustIndent(1)}                            tip="Increase indent"> <TextIndent size={SZ} /></TBtn>
          <TBtn onClick={() => cmd(setBlockType(schema.nodes.code_block))} tip="Code block">     <Code size={SZ} /></TBtn>
          <TBtn onClick={() => cmd(wrapIn(schema.nodes.blockquote))}       tip="Blockquote">     <Quotes size={SZ} /></TBtn>
        </Row>
      </Group>

      <Sep />

      {/* ── Insert ── */}
      <Group label="Insert">
        {/* Row 1: link image divider pagebreak */}
        <Row>
          <TBtn onClick={onLinkAdd}      tip="Insert link">       <Link size={SZ} /></TBtn>
          <TBtn onClick={onImageAdd}     tip="Insert image">      <ImageSquare size={SZ} /></TBtn>
          <TBtn onClick={insertDivider}  tip="Insert divider">    <Minus size={SZ} /></TBtn>
          <TBtn onClick={onPageBreakAdd} tip="Insert page break">
            <span className="text-[9px] font-bold leading-none tracking-tight">PB</span>
          </TBtn>
        </Row>
        {/* Row 2: emoji + table */}
        <Row>
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button onMouseDown={(e) => e.preventDefault()} className={BTN} title="Insert emoji">
                    <Smiley size={SZ} />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Insert emoji</TooltipContent>
            </Tooltip>
            <PopoverContent side="bottom" align="start" className="w-auto p-0">
              <EmojiPicker onEmojiClick={insertEmoji} autoFocusSearch={false} skinTonesDisabled lazyLoadEmojis />
            </PopoverContent>
          </Popover>
          <TablePicker onPick={(r, c) => onInsertTable(r, c)} />
        </Row>
      </Group>

    </div>
    </div>
  );
}
