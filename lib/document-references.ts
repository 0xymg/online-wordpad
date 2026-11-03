/** Persistent reference definitions, identity repair and editing. Layout results
 * are derived separately in reference-layout; positions never identify a target. */
import { Fragment, Slice, type Node as PMNode, type NodeSpec } from "prosemirror-model";
import { Plugin, TextSelection, NodeSelection, type Command, type Transaction } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import { dropPoint } from "prosemirror-transform";
import { selectedNoteRecords, parseNoteClipboard, planNoteClipboard, applyNotePaste, cleanupNoteRecords, NOTE_CLIPBOARD_ATTRIBUTE, type NoteClipboardPayload } from "./document-notes";
import { referenceLabels } from "./reference-i18n";
import { allocateDocumentIdentity, isDocumentIdentity, planDocumentIdentities, type IdentityTokenFactory } from "./document-identity";

export type ReferenceDisplay = "text" | "number" | "page";
export type ReferenceStatus = "ok" | "missing-target" | "ambiguous" | "unsupported" | "pending";
export type TocConfiguration = { fieldId: string; levels: number[]; status?: "unsupported"; nativeSource?: string };
export type ReferenceTarget = { id: string; pos: number; end: number; text: string; number: string; level: number; kind: "heading" | "bookmark" | "caption"; name: string; nativeName?: string };
export type ReferenceIndex = { targets: ReferenceTarget[]; byId: Map<string, ReferenceTarget[]>; fields: { pos: number; node: PMNode }[]; tocs: { pos: number; node: PMNode; fieldId: string; levels: number[]; status?: "unsupported"; nativeSource?: string }[] };
export const referenceParagraphAttrs = { targetId: { default: null }, targetKind: { default: null }, captionLabel: { default: null }, toc: { default: null }, tocOwnerId: { default: null }, tocTargetId: { default: null } };
export const referenceHeadingAttrs = { targetId: { default: null } };
const displays = new Set(["text", "number", "page"]), statuses = new Set(["ok", "missing-target", "ambiguous", "unsupported", "pending"]);
export function normalizeTocLevels(value: unknown): number[] {
  return Array.isArray(value) ? Array.from(new Set(value.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 6))).sort((a, b) => a - b) : [1, 2, 3];
}
export function parseReferenceParagraphAttrs(el: HTMLElement) {
  let toc = null;
  if (el.hasAttribute("data-edtr-toc")) { try { const value = JSON.parse(el.getAttribute("data-edtr-toc") || ""); if (value && typeof value.fieldId === "string") toc = { fieldId: value.fieldId, levels: normalizeTocLevels(value.levels), ...(value.status === "unsupported" ? { status: "unsupported" as const } : {}), ...(typeof value.nativeSource === "string" ? { nativeSource: value.nativeSource } : {}) }; } catch { /* Invalid metadata is not executable content. */ } }
  return { targetId: el.getAttribute("data-target-id"), targetKind: el.getAttribute("data-target-kind") === "caption" ? "caption" : null, captionLabel: el.getAttribute("data-caption-label"), toc, tocOwnerId: el.getAttribute("data-toc-owner-id"), tocTargetId: el.getAttribute("data-toc-target-id") };
}
export function referenceParagraphDOM(node: PMNode): Record<string, string> {
  const a = node.attrs, result: Record<string, string> = {};
  for (const [attr, name] of [["targetId", "target-id"], ["targetKind", "target-kind"], ["captionLabel", "caption-label"], ["tocOwnerId", "toc-owner-id"], ["tocTargetId", "toc-target-id"]]) if (a[attr]) result[`data-${name}`] = String(a[attr]);
  if (a.targetId) { result.id = `edtr-target-${a.targetId}`; result["data-edtr-target-id"] = String(a.targetId); }
  if (a.toc) result["data-edtr-toc"] = JSON.stringify(a.toc);
  if (a.tocOwnerId) result.contenteditable = "false";
  return result;
}
export const bookmarkStartNodeSpec: NodeSpec = {
  inline: true, group: "inline", atom: true, selectable: false,
  attrs: { targetId: { default: null }, name: { default: "" }, nativeName: { default: null } },
  parseDOM: [{ tag: 'span[data-edtr-bookmark="start"]', getAttrs: dom => { const el = dom as HTMLElement; return { targetId: el.getAttribute("data-target-id"), name: el.getAttribute("data-name") || "", nativeName: el.getAttribute("data-native-name") }; } }],
  toDOM: node => ["span", { "data-edtr-bookmark": "start", "data-target-id": node.attrs.targetId || "", "data-name": node.attrs.name, ...(node.attrs.nativeName ? { "data-native-name": node.attrs.nativeName } : {}), id: node.attrs.targetId ? `edtr-target-${node.attrs.targetId}` : "", "data-edtr-target-id": node.attrs.targetId || "", class: "edtr-bookmark-boundary", contenteditable: "false", "aria-hidden": "true" }],
};
export const bookmarkEndNodeSpec: NodeSpec = {
  inline: true, group: "inline", atom: true, selectable: false,
  attrs: { targetId: { default: null } },
  parseDOM: [{ tag: 'span[data-edtr-bookmark="end"]', getAttrs: dom => ({ targetId: (dom as HTMLElement).getAttribute("data-target-id") }) }],
  toDOM: node => ["span", { "data-edtr-bookmark": "end", "data-target-id": node.attrs.targetId || "", class: "edtr-bookmark-boundary", contenteditable: "false", "aria-hidden": "true" }],
};
function currentReferenceLabels() {
  const language = typeof document === "undefined" ? "en" : document.documentElement.lang.toLowerCase().split("-")[0];
  return referenceLabels((["en", "tr", "fr", "zh", "ar"].includes(language) ? language : "en") as Parameters<typeof referenceLabels>[0]);
}
export function referenceFieldText(node: PMNode): string {
  const labels = currentReferenceLabels();
  return String(node.attrs.cached || (node.attrs.status === "missing-target" ? labels.missing : node.attrs.status === "ambiguous" ? labels.ambiguous : node.attrs.status === "unsupported" ? labels.unsupported : "…"));
}
export const referenceFieldNodeSpec: NodeSpec = {
  inline: true, group: "inline", atom: true,
  attrs: { fieldId: { default: null }, targetId: { default: null }, display: { default: "text" }, cached: { default: "" }, status: { default: "pending" }, instruction: { default: null }, nativeName: { default: null }, nativeXml: { default: null } },
  parseDOM: [{ tag: "span[data-edtr-reference]", getAttrs: dom => {
    const el = dom as HTMLElement, display = el.getAttribute("data-display"), status = el.getAttribute("data-status");
    return { fieldId: el.getAttribute("data-field-id"), targetId: el.getAttribute("data-target-id"), display: display || "text", cached: el.getAttribute("data-cached") ?? el.textContent ?? "", status: displays.has(display || "text") && statuses.has(status || "") ? status : "unsupported", instruction: el.getAttribute("data-instruction"), nativeName: el.getAttribute("data-native-name"), nativeXml: el.getAttribute("data-native-xml") };
  } }],
  toDOM: node => { const a = node.attrs; return ["span", { "data-edtr-reference": "true", "data-field-id": a.fieldId || "", "data-target-id": a.targetId || "", "data-reference-target": a.targetId || "", "data-display": a.display, "data-cached": a.cached, "data-status": a.status, ...(a.instruction ? { "data-instruction": a.instruction } : {}), ...(a.nativeName ? { "data-native-name": a.nativeName } : {}), ...(a.nativeXml ? { "data-native-xml": a.nativeXml } : {}), contenteditable: "false", class: `edtr-reference-field edtr-reference-${a.status}`, role: "link", tabindex: "0" }, referenceFieldText(node)]; },
  leafText: referenceFieldText,
};
export function newReferenceIdentity(kind: "target" | "field", occupied: ReadonlySet<string> = new Set(), createToken: IdentityTokenFactory = () => crypto.randomUUID()): string {
  return allocateDocumentIdentity(kind, occupied, createToken);
}
export function collectReferenceIndex(doc: PMNode): ReferenceIndex {
  const targets: ReferenceTarget[] = [], fields: ReferenceIndex["fields"] = [], tocs: ReferenceIndex["tocs"] = [];
  const captions = new Map<string, number>(), ends = new Map<string, number[]>();
  doc.descendants((node, pos) => { if (node.attrs.noteOwnerId) return false; if (node.type.name === "bookmark_end") { const id = String(node.attrs.targetId || ""), list = ends.get(id) || []; list.push(pos); ends.set(id, list); } });
  doc.descendants((node, pos) => {
    const a = node.attrs;
    if (a.noteOwnerId) return false;
    if (node.type.name === "reference_field") fields.push({ pos, node });
    if (a.toc) tocs.push({ pos, node, fieldId: a.toc.fieldId, levels: normalizeTocLevels(a.toc.levels), ...(a.toc.status ? { status: a.toc.status } : {}), ...(a.toc.nativeSource ? { nativeSource: a.toc.nativeSource } : {}) });
    if (node.type.name === "heading") {
      const level = Math.max(1, Math.min(6, Number(a.level) || 1));
      targets.push({ id: String(a.targetId || ""), pos, end: pos + node.nodeSize, kind: "heading", level, text: node.textContent, number: "", name: node.textContent });
    } else if (a.targetKind === "caption") {
      const label = String(a.captionLabel || currentReferenceLabels().figure), count = (captions.get(label) || 0) + 1; captions.set(label, count);
      targets.push({ id: String(a.targetId || ""), pos, end: pos + node.nodeSize, kind: "caption", level: 0, text: node.textBetween(0, node.content.size, "", child => child.type.name === "reference_field" ? (child.attrs.targetId === a.targetId && child.attrs.display === "number" ? String(count) : String(child.attrs.cached || "")) : ""), number: String(count), name: label });
    } else if (node.type.name === "bookmark_start") {
      const id = String(a.targetId || ""), candidates = ends.get(id), end = candidates?.length === 1 && candidates[0] > pos ? candidates[0] : undefined;
      if (end === undefined) return; // An incomplete clipboard range never becomes a new target.
      const text = end === undefined ? "" : doc.textBetween(pos + node.nodeSize, end, " ", n => n.type.name === "reference_field" ? String(n.attrs.cached || "") : "");
      targets.push({ id, pos, end: end === undefined ? pos + node.nodeSize : end + 1, kind: "bookmark", level: 0, text, number: "", name: String(a.name || ""), ...(a.nativeName ? { nativeName: String(a.nativeName) } : {}) });
    }
  });
  const byId = new Map<string, ReferenceTarget[]>();
  for (const target of targets) { const list = byId.get(target.id) || []; list.push(target); byId.set(target.id, list); }
  return { targets, byId, fields, tocs };
}
export function lookupReferenceTarget(index: ReferenceIndex, id: unknown): { status: "ok"; target: ReferenceTarget } | { status: "missing-target" | "ambiguous" } {
  const targets = typeof id === "string" && isDocumentIdentity(id, "target") ? index.byId.get(id) : undefined;
  return !targets?.length ? { status: "missing-target" } : targets.length !== 1 ? { status: "ambiguous" } : { status: "ok", target: targets[0] };
}
function definitions(doc: PMNode) {
  const result: { key: string; kind: "target" | "field"; id: unknown }[] = [];
  doc.descendants((node, pos) => {
    if (node.attrs.noteOwnerId) return false;
    if (node.type.name === "heading" || node.attrs.targetKind === "caption" || node.type.name === "bookmark_start") result.push({ key: `t:${pos}`, kind: "target", id: node.attrs.targetId });
    if (node.type.name === "reference_field") result.push({ key: `f:${pos}`, kind: "field", id: node.attrs.fieldId });
    if (node.attrs.toc) result.push({ key: `c:${pos}`, kind: "field", id: node.attrs.toc.fieldId });
  }); return result;
}
function mapNodes(fragment: Fragment, visit: (node: PMNode, pos: number) => PMNode, offset = 0): Fragment {
  const children: PMNode[] = []; fragment.forEach((node, pos) => { const mapped = node.isLeaf ? node : node.copy(mapNodes(node.content, visit, offset + pos + 1)); children.push(visit(mapped, offset + pos)); }); return Fragment.fromArray(children);
}
/** Load-time repair is deterministic with injected entropy. Duplicated source
 * definitions are never resolved to an arbitrary winner. */
export function normalizeReferenceIdentities(doc: PMNode, createToken: IdentityTokenFactory = () => crypto.randomUUID(), splitIds: ReadonlySet<string> = new Set(), captionSplitIds: ReadonlySet<string> = new Set()): PMNode {
  // A caption owns one SEQ atom. Enter splits prose around that atom; it does
  // not define a second caption or make existing references ambiguous.
  if (captionSplitIds.size) {
    const keep = new Map<string, number>(), candidates = new Map<string, { pos: number; sequence: boolean; nonempty: boolean }[]>();
    doc.descendants((node, pos) => {
      if (node.attrs.targetKind !== "caption" || !captionSplitIds.has(node.attrs.targetId)) return;
      let sequence = false;
      node.descendants(child => { if (child.type.name === "reference_field" && child.attrs.targetId === node.attrs.targetId && child.attrs.display === "number" && /^\s*SEQ\b/i.test(child.attrs.instruction || "")) sequence = true; });
      const values = candidates.get(node.attrs.targetId) || []; values.push({ pos, sequence, nonempty: node.content.size > 0 }); candidates.set(node.attrs.targetId, values);
    });
    for (const [id, values] of candidates) {
      if (values.length < 2) continue;
      const sequence = values.filter(value => value.sequence);
      keep.set(id, (sequence.length === 1 ? sequence[0] : values.find(value => value.nonempty) || values[0]).pos);
    }
    doc = doc.copy(mapNodes(doc.content, (node, pos) => node.attrs.targetKind === "caption" && keep.has(node.attrs.targetId) && keep.get(node.attrs.targetId) !== pos
      ? node.type.create({ ...node.attrs, targetId: null, targetKind: null, captionLabel: null }, node.content, node.marks) : node));
  }
  const sourceDefinitions = definitions(doc);
  // Enter/page-break at offset zero inserts an empty heading before the
  // original content. The content-bearing half keeps the original identity.
  for (const id of splitIds) {
    const occurrences = sourceDefinitions.filter(definition => definition.kind === "target" && definition.id === id);
    if (occurrences.length !== 2) continue;
    const first = doc.nodeAt(Number(occurrences[0].key.slice(2))), second = doc.nodeAt(Number(occurrences[1].key.slice(2)));
    if (first?.type.name === "heading" && !first.content.size && second?.content.size) {
      const left = sourceDefinitions.indexOf(occurrences[0]), right = sourceDefinitions.indexOf(occurrences[1]);
      [sourceDefinitions[left], sourceDefinitions[right]] = [sourceDefinitions[right], sourceDefinitions[left]];
    }
  }
  const plan = planDocumentIdentities(sourceDefinitions, { mode: "preserve", createToken }), assignments = new Map(plan.assignments.map(a => [a.key, a]));
  const content = mapNodes(doc.content, (node, pos) => {
    if (node.isText) return node;
    const attrs = { ...node.attrs }, target = assignments.get(`t:${pos}`), field = assignments.get(`f:${pos}`), toc = assignments.get(`c:${pos}`);
    if (target) attrs.targetId = target.id;
    else if (node.type.name === "paragraph" && attrs.targetKind !== "caption") attrs.targetId = null;
    if (field) attrs.fieldId = field.id;
    if (toc) attrs.toc = { ...attrs.toc, fieldId: toc.id, levels: normalizeTocLevels(attrs.toc.levels) };
    if (node.type.name === "reference_field" && plan.ambiguous.has(attrs.targetId) && !splitIds.has(attrs.targetId)) { attrs.targetId = null; attrs.status = "ambiguous"; }
    if (node.type.name === "bookmark_end" && !plan.ambiguous.has(attrs.targetId)) attrs.targetId = plan.remap.get(attrs.targetId) || attrs.targetId;
    if (node.type.name === "heading" || attrs.targetKind === "caption" || node.type.name === "bookmark_start" || field || toc || node.type.name === "bookmark_end" || attrs.targetId !== node.attrs.targetId) return node.type.create(attrs, node.content, node.marks);
    return node;
  });
  return doc.copy(content);
}
function occupiedIdentities(doc: PMNode) { return new Set(definitions(doc).map(d => String(d.id || ""))); }
/** Clones a pasted subgraph. Existing targets are allowed only with a verified
 * local clipboard token; no HTML attribute can grant that provenance. */
export function cloneReferenceSlice(slice: Slice, destination: PMNode, options: { sameSession?: boolean; move?: boolean; createToken?: IdentityTokenFactory } = {}): Slice {
  // A bookmark boundary is meaningful only together with its unique partner.
  // In particular, a copied end must never attach itself to a destination start.
  const boundaries = new Map<string, { starts: number[]; ends: number[] }>();
  slice.content.descendants((node, pos) => {
    if (node.type.name !== "bookmark_start" && node.type.name !== "bookmark_end") return;
    const id = String(node.attrs.targetId || ""), pair = boundaries.get(id) || { starts: [], ends: [] };
    (node.type.name === "bookmark_start" ? pair.starts : pair.ends).push(pos); boundaries.set(id, pair);
  });
  const paired = new Set(Array.from(boundaries, ([id, pair]) =>
    isDocumentIdentity(id, "target") && pair.starts.length === 1 && pair.ends.length === 1 && pair.starts[0] < pair.ends[0] ? id : ""));
  const clean = (fragment: Fragment): Fragment => {
    const nodes: PMNode[] = [];
    fragment.forEach(node => {
      if (node.attrs.noteOwnerId || (node.type.name === "bookmark_start" || node.type.name === "bookmark_end") && !paired.has(node.attrs.targetId)) return;
      nodes.push(node.isLeaf ? node : node.copy(clean(node.content)));
    });
    return Fragment.fromArray(nodes);
  };
  const cleaned = clean(slice.content), maximum = Slice.maxOpen(cleaned);
  slice = new Slice(cleaned, Math.min(slice.openStart, maximum.openStart), Math.min(slice.openEnd, maximum.openEnd));
  const wrapper = destination.type.create(destination.attrs, slice.content), existing = occupiedIdentities(destination), sourceDefinitions = definitions(wrapper);
  const canMove = !!options.move && sourceDefinitions.every(d => !existing.has(String(d.id)));
  const plan = planDocumentIdentities(sourceDefinitions, { mode: canMove ? "preserve" : "clone", occupied: existing, createToken: options.createToken || (() => crypto.randomUUID()) }), assignments = new Map(plan.assignments.map(a => [a.key, a]));
  const available = options.sameSession ? new Set(collectReferenceIndex(destination).targets.map(t => t.id)) : new Set<string>();
  const content = mapNodes(slice.content, (node, pos) => {
    if (node.isText) return node; const attrs = { ...node.attrs };
    const target = assignments.get(`t:${pos}`), field = assignments.get(`f:${pos}`), toc = assignments.get(`c:${pos}`);
    if (target) attrs.targetId = target.id;
    if (field) attrs.fieldId = field.id;
    if (toc) attrs.toc = { ...attrs.toc, fieldId: toc.id };
    for (const key of ["tocOwnerId", "tocTargetId"]) if (attrs[key]) attrs[key] = plan.remap.get(attrs[key]) || null;
    if (node.type.name === "reference_field" || node.type.name === "bookmark_end") {
      const original = node.attrs.targetId, remapped = plan.remap.get(original);
      if (plan.ambiguous.has(original)) { attrs.targetId = null; if (field) attrs.status = "ambiguous"; }
      else if (remapped) attrs.targetId = remapped;
      else if (!available.has(original)) { attrs.targetId = null; if (field && attrs.status !== "unsupported" && attrs.status !== "ambiguous") attrs.status = "missing-target"; }
    }
    // A native alias is scoped to its import; a copied target receives a new alias on export.
    if (target && !canMove && "nativeName" in attrs) attrs.nativeName = null;
    return node.type.create(attrs, node.content, node.marks);
  });
  return new Slice(content, slice.openStart, slice.openEnd);
}
const REFERENCE_COMMAND = "edtr-reference-command", CLIPBOARD_MIME = "application/x-edtr-reference-token";
function withoutGeneratedNotes(slice: Slice): Slice {
  const clean = (fragment: Fragment): Fragment => { const nodes: PMNode[] = []; fragment.forEach(node => { if (node.attrs.noteOwnerId) return; nodes.push(node.isLeaf ? node : node.copy(clean(node.content))); }); return Fragment.fromArray(nodes); };
  const content = clean(slice.content), maximum = Slice.maxOpen(content);
  return new Slice(content, Math.min(slice.openStart, maximum.openStart), Math.min(slice.openEnd, maximum.openEnd));
}
function clipboardFingerprint(slice: Slice): string {
  // Compare content and the complete reference graph. HTML parsers normalize
  // paragraph formatting (null -> {}) and the section plugin strips native
  // boundaries; neither changes provenance of reference identities.
  const keys = ["targetId", "targetKind", "captionLabel", "toc", "tocOwnerId", "tocTargetId", "fieldId", "display", "cached", "status", "instruction", "nativeName", "nativeXml", "name", "noteId"];
  const graph = (node: PMNode): unknown => ({ type: node.type.name, ...(node.isText ? { text: node.text } : {}), attrs: Object.fromEntries(keys.filter(key => node.attrs[key] != null).map(key => [key, node.attrs[key]])), children: Array.from({ length: node.childCount }, (_, i) => graph(node.child(i))) });
  return JSON.stringify({ openStart: slice.openStart, openEnd: slice.openEnd, content: Array.from({ length: slice.content.childCount }, (_, i) => graph(slice.content.child(i))) });
}
function insertAfterSelectionBlock(state: import("prosemirror-state").EditorState, node: PMNode): Transaction {
  const { $to } = state.selection, pos = $to.depth > 0 ? $to.after(1) : $to.pos;
  const tr = state.tr.insert(pos, node);
  return tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1))).scrollIntoView();
}
function commandTransaction(tr: Transaction) { return closeHistory(cleanupNoteRecords(tr)).setMeta(REFERENCE_COMMAND, true); }
export function createBookmark(name: string): Command { return (state, dispatch) => {
  const { from, to, $from, $to } = state.selection;
  if (!name.trim() || from === to || !$from.parent.inlineContent || !$to.parent.inlineContent) return false;
  const id = newReferenceIdentity("target", occupiedIdentities(state.doc)), tr = state.tr.insert(to, state.schema.nodes.bookmark_end.create({ targetId: id })).insert(from, state.schema.nodes.bookmark_start.create({ targetId: id, name: name.trim() }));
  if (dispatch) dispatch(commandTransaction(tr)); return true;
}; }
export function insertCaption(label: string, text = ""): Command { return (state, dispatch) => {
  if (!label.trim()) return false;
  const occupied = occupiedIdentities(state.doc), id = newReferenceIdentity("target", occupied), fieldId = newReferenceIdentity("field", occupied);
  const caption = state.schema.nodes.paragraph.create({ targetId: id, targetKind: "caption", captionLabel: label.trim() }, [state.schema.text(`${label.trim()} `), state.schema.nodes.reference_field.create({ fieldId, targetId: id, display: "number", instruction: `SEQ ${label.trim()}`, status: "pending" }), ...(text ? [state.schema.text(` ${text}`)] : [])]);
  if (dispatch) dispatch(commandTransaction(insertAfterSelectionBlock(state, caption))); return true;
}; }
export function insertCrossReference(targetId: string, display: ReferenceDisplay): Command { return (state, dispatch) => {
  const target = lookupReferenceTarget(collectReferenceIndex(state.doc), targetId);
  if (!displays.has(display) || target.status !== "ok" || (display === "number" && !target.target.number)) return false;
  if (dispatch) dispatch(commandTransaction(state.tr.replaceSelectionWith(state.schema.nodes.reference_field.create({ fieldId: newReferenceIdentity("field", occupiedIdentities(state.doc)), targetId, display, status: "pending" })).scrollIntoView())); return true;
}; }
export function editCrossReference(pos: number, values: { targetId: string; display: ReferenceDisplay }): Command { return (state, dispatch) => {
  const node = state.doc.nodeAt(pos), target = lookupReferenceTarget(collectReferenceIndex(state.doc), values.targetId);
  if (node?.type.name !== "reference_field" || !displays.has(values.display) || target.status !== "ok" || (values.display === "number" && !target.target.number)) return false;
  if (dispatch) dispatch(commandTransaction(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...values, instruction: null, nativeName: null, nativeXml: null, status: "pending" }))); return true;
}; }
export function insertTableOfContents(levels: number[] = [1, 2, 3], title = currentReferenceLabels().toc): Command { return (state, dispatch) => {
  const normalized = normalizeTocLevels(levels); if (!normalized.length) return false;
  const marker = state.schema.nodes.paragraph.create({ toc: { fieldId: newReferenceIdentity("field", occupiedIdentities(state.doc)), levels: normalized } }, title ? state.schema.text(title) : undefined);
  if (dispatch) dispatch(commandTransaction(insertAfterSelectionBlock(state, marker))); return true;
}; }
export function updateTableOfContents(pos: number, levels: number[]): Command { return (state, dispatch) => {
  const node = state.doc.nodeAt(pos), normalized = normalizeTocLevels(levels); if (!node?.attrs.toc || !normalized.length) return false;
  if (dispatch) dispatch(commandTransaction(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, toc: { fieldId: node.attrs.toc.fieldId, levels: normalized } }))); return true;
}; }
export function navigateReferenceTarget(targetId: string): Command { return (state, dispatch) => {
  const result = lookupReferenceTarget(collectReferenceIndex(state.doc), targetId); if (result.status !== "ok") return false;
  if (dispatch) dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(Math.min(state.doc.content.size, result.target.pos + 1)))).scrollIntoView()); return true;
}; }
/** Clipboard provenance belongs to this editor instance and is invalidated on
 * full document loads, including reopening the same saved document identity. */
export function referenceIdentityPlugin(createToken: IdentityTokenFactory = () => crypto.randomUUID()): Plugin {
  const transfers = new Map<string, { document: unknown; slice: string; cut: boolean; consumed: boolean; notes: NoteClipboardPayload }>();
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (event.key !== "Enter") return false;
        const element = event.target as Element | null, link = element?.closest?.('a[href^="#edtr-target-"]');
        if (link) { event.preventDefault(); navigateReferenceTarget(link.getAttribute("href")!.slice("#edtr-target-".length))(view.state, view.dispatch, view); return true; }
        const fieldId = element?.closest?.("[data-edtr-reference]")?.getAttribute("data-field-id");
        const field = fieldId ? collectReferenceIndex(view.state.doc).fields.find(item => item.node.attrs.fieldId === fieldId)?.node : view.state.selection instanceof NodeSelection && view.state.selection.node.type.name === "reference_field" ? view.state.selection.node : null;
        if (!field) return false;
        event.preventDefault(); navigateReferenceTarget(field.attrs.targetId)(view.state, view.dispatch, view); return true;
      },
      handleClickOn(view, _pos, node, nodePos, event, direct) {
        if (direct && node.type.name === "reference_field" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault(); return navigateReferenceTarget(node.attrs.targetId)(view.state, view.dispatch, view);
        }
        return false;
      },
      handleClick(view, _pos, event) {
        const link = (event.target as Element | null)?.closest?.('a[href^="#edtr-target-"]');
        const href = link?.getAttribute("href");
        if (!href) return false;
        event.preventDefault(); return navigateReferenceTarget(href.slice("#edtr-target-".length))(view.state, view.dispatch, view);
      },
      handleDOMEvents: Object.fromEntries(["copy", "cut"].map(kind => [kind, (view: import("prosemirror-view").EditorView, event: Event) => {
        const clipboard = (event as ClipboardEvent).clipboardData;
        if (!clipboard || view.state.selection.empty) return false;
        const slice = withoutGeneratedNotes(view.state.selection.content()), serialized = view.serializeForClipboard(slice), token = crypto.randomUUID();
        const notes = selectedNoteRecords(serialized.slice, view.state.doc);
        if (Object.keys(notes.notes).length) {
          const carrier = serialized.dom.ownerDocument.createElement("div"); carrier.setAttribute(NOTE_CLIPBOARD_ATTRIBUTE, JSON.stringify(notes));
          while (serialized.dom.firstChild) carrier.appendChild(serialized.dom.firstChild);
          serialized.dom.appendChild(carrier);
        }
        transfers.clear(); transfers.set(token, { document: view.state.doc.attrs.documentModel?.id || view.state.doc, slice: clipboardFingerprint(serialized.slice), cut: kind === "cut", consumed: false, notes });
        clipboard.clearData(); clipboard.setData("text/html", serialized.dom.innerHTML); clipboard.setData("text/plain", serialized.text); clipboard.setData(CLIPBOARD_MIME, token); event.preventDefault();
        if (kind === "cut" && view.editable) view.dispatch(commandTransaction(view.state.tr.deleteSelection()).setMeta("uiEvent", "cut"));
        return true;
      }])),
      handleDrop(view, event, slice, moved) {
        // Internal copy-drag has the same provenance as copying within this view.
        // Leave moves and non-reference drops to ProseMirror and other plugins.
        if (moved || !view.dragging || clipboardFingerprint(view.dragging.slice) !== clipboardFingerprint(slice)) return false;
        let relevant = false;
        slice.content.descendants(node => { if (node.type.name === "heading" || node.type.name === "reference_field" || node.type.name.startsWith("bookmark_") || node.attrs.targetKind === "caption" || node.attrs.toc || node.attrs.tocOwnerId || node.type.name === "note_reference" || node.attrs.noteOwnerId) relevant = true; });
        if (!relevant) return false;
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (!coords) return false;
        const references = cloneReferenceSlice(slice, view.state.doc, { sameSession: true, createToken });
        const notePlan = planNoteClipboard(references, selectedNoteRecords(withoutGeneratedNotes(slice), view.state.doc), view.state.doc, { sameSession: true, createToken }), copied = notePlan.slice;
        if (!copied.size) return true;
        const pos = dropPoint(view.state.doc, coords.pos, copied) ?? coords.pos;
        const tr = commandTransaction(applyNotePaste(view.state.tr.replaceRange(pos, pos, copied), notePlan.notes)).setMeta("uiEvent", "drop");
        if (!tr.docChanged) return true;
        view.dispatch(tr.scrollIntoView()); view.focus(); return true;
      },
      handlePaste(view, event, slice) {
        if (Array.from(event.clipboardData?.files || []).some(file => file.type.startsWith("image/"))) return false;
        let relevant = false; slice.content.descendants(node => { if (node.type.name === "heading" || node.type.name === "reference_field" || node.type.name.startsWith("bookmark_") || node.attrs.targetKind === "caption" || node.attrs.toc || node.attrs.tocOwnerId || node.type.name === "note_reference" || node.attrs.noteOwnerId) relevant = true; });
        if (!relevant) return false;
        try {
          slice = withoutGeneratedNotes(slice);
          const html = event.clipboardData?.getData("text/html") || "";
          const carriers = html.includes(NOTE_CLIPBOARD_ATTRIBUTE) ? new DOMParser().parseFromString(html, "text/html").querySelectorAll(`[${NOTE_CLIPBOARD_ATTRIBUTE}]`) : [];
          if (carriers.length > 1) throw new Error("The copied note payload is ambiguous");
          const notes = parseNoteClipboard(carriers[0]?.getAttribute(NOTE_CLIPBOARD_ATTRIBUTE) || null, view.state.schema);
          if (notes && Object.values(notes.notes).some(record => record.kind === "footnote")) throw new Error("Page footnote layout is not available yet");
          const transfer = transfers.get(event.clipboardData?.getData(CLIPBOARD_MIME) || ""), document = view.state.doc.attrs.documentModel?.id || view.state.doc;
          const trusted = !!transfer && transfer.document === document && transfer.slice === clipboardFingerprint(slice) && JSON.stringify(transfer.notes) === JSON.stringify(notes || { version: 1, notes: {} });
          const existingDefinitions = occupiedIdentities(view.state.doc), incomingDefinitions = definitions(view.state.doc.type.create(view.state.doc.attrs, slice.content));
          const move = trusted && transfer!.cut && !transfer!.consumed && incomingDefinitions.every(definition => !existingDefinitions.has(String(definition.id))) && Object.keys(notes?.notes || {}).every(id => !Object.hasOwn(view.state.doc.attrs.documentModel?.notes || {}, id));
          const references = cloneReferenceSlice(slice, view.state.doc, { sameSession: trusted, move, createToken });
          const notePlan = planNoteClipboard(references, notes, view.state.doc, { sameSession: trusted, move, createToken }), pasted = notePlan.slice;
          if (!pasted.size) return true;
          const before = view.state.doc, tr = commandTransaction(applyNotePaste(view.state.tr.replaceSelection(pasted).scrollIntoView(), notePlan.notes)).setMeta("paste", true).setMeta("uiEvent", "paste");
          view.dispatch(tr);
          if (move && view.state.doc !== before) transfer!.consumed = true;
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          view.dom.dispatchEvent(new CustomEvent("edtr-note-error", { bubbles: true, detail: { error: message } }));
          event.preventDefault(); return true;
        }
      },
    },
    appendTransaction(transactions, _oldState, newState) {
      if (transactions.some(tr => tr.getMeta("documentLoad"))) transfers.clear();
      if (!transactions.some(tr => tr.docChanged)) return null;
      const splitIds = new Set<string>(), captionSplitIds = new Set<string>();
      for (const transaction of transactions) transaction.steps.forEach((step, index) => {
        const json = step.toJSON(), before = transaction.docs[index];
        if (json.stepType !== "replace" || !json.structure || json.from !== json.to || json.slice?.openStart !== 1 || json.slice?.openEnd !== 1 || json.slice?.content?.length !== 2) return;
        const original = before.resolve(json.from).parent;
        if (original.attrs.targetKind === "caption" && json.slice.content.every((child: { attrs?: { targetId?: string; targetKind?: string } }) => child.attrs?.targetKind === "caption" && child.attrs?.targetId === original.attrs.targetId)) captionSplitIds.add(original.attrs.targetId);
        if (original.type.name !== "heading") return;
        if (json.slice.content.every((child: { type: string; attrs?: { targetId?: string } }) => child.type === "heading" && child.attrs?.targetId === original.attrs.targetId)) splitIds.add(original.attrs.targetId);
      });
      const normalized = normalizeReferenceIdentities(newState.doc, createToken, splitIds, captionSplitIds), tr = newState.tr;
      normalized.descendants((node, pos) => { const current = tr.doc.nodeAt(pos); if (current && JSON.stringify(current.attrs) !== JSON.stringify(node.attrs)) tr.setNodeMarkup(pos, undefined, node.attrs); });
      if (tr.docChanged) return tr;
      return transactions.some(transaction => transaction.getMeta(REFERENCE_COMMAND)) ? closeHistory(tr).setMeta("addToHistory", false) : null;
    },
  });
}
