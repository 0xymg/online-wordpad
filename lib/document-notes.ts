/** Canonical note records, owner identities and derived ordinary-block endnotes.
 * Deliberately independent of document-model to keep migration imports acyclic. */
import { Fragment, Slice, type Mark, type Node as PMNode, type Schema } from "prosemirror-model";
import { EditorState, Plugin, TextSelection, type Command, type Transaction } from "prosemirror-state";
import { closeHistory, isHistoryTransaction } from "prosemirror-history";
import { Decoration, DecorationSet } from "prosemirror-view";
import { allocateDocumentIdentity, isDocumentIdentity, planDocumentIdentities, type IdentityTokenFactory } from "./document-identity";
import { effectiveParagraph, lineMetricFamily } from "./paragraph-format";

export type NoteKind = "footnote" | "endnote";
export type NoteNumbering = { restart: "continuous" | "eachSection"; start: number; format: "decimal" | "lowerRoman" | "upperRoman" | "lowerLetter" | "upperLetter" };
export type NotePolicy = { footnote: NoteNumbering & { placement: "pageBottom" }; endnote: NoteNumbering & { placement: "documentEnd" | "sectionEnd" } };
export type NoteBodyJSON = { type: "doc"; content: unknown[] };
export type NoteReferenceMark = { type: string; attrs?: Record<string, unknown> };
export type NoteSeparators = { separator: "default" | "none"; continuationSeparator: "default" | "none"; paragraphSpacing?: { separator?: "single-zero"; continuationSeparator?: "single-zero" } };
/** Presentation is canonical, independent of the source package's identities.
 * Missing presentation retains the appearance of notes authored before v7. */
export type NotePresentation = { version: 1; bodyReference: null | { marks: NoteReferenceMark[] }; separators?: NoteSeparators };
export type NoteRecord = { kind: NoteKind; body: NoteBodyJSON; presentation?: NotePresentation; native?: { partUri: string; nativeId: string; rawProperties?: string } };
export type NoteSectionPolicy = { footnote?: Partial<NoteNumbering>; endnote?: Partial<NoteNumbering> };
export type NoteModelShape = { version: number; finalSectionId: string; sections: Record<string, { notePolicy?: NoteSectionPolicy; [key: string]: unknown }>; notes: Record<string, NoteRecord>; notePolicy: NotePolicy; [key: string]: unknown };
export type NoteDiagnostic = { code: string; noteId?: string; pos?: number; message: string };
export type NoteEntry = { noteId: string; pos: number; sectionId: string; kind: NoteKind; ordinal: number; label: string; record: NoteRecord };
export type NoteIndex = { notes: NoteEntry[]; byId: Map<string, NoteEntry[]>; diagnostics: NoteDiagnostic[] };
export class NoteError extends Error { constructor(public code: string, message: string) { super(message); this.name = "NoteError"; } }
export const NOTE_COMMAND = "edtr-note-command", NOTE_PROJECTION = "edtr-note-projection";
const numberingKeys = new Set(["restart", "start", "format"]), formats = new Set(["decimal", "lowerRoman", "upperRoman", "lowerLetter", "upperLetter"]);
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function fail(code: string, message: string): never { throw new NoteError(code, message); }
export function defaultNotePolicy(): NotePolicy { return { footnote: { restart: "continuous", start: 1, format: "decimal", placement: "pageBottom" }, endnote: { restart: "continuous", start: 1, format: "decimal", placement: "documentEnd" } }; }
function validateNumbering(value: unknown, partial = false): void {
  if (!plain(value)) fail("invalid-note-policy", "Invalid note numbering settings");
  for (const key of Object.keys(value)) if (!numberingKeys.has(key) && key !== "placement") fail("invalid-note-policy", "Unknown note numbering setting");
  if ((!partial || value.restart !== undefined) && !["continuous", "eachSection"].includes(String(value.restart))) fail("invalid-note-policy", "Unsupported note numbering restart");
  if ((!partial || value.start !== undefined) && (!Number.isSafeInteger(value.start) || Number(value.start) < 1 || Number(value.start) > 2147483647)) fail("invalid-note-policy", "Invalid note numbering start");
  if (["lowerRoman", "upperRoman"].includes(String(value.format)) && Number(value.start) > 3999) fail("invalid-note-policy", "Roman note numbers above 3999 are unsupported");
  if ((!partial || value.format !== undefined) && !formats.has(String(value.format))) fail("invalid-note-policy", "Unsupported note numbering format");
}
export function validateNotePolicy(value: unknown): asserts value is NotePolicy {
  if (!plain(value) || Object.keys(value).some(key => !["footnote", "endnote"].includes(key))) fail("invalid-note-policy", "Invalid note policy");
  validateNumbering(value.footnote); validateNumbering(value.endnote);
  if ((value.footnote as NotePolicy["footnote"]).placement !== "pageBottom" || !["documentEnd", "sectionEnd"].includes((value.endnote as NotePolicy["endnote"]).placement)) fail("invalid-note-policy", "Unsupported note placement");
}
const allowedNodes = new Set(["doc", "paragraph", "bullet_list", "ordered_list", "list_item", "text", "hard_break", "tab"]);
const allowedMarks = new Set(["strong", "em", "underline", "strikethrough", "superscript", "subscript", "textColor", "bgColor", "fontSize", "fontFamily", "link", "code"]);
const forbiddenAttrs = new Set(["sectionEndId", "targetId", "targetKind", "captionLabel", "toc", "tocOwnerId", "tocTargetId", "noteId", "noteOwnerId", "noteBlock", "noteScope", "noteSectionId", "fieldId", "documentModel", "layout"]);
/** Validate source JSON before nodeFromJSON can silently discard unknown attrs. */
function validateBodyJSON(value: unknown, schema?: Schema, root = true): void {
  if (!plain(value) || typeof value.type !== "string" || !allowedNodes.has(value.type) || (root ? value.type !== "doc" : value.type === "doc")) fail("unsupported-note-body", "Unsupported note body node");
  if (Object.keys(value).some(key => !["type", "attrs", "content", "marks", "text"].includes(key))) fail("unsupported-note-body", "Unknown note body data");
  if (value.attrs !== undefined) {
    if (!plain(value.attrs)) fail("invalid-note-body", "Invalid note body attributes");
    for (const [key, item] of Object.entries(value.attrs)) {
      if (forbiddenAttrs.has(key) && item != null) fail("unsupported-note-body", "Notes cannot contain document identities or section boundaries");
      if (schema && !Object.hasOwn(schema.nodes[value.type]?.spec.attrs || {}, key)) fail("unsupported-note-body", "Unknown note body attribute");
      if (key === "docxProperties" && typeof item === "string" && /<(?:\w+:)?(?:sectPr|fldSimple|fldChar|instrText)\b/.test(item)) fail("unsupported-note-body", "Unsupported native note body properties");
    }
  }
  if (value.marks !== undefined) {
    if (!Array.isArray(value.marks)) fail("invalid-note-body", "Invalid note marks");
    for (const mark of value.marks) {
      if (!plain(mark) || typeof mark.type !== "string" || !allowedMarks.has(mark.type) || (schema && !schema.marks[mark.type])) fail("unsupported-note-body", "Unsupported note text mark");
      if (Object.keys(mark).some(key => !["type", "attrs"].includes(key)) || mark.attrs !== undefined && !plain(mark.attrs)) fail("invalid-note-body", "Invalid note mark data");
      if (schema && plain(mark.attrs) && Object.keys(mark.attrs).some(key => !Object.hasOwn(schema.marks[String(mark.type)].spec.attrs || {}, key))) fail("unsupported-note-body", "Unknown note mark attribute");
      if (mark.type === "link") {
        const href = plain(mark.attrs) ? mark.attrs.href : undefined;
        if (typeof href !== "string" || !/^(?:https?:|mailto:|tel:)/i.test(href)) fail("unsupported-note-body", "Only external note links are supported");
      }
    }
  }
  if (value.content !== undefined && !Array.isArray(value.content)) fail("invalid-note-body", "Invalid note body content");
  for (const child of (value.content as unknown[] | undefined) || []) validateBodyJSON(child, schema, false);
}
export function validateNoteBody(value: unknown, schema: Schema): NoteBodyJSON {
  validateBodyJSON(value, schema);
  const input = value as NoteBodyJSON;
  const normalized = !input.content?.length ? { type: "doc", content: [{ type: "paragraph" }] } : input;
  try { const node = schema.nodeFromJSON(normalized); node.check(); return node.toJSON() as NoteBodyJSON; }
  catch (error) { fail("invalid-note-body", error instanceof Error ? error.message : "Invalid note body"); }
}
export function validateNoteModel(value: unknown, schema?: Schema): asserts value is NoteModelShape {
  if (!plain(value) || !plain(value.notes) || !plain(value.sections)) fail("invalid-note-model", "Invalid note registry");
  validateNotePolicy(value.notePolicy);
  for (const section of Object.values(value.sections)) {
    if (!plain(section)) fail("invalid-note-policy", "Invalid note section");
    if (section.notePolicy !== undefined) {
      if (!plain(section.notePolicy) || Object.keys(section.notePolicy).some(key => !["footnote", "endnote"].includes(key))) fail("invalid-note-policy", "Invalid section note policy");
      for (const policy of Object.values(section.notePolicy)) { validateNumbering(policy, true); if (Object.hasOwn(policy as object, "placement")) fail("invalid-note-policy", "Section overrides cannot change note placement"); }
    }
  }
  for (const [id, record] of Object.entries(value.notes)) {
    if (!isDocumentIdentity(id, "note") || !plain(record) || Object.keys(record).some(key => !["kind", "body", "native", "presentation"].includes(key)) || !["footnote", "endnote"].includes(String(record.kind))) fail("invalid-note-record", "Invalid note record identity, kind or data");
    if (schema) validateNoteBody(record.body, schema); else validateBodyJSON(record.body);
    if (record.presentation !== undefined) {
      const presentation = record.presentation;
      if (!plain(presentation) || presentation.version !== 1 || Object.keys(presentation).some(key => !["version", "bodyReference", "separators"].includes(key))) fail("unsupported-note-presentation", "Unsupported note presentation version or data");
      if (presentation.bodyReference !== null) {
        const reference = presentation.bodyReference;
        if (!plain(reference) || Object.keys(reference).some(key => key !== "marks") || !Array.isArray(reference.marks) || reference.marks.some(mark => !plain(mark) || mark.type === "link")) fail("unsupported-note-presentation", "Invalid note body reference appearance");
        validateBodyJSON({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "1", marks: reference.marks }] }] }, schema);
      }
      if (presentation.separators !== undefined) {
        const separators = presentation.separators;
        if (!plain(separators) || Object.keys(separators).some(key => !["separator", "continuationSeparator", "paragraphSpacing"].includes(key)) || !["default", "none"].includes(String(separators.separator)) || !["default", "none"].includes(String(separators.continuationSeparator))) fail("unsupported-note-presentation", "Unsupported note separator appearance");
        if (separators.paragraphSpacing !== undefined && (!plain(separators.paragraphSpacing) || Object.entries(separators.paragraphSpacing).some(([key, spacing]) => !["separator", "continuationSeparator"].includes(key) || spacing !== "single-zero" || separators[key] !== "default"))) fail("unsupported-note-presentation", "Unsupported note separator paragraph spacing");
      }
    }
    if (record.native !== undefined && (!plain(record.native) || Object.keys(record.native).some(key => !["partUri", "nativeId", "rawProperties"].includes(key)) || typeof record.native.partUri !== "string" || typeof record.native.nativeId !== "string" || (record.native.rawProperties !== undefined && typeof record.native.rawProperties !== "string"))) fail("invalid-note-record", "Invalid native note metadata");
  }
  for (const kind of ["footnote", "endnote"] as const) noteSeparators(value.notes as Record<string, NoteRecord>, kind);
}
/** Source marks remain semantic PM marks, so both physical and generated notes
 * use the shared schema serializer and never invent a superscript or a space. */
export function noteBodyReference(record: NoteRecord, _label: string, schema: Schema): { marks: readonly Mark[]; trailingSpace: boolean } | null {
  if (record.presentation?.bodyReference === null) return null;
  if (record.presentation) return { marks: record.presentation.bodyReference!.marks.map(mark => schema.markFromJSON(mark)), trailingSpace: false };
  return { marks: schema.marks.superscript ? [schema.marks.superscript.create()] : [], trailingSpace: true };
}
export function noteSeparators(notes: Record<string, NoteRecord>, kind: NoteKind): NoteSeparators {
  let selected: NoteSeparators | undefined;
  for (const record of Object.values(notes)) if (record.kind === kind && record.presentation?.separators) {
    const profile = record.presentation.separators;
    if (selected && (selected.separator !== profile.separator || selected.continuationSeparator !== profile.continuationSeparator || selected.paragraphSpacing?.separator !== profile.paragraphSpacing?.separator || selected.paragraphSpacing?.continuationSeparator !== profile.paragraphSpacing?.continuationSeparator)) fail("unsupported-note-presentation", "Notes of the same kind have conflicting separator appearance");
    selected = profile;
  }
  return selected || { separator: "default", continuationSeparator: "default" };
}
function modelOf(doc: PMNode): NoteModelShape | null { const model = doc.attrs.documentModel; return model?.version >= 5 ? model as NoteModelShape : null; }
export function noteNumberLabel(number: number, format: NoteNumbering["format"]): string {
  if (!Number.isSafeInteger(number) || number < 1 || number > 2147483647 || !formats.has(format)) fail("note-number-out-of-range", "Invalid note number or format");
  if (format === "decimal") return String(number);
  if (format === "lowerLetter" || format === "upperLetter") { let n = number, text = ""; while (n > 0) { text = String.fromCharCode(65 + (n - 1) % 26) + text; n = Math.floor((n - 1) / 26); } return format === "lowerLetter" ? text.toLowerCase() : text; }
  if (number > 3999) fail("note-number-out-of-range", "Roman note numbers above 3999 are unsupported");
  let n = number, text = ""; for (const [amount, letters] of [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]] as const) while (n >= amount) { text += letters; n -= amount; }
  return format === "lowerRoman" ? text.toLowerCase() : text;
}
function noteOwners(doc: PMNode): { noteId: string; pos: number; sectionId: string }[] {
  const model = modelOf(doc), sections: { from: number; to: number; id: string }[] = []; let from = 0;
  doc.forEach((node, pos) => { if (node.attrs.sectionEndId) { sections.push({ from, to: pos + node.nodeSize, id: node.attrs.sectionEndId }); from = pos + node.nodeSize; } });
  sections.push({ from, to: doc.content.size + 1, id: model?.finalSectionId || "" });
  const owners: { noteId: string; pos: number; sectionId: string }[] = [];
  doc.descendants((node, pos) => { if (node.attrs.noteOwnerId) return false; if (node.type.name === "note_reference") owners.push({ noteId: node.attrs.noteId, pos, sectionId: sections.find(section => pos >= section.from && pos < section.to)?.id || "" }); });
  return owners;
}
export function validateNoteGraph(doc: PMNode): NoteDiagnostic[] {
  const model = modelOf(doc), diagnostics: NoteDiagnostic[] = [], owners = noteOwners(doc), counts = new Map<string, number>();
  if (!model) return owners.length ? [{ code: "missing-note-model", message: "Notes require document model version 5" }] : [];
  try { validateNoteModel(model, doc.type.schema); } catch (error) { diagnostics.push({ code: error instanceof NoteError ? error.code : "invalid-note-model", message: error instanceof Error ? error.message : String(error) }); return diagnostics; }
  for (const owner of owners) {
    counts.set(owner.noteId, (counts.get(owner.noteId) || 0) + 1);
    if (!isDocumentIdentity(owner.noteId, "note")) diagnostics.push({ ...owner, code: "invalid-note-owner", message: "Invalid note owner identity" });
    else if (!Object.hasOwn(model.notes, owner.noteId)) diagnostics.push({ ...owner, code: "missing-note-body", message: "The note body is missing" });
    if (!Object.hasOwn(model.sections, owner.sectionId)) diagnostics.push({ ...owner, code: "missing-note-section", message: "The owner section is missing" });
  }
  for (const [noteId, count] of counts) if (count > 1) diagnostics.push({ noteId, code: "duplicate-note-owner", message: "A note must have exactly one owner" });
  for (const noteId of Object.keys(model.notes)) if (!counts.has(noteId)) diagnostics.push({ noteId, code: "orphan-note", message: "The note has no owner" });
  return diagnostics;
}
export function collectNoteIndex(doc: PMNode): NoteIndex {
  const notes: NoteEntry[] = [], byId = new Map<string, NoteEntry[]>(), diagnostics = validateNoteGraph(doc), model = modelOf(doc);
  if (!model || diagnostics.some(item => !["orphan-note", "duplicate-note-owner", "missing-note-body", "invalid-note-owner", "missing-note-section"].includes(item.code))) return { notes, byId, diagnostics };
  const counters = new Map<string, number>();
  for (const owner of noteOwners(doc)) {
    const record = model.notes[owner.noteId]; if (!record) continue;
    const policy = { ...model.notePolicy[record.kind], ...model.sections[owner.sectionId]?.notePolicy?.[record.kind] };
    const key = `${record.kind}:${policy.restart === "eachSection" ? owner.sectionId : "document"}`;
    const ordinal = counters.has(key) ? counters.get(key)! + 1 : policy.start; counters.set(key, ordinal);
    let label = "…"; try { label = noteNumberLabel(ordinal, policy.format); } catch (error) { diagnostics.push({ noteId: owner.noteId, pos: owner.pos, code: "note-number-out-of-range", message: String(error) }); }
    const entry = { ...owner, kind: record.kind, ordinal, label, record }; notes.push(entry); const found = byId.get(owner.noteId) || []; found.push(entry); byId.set(owner.noteId, found);
  }
  return { notes, byId, diagnostics };
}
export const noteProjectionAttrs = { noteOwnerId: { default: null }, noteBlock: { default: null }, noteScope: { default: null }, noteSectionId: { default: null } };
export function parseNoteProjectionAttrs(el: HTMLElement) { const block = el.getAttribute("data-note-block"); return { noteOwnerId: el.getAttribute("data-note-owner-id"), noteBlock: block === null ? null : Number(block), noteScope: el.getAttribute("data-note-scope"), noteSectionId: el.getAttribute("data-note-section-id") }; }
export function noteProjectionDOM(node: PMNode): Record<string, string> { const a = node.attrs; return a.noteOwnerId ? { "data-note-owner-id": a.noteOwnerId, "data-note-block": String(a.noteBlock), "data-note-scope": a.noteScope, ...(a.noteSectionId ? { "data-note-section-id": a.noteSectionId } : {}), contenteditable: "false" } : {}; }
function commandModel(doc: PMNode): NoteModelShape { const model = modelOf(doc); if (!model) fail("missing-note-model", "Notes require document model version 5"); validateNoteModel(model, doc.type.schema); return model; }
function assertGraph(doc: PMNode, allowOrphans = false) { const diagnostics = validateNoteGraph(doc).filter(item => !allowOrphans || item.code !== "orphan-note"); if (diagnostics.length) fail(diagnostics[0].code, diagnostics[0].message); }
function noteTransaction(tr: Transaction): Transaction { return closeHistory(tr).setMeta(NOTE_COMMAND, true); }
function canEdit(state: Parameters<Command>[0]) { for (let depth = state.selection.$from.depth; depth > 0; depth--) if (state.selection.$from.node(depth).attrs.noteOwnerId || state.selection.$from.node(depth).attrs.tocOwnerId) return false; return true; }
export function insertNote(kind: NoteKind, body: unknown = { type: "doc", content: [{ type: "paragraph" }] }, createToken: IdentityTokenFactory = () => crypto.randomUUID()): Command { return (state, dispatch) => {
  if (!["footnote", "endnote"].includes(kind) || !state.schema.nodes.note_reference || !state.selection.$from.parent.inlineContent || !canEdit(state)) return false;
  const model = commandModel(state.doc), record: NoteRecord = { kind, body: validateNoteBody(body, state.schema) }, id = allocateDocumentIdentity("note", new Set(Object.keys(model.notes)), createToken);
  const tr = state.tr.replaceSelectionWith(state.schema.nodes.note_reference.create({ noteId: id })).setDocAttribute("documentModel", { ...model, notes: { ...model.notes, [id]: record } });
  if (dispatch) dispatch(noteTransaction(cleanupNoteRecords(tr)).scrollIntoView()); return true;
}; }
export function updateNoteBody(noteId: string, body: unknown): Command { return (state, dispatch) => { const model = commandModel(state.doc); if (!Object.hasOwn(model.notes, noteId)) return false; const record = { ...model.notes[noteId], body: validateNoteBody(body, state.schema) }; if (dispatch) dispatch(noteTransaction(state.tr.setDocAttribute("documentModel", { ...model, notes: { ...model.notes, [noteId]: record } }))); return true; }; }
export function deleteNote(noteId: string): Command { return (state, dispatch) => { const model = commandModel(state.doc), owners = noteOwners(state.doc).filter(owner => owner.noteId === noteId); if (!model.notes[noteId] || owners.length !== 1) return false; const notes = { ...model.notes }; delete notes[noteId]; if (dispatch) dispatch(noteTransaction(state.tr.delete(owners[0].pos, owners[0].pos + 1).setDocAttribute("documentModel", { ...model, notes }))); return true; }; }
export function convertNote(noteId: string, kind: NoteKind): Command { return (state, dispatch) => { const model = commandModel(state.doc); if (!model.notes[noteId] || !["footnote", "endnote"].includes(kind)) return false; const record = { ...model.notes[noteId], kind }; delete record.native; if (record.presentation) record.presentation = { version: 1, bodyReference: record.presentation.bodyReference }; if (dispatch) dispatch(noteTransaction(state.tr.setDocAttribute("documentModel", { ...model, notes: { ...model.notes, [noteId]: record } }))); return true; }; }
export function setNotePolicy(patch: Partial<{ footnote: Partial<NotePolicy["footnote"]>; endnote: Partial<NotePolicy["endnote"]> }>, scope: "document" | "section" = "document", sectionId?: string): Command { return (state, dispatch) => {
  const model = commandModel(state.doc); let next: NoteModelShape;
  if (scope === "document") { const notePolicy = { footnote: { ...model.notePolicy.footnote, ...patch.footnote }, endnote: { ...model.notePolicy.endnote, ...patch.endnote } }; validateNotePolicy(notePolicy); next = { ...model, notePolicy }; }
  else { const section = sectionId && model.sections[sectionId]; if (!section || !sectionId) return false; const notePolicy = { ...section.notePolicy }; for (const kind of ["footnote", "endnote"] as const) if (patch[kind]) { if (Object.hasOwn(patch[kind]!, "placement")) fail("invalid-note-policy", "Section overrides cannot change placement"); notePolicy[kind] = { ...notePolicy[kind], ...patch[kind] }; validateNumbering(notePolicy[kind], true); } next = { ...model, sections: { ...model.sections, [sectionId]: { ...section, notePolicy } } }; }
  if (dispatch) dispatch(noteTransaction(state.tr.setDocAttribute("documentModel", next))); return true;
}; }
export function navigateNoteOwner(noteId: string): Command { return (state, dispatch) => { const owners = noteOwners(state.doc).filter(owner => owner.noteId === noteId); if (owners.length !== 1) return false; if (dispatch) dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(owners[0].pos))).scrollIntoView()); return true; }; }
/** Appended to the original owner edit, so undo restores both graph halves. */
export function cleanupNoteRecords(tr: Transaction): Transaction { const model = modelOf(tr.doc); if (!model) return tr; const owned = new Set(noteOwners(tr.doc).map(owner => owner.noteId)), notes = Object.fromEntries(Object.entries(model.notes).filter(([id]) => owned.has(id))); if (Object.keys(notes).length !== Object.keys(model.notes).length) tr.setDocAttribute("documentModel", { ...model, notes }); return tr; }
export function refreshNoteLabels(tr: Transaction): Transaction { const index = collectNoteIndex(tr.doc); if (index.diagnostics.length) fail(index.diagnostics[0].code, index.diagnostics[0].message); for (const entry of index.notes) { const node = tr.doc.nodeAt(entry.pos)!; if (Object.hasOwn(node.attrs, "cachedLabel") && node.attrs.cachedLabel !== entry.label) tr.setNodeMarkup(entry.pos, undefined, { ...node.attrs, cachedLabel: entry.label }); } return tr; }
/** Full-load cache validation. Interactive edits may temporarily retain old
 * cache records, so this is intentionally separate from owner-graph cleanup. */
export function validateNoteProjection(doc: PMNode): NoteDiagnostic[] {
  const model = modelOf(doc), diagnostics: NoteDiagnostic[] = [], seen = new Set<string>();
  let active: string | null = null, expectedBlock = 0;
  const entries = collectNoteIndex(doc).byId;
  doc.descendants((node, pos, parent) => {
    if (!node.attrs.noteOwnerId) return;
    const noteId = String(node.attrs.noteOwnerId), record = model?.notes[noteId];
    const report = (message: string) => diagnostics.push({ code: "invalid-note-projection", noteId, pos, message });
    if (parent?.type.name !== "doc") { report("Generated note markers must be top-level"); return false; }
    if (!["paragraph", "bullet_list", "ordered_list"].includes(node.type.name) || !record || record.kind !== "endnote" || entries.get(noteId)?.length !== 1) report("Generated note block has no unique canonical endnote");
    if (active !== noteId) { if (seen.has(noteId)) report("Generated note blocks are not contiguous"); seen.add(noteId); active = noteId; expectedBlock = 0; }
    if (node.attrs.noteBlock !== expectedBlock++) report("Generated note block sequence is invalid");
    if (!model || node.attrs.noteScope !== model.notePolicy.endnote.placement) report("Generated note scope is invalid");
    const section = model?.notePolicy.endnote.placement === "documentEnd" ? model.finalSectionId : entries.get(noteId)?.[0]?.sectionId;
    if (node.attrs.noteSectionId && node.attrs.noteSectionId !== section || node.attrs.sectionEndId && node.attrs.sectionEndId !== section) report("Generated note section terminal is invalid");
    node.descendants(child => { if (!allowedNodes.has(child.type.name) || child.attrs.noteOwnerId || child.attrs.sectionEndId || child.type.name === "note_reference" || child.attrs.targetId || child.attrs.toc) report("Generated note content contains nested document identities"); });
    return false;
  });
  // Reset contiguity at every canonical block, even when the same note repeats.
  let prior: string | null = null; const ended = new Set<string>();
  doc.forEach((node, pos) => { const owner = node.attrs.noteOwnerId || null; if (prior && prior !== owner) ended.add(prior); if (owner && owner !== prior && ended.has(owner)) diagnostics.push({ code: "invalid-note-projection", noteId: owner, pos, message: "Generated note blocks are not contiguous" }); prior = owner; });
  return diagnostics;
}
/** Remove only generated top-level blocks, restoring their terminal boundary. */
export function unprojectEndnotes(tr: Transaction): Transaction {
  const runs: { from: number; to: number; boundary: string | null; previous: number | null }[] = [];
  let previous: number | null = null, run: typeof runs[number] | null = null;
  tr.doc.forEach((node, pos) => {
    if (node.attrs.noteOwnerId) {
      if (!isDocumentIdentity(node.attrs.noteOwnerId, "note") || !Number.isInteger(node.attrs.noteBlock) || node.attrs.noteBlock < 0 || !["documentEnd", "sectionEnd"].includes(node.attrs.noteScope)) fail("invalid-note-projection", "Invalid generated note block markers");
      if (!run) { run = { from: pos, to: pos, boundary: null, previous }; runs.push(run); }
      if (run.boundary) fail("invalid-note-projection", "Generated note content follows a section terminal");
      run.to = pos + node.nodeSize; if (node.attrs.sectionEndId) run.boundary = node.attrs.sectionEndId;
    } else { run = null; previous = pos; }
  });
  for (const item of runs.reverse()) {
    if (item.boundary) {
      if (item.previous !== null) {
        const prior = tr.doc.nodeAt(item.previous)!;
        if (!Object.hasOwn(prior.attrs, "sectionEndId") || prior.attrs.sectionEndId) fail("invalid-note-projection", "Cannot restore the generated note section terminal");
        tr.setNodeMarkup(item.previous, undefined, { ...prior.attrs, sectionEndId: item.boundary });
      } else {
        tr.insert(item.from, tr.doc.type.schema.nodes.paragraph.create({ sectionEndId: item.boundary }));
        const size = tr.doc.type.schema.nodes.paragraph.create().nodeSize;
        tr.delete(item.from + size, item.to + size); continue;
      }
    }
    tr.delete(item.from, item.to);
  }
  return tr;
}
function prefixNoteNumber(node: PMNode, label: string, record: NoteRecord, found: { value: boolean }): PMNode {
  if (!found.value && node.type.name === "paragraph") { found.value = true; const reference = noteBodyReference(record, label, node.type.schema); if (!reference) return node; const prefix = [node.type.schema.text(label, reference.marks), ...(reference.trailingSpace ? [node.type.schema.text(" ")] : [])]; return node.copy(Fragment.fromArray(prefix).append(node.content)); }
  return node.isLeaf ? node : node.copy(Fragment.fromArray(Array.from({ length: node.childCount }, (_, index) => prefixNoteNumber(node.child(index), label, record, found))));
}
/** Font metric invalidation belongs to this derived tree. A separate paragraph
 * refresh cannot edit the protected cache, nor should it write back to bodies. */
function noteProjectionFontMetrics(node: PMNode): PMNode {
  const projected = node.isLeaf ? node : node.copy(Fragment.fromArray(Array.from({ length: node.childCount }, (_, index) => noteProjectionFontMetrics(node.child(index)))));
  if (projected.type.name !== "paragraph" || !Object.hasOwn(projected.type.spec.attrs || {}, "lineMetricFamily")) return projected;
  const format = effectiveParagraph(projected);
  if (format.lineMode !== "multiple" || format.lineBasis !== "font") return projected;
  return projected.type.create({ ...projected.attrs, lineMetricFamily: lineMetricFamily(projected) }, projected.content, projected.marks);
}
/** Derived ordinary paragraphs/lists; canonical bodies always remain in the pool. */
export function projectEndnotes(tr: Transaction): Transaction {
  const model = modelOf(tr.doc); if (!model) return tr;
  const original = tr.doc, scratch = unprojectEndnotes(EditorState.create({ doc: original }).tr);
  assertGraph(scratch.doc);
  const index = collectNoteIndex(scratch.doc), canonical = scratch.doc;
  if (index.diagnostics.length) fail(index.diagnostics[0].code, index.diagnostics[0].message);
  const endpoints: { id: string; pos: number; node: PMNode; final: boolean }[] = [];
  canonical.forEach((node, pos) => { if (node.attrs.sectionEndId) endpoints.push({ id: node.attrs.sectionEndId, pos, node, final: false }); });
  const last = canonical.lastChild;
  if (!last) fail("invalid-note-projection", "A document must contain a canonical block");
  endpoints.push({ id: model.finalSectionId, pos: canonical.content.size - last.nodeSize, node: last, final: true });
  for (const endpoint of endpoints.reverse()) {
    const entries = index.notes.filter(entry => entry.kind === "endnote" && (model.notePolicy.endnote.placement === "documentEnd" ? endpoint.final : entry.sectionId === endpoint.id));
    if (!entries.length) continue;
    const projected: PMNode[] = [];
    for (const entry of entries) {
      const body = canonical.type.schema.nodeFromJSON(validateNoteBody(entry.record.body, canonical.type.schema)), prefixed = { value: false };
      body.forEach((block, _offset, blockIndex) => {
        if (!Object.hasOwn(block.type.spec.attrs || {}, "noteOwnerId")) fail("unsupported-note-projection", "This body block cannot carry generated note markers");
        const node = noteProjectionFontMetrics(prefixNoteNumber(block, entry.label, entry.record, prefixed));
        projected.push(node.type.create({ ...node.attrs, noteOwnerId: entry.noteId, noteBlock: blockIndex, noteScope: model.notePolicy.endnote.placement, noteSectionId: endpoint.id, sectionEndId: null }, node.content, node.marks));
      });
    }
    if (!endpoint.final) {
      const terminal = projected[projected.length - 1];
      if (!Object.hasOwn(terminal.attrs, "sectionEndId")) fail("unsupported-note-projection", "The generated terminal block cannot carry a section boundary");
      projected[projected.length - 1] = terminal.type.create({ ...terminal.attrs, sectionEndId: endpoint.id }, terminal.content, terminal.marks);
      scratch.setNodeMarkup(endpoint.pos, undefined, { ...endpoint.node.attrs, sectionEndId: null });
    }
    scratch.insert(endpoint.pos + endpoint.node.nodeSize, projected);
  }
  if (scratch.doc.eq(original)) return tr;
  for (const step of scratch.steps) tr.step(step);
  return tr.setMeta(NOTE_PROJECTION, true);
}

/** A replacement may remove whole generated blocks together with source text,
 * but must never join a cache prefix/suffix into canonical user content. Inspect
 * each step against its own pre-step document; final positions cannot identify
 * which side of a cache boundary supplied the surviving text. */
function unsafeGeneratedEdit(tr: Transaction): boolean {
  for (let index = 0; index < tr.steps.length; index++) {
    const step = tr.steps[index], data = step.toJSON(), before = tr.docs[index];
    if (typeof data.from !== "number" || typeof data.to !== "number") continue;
    const from = data.from as number, to = data.to as number;
    let generated = false, canonical = false, partial = false, safeMarkup = false, movedCacheGap = false;
    before.forEach((node, pos) => {
      const end = pos + node.nodeSize;
      const intersects = from === to ? from > pos && from < end : from < end && to > pos;
      if (!intersects) return;
      if (!node.attrs.noteOwnerId) { canonical = true; return; }
      generated = true;
      // setNodeMarkup uses a replace-around shell without altering content.
      // Section projection/removal must still update the generated terminal.
      if (data.stepType === "replaceAround" && from === pos && to === end && data.gapFrom === pos + 1 && data.gapTo === end - 1) {
        const after = (index + 1 < tr.docs.length ? tr.docs[index + 1] : tr.doc).nodeAt(pos);
        if (after?.type === node.type && after.content.eq(node.content) && ["noteOwnerId", "noteBlock", "noteScope", "noteSectionId"].every(key => after.attrs[key] === node.attrs[key])) { safeMarkup = true; return; }
      }
      if (typeof data.gapFrom === "number" && typeof data.gapTo === "number" && data.gapFrom < end && data.gapTo > pos) movedCacheGap = true;
      if (from > pos || to < end) partial = true;
    });
    if (generated && !safeMarkup && (partial || movedCacheGap || !canonical || data.structure === true)) return true;
  }
  return false;
}

/** Browser reparsing can add inherited color/font marks across a measured
 * read-only story. Reject that no-content normalization silently; accepting it
 * would make the derived cache a source of note formatting, while warning the
 * user on an untouched imported document is misleading. Real input/clipboard
 * events, structural changes, identities, attrs and text never use this path. */
function noteDOMMarkNormalization(tr: Transaction, before: PMNode): boolean {
  if (tr.getMeta("uiEvent") != null || tr.steps.length !== 1 || tr.steps[0].toJSON().stepType !== "replace") return false;
  const unmarked = (node: PMNode): PMNode => node.isText ? node.mark([]) : node.type.create(node.attrs, node.isLeaf ? undefined : Fragment.fromArray(Array.from({ length: node.childCount }, (_, i) => unmarked(node.child(i)))), []);
  return unmarked(before).eq(unmarked(tr.doc));
}

export type NotePluginOptions = { finalize?: (tr: Transaction) => Transaction; onBlocked?: (error: NoteError) => void };
/** Native owners already carry their real run marks. The schema's inner sup is
 * the legacy authored default, so neutralize only that synthetic wrapper. */
function noteOwnerAppearanceDecorations(doc: PMNode): DecorationSet {
  const records = modelOf(doc)?.notes;
  if (!records || !Object.values(records).some(record => record.presentation)) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.attrs.noteOwnerId) return false;
    if (node.type.name === "note_reference" && records[String(node.attrs.noteId)]?.presentation) decorations.push(Decoration.node(pos, pos + node.nodeSize, { "data-note-source-appearance": "true" }));
  });
  return DecorationSet.create(doc, decorations);
}
/** Natural-width measurement needs the same presentation without edit hooks. */
export function noteOwnerAppearancePlugin(): Plugin { return new Plugin({ props: { decorations: state => noteOwnerAppearanceDecorations(state.doc) } }); }
/** One append chain owns cleanup, projection and label caches; no independent save. */
export function notePlugin(options: NotePluginOptions = {}): Plugin {
  return new Plugin({
    props: { decorations: state => noteOwnerAppearanceDecorations(state.doc) },
    view() { return { update(updated, previous) { if (updated.state.doc !== previous.doc) updated.dom.dispatchEvent(new CustomEvent("edtr-note-update", { bubbles: true })); } }; },
    filterTransaction(tr, state) {
      if (!tr.docChanged || isHistoryTransaction(tr) || tr.getMeta("documentLoad") || tr.getMeta(NOTE_PROJECTION) || tr.getMeta(NOTE_COMMAND)) return true;
      const generated = (doc: PMNode) => { const nodes: PMNode[] = []; doc.forEach(node => { if (node.attrs.noteOwnerId) nodes.push(node); }); return Fragment.fromArray(nodes); };
      const generatedChanged = !generated(state.doc).eq(generated(tr.doc));
      if (generatedChanged && noteDOMMarkNormalization(tr, state.doc)) return false;
      if (unsafeGeneratedEdit(tr)) { options.onBlocked?.(new NoteError("generated-note-readonly", "Edit this note in the note editor, or select the complete note block with the surrounding text")); return false; }
      const diagnostics = validateNoteGraph(tr.doc).filter(item => item.code !== "orphan-note");
      if (diagnostics.length) { options.onBlocked?.(new NoteError(diagnostics[0].code, diagnostics[0].message)); return false; }
      if (generatedChanged) {
        const canonical = (doc: PMNode) => { const nodes: PMNode[] = []; doc.forEach(node => { if (!node.attrs.noteOwnerId) nodes.push(node); }); return Fragment.fromArray(nodes); };
        if (canonical(state.doc).eq(canonical(tr.doc)) && state.doc.attrs.documentModel === tr.doc.attrs.documentModel) { options.onBlocked?.(new NoteError("generated-note-readonly", "Edit this note in the note editor")); return false; }
      }
      return true;
    },
    appendTransaction(transactions, _old, state) {
      if (!transactions.some(transaction => transaction.docChanged) || !modelOf(state.doc)) return null;
      const tr = cleanupNoteRecords(state.tr), recordsChanged = tr.docChanged; assertGraph(tr.doc);
      projectEndnotes(tr); refreshNoteLabels(tr); options.finalize?.(tr);
      if (tr.docChanged && !tr.doc.eq(state.doc)) {
        tr.setMeta(NOTE_PROJECTION, true);
        if (!recordsChanged) tr.setMeta("addToHistory", false);
        if (transactions.some(transaction => transaction.getMeta(NOTE_COMMAND))) closeHistory(tr);
        return tr;
      }
      return transactions.some(transaction => transaction.getMeta(NOTE_COMMAND)) ? closeHistory(tr).setMeta("addToHistory", false) : null;
    },
  });
}

export type NoteClipboardPayload = { version: 1 | 2; notes: Record<string, NoteRecord> };
export const NOTE_CLIPBOARD_ATTRIBUTE = "data-edtr-note-fragment";
export function selectedNoteRecords(slice: Slice, doc: PMNode): NoteClipboardPayload {
  const model = modelOf(doc), notes: Record<string, NoteRecord> = {};
  slice.content.descendants(node => { if (node.attrs.noteOwnerId) return false; if (node.type.name !== "note_reference") return; const id = node.attrs.noteId; if (!model || !Object.hasOwn(model.notes, id)) fail("missing-note-body", "The copied note body is missing"); if (Object.hasOwn(notes, id)) fail("duplicate-note-owner", "The copied note has multiple owners"); notes[id] = structuredClone(model.notes[id]); });
  return { version: Object.values(notes).some(record => record.presentation) ? 2 : 1, notes };
}
export function parseNoteClipboard(value: string | null, schema: Schema): NoteClipboardPayload | null {
  if (!value) return null;
  let parsed: unknown; try { parsed = JSON.parse(value); } catch { fail("invalid-note-clipboard", "The copied note metadata is invalid"); }
  if (!plain(parsed) || parsed.version !== 1 && parsed.version !== 2 || Object.keys(parsed).some(key => !["version", "notes"].includes(key)) || !plain(parsed.notes)) fail("invalid-note-clipboard", "The copied note metadata is invalid");
  if (parsed.version === 1 && Object.values(parsed.notes).some(record => plain(record) && record.presentation !== undefined)) fail("invalid-note-clipboard", "Note presentation requires clipboard version 2");
  validateNoteModel({ notes: parsed.notes, notePolicy: defaultNotePolicy(), sections: {} }, schema);
  return parsed as NoteClipboardPayload;
}
export type NotePastePlan = { slice: Slice; notes: Record<string, NoteRecord> };
export function planNoteClipboard(slice: Slice, payload: NoteClipboardPayload | null, destination: PMNode, options: { move?: boolean; sameSession?: boolean; createToken?: IdentityTokenFactory } = {}): NotePastePlan {
  const model = modelOf(destination), definitions: { key: string; kind: "note"; id: unknown }[] = [];
  slice.content.descendants((node, pos) => { if (node.attrs.noteOwnerId) return false; if (node.type.name === "note_reference") definitions.push({ key: String(pos), kind: "note", id: node.attrs.noteId }); });
  if (!definitions.length) return { slice, notes: {} };
  if (!model || !payload) fail("missing-note-clipboard", "The copied note body is unavailable");
  const counts = new Set<string>();
  validateNoteModel({ notes: payload.notes, notePolicy: defaultNotePolicy(), sections: {} }, destination.type.schema);
  for (const definition of definitions) { const id = String(definition.id); if (counts.has(id) || !isDocumentIdentity(id, "note") || !Object.hasOwn(payload.notes, id)) fail("invalid-note-clipboard", "The copied note owner graph is invalid"); counts.add(id); validateNoteBody(payload.notes[id].body, destination.type.schema); }
  if (Object.keys(payload.notes).some(id => !counts.has(id))) fail("invalid-note-clipboard", "The copied note payload contains an unselected note");
  const existing = new Set([...Object.keys(model.notes), ...noteOwners(destination).map(owner => owner.noteId)]), move = options.sameSession && options.move && definitions.every(definition => !existing.has(String(definition.id)));
  const plan = planDocumentIdentities(definitions, { mode: move ? "preserve" : "clone", occupied: existing, createToken: options.createToken || (() => crypto.randomUUID()) });
  const notes: Record<string, NoteRecord> = {}, ids = new Map<string, string>();
  for (const assignment of plan.assignments) { const source = payload.notes[String(assignment.oldId)]; const record = structuredClone(source); if (!move) delete record.native; notes[assignment.id] = record; ids.set(String(assignment.oldId), assignment.id); }
  const map = (fragment: Fragment): Fragment => { const nodes: PMNode[] = []; fragment.forEach(node => { if (node.attrs.noteOwnerId) return; const content = node.isLeaf ? undefined : map(node.content); nodes.push(node.type.name === "note_reference" ? node.type.create({ ...node.attrs, noteId: ids.get(node.attrs.noteId), cachedLabel: "…" }, content, node.marks) : node.isLeaf ? node : node.copy(content!)); }); return Fragment.fromArray(nodes); };
  return { slice: new Slice(map(slice.content), slice.openStart, slice.openEnd), notes };
}
export function applyNotePaste(tr: Transaction, notes: Record<string, NoteRecord>): Transaction { if (!Object.keys(notes).length) return tr; const model = commandModel(tr.doc); for (const id of Object.keys(notes)) if (Object.hasOwn(model.notes, id)) fail("note-paste-collision", "The pasted note identity already exists"); const next = { ...model, notes: { ...model.notes, ...notes } }; validateNoteModel(next, tr.doc.type.schema); return tr.setDocAttribute("documentModel", next); }
