"use client";

import { useState } from "react";
import { NodeSelection } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import type { EditorView } from "prosemirror-view";
import { alignParagraphImages } from "@/lib/editor-commands";
import { IMAGE_WRAPS, imageWrap, imageDistance, type ImageWrap } from "@/lib/image-layout";
import { imagePageContext } from "@/lib/page-image-position";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "./I18nProvider";

const cm = (px: number) => (px * 2.54 / 96).toFixed(2);
const pixels = (value: string) => Number(value) * 96 / 2.54;
export default function ImageLayoutDialog({ view, onClose }: { view: EditorView; onClose: () => void }) {
  const t = useT(), labels = t.image;
  const [initial] = useState(() => {
    const selection = view.state.selection;
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== "image") return null;
    const wrapper = view.nodeDOM(selection.from) as HTMLElement;
    const img = wrapper.querySelector("img")!;
    const scale = view.dom.getBoundingClientRect().width / parseFloat(getComputedStyle(view.dom).width);
    const page = imagePageContext(view, selection.from);
    if (!page) return null;
    if (selection.node.attrs.position === "page") {
      if (Math.abs(page.x - Number(selection.node.attrs.x)) < 1) page.x = Number(selection.node.attrs.x);
      if (Math.abs(page.y - Number(selection.node.attrs.y)) < 1) page.y = Number(selection.node.attrs.y);
    }
    return { doc: view.state.doc, pos: selection.from, node: selection.node, page,
      width: page.imageWidth,
      maxWidth: (wrapper.parentElement?.getBoundingClientRect().width || page.width * scale) / scale,
      ratio: Number(selection.node.attrs.aspectRatio) || img.naturalWidth / img.naturalHeight || 1 };
  });
  const [position, setPosition] = useState(() => initial?.node.attrs.position === "page" ? "page" : "flow");
  const [x, setX] = useState(() => cm(initial?.page.x || 0));
  const [y, setY] = useState(() => cm(initial?.page.y || 0));
  const [layerAction, setLayerAction] = useState<"front" | "back" | null>(null);
  const [wrap, setWrap] = useState<ImageWrap>(() => imageWrap(initial?.node.attrs.wrap));
  const [align, setAlign] = useState<string>(() => initial?.node.attrs.align || "left");
  const [distance, setDistance] = useState(() => String(imageDistance(initial?.node.attrs.distance) * 72 / 96));
  const [width, setWidth] = useState(() => cm(initial?.width || 100));
  const [error, setError] = useState("");
  const field = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  const fixed = position === "page";
  const options = { inline: labels.inline, topBottom: labels.topBottom, wrapLeft: labels.wrapLeft, wrapRight: labels.wrapRight };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md" onCloseAutoFocus={e => { e.preventDefault(); if (!view.isDestroyed) view.focus(); }}>
      <form onSubmit={e => {
        e.preventDefault();
        if (!initial || view.isDestroyed || view.state.doc !== initial.doc) { setError(t.paragraph.changed); return; }
        const px = width === cm(initial.width) ? initial.width : pixels(width), gap = wrap === "inline" ? 0 : Number(distance) * 96 / 72;
        const available = fixed ? initial.page.width : initial.maxWidth - (wrap === "inline" ? 2 : wrap === "topBottom" ? 0 : 1) * gap;
        if (!Number.isFinite(px) || px < 1 || px > available + 1 || !Number.isFinite(gap) || gap < 0 || gap > 96) { setError(labels.invalidSize); return; }
        const left = x === cm(initial.page.x) ? initial.page.x : pixels(x), top = y === cm(initial.page.y) ? initial.page.y : pixels(y);
        if (fixed && (!Number.isFinite(left) || !Number.isFinite(top) || left < 0 || top < 0 || left + px > initial.page.width + 1 || top + px / initial.ratio > initial.page.height + 1)) { setError(labels.invalidPosition); return; }
        const attrs = { ...initial.node.attrs, position, x: Math.round(left * 100) / 100, y: Math.round(top * 100) / 100,
          wrap, align: fixed ? (Math.abs(left - initial.page.margins.left) < 0.5 ? "left" : Math.abs(left - (initial.page.margins.left + (initial.page.width - initial.page.margins.left - initial.page.margins.right - px) / 2)) < 0.5 ? "center" : Math.abs(left - (initial.page.width - initial.page.margins.right - px)) < 0.5 ? "right" : "") : wrap === "wrapLeft" ? "left" : wrap === "wrapRight" ? "right" : align,
          width: `${Math.round(px * 100) / 100}px`, aspectRatio: initial.ratio, distance: gap };
        const tr = closeHistory(view.state.tr).setNodeMarkup(initial.pos, undefined, attrs);
        if (!fixed) alignParagraphImages(tr, tr.doc.resolve(initial.pos).before(), attrs.align, true);
        if (fixed && layerAction) {
          const images: { pos: number; layer: number }[] = [];
          tr.doc.descendants((node, pos) => { if (node.type.name === "image" && node.attrs.position === "page") images.push({pos, layer: Number(node.attrs.layer) || 0}); });
          images.sort((a, b) => a.layer - b.layer || a.pos - b.pos);
          const ordered = images.filter(image => image.pos !== initial.pos);
          if (layerAction === "front") ordered.push({pos: initial.pos, layer: 0});
          else ordered.unshift({pos: initial.pos, layer: 0});
          ordered.forEach(({pos}, layer) => tr.setNodeMarkup(pos, undefined, {...tr.doc.nodeAt(pos)!.attrs, layer}));
        }
        tr.setSelection(NodeSelection.create(tr.doc, initial.pos)); view.dispatch(tr); onClose(); view.focus();
      }} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && ["s", "o", "p"].includes(e.key.toLowerCase())) { e.preventDefault(); e.stopPropagation(); } }}>
        <DialogHeader><DialogTitle>{labels.layout}</DialogTitle><DialogDescription>{labels.layoutDescription}</DialogDescription></DialogHeader>
        <div className="my-5 space-y-4">
          <label className="block space-y-1 text-sm"><span>{labels.position}</span><select className={field} value={position} onChange={e => { setPosition(e.target.value); setError(""); }}><option value="flow">{labels.moveWithText}</option><option value="page">{labels.fixedOnPage}</option></select></label>
          {fixed ? <>
            <p className="text-xs text-muted-foreground">{labels.fixedHint}</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1 text-sm"><span>{labels.xCm}</span><input className={field} type="number" min="0" step="0.01" required value={x} onChange={e => setX(e.target.value)}/></label>
              <label className="block space-y-1 text-sm"><span>{labels.yCm}</span><input className={field} type="number" min="0" step="0.01" required value={y} onChange={e => setY(e.target.value)}/></label>
            </div>
            <fieldset className="space-y-2"><legend className="text-sm">{labels.imageOrder}</legend><div className="flex flex-wrap gap-2"><Button type="button" variant={layerAction === "front" ? "secondary" : "outline"} aria-pressed={layerAction === "front"} onClick={() => setLayerAction("front")}>{labels.bringToFront}</Button><Button type="button" variant={layerAction === "back" ? "secondary" : "outline"} aria-pressed={layerAction === "back"} onClick={() => setLayerAction("back")}>{labels.sendToBack}</Button></div></fieldset>
          </> : <>
            <label className="block space-y-1 text-sm"><span>{labels.wrapping}</span><select className={field} value={wrap} onChange={e => setWrap(e.target.value as ImageWrap)}>{IMAGE_WRAPS.map(mode => <option key={mode} value={mode}>{options[mode]}</option>)}</select></label>
            {wrap === "topBottom" && <label className="block space-y-1 text-sm"><span>{labels.alignment}</span><select className={field} value={align} onChange={e => setAlign(e.target.value)}>{["left", "center", "right"].map((value, i) => <option key={value} value={value}>{[labels.alignLeft, labels.alignCenter, labels.alignRight][i]}</option>)}</select></label>}
          </>}
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1 text-sm"><span>{labels.widthCm}</span><input className={field} type="number" min="0.03" max={initial ? cm(fixed ? initial.page.width : initial.maxWidth) : undefined} step="0.01" required value={width} onChange={e => setWidth(e.target.value)}/></label>
            {!fixed && <label className="block space-y-1 text-sm"><span>{labels.distancePt}</span><input className={field} disabled={wrap === "inline"} type="number" min="0" max="72" step="0.5" required value={distance} onChange={e => setDistance(e.target.value)}/></label>}
          </div>
          <p className="text-xs text-muted-foreground">{labels.keepRatio}</p>
        </div>
        {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>{t.paragraph.cancel}</Button><Button type="submit" disabled={!initial}>{t.paragraph.apply}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
