"use client";
import { useState } from "react";
import type { EditorView } from "prosemirror-view";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatTable, type TableFormatting } from "@/lib/table-formatting";
import { useT } from "./I18nProvider";

export default function TablePropertiesDialog({ view, onClose }: { view: EditorView; onClose: () => void }) {
  const t = useT().tableProperties;
  const [values, setValues] = useState<Record<string, string>>({});
  const change = (name: string, value: string) => setValues(v => ({ ...v, [name]: value }));
  const fieldClass = "h-9 w-full rounded border border-input bg-background px-2 text-sm";
  function apply() {
    const options: TableFormatting = {};
    if (values.fill) options.fill = values.fill;
    if (values.vertical) options.vertical = values.vertical;
    if (values.alignment) options.alignment = values.alignment;
    if (values.border) { options.border = values.border as "all" | "none"; options.borderColor = values.borderColor || "#000000"; options.borderWidth = Number(values.borderWidth || 0.75); }
    if (values.padding) options.padding = Number(values.padding);
    if (values.rowHeight) options.rowHeight = Number(values.rowHeight);
    if (values.repeatHeader) options.repeatHeader = values.repeatHeader === "yes";
    if (values.columns) options.columns = values.columns as "equal" | "page";
    const tr = formatTable(view.state, options, view.dom.clientWidth);
    if (tr?.docChanged) view.dispatch(tr);
    onClose(); view.focus();
  }
  const select = (name: string, label: string, choices: [string, string][]) => <label className="space-y-1 text-sm">{label}<select disabled={name === "borderWidth" && values.border !== "all"} aria-label={label} className={fieldClass} value={values[name] || ""} onChange={e => change(name, e.target.value)}><option value="">{t.keep}</option>{choices.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="sm:max-w-xl" onCloseAutoFocus={e => { e.preventDefault(); view.focus(); }}>
    <form onSubmit={e => { e.preventDefault(); apply(); }}>
      <DialogHeader><DialogTitle>{t.title}</DialogTitle><DialogDescription>{t.description}</DialogDescription></DialogHeader>
      <div className="my-5 grid grid-cols-2 gap-4">
        {select("fill", t.fill, [["none", t.none], ["#ffffff", t.white], ["#f3f4f6", t.gray], ["#dbeafe", t.blue], ["#dcfce7", t.green], ["#fef9c3", t.yellow]])}
        {select("vertical", t.vertical, [["top", t.top], ["middle", t.middle], ["bottom", t.bottom]])}
        <label className="space-y-1 text-sm">{t.padding}<input aria-label={t.padding} className={fieldClass} type="number" min="0" max="72" step="0.5" placeholder={t.keep} value={values.padding || ""} onChange={e => change("padding", e.target.value)} /></label>
        <label className="space-y-1 text-sm">{t.rowHeight}<input aria-label={t.rowHeight} className={fieldClass} type="number" min="0" max="30" step="0.1" placeholder={t.keep} value={values.rowHeight || ""} onChange={e => change("rowHeight", e.target.value)} /></label>
        {select("border", t.border, [["all", t.all], ["none", t.none]])}
        <label className="space-y-1 text-sm">{t.borderColor}<input aria-label={t.borderColor} className={fieldClass} type="color" disabled={values.border !== "all"} value={values.borderColor || "#000000"} onChange={e => change("borderColor", e.target.value)} /></label>
        {select("borderWidth", t.borderWidth, [["0.5", "0.5 pt"], ["0.75", "0.75 pt"], ["1.5", "1.5 pt"], ["3", "3 pt"]])}
        {select("alignment", t.alignment, [["left", t.left], ["center", t.middle], ["right", t.right]])}
        {select("columns", t.columns, [["equal", t.equal], ["page", t.fit]])}
        {select("repeatHeader", t.repeatHeader, [["yes", t.yes], ["no", t.no]])}
      </div>
      <DialogFooter><Button type="button" variant="outline" onClick={onClose}>{t.cancel}</Button><Button type="submit">{t.apply}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
