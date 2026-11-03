/** Shared image geometry for the editor, serialized HTML and print/PDF views. */
export type ImageWrap = "inline" | "topBottom" | "wrapLeft" | "wrapRight";
export const IMAGE_WRAPS: ImageWrap[] = ["inline", "topBottom", "wrapLeft", "wrapRight"];

export function imageWrap(value: unknown): ImageWrap {
  return IMAGE_WRAPS.includes(value as ImageWrap) ? value as ImageWrap : "topBottom";
}
export function imageDistance(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(96, n)) : 0;
}
export function imageWidth(value: unknown): string {
  const s = String(value ?? "100%");
  return /^(\d+(?:\.\d+)?)(px|%)$/.test(s) && parseFloat(s) > 0 ? s : "100%";
}
export function imagePosition(value: unknown): "flow" | "page" {
  return value === "page" ? "page" : "flow";
}
export function imageCoordinate(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100000, n)) : 0;
}
export function imageLayer(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1000000, Math.floor(n))) : 0;
}
export function imageTextPlane(value: unknown): "front" | "behind" {
  return value === "behind" ? "behind" : "front";
}
export function imageVisualElement(wrapper: HTMLElement): HTMLElement {
  return wrapper.dataset.position === "page" ? wrapper.querySelector<HTMLElement>(".pm-image-frame, .pm-textbox-frame") || wrapper : wrapper;
}
export function imageLayoutStyle(attrs: Record<string, unknown>): string {
  if (imagePosition(attrs.position) === "page") return "position:relative;display:inline-block;width:0;height:0;max-width:none;float:none;clear:none;margin:0;vertical-align:baseline;line-height:0;";
  const wrap = imageWrap(attrs.wrap), gap = wrap === "inline" ? 0 : imageDistance(attrs.distance);
  const reserved = wrap === "inline" ? gap * 2 : wrap === "topBottom" ? 0 : gap;
  const base = `width:${imageWidth(attrs.align === "justify" ? "100%" : attrs.width)};max-width:calc(100% - ${reserved}px);vertical-align:baseline;`;
  if (wrap === "inline") return `${base}display:inline-block;float:none;margin:0 ${gap}px;`;
  if (wrap === "wrapLeft") return `${base}display:block;float:left;margin:0 ${gap}px ${gap}px 0;`;
  if (wrap === "wrapRight") return `${base}display:block;float:right;margin:0 0 ${gap}px ${gap}px;`;
  const align = attrs.align;
  return `${base}display:block;float:none;clear:both;margin:${gap}px ${align === "right" ? "0" : "auto"} ${gap}px ${align === "right" || align === "center" ? "auto" : "0"};`;
}
export function imageDataAttrs(attrs: Record<string, unknown>): Record<string, string> {
  return { "data-wrap": imageWrap(attrs.wrap), "data-distance": String(imageDistance(attrs.distance)), "data-position": imagePosition(attrs.position), "data-x": String(imageCoordinate(attrs.x)), "data-y": String(imageCoordinate(attrs.y)), "data-layer": String(imageLayer(attrs.layer)), "data-text-plane": imageTextPlane(attrs.textPlane) };
}

/** Live-only selection chrome stays above text without lifting behind-text artwork. */
export function syncImageSelectionFrame(wrapper: HTMLElement) {
  const frame = wrapper.querySelector<HTMLElement>(".pm-image-frame");
  if (!frame) return;
  let selection = wrapper.querySelector<HTMLElement>(".pm-image-selection-frame");
  const behind = wrapper.dataset.position === "page" && wrapper.dataset.textPlane === "behind";
  if (!behind) {
    if (selection) { selection.querySelectorAll(".pm-image-handle").forEach(handle => frame.appendChild(handle)); selection.remove(); }
    return;
  }
  const handles = wrapper.querySelectorAll(".pm-image-handle");
  // Read-only/export renderers have no editor handles or selection chrome.
  if (!handles.length) return;
  if (!selection) {
    selection = document.createElement("span");
    selection.className = "pm-image-selection-frame";
    selection.setAttribute("contenteditable", "false");
    wrapper.appendChild(selection);
  }
  handles.forEach(handle => { if (handle.parentElement !== selection) selection!.appendChild(handle); });
  const root = wrapper.closest<HTMLElement>(".ProseMirror");
  const scale = root ? root.getBoundingClientRect().width / Number.parseFloat(getComputedStyle(root).width) || 1 : 1;
  selection.style.left = frame.style.left;
  selection.style.top = frame.style.top;
  selection.style.width = frame.style.width;
  selection.style.height = `${frame.getBoundingClientRect().height / scale}px`;
}

export function applyImageLayout(wrapper: HTMLElement, img: HTMLImageElement, attrs: Record<string, unknown>) {
  wrapper.style.cssText = imageLayoutStyle(attrs);
  for (const [key, value] of Object.entries(imageDataAttrs(attrs))) {
    wrapper.setAttribute(key, value);
    img.setAttribute(key, value);
  }
  const frame = wrapper.querySelector<HTMLElement>(".pm-image-frame");
  if (frame) {
    const fixed = imagePosition(attrs.position) === "page";
    const behind = fixed && imageTextPlane(attrs.textPlane) === "behind";
    const z = behind ? imageLayer(attrs.layer) - 1000001 : imageLayer(attrs.layer) + 1;
    frame.style.cssText = fixed
      ? `position:absolute;display:block;width:${imageWidth(attrs.width)};max-width:none;left:0;top:0;line-height:0;z-index:${z};${behind ? "pointer-events:none;" : ""}`
      : `position:relative;display:block;width:100%;line-height:0;z-index:${imageLayer(attrs.layer) + 1}`;
  }
  img.style.width = "100%";
  img.style.maxWidth = "100%";
  img.style.display = "block";
  img.style.margin = "0";
  img.style.float = "none";
  img.style.clear = "none";
  syncImageSelectionFrame(wrapper);
}
