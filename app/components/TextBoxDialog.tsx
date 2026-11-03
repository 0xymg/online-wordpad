"use client";

import { useState } from "react";
import { NodeSelection } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import type { EditorView } from "prosemirror-view";
import { textBoxAttrs, commitTextBoxChange } from "@/lib/text-box";
import { imagePageContext } from "@/lib/page-image-position";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { textBoxLabels } from "@/lib/text-box-i18n";
import { useLocale } from "./I18nProvider";

const cm = (px: number) => (px * 2.54 / 96).toFixed(2);
const px = (value: string) => Number(value) * 96 / 2.54;

/** Text editing is an explicit operation; pointer gestures never edit the body. */
export default function TextBoxDialog({ view, onClose }: { view: EditorView; onClose: () => void }) {
  const { locale } = useLocale(), labels = textBoxLabels(locale);
  const [initial] = useState(() => {
    const s = view.state.selection;
    return s instanceof NodeSelection && s.node.type.name === "text_box"
      ? { doc: view.state.doc, pos: s.from, node: s.node, attrs: textBoxAttrs(s.node.attrs), page: imagePageContext(view, s.from) } : null;
  });
  const [text, setText] = useState(initial?.attrs.text || "");
  const [x, setX] = useState(cm(initial?.attrs.x || 0));
  const [y, setY] = useState(cm(initial?.attrs.y || 0));
  const [width, setWidth] = useState(cm(Number.parseFloat(initial?.attrs.width || "240px")));
  const [height, setHeight] = useState(cm(initial?.attrs.height || 96));
  const [fontSize, setFontSize] = useState(String(initial?.attrs.fontSize || 12));
  const [fontFamily, setFontFamily] = useState(initial?.attrs.fontFamily || "Calibri, Carlito, Arial, sans-serif");
  const [color, setColor] = useState(initial?.attrs.color || "#000000");
  const [background, setBackground] = useState(initial?.attrs.background || "#ffffff");
  const [textPlane, setTextPlane] = useState(initial?.attrs.textPlane || "front");
  const [error, setError] = useState("");
  const field = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  const exact = (value: string, original: number) => value === cm(original) ? original : px(value);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" onCloseAutoFocus={e => { e.preventDefault(); if (!view.isDestroyed) view.focus(); }}>
      <form onSubmit={e => {
        e.preventDefault();
        if (!initial || view.isDestroyed || view.state.doc !== initial.doc) { setError(labels.changed); return; }
        const nextX = exact(x, initial.attrs.x), nextY = exact(y, initial.attrs.y);
        const nextW = exact(width, Number.parseFloat(initial.attrs.width)), nextH = exact(height, initial.attrs.height), size = Number(fontSize);
        if (![nextX, nextY, nextW, nextH, size].every(Number.isFinite) || nextX < 0 || nextY < 0 || nextW < 40 || nextH < 32 || size < 6 || size > 144 || nextX + nextW > initial.page.width + 1 || nextY + nextH > initial.page.height + 1) {
          setError(labels.invalid); return;
        }
        const attrs = textBoxAttrs({ ...initial.attrs, text, x: nextX, y: nextY, width: `${nextW}px`, height: nextH, fontSize: size, fontFamily, color, background, textPlane });
        const tr = closeHistory(view.state.tr).setNodeMarkup(initial.pos, undefined, attrs);
        tr.setSelection(NodeSelection.create(tr.doc, initial.pos)); commitTextBoxChange(view, tr); onClose(); view.focus();
      }} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && ["s", "o", "p"].includes(e.key.toLowerCase())) { e.preventDefault(); e.stopPropagation(); } }}>
        <DialogHeader><DialogTitle>{labels.title}</DialogTitle><DialogDescription>{labels.description}</DialogDescription></DialogHeader>
        <div className="my-5 space-y-4">
          <label className="block space-y-1 text-sm"><span>{labels.text}</span><textarea autoFocus rows={6} className="w-full resize-y rounded-md border border-input bg-background p-2 text-sm" value={text} onChange={e => setText(e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3">
            {([[labels.x, x, setX], [labels.y, y, setY], [labels.width, width, setWidth], [labels.height, height, setHeight]] as const).map(([label, value, setter]) => <label key={label} className="block space-y-1 text-sm"><span>{label}</span><input className={field} type="number" step="0.01" min="0" required value={value} onChange={e => setter(e.target.value)} /></label>)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1 text-sm"><span>{labels.font}</span><input className={field} value={fontFamily} maxLength={200} onChange={e => setFontFamily(e.target.value)} /></label>
            <label className="block space-y-1 text-sm"><span>{labels.fontSize}</span><input className={field} type="number" min="6" max="144" step="0.5" required value={fontSize} onChange={e => setFontSize(e.target.value)} /></label>
            <label className="block space-y-1 text-sm"><span>{labels.color}</span><input className={field} type="color" value={color} onChange={e => setColor(e.target.value)} /></label>
            <label className="block space-y-1 text-sm"><span>{labels.background}</span><input className={field} type="color" value={background === "transparent" ? "#ffffff" : background} onChange={e => setBackground(e.target.value)} /></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={background === "transparent"} onChange={e => setBackground(e.target.checked ? "transparent" : "#ffffff")} />{labels.transparent}</label>
          <label className="block space-y-1 text-sm"><span>{labels.plane}</span><select className={field} value={textPlane} onChange={e => setTextPlane(e.target.value as "front" | "behind")}><option value="front">{labels.front}</option><option value="behind">{labels.behind}</option></select></label>
          <p className="text-xs text-muted-foreground">{labels.hint}</p>
        </div>
        {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>{labels.cancel}</Button><Button type="submit" disabled={!initial}>{labels.apply}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
