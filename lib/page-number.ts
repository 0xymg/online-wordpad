import type { DocumentLayout } from "./document-layout";
export function numberLabel(page: number, total: number, format: "plain" | "of", style?: DocumentLayout["numberingStyle"]): string {
  if (style?.hideFirst && page === 1) return "";
  if (!style) return format === "of" ? `${page} / ${total}` : String(page);
  let n = page + style.start - 1;
  let label = String(n);
  if (/Roman$/.test(style.format)) {
    label = "";
    for (const [value, letters] of [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]] as const) while (n >= value && label.length < 100) { label += letters; n -= value; }
    if (style.format === "lowerRoman") label = label.toLowerCase();
  } else if (/Letter$/.test(style.format)) {
    label = "";
    while (n > 0) { n--; label = String.fromCharCode(65 + n % 26) + label; n = Math.floor(n / 26); }
    if (style.format === "lowerLetter") label = label.toLowerCase();
  }
  return style.template.replaceAll("{{PAGE}}", label).replaceAll("{{NUMPAGES}}", String(total));
}

