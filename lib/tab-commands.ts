import { closeHistory } from "prosemirror-history";
import type { EditorState, Transaction } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { documentStyles, resolveStyle, saveDocumentStyle, selectedParagraphs } from "./document-styles";
import { defaultDocumentLayout } from "./document-layout";
import type { DocumentStyles } from "./paragraph-format";
import { cleanTabStop, cleanTabStops, documentTabSettings, effectiveTabs, mergeTabStops, mergeTabsWithRaw, paragraphBaseTabs, parseTabStopsXml,
  type OpaqueTabStop, type TabSettings, type TabStop } from "./tab-stops";

export type TabOperation = { type: "upsert"; stop: TabStop } | { type: "remove"; position: number } | { type: "clear" } | { type: "reset" };
export type TabTarget = { kind: "selection" } | { kind: "style"; styleId: string };
export type TabStopRow = { position: number; stop: TabStop | null; source: "direct" | "inherited" | "mixed"; mixed: boolean };
export type TabStopSnapshot = TabSettings & { paragraphCount: number; mixed: boolean; stops: TabStop[] | null; rows: TabStopRow[];
  unsupportedCount: number; baseTabs: TabStop[]; directTabs: TabStop[] | undefined };
export class TabCommandError extends Error {
  constructor(public code: "invalid-position" | "invalid-stop" | "invalid-interval" | "invalid-decimal" | "no-paragraphs" | "missing-style", message: string) { super(message); this.name = "TabCommandError"; }
}
/** Reset removes managed overrides; inherited and original native stops reappear. */
export function applyTabOperations(baseTabs: readonly TabStop[], directTabs: readonly TabStop[] | undefined, operations: readonly TabOperation[]): TabStop[] | undefined {
  let direct = directTabs === undefined ? undefined : mergeTabStops(directTabs);
  for (const operation of operations) {
    if (operation.type === "reset") direct = undefined;
    else if (operation.type === "clear") direct = mergeTabStops(direct, mergeTabStops(baseTabs, direct).map(stop => ({ position: stop.position, alignment: "clear", leader: "none" })));
    else if (operation.type === "upsert") {
      const stop = cleanTabStop(operation.stop); if (!stop) throw new TabCommandError("invalid-stop", "Enter a valid tab stop");
      direct = mergeTabStops(direct, [stop]);
    } else if (operation.type === "remove") {
      const stop = cleanTabStop({ position: operation.position, alignment: "clear", leader: "none" });
      if (!stop) throw new TabCommandError("invalid-position", "Tab position must be an integer number of twips");
      direct = mergeTabStops(direct, [stop]);
    } else throw new TabCommandError("invalid-stop", "Unknown tab operation");
  }
  return direct;
}
function opaqueLayer(previous: OpaqueTabStop[], raw: string | undefined | null, managed?: TabStop[]): OpaqueTabStop[] {
  const parsed = parseTabStopsXml(raw), replaced = new Set([...parsed.stops, ...(managed || [])].map(stop => stop.position));
  const incoming = new Set<number | null>(parsed.unsupported.map(stop => stop.position).filter(position => position !== null));
  return [...previous.filter(stop => !replaced.has(stop.position!) && !incoming.has(stop.position)), ...parsed.unsupported.filter(stop => !replaced.has(stop.position!))];
}
function styleOpaqueTabs(styles: DocumentStyles, id: string, seen = new Set<string>()): OpaqueTabStop[] {
  if (seen.has(id) || seen.size > 20 || !Object.hasOwn(styles, id)) return [];
  seen.add(id); const style = styles[id];
  return opaqueLayer(style.basedOn ? styleOpaqueTabs(styles, style.basedOn, seen) : [], style.rawParagraphProperties, style.paragraph.tabs);
}
function ownPositions(node: PMNode): Set<number> {
  return new Set([...parseTabStopsXml(node.attrs.docxProperties).stops, ...cleanTabStops(node.attrs.paragraphFormat?.tabs)].map(stop => stop.position));
}
export function readStyleTabStops(styles: DocumentStyles, styleId: string): TabStopSnapshot {
  if (!Object.hasOwn(styles, styleId)) throw new TabCommandError("missing-style", "The style no longer exists");
  const style = styles[styleId], inherited = style.basedOn ? resolveStyle(styles, style.basedOn).paragraph.tabs : [];
  const baseTabs = mergeTabsWithRaw(inherited, style.rawParagraphProperties), directTabs = style.paragraph.tabs === undefined ? undefined : cleanTabStops(style.paragraph.tabs);
  const stops = mergeTabStops(baseTabs, directTabs), own = new Set([...parseTabStopsXml(style.rawParagraphProperties).stops, ...(directTabs || [])].map(stop => stop.position));
  return { ...documentTabSettings(null), paragraphCount: 1, mixed: false, stops, baseTabs, directTabs,
    rows: stops.map(stop => ({ position: stop.position, stop, mixed: false, source: own.has(stop.position) ? "direct" : "inherited" })), unsupportedCount: styleOpaqueTabs(styles, styleId).length };
}
export function readTabStops(state: EditorState, target: TabTarget = { kind: "selection" }): TabStopSnapshot {
  const styles = documentStyles(state.doc.attrs.layout), settings = documentTabSettings(state.doc.attrs.layout);
  if (target.kind === "style") return { ...readStyleTabStops(styles, target.styleId), ...settings };
  const paragraphs = selectedParagraphs(state), lists = paragraphs.map(({ node }) => effectiveTabs(node));
  const mixed = lists.some(stops => JSON.stringify(stops) !== JSON.stringify(lists[0]));
  const positions = Array.from(new Set(lists.flatMap(stops => stops.map(stop => stop.position)))).sort((a, b) => a - b);
  const rows: TabStopRow[] = positions.map(position => {
    const entries = lists.map(stops => stops.find(stop => stop.position === position)), stop = entries[0];
    const different = entries.some(entry => JSON.stringify(entry) !== JSON.stringify(stop));
    const sources: Array<"direct" | "inherited"> = paragraphs.map(({ node }) => ownPositions(node).has(position) ? "direct" : "inherited");
    return { position, stop: different ? null : stop || null, mixed: different, source: sources.some(source => source !== sources[0]) ? "mixed" as const : sources[0] || "inherited" as const };
  });
  const bases = paragraphs.map(({ node }) => paragraphBaseTabs(node)), directs = paragraphs.map(({ node }) => node.attrs.paragraphFormat?.tabs as TabStop[] | undefined);
  return { ...settings, paragraphCount: paragraphs.length, mixed, stops: mixed ? null : lists[0] || [], rows,
    baseTabs: bases[0] || [], directTabs: directs.every(tabs => JSON.stringify(tabs) === JSON.stringify(directs[0])) ? directs[0] : undefined,
    unsupportedCount: paragraphs.reduce((count, { node }) => count + opaqueLayer(node.attrs.styleId ? styleOpaqueTabs(styles, node.attrs.styleId) : [], node.attrs.docxProperties, cleanTabStops(node.attrs.paragraphFormat?.tabs)).length, 0) };
}
export const readSelectedTabStops = (state: EditorState) => readTabStops(state);
export function applyTabChanges(state: EditorState, change: { operations: readonly TabOperation[]; documentSettings?: Partial<TabSettings> }, target: TabTarget = { kind: "selection" }): Transaction {
  let tr = closeHistory(state.tr).setMeta("edtr-tab-command", true);
  if (change.operations.length) {
    if (target.kind === "style") {
      const styles = documentStyles(state.doc.attrs.layout), snapshot = readStyleTabStops(styles, target.styleId), definition = styles[target.styleId];
      const tabs = applyTabOperations(snapshot.baseTabs, snapshot.directTabs, change.operations), paragraph = { ...definition.paragraph };
      if (tabs === undefined) delete paragraph.tabs; else paragraph.tabs = tabs;
      tr = closeHistory(saveDocumentStyle(state, target.styleId, { ...definition, paragraph })).setMeta("edtr-tab-command", true);
    } else {
      const paragraphs = selectedParagraphs(state); if (!paragraphs.length) throw new TabCommandError("no-paragraphs", "Select a paragraph or heading");
      for (const { node, pos } of paragraphs) {
        const paragraphFormat = { ...node.attrs.paragraphFormat }, tabs = applyTabOperations(paragraphBaseTabs(node), paragraphFormat.tabs, change.operations);
        if (tabs === undefined) delete paragraphFormat.tabs; else paragraphFormat.tabs = tabs;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, paragraphFormat });
      }
    }
  }
  if (change.documentSettings) {
    const requested = change.documentSettings;
    if (requested.defaultTabStop !== undefined && (!Number.isInteger(requested.defaultTabStop) || requested.defaultTabStop < 1 || requested.defaultTabStop > 31680)) throw new TabCommandError("invalid-interval", "Default tab interval must be 1–31680 twips");
    if (requested.decimalSeparator !== undefined && ![".", ",", "٫"].includes(requested.decimalSeparator)) throw new TabCommandError("invalid-decimal", "Unsupported decimal separator");
    tr.setDocAttribute("layout", { ...(tr.doc.attrs.layout || defaultDocumentLayout()),
      ...(requested.defaultTabStop === undefined ? {} : { defaultTabStop: requested.defaultTabStop }),
      ...(requested.decimalSeparator === undefined ? {} : { decimalSeparator: requested.decimalSeparator }) });
  }
  return tr;
}
export const setSelectedTabStop = (state: EditorState, stop: TabStop) => applyTabChanges(state, { operations: [{ type: "upsert", stop }] });
export const removeSelectedTabStop = (state: EditorState, position: number) => applyTabChanges(state, { operations: [{ type: "remove", position }] });
export const clearSelectedTabStops = (state: EditorState) => applyTabChanges(state, { operations: [{ type: "clear" }] });
export const resetSelectedTabStops = (state: EditorState) => applyTabChanges(state, { operations: [{ type: "reset" }] });
export const setDocumentTabSettings = (state: EditorState, documentSettings: Partial<TabSettings>) => applyTabChanges(state, { operations: [], documentSettings });
