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
import { EditorState, Transaction } from "prosemirror-state";
import { DOMSerializer } from "prosemirror-model";
import { addColumnAfter, addRowAfter, deleteColumn, deleteRow, deleteTable } from "prosemirror-tables";
import { Document, Packer, Paragraph, TextRun } from "docx";

interface MenuBarProps {
  viewRef: React.MutableRefObject<EditorView | null>;
  schema: any;
}

export default function MenuBar({ viewRef, schema }: MenuBarProps) {
  const cmd = (command: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean) => {
    const v = viewRef.current;
    if (!v) return;
    command(v.state, v.dispatch);
    v.focus();
  };

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
    const blob = new Blob([`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Belge</title></head><body style="font-family:Arial;max-width:800px;margin:40px auto;padding:20px">${tmp.innerHTML}</body></html>`], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "belge.html";
    a.click();
  };

  const saveAsTxt = () => {
    const v = viewRef.current;
    if (!v) return;
    const text = v.state.doc.textContent;
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "belge.txt";
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
            ? lines.map((line) => new Paragraph({
                children: [new TextRun(line)],
              }))
            : [new Paragraph("")],
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "belge.docx";
    a.click();
  };

  const print = () => {
    window.print();
  };

  const selectAll = () => {
    const v = viewRef.current;
    if (!v) return;
    const { tr, doc } = v.state;
    v.dispatch(tr.setSelection(
      (globalThis as any).prosemirrorState?.TextSelection?.create(doc, 0, doc.content.size)
    ));
  };

  return (
    <Menubar className="relative rounded-none border-x-0 border-t-0 border-b border-border bg-background px-2 h-8">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[11px] font-semibold tracking-[0.18em] text-muted-foreground/80">
        EDTR
      </div>
      {/* File */}
      <MenubarMenu>
        <MenubarTrigger className="text-sm font-normal px-3 py-1 h-7">File</MenubarTrigger>
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
        <MenubarTrigger className="text-sm font-normal px-3 py-1 h-7">Edit</MenubarTrigger>
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
          <MenubarItem onClick={() => {
            const v = viewRef.current;
            if (!v) return;
            const { tr, doc } = v.state;
            const { AllSelection } = require("prosemirror-state");
            v.dispatch(tr.setSelection(new AllSelection(doc)));
          }}>
            Select All <MenubarShortcut>Ctrl+A</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* View */}
      <MenubarMenu>
        <MenubarTrigger className="text-sm font-normal px-3 py-1 h-7">View</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={() => document.documentElement.requestFullscreen?.()}>
            Full Screen <MenubarShortcut>F11</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => window.print()}>
            Print Preview
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Insert */}
      <MenubarMenu>
        <MenubarTrigger className="text-sm font-normal px-3 py-1 h-7">Insert</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={() => {
            const url = prompt("Link URL:");
            if (!url) return;
            const v = viewRef.current;
            if (!v || v.state.selection.empty) return;
            const mt = schema.marks.link;
            const { ranges } = v.state.selection;
            const tr = v.state.tr;
            ranges.forEach(({ $from, $to }: any) => {
              tr.removeMark($from.pos, $to.pos, mt);
              tr.addMark($from.pos, $to.pos, mt.create({ href: url, title: "" }));
            });
            v.dispatch(tr);
          }}>
            Link
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Table */}
      <MenubarMenu>
        <MenubarTrigger className="text-sm font-normal px-3 py-1 h-7">Table</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={() => cmd(addColumnAfter)}>
            Add Column Right
          </MenubarItem>
          <MenubarItem onClick={() => cmd(addRowAfter)}>
            Add Row Below
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => cmd(deleteColumn)}>
            Delete Column
          </MenubarItem>
          <MenubarItem onClick={() => cmd(deleteRow)}>
            Delete Row
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={() => cmd(deleteTable)}>
            Delete Table
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Format */}
      <MenubarMenu>
        <MenubarTrigger className="text-sm font-normal px-3 py-1 h-7">Format</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={() => cmd((s, d) => {
            const mt = schema.marks.strong;
            const { from, to, empty, $from } = s.selection;
            const active = empty ? !!mt.isInSet(s.storedMarks || $from.marks()) : s.doc.rangeHasMark(from, to, mt);
            const tr = s.tr;
            if (active) tr.removeMark(from, to, mt);
            else tr.addMark(from, to, mt.create());
            if (d) d(tr);
            return true;
          })}>
            Bold <MenubarShortcut>Ctrl+B</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => cmd((s, d) => {
            const mt = schema.marks.em;
            const { from, to } = s.selection;
            const tr = s.tr;
            if (s.doc.rangeHasMark(from, to, mt)) tr.removeMark(from, to, mt);
            else tr.addMark(from, to, mt.create());
            if (d) d(tr);
            return true;
          })}>
            Italic <MenubarShortcut>Ctrl+I</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onClick={() => cmd((s, d) => {
            const mt = schema.marks.underline;
            const { from, to } = s.selection;
            const tr = s.tr;
            if (s.doc.rangeHasMark(from, to, mt)) tr.removeMark(from, to, mt);
            else tr.addMark(from, to, mt.create());
            if (d) d(tr);
            return true;
          })}>
            Underline <MenubarShortcut>Ctrl+U</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Help */}
      <MenubarMenu>
        <MenubarTrigger className="text-sm font-normal px-3 py-1 h-7">Help</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={() => alert("WordPad Online\nProseMirror-based web editor")}>
            About
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
