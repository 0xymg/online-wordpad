/** Word automatic spacing multiplies the font's single-line metrics, not its
 * em size as CSS unitless line-height does. These OpenType hhea values are
 * shared by Arial and the bundled, metrically compatible Liberation Sans.
 * Unknown families retain their existing fallback until measured evidence is
 * available; do not infer a metric from a generic serif/sans-serif fallback.
 */
export function wordAutomaticLineHeight(multiple: number, family: string): number {
  const primary = family.split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase();
  const single = primary === "arial" || primary === "liberation sans" ? (1854 + 434 + 67) / 2048 : 1;
  return multiple * single;
}
