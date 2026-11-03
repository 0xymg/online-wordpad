/** Word automatic spacing multiplies a font metric, not its CSS em size.
 * The genuine A7.3 Word PDF proves these uniform Latin profiles at 11pt and
 * multiples 1/1.15/1.5. The metric is the larger of the captured hhea sum and
 * OS/2 Windows extent: Roboto's Windows extent exceeds its hhea sum.
 * Aliases share those tables in the bundled, licensed compatible fonts.
 * Unknown families remain unknown; generic CSS fallback is not a profile.
 */
const WORD_SINGLE_LINE_UNITS: Readonly<Record<string, number>> = {
    arial: 2355, "liberation sans": 2355,
    calibri: 2500, carlito: 2500,
    "times new roman": 2355, "liberation serif": 2355,
    "courier new": 2320, "liberation mono": 2320,
    roboto: 2458,
};
export function wordSingleLineMetric(family: string): number | undefined {
  const primary = family.split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase();
  const units = WORD_SINGLE_LINE_UNITS[primary];
  return units === undefined ? undefined : units / 2048;
}
export function wordAutomaticLineHeight(multiple: number, family: string): number {
  return multiple * (wordSingleLineMetric(family) ?? 1);
}
