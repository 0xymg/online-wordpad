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
export function imageLayoutStyle(attrs: Record<string, unknown>): string {
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
  return { "data-wrap": imageWrap(attrs.wrap), "data-distance": String(imageDistance(attrs.distance)) };
}

export function applyImageLayout(wrapper: HTMLElement, img: HTMLImageElement, attrs: Record<string, unknown>) {
  wrapper.style.cssText = imageLayoutStyle(attrs);
  for (const [key, value] of Object.entries(imageDataAttrs(attrs))) {
    wrapper.setAttribute(key, value);
    img.setAttribute(key, value);
  }
  img.style.width = "100%";
  img.style.maxWidth = "100%";
  img.style.display = "block";
  img.style.margin = "0";
  img.style.float = "none";
  img.style.clear = "none";
}
