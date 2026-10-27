/** Resolve the base direction from the first strong letter in a text block. */
export function textDirection(text: string): "rtl" | "ltr" {
  for (const char of text) {
    if (!/\p{Letter}/u.test(char)) continue;
    return /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff\u{10800}-\u{10fff}\u{1e800}-\u{1eeff}]/u.test(char) ? "rtl" : "ltr";
  }
  return "ltr";
}

export function resolvedAlignment(align: unknown, text: string): "left" | "right" | "center" | "justify" {
  if (align === "left" || align === "right" || align === "center" || align === "justify") return align;
  return textDirection(text) === "rtl" ? "right" : "left";
}
