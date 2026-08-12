"use client";

/**
 * On-demand Google Fonts loader for the /pad editor.
 *
 * The editor boots with system fonts only. A Google font's stylesheet is
 * injected the first time the family is actually needed:
 *   - `ensureEditorFont(cssValue)`  → call when the user picks a font in the toolbar
 *   - `ensureFontsInHtml(html)`     → call when a document is opened, so any
 *                                     fonts already used in it render correctly
 *
 * Each family loads exactly once per page; the per-family weight/italic axes
 * mirror what the old combined stylesheet in app/pad/layout.tsx used to load.
 * SSR-safe: all functions are no-ops on the server.
 */

/* System fonts available everywhere — never downloaded. */
const SYSTEM_FAMILIES = new Set([
  "arial",
  "times new roman",
  "courier new",
  "georgia",
  "verdana",
  "tahoma",
  "trebuchet ms",
]);

/**
 * Google Fonts offered in the editor's font dropdown, mapped to the
 * css2 API axis spec each family needs (empty string = default 400 only).
 * These axes match the old combined GOOGLE_FONTS_HREF exactly.
 */
export const GOOGLE_FONT_AXES: Record<string, string> = {
  Inter: "wght@400;700",
  Roboto: "ital,wght@0,400;0,700;1,400",
  "Open Sans": "ital,wght@0,400;0,700;1,400",
  Lato: "ital,wght@0,400;0,700;1,400",
  Montserrat: "ital,wght@0,400;0,700;1,400",
  Raleway: "ital,wght@0,400;0,700;1,400",
  Nunito: "ital,wght@0,400;0,700;1,400",
  Poppins: "ital,wght@0,400;0,700;1,400",
  "Josefin Sans": "ital,wght@0,400;0,700;1,400",
  Oswald: "wght@400;700",
  "Playfair Display": "ital,wght@0,400;0,700;1,400",
  Merriweather: "ital,wght@0,400;0,700;1,400",
  "PT Serif": "ital,wght@0,400;0,700;1,400",
  "Libre Baskerville": "ital,wght@0,400;1,400",
  "Crimson Text": "ital,wght@0,400;0,600;1,400",
  "Source Code Pro": "wght@400;700",
  "Dancing Script": "wght@400;700",
  Pacifico: "",
  Lobster: "",
  Caveat: "wght@400;700",
};

/* Families whose stylesheet <link> has already been injected this page. */
const loadedFamilies = new Set<string>();

/** Extract the primary family name from a CSS font-family value. */
function primaryFamily(cssFontFamily: string): string {
  const first = cssFontFamily.split(",")[0] ?? "";
  return first.trim().replace(/^['"]|['"]$/g, "");
}

/** Build the css2 stylesheet URL for a single family. */
function fontStylesheetUrl(family: string, axes: string): string {
  const encoded = family.trim().replace(/ /g, "+");
  const spec = axes ? `${encoded}:${axes}` : encoded;
  return `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
}

/**
 * Ensure the Google Fonts stylesheet for the given CSS font-family value is
 * loaded. No-op for system fonts, unknown families, already-loaded families,
 * and on the server.
 */
export function ensureEditorFont(cssFontFamily: string): void {
  if (typeof document === "undefined") return;
  if (!cssFontFamily) return;

  const family = primaryFamily(cssFontFamily);
  if (!family || SYSTEM_FAMILIES.has(family.toLowerCase())) return;
  if (loadedFamilies.has(family)) return;

  const axes = GOOGLE_FONT_AXES[family];
  if (axes === undefined) return; // not a font we offer — nothing to load

  loadedFamilies.add(family);

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = fontStylesheetUrl(family, axes);
  document.head.appendChild(link);
}

/**
 * Scan a document's HTML for any known Google font families and load each
 * one found. Call when opening a document so its fonts render correctly.
 */
export function ensureFontsInHtml(html: string): void {
  if (typeof document === "undefined") return;
  if (!html) return;

  for (const family of Object.keys(GOOGLE_FONT_AXES)) {
    if (!loadedFamilies.has(family) && html.includes(family)) {
      ensureEditorFont(family);
    }
  }
}
