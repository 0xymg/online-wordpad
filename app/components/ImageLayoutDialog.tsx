"use client";

import { useState } from "react";
import { NodeSelection } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import type { EditorView } from "prosemirror-view";
import { alignParagraphImages } from "@/lib/editor-commands";
import { IMAGE_WRAPS, imageWrap, imageDistance, type ImageWrap } from "@/lib/image-layout";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "./I18nProvider";

export default function ImageLayoutDialog({ view, onClose }: { view: EditorView; onClose: () => void }) {
  const t = useT(), labels = t.image;
  const [initial] = useState(() => {
    const selection = view.state.selection;
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== "image") return null;
    const wrapper = view.nodeDOM(selection.from) as HTMLElement;
    const img = wrapper.querySelector("img")!;
    const scale = view.dom.getBoundingClientRect().width / parseFloat(getComputedStyle(view.dom).width);
    return { doc: view.state.doc, pos: selection.from, node: selection.node,
      width: wrapper.getBoundingClientRect().width / scale,
      maxWidth: (wrapper.parentElement?.getBoundingClientRect().width || wrapper.getBoundingClientRect().width) / scale,
      ratio: Number(selection.node.attrs.aspectRatio) || img.naturalWidth / img.naturalHeight || 1 };
  });
  const [wrap, setWrap] = useState<ImageWrap>(() => imageWrap(initial?.node.attrs.wrap));
  const [align, setAlign] = useState<string>(() => initial?.node.attrs.align || "left");
  const [distance, setDistance] = useState(() => String(imageDistance(initial?.node.attrs.distance) * 72 / 96));
  const [width, setWidth] = useState(() => ((initial?.width || 100) * 2.54 / 96).toFixed(2));
  const [error, setError] = useState("");
  const field = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  const options = { inline: labels.inline, topBottom: labels.topBottom, wrapLeft: labels.wrapLeft, wrapRight: labels.wrapRight };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md" onCloseAutoFocus={e => { e.preventDefault(); if (!view.isDestroyed) view.focus(); }}>
      <form onSubmit={e => {
        e.preventDefault();
        if (!initial || view.isDestroyed || view.state.doc !== initial.doc) { setError(t.paragraph.changed); return; }
        const px = Number(width) * 96 / 2.54, gap = wrap === "inline" ? 0 : Number(distance) * 96 / 72;
        const available = initial.maxWidth - (wrap === "inline" ? 2 : wrap === "topBottom" ? 0 : 1) * gap;
        if (!Number.isFinite(px) || px < 1 || px > available + 1 || !Number.isFinite(gap) || gap < 0 || gap > 96) { setError(labels.invalidSize); return; }
        const attrs = { ...initial.node.attrs, wrap, align: wrap === "wrapLeft" ? "left" : wrap === "wrapRight" ? "right" : align,
          width: `${Math.round(px * 100) / 100}px`, aspectRatio: initial.ratio, distance: gap };
        const tr = closeHistory(view.state.tr).setNodeMarkup(initial.pos, undefined, attrs);
        const parentPos = tr.doc.resolve(initial.pos).before();
        alignParagraphImages(tr, parentPos, attrs.align, true);
        tr.setSelection(NodeSelection.create(tr.doc, initial.pos)); view.dispatch(tr); onClose(); view.focus();
      }} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && ["s", "o", "p"].includes(e.key.toLowerCase())) { e.preventDefault(); e.stopPropagation(); } }}>
        <DialogHeader><DialogTitle>{labels.layout}</DialogTitle><DialogDescription>{labels.layoutDescription}</DialogDescription></DialogHeader>
        <div className="my-5 space-y-4">
          <label className="block space-y-1 text-sm"><span>{labels.wrapping}</span><select className={field} value={wrap} onChange={e => setWrap(e.target.value as ImageWrap)}>{IMAGE_WRAPS.map(mode => <option key={mode} value={mode}>{options[mode]}</option>)}</select></label>
          {wrap === "topBottom" && <label className="block space-y-1 text-sm"><span>{labels.alignment}</span><select className={field} value={align} onChange={e => setAlign(e.target.value)}>{["left", "center", "right"].map((value, i) => <option key={value} value={value}>{[labels.alignLeft, labels.alignCenter, labels.alignRight][i]}</option>)}</select></label>}
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1 text-sm"><span>{labels.widthCm}</span><input className={field} type="number" min="0.03" max={initial ? (initial.maxWidth * 2.54 / 96).toFixed(2) : undefined} step="0.01" required value={width} onChange={e => setWidth(e.target.value)}/></label>
            <label className="block space-y-1 text-sm"><span>{labels.distancePt}</span><input className={field} disabled={wrap === "inline"} type="number" min="0" max="72" step="0.5" required value={distance} onChange={e => setDistance(e.target.value)}/></label>
          </div>
          <p className="text-xs text-muted-foreground">{labels.keepRatio}</p>
        </div>
        {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>{t.paragraph.cancel}</Button><Button type="submit" disabled={!initial}>{t.paragraph.apply}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
