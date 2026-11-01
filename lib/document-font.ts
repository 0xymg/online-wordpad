/** Shared document default; Carlito is the bundled fallback when Calibri is absent. */
export const DEFAULT_DOCUMENT_FONT = "Calibri";
export const DEFAULT_DOCUMENT_FONT_CSS = "Calibri, Carlito, Arial, sans-serif";

/** Compare imported CSS font stacks with the toolbar's known families. */
export function primaryDocumentFont(value: string): string {
  return (value.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");
}
