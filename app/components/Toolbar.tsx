"use client";

import { useState, useRef } from "react";
import { EditorView } from "prosemirror-view";
import { EditorState, Transaction } from "prosemirror-state";
import { toggleMark, setBlockType, wrapIn, lift } from "prosemirror-commands";
import { wrapInList, sinkListItem, liftListItem } from "prosemirror-schema-list";
import { undo, redo } from "prosemirror-history";
import { addColumnAfter, deleteColumn, addRowAfter, deleteRow, deleteTable } from "prosemirror-tables";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import ColorPicker from "./ColorPicker";
import {
  Undo2, Redo2, Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Outdent, Indent, Link2, Quote,
  Table, Trash2, Type, Highlighter,
  TableColumnsSplit, TableRowsSplit,
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
  tick: number;
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
  { value: "h1",         label: "Başlık 1" },
  { value: "h2",         label: "Başlık 2" },
  { value: "h3",         label: "Başlık 3" },
  { value: "h4",         label: "Başlık 4" },
  { value: "code_block", label: "Kod" },
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

function VSep() {
  return <Separator orientation="vertical" className="h-6 mx-1" />;
}

export default function Toolbar({ viewRef, schema, onInsertTable, onLinkAdd, tick }: ToolbarProps) {
  const [textColor, setTextColor] = useState("#000000");
  const [bgColor,   setBgColor]   = useState("#ffff00");

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

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-border bg-background">

      {/* Geri/İleri */}
      <TBtn onClick={() => cmd(undo)} tip="Geri al (Ctrl+Z)"><Undo2 size={15} /></TBtn>
      <TBtn onClick={() => cmd(redo)} tip="İleri al (Ctrl+Y)"><Redo2 size={15} /></TBtn>
      <VSep />

      {/* Font ailesi */}
      <select
        className="h-8 text-sm border border-input rounded-md px-2 bg-background hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring w-[148px] shrink-0"
        onChange={(e) => applyMark("fontFamily", { family: e.target.value })}
        defaultValue=""
        title="Yazı tipi"
      >
        <option value="" disabled>Yazı tipi</option>
        <optgroup label="Klasik">
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
        <optgroup label="Dekoratif">
          {FONTS.slice(23).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </optgroup>
      </select>

      {/* Font boyutu */}
      <select
        className="h-8 text-sm border border-input rounded-md px-1 bg-background hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring w-[58px] shrink-0"
        onChange={(e) => applyMark("fontSize", { size: e.target.value + "pt" })}
        defaultValue="12"
        title="Yazı boyutu"
      >
        {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      {/* Paragraf stili */}
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
        title="Stil"
      >
        {BLOCK_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>

      <VSep />

      {/* Biçim */}
      <TBtn onClick={() => cmd(toggleMark(schema.marks.strong))}        active={isActive("strong")}        tip="Kalın (Ctrl+B)">       <Bold size={15} /></TBtn>
      <TBtn onClick={() => cmd(toggleMark(schema.marks.em))}            active={isActive("em")}            tip="İtalik (Ctrl+I)">       <Italic size={15} /></TBtn>
      <TBtn onClick={() => cmd(toggleMark(schema.marks.underline))}     active={isActive("underline")}     tip="Altı çizili (Ctrl+U)">  <Underline size={15} /></TBtn>
      <TBtn onClick={() => cmd(toggleMark(schema.marks.strikethrough))} active={isActive("strikethrough")} tip="Üstü çizili">            <Strikethrough size={15} /></TBtn>

      <VSep />

      {/* Renk seçiciler — shadcn Popover + react-colorful */}
      <ColorPicker
        color={textColor}
        onChange={(c) => { setTextColor(c); applyMark("textColor", { color: c }); }}
        tip="Yazı rengi"
        icon={<Type size={14} />}
      />
      <ColorPicker
        color={bgColor}
        onChange={(c) => { setBgColor(c); applyMark("bgColor", { color: c }); }}
        tip="Arka plan rengi (vurgulama)"
        icon={<Highlighter size={14} />}
      />

      <VSep />

      {/* Hizalama */}
      <TBtn onClick={() => setTextAlign("left")}    tip="Sola hizala">    <AlignLeft size={15} /></TBtn>
      <TBtn onClick={() => setTextAlign("center")}  tip="Ortaya hizala">  <AlignCenter size={15} /></TBtn>
      <TBtn onClick={() => setTextAlign("right")}   tip="Sağa hizala">    <AlignRight size={15} /></TBtn>
      <TBtn onClick={() => setTextAlign("justify")} tip="İki yana yasla"> <AlignJustify size={15} /></TBtn>

      <VSep />

      {/* Listeler */}
      <TBtn onClick={() => cmd(wrapInList(schema.nodes.bullet_list))}  tip="Madde listesi">   <List size={15} /></TBtn>
      <TBtn onClick={() => cmd(wrapInList(schema.nodes.ordered_list))} tip="Numaralı liste">  <ListOrdered size={15} /></TBtn>
      <TBtn onClick={() => cmd(lift)}                                   tip="Girintiyi azalt"> <Outdent size={15} /></TBtn>
      <TBtn onClick={() => cmd(sinkListItem(schema.nodes.list_item))}  tip="Girintiyi artır"> <Indent size={15} /></TBtn>

      <VSep />

      {/* Link & Alıntı */}
      <TBtn onClick={onLinkAdd}                                     tip="Link ekle"><Link2 size={15} /></TBtn>
      <TBtn onClick={() => cmd(wrapIn(schema.nodes.blockquote))}    tip="Alıntı">   <Quote size={15} /></TBtn>

      <VSep />

      {/* Tablo */}
      <TablePicker onPick={(r, c) => onInsertTable(r, c)} />
      <TBtn onClick={() => cmd(addColumnAfter)} tip="Add column right"><TableColumnsSplit size={15} /></TBtn>
      <TBtn onClick={() => cmd(addRowAfter)}    tip="Add row below">   <TableRowsSplit size={15} /></TBtn>
      <TBtn onClick={() => cmd(deleteColumn)}   tip="Delete column">   <Trash2 size={13} /></TBtn>
      <TBtn onClick={() => cmd(deleteRow)}      tip="Delete row">      <Trash2 size={13} /></TBtn>
      <TBtn onClick={() => cmd(deleteTable)}    tip="Delete table">    <Trash2 size={15} /></TBtn>

    </div>
  );
}
