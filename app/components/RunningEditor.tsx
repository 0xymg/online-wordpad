"use client";
import { useEffect, useRef } from "react";
import { DOMParser as PMParser, DOMSerializer } from "prosemirror-model";
import { EditorState, type Command } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { tableEditing } from "prosemirror-tables";
import { mySchema } from "./editor-schema";
import { useT } from "./I18nProvider";
import { DEFAULT_DOCUMENT_FONT_CSS } from "@/lib/document-font";
export default function RunningEditor({ html, label, disabled, onChange }: { html: string; label: string; disabled: boolean; onChange: (html: string) => void }) {
  const t = useT().running;
  const host = useRef<HTMLDivElement>(null), view = useRef<EditorView | null>(null), initial = useRef(html), initialLabel = useRef(label), change = useRef(onChange);
  useEffect(() => { change.current = onChange; }, [onChange]);
  useEffect(() => {
    if (!host.current) return;
    const dom = new DOMParser().parseFromString(initial.current, "text/html");
    const editor = new EditorView(host.current, {
      state: EditorState.create({ doc: PMParser.fromSchema(mySchema).parse(dom.body), plugins: [history(), tableEditing(), keymap({ "Mod-z": undo, "Mod-Shift-z": redo, "Mod-b": toggleMark(mySchema.marks.strong), "Mod-i": toggleMark(mySchema.marks.em), "Mod-u": toggleMark(mySchema.marks.underline) }), keymap(baseKeymap)] }),
      attributes: { role: "textbox", "aria-label": initialLabel.current, "aria-multiline": "true" },
      dispatchTransaction(tr) { editor.updateState(editor.state.apply(tr)); if (tr.docChanged) { const output = document.createElement("div"); output.appendChild(DOMSerializer.fromSchema(mySchema).serializeFragment(editor.state.doc.content)); change.current(output.innerHTML); } },
    });
    view.current = editor;
    if (!editor.state.doc.textContent) editor.dispatch(editor.state.tr.setStoredMarks([mySchema.marks.fontFamily.create({ family: DEFAULT_DOCUMENT_FONT_CSS }), mySchema.marks.fontSize.create({ size: "11pt" })]));
    return () => { editor.destroy(); view.current = null; };
  }, []);
  useEffect(() => { view.current?.setProps({ editable: () => !disabled, attributes: { role: "textbox", "aria-label": label, "aria-multiline": "true" } }); }, [disabled, label]);
  const run = (command: Command) => { const editor = view.current; if (editor && !disabled) { command(editor.state, editor.dispatch); editor.focus(); } };
  function alignment(value: string) {
    run((state, dispatch) => { const tr = state.tr; state.doc.descendants((node, pos) => { if (node.isTextblock) tr.setNodeMarkup(pos, undefined, { ...node.attrs, textAlign: value }); }); dispatch?.(tr); return true; });
  }
  function field(kind: string) { run((state, dispatch) => { dispatch?.(state.tr.replaceSelectionWith(mySchema.nodes.doc_field.create({ kind }), true)); return true; }); }
  return <section className="running-editor space-y-2">
    <h3 className="text-sm font-medium">{label}</h3>
    <div role="toolbar" aria-label={label} className="flex flex-wrap gap-1">
      {[[t.bold, "strong", "B"], [t.italic, "em", "I"], [t.underline, "underline", "U"]].map(([title, mark, text]) => <button key={mark} type="button" disabled={disabled} aria-label={title} title={title} onMouseDown={e => e.preventDefault()} onClick={() => run(toggleMark(mySchema.marks[mark]))} className="h-8 min-w-8 border border-input px-2 text-sm hover:bg-accent disabled:opacity-40">{text}</button>)}
      <select aria-label={`${label} ${t.alignment}`} disabled={disabled} defaultValue="" onChange={e => { alignment(e.target.value); e.target.value = ""; }} className="h-8 border border-input bg-background px-2 text-xs"><option value="" disabled>{t.alignment}</option><option value="left">{t.left}</option><option value="center">{t.center}</option><option value="right">{t.right}</option></select>
      <button type="button" disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => field("PAGE")} className="h-8 border border-input px-2 text-xs hover:bg-accent disabled:opacity-40">{t.pageNumber}</button>
      <button type="button" disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => field("NUMPAGES")} className="h-8 border border-input px-2 text-xs hover:bg-accent disabled:opacity-40">{t.pageCount}</button>
    </div>
    <div ref={host} className={`edtr-running-content max-h-44 min-h-24 overflow-auto border border-input bg-background p-3 ${disabled ? "opacity-50" : ""}`} />
  </section>;
}
