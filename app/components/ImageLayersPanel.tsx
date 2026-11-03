"use client";

import { useMemo, type RefObject } from "react";
import { NodeSelection, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { imageLayer, imageVisualElement } from "@/lib/image-layout";
import { reorderPageImage } from "@/lib/image-layer-order";
import { placePageImages } from "@/lib/page-image-position";
import { useT } from "./I18nProvider";
import { X } from "./icons";

type Props = {
  viewRef: RefObject<EditorView | null>;
  state: EditorState;
  onClose: () => void;
};

export default function ImageLayersPanel({ viewRef, state, onClose }: Props) {
  const labels = useT().image;
  const images = useMemo(() => {
    const rows: { pos: number; src: string; alt: string; number: number; fixed: boolean; layer: number }[] = [];
    state.doc.descendants((node, pos) => {
      if (node.type.name === "image") rows.push({ pos, src: String(node.attrs.src || ""),
        alt: String(node.attrs.alt || "").trim(), number: rows.length + 1,
        fixed: node.attrs.position === "page", layer: imageLayer(node.attrs.layer) });
    });
    return rows.sort((a, b) => Number(b.fixed) - Number(a.fixed) || (a.fixed ? b.layer - a.layer || b.pos - a.pos : a.pos - b.pos));
  }, [state.doc]);
  const selection = state.selection;
  const selectedPos = selection instanceof NodeSelection && selection.node.type.name === "image" ? selection.from : null;
  const selected = images.find(image => image.pos === selectedPos);
  const canReorder = !!selected?.fixed;
  const reason = selected ? labels.layersFlowHint : labels.layersSelectHint;

  const currentView = () => {
    const view = viewRef.current;
    return view && !view.isDestroyed && view.state.doc === state.doc ? view : null;
  };
  const reveal = (view: EditorView, pos: number) => {
    const doc = view.state.doc;
    requestAnimationFrame(() => {
      if (viewRef.current !== view || view.isDestroyed || view.state.doc !== doc) return;
      placePageImages(view);
      const wrapper = view.nodeDOM(pos) as HTMLElement | null;
      if (wrapper) imageVisualElement(wrapper).scrollIntoView({ block: "center", inline: "nearest" });
    });
  };
  const select = (pos: number, focusEditor: boolean) => {
    const view = currentView();
    if (!view || view.state.doc.nodeAt(pos)?.type.name !== "image") return;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    if (focusEditor) view.focus();
    reveal(view, pos);
  };
  const reorder = (action: "front" | "back", focusEditor: boolean) => {
    const view = currentView();
    if (!view || selectedPos === null || !canReorder || !(view.state.selection instanceof NodeSelection) || view.state.selection.from !== selectedPos) return;
    const tr = reorderPageImage(view.state.tr, selectedPos, action);
    if (tr.docChanged) view.dispatch(tr);
    if (focusEditor) view.focus();
    reveal(view, selectedPos);
  };
  const buttonStyle = "rounded border border-input px-2 py-1.5 text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-default disabled:opacity-40";

  return <aside aria-label={labels.layersTitle} className="flex h-56 max-h-[40%] w-full shrink-0 flex-col border-t border-border bg-card text-card-foreground lg:h-auto lg:max-h-none lg:w-72 lg:border-t-0 lg:border-s" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}>
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
      <h2 className="text-sm font-semibold">{labels.layersTitle}</h2>
      <button type="button" aria-label={labels.layersClose} className="rounded p-1 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring" onClick={onClose}><X size={16} /></button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {images.length ? <ul className="space-y-1">{images.map(image => {
        const name = image.alt || labels.layersName(image.number);
        return <li key={image.pos}><button type="button" aria-label={name} aria-pressed={image.pos === selectedPos}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring aria-pressed:bg-accent aria-pressed:text-accent-foreground"
          onMouseDown={event => event.preventDefault()} onClick={event => select(image.pos, event.detail !== 0)}>
          <span className="flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted">
            {/* Uploaded and data-URL thumbnails have no fixed Next.js image source. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.src} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
          </span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm">{name}</span><span className="block truncate text-[11px] text-muted-foreground">{image.fixed ? labels.fixedOnPage : labels.moveWithText}</span></span>
        </button></li>;
      })}</ul> : <p className="px-1 py-3 text-sm text-muted-foreground">{labels.layersEmpty}</p>}
    </div>
    <div className="shrink-0 space-y-2 border-t border-border p-2">
      {!canReorder && images.length > 0 && <p id="image-layer-order-hint" className="text-xs text-muted-foreground">{reason}</p>}
      <div className="flex gap-2">
        <button type="button" className={buttonStyle} disabled={!canReorder} aria-describedby={!canReorder && images.length ? "image-layer-order-hint" : undefined} onMouseDown={event => event.preventDefault()} onClick={event => reorder("front", event.detail !== 0)}>{labels.bringToFront}</button>
        <button type="button" className={buttonStyle} disabled={!canReorder} aria-describedby={!canReorder && images.length ? "image-layer-order-hint" : undefined} onMouseDown={event => event.preventDefault()} onClick={event => reorder("back", event.detail !== 0)}>{labels.sendToBack}</button>
      </div>
    </div>
  </aside>;
}
