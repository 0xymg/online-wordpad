/** Page-relative image artwork stays attached to a zero-size document anchor. */
import type { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { documentSections, type PageGeometry } from "./document-sections";
import { imageCoordinate, imagePosition, imageWidth, imageVisualElement } from "./image-layout";

export type ImagePage = { top: number; geometry: PageGeometry };
const measuredPages = new WeakMap<EditorView, readonly ImagePage[]>();

export function fixedImageWidth(attrs: Record<string, unknown>, geometry: PageGeometry): number {
  const width = imageWidth(attrs.width);
  const available = Math.max(1, (geometry.width - geometry.margins.left - geometry.margins.right) / 15);
  return Math.min(geometry.width / 15, Math.max(1, Number.parseFloat(width) * (width.endsWith("%") ? available / 100 : 1)));
}

export function fixedImageAlignedX(attrs: Record<string, unknown>, geometry: PageGeometry, align: string): number {
  const width = fixedImageWidth(attrs, geometry), left = geometry.margins.left / 15;
  const right = (geometry.width - geometry.margins.right) / 15;
  return Math.max(0, Math.min(geometry.width / 15 - width,
    align === "right" ? right - width : align === "center" ? (left + right - width) / 2 : left));
}

function context(view: EditorView, pos: number) {
  const anchor = view.nodeDOM(pos) as HTMLElement | null, host = view.dom.parentElement;
  if (!anchor || !host) return null;
  const hostRect = host.getBoundingClientRect(), rootRect = view.dom.getBoundingClientRect();
  const scale = rootRect.width / Number.parseFloat(getComputedStyle(view.dom).width) || 1;
  const anchorRect = anchor.getBoundingClientRect();
  const anchorY = (anchorRect.top - hostRect.top) / scale;
  const pages = measuredPages.get(view);
  let page = pages?.[0];
  if (pages) for (const candidate of pages) {
    if (candidate.top <= anchorY + 0.5) page = candidate;
    else break;
  }
  if (!page) {
    const sections = documentSections(view.state.doc);
    const section = sections.find(section => pos >= section.from && pos <= section.to) || sections[0];
    page = { top: 0, geometry: section.geometry };
  }
  const width = page.geometry.width / 15;
  // Mixed-size sheets are horizontally centered in the maximum-width host.
  const left = (hostRect.width / scale - width) / 2;
  return { anchor, hostRect, anchorRect, scale, page, left, width, height: page.geometry.height / 15 };
}

/** Dimensions and current image location relative to its physical anchor page. */
export function imagePageContext(view: EditorView, pos: number) {
  const info = context(view, pos);
  if (!info) {
    const sections = documentSections(view.state.doc);
    const geometry = (sections.find(section => pos >= section.from && pos <= section.to) || sections[0]).geometry;
    const attrs = view.state.doc.nodeAt(pos)?.attrs || {};
    const width = fixedImageWidth(attrs, geometry);
    return { width: geometry.width / 15, height: geometry.height / 15,
      x: imageCoordinate(attrs.x), y: imageCoordinate(attrs.y), imageWidth: width,
      imageHeight: width / (Number(attrs.aspectRatio) || 1),
      margins: { left: geometry.margins.left / 15, right: geometry.margins.right / 15,
        top: geometry.margins.top / 15, bottom: geometry.margins.bottom / 15 } };
  }
  const rect = imageVisualElement(info.anchor).getBoundingClientRect();
  return {
    width: info.width, height: info.height,
    x: (rect.left - info.hostRect.left) / info.scale - info.left,
    y: (rect.top - info.hostRect.top) / info.scale - info.page.top,
    imageWidth: rect.width / info.scale, imageHeight: rect.height / info.scale,
    margins: { left: info.page.geometry.margins.left / 15, right: info.page.geometry.margins.right / 15,
      top: info.page.geometry.margins.top / 15, bottom: info.page.geometry.margins.bottom / 15 },
  };
}

function placeImage(view: EditorView, node: PMNode, pos: number) {
  const info = context(view, pos);
  const frame = info?.anchor.querySelector<HTMLElement>(".pm-image-frame");
  if (!info || !frame) return;
  const width = fixedImageWidth(node.attrs, info.page.geometry);
  frame.style.width = `${width}px`;
  const ratio = Number(node.attrs.aspectRatio) || 0;
  const img = frame.querySelector("img");
  const height = ratio > 0 ? width / ratio : img?.naturalWidth ? width * img.naturalHeight / img.naturalWidth : frame.getBoundingClientRect().height / info.scale;
  const x = Math.min(imageCoordinate(node.attrs.x), Math.max(0, info.width - width));
  const y = Math.min(imageCoordinate(node.attrs.y), Math.max(0, info.height - height));
  // The visual frame is positioned against its own zero-size relative anchor,
  // so positioned paragraphs, list items and table cells require no special case.
  frame.style.left = `${info.left + x - (info.anchorRect.left - info.hostRect.left) / info.scale}px`;
  frame.style.top = `${info.page.top + y - (info.anchorRect.top - info.hostRect.top) / info.scale}px`;
}

/** Called after pagination settles; the same pass runs for live and export views. */
export function placePageImages(view: EditorView, pages?: readonly ImagePage[]) {
  if (pages) measuredPages.set(view, pages);
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === "image" && imagePosition(node.attrs.position) === "page") placeImage(view, node, pos);
  });
}
