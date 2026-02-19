"use client";

import { useEffect, useRef, useState } from "react";
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
  Undo2, Redo2, Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Outdent, Indent, Link2, Quote,
  Table, Type, Highlighter, Smile, ImagePlus, Minus, Code2,
} from "lucide-react";

const GRID_ROWS = 8;
const GRID_COLS = 10;

function TablePicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hovered, setHovered] = useState({ r: 0, c: 0 });
  const [open, setOpen] = useState(false);

  const pick = (r: number, c: number) => {
    setOpen(false);
    onPick(r, c);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              onMouseDown={(e) => e.preventDefault()}
              className={cn(
                "inline-flex items-center justify-center w-8 h-8 rounded-md text-sm transition-colors shrink-0",
                "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none",
                open && "bg-accent text-accent-foreground"
              )}
            >
              <Table size={15} />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Insert table</TooltipContent>
      </Tooltip>

      <PopoverContent
        side="bottom"
        align="start"
        className="w-auto p-2 space-y-1.5"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div
          className="grid gap-0.5"
          style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1.25rem)` }}
          onMouseLeave={() => setHovered({ r: 0, c: 0 })}
        >
          {Array.from({ length: GRID_ROWS }, (_, ri) =>
            Array.from({ length: GRID_COLS }, (_, ci) => {
              const active = ri < hovered.r && ci < hovered.c;
              return (
                <div
                  key={`${ri}-${ci}`}
                  className={cn(
                    "w-5 h-5 border rounded-sm cursor-pointer transition-colors",
                    active
                      ? "bg-blue-500 border-blue-600"
                      : "bg-background border-border hover:border-blue-400"
                  )}
                  onMouseEnter={() => setHovered({ r: ri + 1, c: ci + 1 })}
                  onMouseDown={(e) => { e.preventDefault(); pick(ri + 1, ci + 1); }}
                />
              );
            })
          )}
        </div>
        <p className="text-xs text-center text-muted-foreground">
          {hovered.r > 0 && hovered.c > 0
            ? `${hovered.r} × ${hovered.c}`
            : "Select table size"}
        </p>
      </PopoverContent>
    </Popover>
  );
}

interface ToolbarProps {
  viewRef: React.MutableRefObject<EditorView | null>;
  schema: any;
  onInsertTable: (rows: number, cols: number) => void;
  onLinkAdd: () => void;
  onImageAdd: () => void;
  tick: number;
  pageMarginCm: number;
  onPageMarginChange: (margin: number) => void;
}

const FONTS = [
  { label: "Arial",            value: "Arial, sans-serif" },
  { label: "Times New Roman",  value: "'Times New Roman', serif" },
  { label: "Courier New",      value: "'Courier New', monospace" },
  { label: "Georgia",          value: "Georgia, serif" },
  { label: "Verdana",          value: "Verdana, sans-serif" },
  { label: "Tahoma",           value: "Tahoma, sans-serif" },
  { label: "Trebuchet MS",     value: "'Trebuchet MS', sans-serif" },
  { label: "Inter",            value: "'Inter', sans-serif" },
  { label: "Roboto",           value: "'Roboto', sans-serif" },
  { label: "Open Sans",        value: "'Open Sans', sans-serif" },
  { label: "Lato",             value: "'Lato', sans-serif" },
  { label: "Montserrat",       value: "'Montserrat', sans-serif" },
  { label: "Raleway",          value: "'Raleway', sans-serif" },
  { label: "Nunito",           value: "'Nunito', sans-serif" },
  { label: "Poppins",          value: "'Poppins', sans-serif" },
  { label: "Josefin Sans",     value: "'Josefin Sans', sans-serif" },
  { label: "Oswald",           value: "'Oswald', sans-serif" },
  { label: "Playfair Display", value: "'Playfair Display', serif" },
  { label: "Merriweather",     value: "'Merriweather', serif" },
  { label: "PT Serif",         value: "'PT Serif', serif" },
  { label: "Libre Baskerville",value: "'Libre Baskerville', serif" },
  { label: "Crimson Text",     value: "'Crimson Text', serif" },
  { label: "Source Code Pro",  value: "'Source Code Pro', monospace" },
  { label: "Dancing Script",   value: "'Dancing Script', cursive" },
  { label: "Pacifico",         value: "'Pacifico', cursive" },
  { label: "Lobster",          value: "'Lobster', cursive" },
  { label: "Caveat",           value: "'Caveat', cursive" },
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

function TBtn({
  onClick, active, tip, children,
}: {
  onClick: () => void;
  active?: boolean;
  tip: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onMouseDown={(e) => { e.preventDefault(); onClick(); }}
          className={cn(
            "inline-flex items-center justify-center w-8 h-8 rounded-md text-sm transition-colors shrink-0",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-none",
            active && "bg-accent text-accent-foreground"
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}

function ToolbarGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 flex-wrap items-center gap-0.5 px-1.5", className)}>
      {children}
    </div>
  );
}

export default function Toolbar({
  viewRef,
  schema,
  onInsertTable,
  onLinkAdd,
  onImageAdd,
  tick,
  pageMarginCm,
  onPageMarginChange,
}: ToolbarProps) {
  void tick;
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [textColor, setTextColor] = useState("#000000");
  const [bgColor,   setBgColor]   = useState("#ffff00");
  const [visibleGroupCount, setVisibleGroupCount] = useState(5);

  const cmd = (command: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean) => {
    const v = viewRef.current;
    if (!v) return;
    command(v.state, v.dispatch);
    v.focus();
  };

  const isActive = (markName: string): boolean => {
    const v = viewRef.current;
    if (!v) return false;
    const { from, $from, to, empty } = v.state.selection;
    const mt = schema.marks[markName];
    if (!mt) return false;
    if (empty) return !!mt.isInSet(v.state.storedMarks || $from.marks());
    return v.state.doc.rangeHasMark(from, to, mt);
  };

  const applyMark = (markName: string, attrs: Record<string, string>) => {
    const v = viewRef.current;
    if (!v) return;
    const mt = schema.marks[markName];
    if (!mt || v.state.selection.empty) return;
    const { ranges } = v.state.selection;
    const tr = v.state.tr;
    ranges.forEach(({ $from, $to }: any) => {
      tr.removeMark($from.pos, $to.pos, mt);
      tr.addMark($from.pos, $to.pos, mt.create(attrs));
    });
    v.dispatch(tr);
    v.focus();
  };

  const setTextAlign = (align: string) => {
    const v = viewRef.current;
    if (!v) return;
    const { from, to } = v.state.selection;
    const tr = v.state.tr;
    v.state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type === schema.nodes.paragraph || node.type === schema.nodes.heading) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, textAlign: align });
      }
    });
    v.dispatch(tr);
    v.focus();
  };

  const adjustIndent = (direction: 1 | -1) => {
    const v = viewRef.current;
    if (!v) return;

    // List item ise native list indent/outdent davranışını kullan
    const listCommand =
      direction > 0
        ? sinkListItem(schema.nodes.list_item)
        : liftListItem(schema.nodes.list_item);
    if (listCommand(v.state, v.dispatch)) {
      v.focus();
      return;
    }

    // Paragraf/başlık için custom indent attr uygula
    const { from, to } = v.state.selection;
    const tr = v.state.tr;
    let changed = false;
    v.state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type === schema.nodes.paragraph || node.type === schema.nodes.heading) {
        const current = Number(node.attrs.indent || 0);
        const next = Math.max(0, Math.min(12, current + direction));
        if (next !== current) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
          changed = true;
        }
      }
    });
    if (!changed) return;
    v.dispatch(tr);
    v.focus();
  };

  const insertEmoji = (emojiData: EmojiClickData) => {
    const v = viewRef.current;
    if (!v) return;
    const tr = v.state.tr.insertText(emojiData.emoji);
    v.dispatch(tr);
    v.focus();
  };

  const insertDivider = () => {
    const v = viewRef.current;
    if (!v) return;
    const hrType = schema.nodes.horizontal_rule;
    const paragraphType = schema.nodes.paragraph;
    if (!hrType || !paragraphType) return;

    const hr = hrType.create();
    const paragraph = paragraphType.create();
    let tr = v.state.tr.replaceSelectionWith(hr);
    const insertPos = tr.selection.from;
    tr = tr.insert(insertPos, paragraph);
    tr = tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
    v.dispatch(tr.scrollIntoView());
    v.focus();
  };

  useEffect(() => {
    if (!toolbarRef.current) return;

    const calcVisibleGroups = (width: number) => {
      if (width >= 1500) return 5;
      if (width >= 1240) return 4;
      if (width >= 980) return 3;
      if (width >= 740) return 2;
      return 1;
    };

    const update = () => {
      const w = toolbarRef.current?.clientWidth ?? window.innerWidth;
      setVisibleGroupCount(calcVisibleGroups(w));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(toolbarRef.current);
    return () => observer.disconnect();
  }, []);

  const allGroups = [
    {
      id: "history",
      title: "History",
      className: "pr-2 border-r border-border",
      content: (
        <>
          <TBtn onClick={() => cmd(undo)} tip="Undo (Ctrl+Z)"><Undo2 size={15} /></TBtn>
          <TBtn onClick={() => cmd(redo)} tip="Redo (Ctrl+Y)"><Redo2 size={15} /></TBtn>
        </>
      ),
    },
    {
      id: "font",
      title: "Font",
      className: "min-w-[430px] pr-2 border-r border-border",
      content: (
        <>
          <select
            className="h-8 text-sm border border-input rounded-md px-2 bg-background hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring w-[148px] shrink-0"
            onChange={(e) => applyMark("fontFamily", { family: e.target.value })}
            defaultValue=""
            title="Font family"
          >
            <option value="" disabled>Font</option>
            <optgroup label="Classic">
              {FONTS.slice(0,7).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </optgroup>
            <optgroup label="Sans-serif">
              {FONTS.slice(7,17).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </optgroup>
            <optgroup label="Serif">
              {FONTS.slice(17,22).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </optgroup>
            <optgroup label="Monospace">
              {FONTS.slice(22,23).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </optgroup>
            <optgroup label="Decorative">
              {FONTS.slice(23).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </optgroup>
          </select>
          <select
            className="h-8 text-sm border border-input rounded-md px-1 bg-background hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring w-[58px] shrink-0"
            onChange={(e) => applyMark("fontSize", { size: e.target.value + "pt" })}
            defaultValue="12"
            title="Font size"
          >
            {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <TBtn onClick={() => cmd(toggleMark(schema.marks.strong))}        active={isActive("strong")}        tip="Bold (Ctrl+B)"><Bold size={15} /></TBtn>
          <TBtn onClick={() => cmd(toggleMark(schema.marks.em))}            active={isActive("em")}            tip="Italic (Ctrl+I)"><Italic size={15} /></TBtn>
          <TBtn onClick={() => cmd(toggleMark(schema.marks.underline))}     active={isActive("underline")}     tip="Underline (Ctrl+U)"><Underline size={15} /></TBtn>
          <TBtn onClick={() => cmd(toggleMark(schema.marks.strikethrough))} active={isActive("strikethrough")} tip="Strikethrough"><Strikethrough size={15} /></TBtn>
          <ColorPicker
            color={textColor}
            onChange={(c) => { setTextColor(c); applyMark("textColor", { color: c }); }}
            tip="Text color"
            icon={<Type size={14} />}
          />
          <ColorPicker
            color={bgColor}
            onChange={(c) => { setBgColor(c); applyMark("bgColor", { color: c }); }}
            tip="Highlight color"
            icon={<Highlighter size={14} />}
          />
        </>
      ),
    },
    {
      id: "paragraph",
      title: "Paragraph",
      className: "min-w-[320px] pr-2 border-r border-border",
      content: (
        <>
          <select
            className="h-8 text-sm border border-input rounded-md px-2 bg-background hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring w-[100px] shrink-0"
            onChange={(e) => {
              const val = e.target.value;
              const { nodes } = schema;
              if (val === "paragraph")       cmd(setBlockType(nodes.paragraph));
              else if (/^h\d$/.test(val))    cmd(setBlockType(nodes.heading, { level: +val[1] }));
              else if (val === "code_block") cmd(setBlockType(nodes.code_block));
            }}
            defaultValue="paragraph"
            title="Block style"
          >
            {BLOCK_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <TBtn onClick={() => setTextAlign("left")}    tip="Align left"><AlignLeft size={15} /></TBtn>
          <TBtn onClick={() => setTextAlign("center")}  tip="Align center"><AlignCenter size={15} /></TBtn>
          <TBtn onClick={() => setTextAlign("right")}   tip="Align right"><AlignRight size={15} /></TBtn>
          <TBtn onClick={() => setTextAlign("justify")} tip="Justify"><AlignJustify size={15} /></TBtn>
          <TBtn onClick={() => cmd(wrapInList(schema.nodes.bullet_list))}  tip="Bulleted list"><List size={15} /></TBtn>
          <TBtn onClick={() => cmd(wrapInList(schema.nodes.ordered_list))} tip="Numbered list"><ListOrdered size={15} /></TBtn>
          <TBtn onClick={() => adjustIndent(-1)}                           tip="Decrease indent"><Outdent size={15} /></TBtn>
          <TBtn onClick={() => adjustIndent(1)}                            tip="Increase indent"><Indent size={15} /></TBtn>
          <TBtn onClick={() => cmd(setBlockType(schema.nodes.code_block))} tip="Code block"><Code2 size={15} /></TBtn>
          <TBtn onClick={() => cmd(wrapIn(schema.nodes.blockquote))}       tip="Blockquote"><Quote size={15} /></TBtn>
        </>
      ),
    },
    {
      id: "insert",
      title: "Insert",
      className: "pr-2 border-r border-border",
      content: (
        <>
          <TBtn onClick={onLinkAdd} tip="Insert link"><Link2 size={15} /></TBtn>
          <TBtn onClick={onImageAdd} tip="Insert image"><ImagePlus size={15} /></TBtn>
          <TBtn onClick={insertDivider} tip="Insert divider"><Minus size={15} /></TBtn>
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    className={cn(
                      "inline-flex items-center justify-center w-8 h-8 rounded-md text-sm transition-colors shrink-0",
                      "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none"
                    )}
                    title="Insert emoji"
                  >
                    <Smile size={15} />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Insert emoji</TooltipContent>
            </Tooltip>
            <PopoverContent side="bottom" align="start" className="w-auto p-0">
              <EmojiPicker
                onEmojiClick={insertEmoji}
                autoFocusSearch={false}
                skinTonesDisabled
                lazyLoadEmojis
              />
            </PopoverContent>
          </Popover>
          <TablePicker onPick={(r, c) => onInsertTable(r, c)} />
        </>
      ),
    },
    {
      id: "page",
      title: "Page",
      className: "",
      content: (
        <select
          className="h-8 text-sm border border-input rounded-md px-2 bg-background hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring w-[96px] shrink-0"
          value={String(pageMarginCm)}
          onChange={(e) => onPageMarginChange(parseFloat(e.target.value))}
          title="Page margin"
        >
          <option value="0.5">0.5 cm</option>
          <option value="1">1 cm</option>
          <option value="1.5">1.5 cm</option>
          <option value="2">2 cm</option>
        </select>
      ),
    },
  ];

  const visibleGroups = allGroups.slice(0, visibleGroupCount);
  const overflowGroups = allGroups.slice(visibleGroupCount);

  return (
    <div ref={toolbarRef} className="border-b border-border bg-background px-2 py-1">
      <div className="flex items-center justify-center gap-2 overflow-hidden">
        {visibleGroups.map((group) => (
          <ToolbarGroup key={group.id} className={group.className}>
            {group.content}
          </ToolbarGroup>
        ))}
        {overflowGroups.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-2 text-sm hover:bg-accent focus-visible:outline-none"
                title="More tools"
              >
                ...
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="end" className="w-[360px] max-h-[70vh] overflow-y-auto p-2">
              <div className="space-y-2">
                {overflowGroups.map((group) => (
                  <div key={group.id} className="rounded-md border border-border p-2">
                    <div className="mb-1 text-xs font-medium text-muted-foreground">{group.title}</div>
                    <div className="flex flex-wrap items-center gap-0.5">
                      {group.content}
                    </div>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
