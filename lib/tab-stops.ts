/** Canonical tab stops are twips from the text content origin, not screen pixels. */
import type { Node as PMNode } from "prosemirror-model";
import type { DocumentLayout } from "./document-layout";

export type TabAlignment = "left" | "center" | "right" | "decimal" | "clear";
export type TabLeader = "none" | "dot" | "dash";
export type TabStop = { position: number; alignment: TabAlignment; leader: TabLeader };
export type DecimalSeparator = "." | "," | "٫";
export type TabSettings = { defaultTabStop: number; decimalSeparator: DecimalSeparator };
export type OpaqueTabStop = { position: number | null; xml: string };
export const DEFAULT_TAB_STOP = 720;
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export function cleanTabStop(value: unknown): TabStop | null {
  if (!value || typeof value !== "object") return null;
  const stop = value as TabStop;
  if (!Number.isInteger(stop.position) || stop.position < -31680 || stop.position > 31680
    || !["left", "center", "right", "decimal", "clear"].includes(stop.alignment) || !["none", "dot", "dash"].includes(stop.leader)) return null;
  return { position: stop.position, alignment: stop.alignment, leader: stop.alignment === "clear" ? "none" : stop.leader };
}
export function cleanTabStops(value: unknown): TabStop[] {
  return Array.isArray(value) ? mergeTabStops(value.map(cleanTabStop).filter((stop): stop is TabStop => !!stop)) : [];
}
/** Clear entries remain in the map to suppress the same inherited position. */
export function mergeTabStops(...layers: readonly (readonly TabStop[] | undefined)[]): TabStop[] {
  const positions = new Map<number, TabStop>();
  for (const layer of layers) for (const raw of layer || []) { const stop = cleanTabStop(raw); if (stop) positions.set(stop.position, stop); }
  return Array.from(positions.values()).sort((a, b) => a.position - b.position);
}
export function documentTabSettings(layout: DocumentLayout | null | undefined): TabSettings {
  const n = layout?.defaultTabStop;
  return { defaultTabStop: Number.isInteger(n) && n! >= 1 && n! <= 31680 ? n! : DEFAULT_TAB_STOP,
    decimalSeparator: [".", ",", "٫"].includes(layout?.decimalSeparator || "") ? layout!.decimalSeparator! : "." };
}
export function parseTabStopsXml(raw: string | Element | null | undefined): { stops: TabStop[]; unsupported: OpaqueTabStop[] } {
  if (!raw) return { stops: [], unsupported: [] };
  const root = typeof raw === "string" ? new DOMParser().parseFromString(raw, "application/xml").documentElement : raw;
  const tabs = root.namespaceURI === W && root.localName === "tabs" ? root : Array.from(root.children).find(el => el.namespaceURI === W && el.localName === "tabs");
  const stops: TabStop[] = [], unsupported: OpaqueTabStop[] = [];
  for (const el of Array.from(tabs?.children || [])) {
    if (el.namespaceURI !== W || el.localName !== "tab") continue;
    const text = el.getAttributeNS(W, "pos"), n = text == null || text.trim() === "" ? NaN : Number(text);
    const leader = el.getAttributeNS(W, "leader") || "none";
    const candidate = cleanTabStop({ position: n, alignment: el.getAttributeNS(W, "val"), leader: leader === "hyphen" ? "dash" : leader === "dash" ? "unsupported" : leader });
    if (candidate) stops.push(candidate);
    else unsupported.push({ position: Number.isInteger(n) ? n : null, xml: new XMLSerializer().serializeToString(el) });
  }
  return { stops: mergeTabStops(stops), unsupported };
}
/** A native unsupported stop still shadows inherited stops at its position. */
export function mergeTabsWithRaw(inherited: readonly TabStop[] | undefined, raw: string | Element | null | undefined, managed?: readonly TabStop[]): TabStop[] {
  const parsed = parseTabStopsXml(raw), opaquePositions = new Set(parsed.unsupported.map(stop => stop.position));
  return mergeTabStops((inherited || []).filter(stop => !opaquePositions.has(stop.position)), parsed.stops, managed);
}
export function paragraphBaseTabs(node: PMNode): TabStop[] {
  return mergeTabsWithRaw(cleanTabStops(node.attrs.styleParagraph?.tabs), node.attrs.docxProperties);
}
export function effectiveTabs(node: PMNode): TabStop[] {
  return mergeTabStops(paragraphBaseTabs(node), cleanTabStops(node.attrs.paragraphFormat?.tabs));
}
/** Only supplied positions are replaced. Unknown kinds/leaders elsewhere stay raw. */
export function writeTabStopsXml(root: Element, stops: readonly TabStop[]): void {
  const managed = mergeTabStops(stops); if (!managed.length) return;
  const doc = root.ownerDocument, positions = new Set(managed.map(stop => stop.position));
  let tabs = Array.from(root.children).find(el => el.namespaceURI === W && el.localName === "tabs");
  if (!tabs) { tabs = doc.createElementNS(W, "w:tabs"); root.appendChild(tabs); }
  for (const el of Array.from(tabs.children)) {
    const position = el.getAttributeNS(W, "pos");
    if (el.namespaceURI === W && el.localName === "tab" && position !== null && position.trim() !== "" && positions.has(Number(position))) el.remove();
  }
  for (const stop of managed) {
    const el = doc.createElementNS(W, "w:tab"); el.setAttributeNS(W, "w:pos", String(stop.position)); el.setAttributeNS(W, "w:val", stop.alignment);
    if (stop.leader !== "none") el.setAttributeNS(W, "w:leader", stop.leader === "dash" ? "hyphen" : stop.leader); tabs.appendChild(el);
  }
  // Preserve native/opaque entries, but emit ordinary positions in native order.
  Array.from(tabs.children).map((el, index) => ({ el, index, position: el.hasAttributeNS(W, "pos") ? Number(el.getAttributeNS(W, "pos")) : NaN })).sort((a, b) =>
    (Number.isFinite(a.position) ? a.position : Infinity) - (Number.isFinite(b.position) ? b.position : Infinity) || a.index - b.index).forEach(({ el }) => tabs!.appendChild(el));
}
