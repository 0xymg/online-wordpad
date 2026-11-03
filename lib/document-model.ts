import { defaultBibliographyConfiguration, validateBibliographyModel, validateBibliographyGraph, type SourceRecord, type BibliographyConfiguration } from "./document-bibliography";
/** Versioned section identity model and compatibility projection for existing dialogs. */
import { DOMParser as PMParser, Fragment, Slice, type Node as PMNode, type Schema } from "prosemirror-model";
import { EditorState, Plugin, type Transaction } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import { allocateDocumentIdentity, isDocumentIdentity, type DocumentIdentity } from "./document-identity";
import { defaultDocumentLayout, readLayout, type DocumentLayout } from "./document-layout";
import { sectionGeometry } from "./document-sections";
import { normalizeReferenceIdentities } from "./document-references";
import { defaultNotePolicy, validateNoteBody, validateNoteModel, validateNoteGraph, validateNoteProjection, projectEndnotes, refreshNoteLabels, type NoteRecord, type NotePolicy, type NoteSectionPolicy } from "./document-notes";
import { normalizeTabCharacters } from "./tab-node";
import { documentTabSettings } from "./tab-stops";
import { parseSectionColumns, validSectionColumns, writeSectionColumns, type SectionColumns, type SectionFlowDirection } from "./section-columns";

export const DOCUMENT_MODEL_ATTRIBUTE = "data-edtr-model";
export const DOCUMENT_MODEL_VERSION = 6;
export type SectionStart = "nextPage" | "continuous" | "oddPage" | "evenPage";
export type SectionPage = Pick<DocumentLayout, "width" | "height" | "margins">;
export type RunningSlotV1 = NonNullable<DocumentLayout["running"]>[string];
export type SectionRecordV1 = {
  page: SectionPage; start: SectionStart; numbering: { start?: number; format?: string };
  rawProperties?: string; running: Record<string, RunningSlotV1>;
};
export type SectionRecord = SectionRecordV1 & { columns: SectionColumns; flowDirection: SectionFlowDirection; notePolicy?: NoteSectionPolicy };
export type DocumentModel = { version: 6; sources: Record<string, SourceRecord>; bibliography: BibliographyConfiguration; id: DocumentIdentity<"document">; finalSectionId: DocumentIdentity<"section">; sections: Record<string, SectionRecord>; notes: Record<string, NoteRecord>; notePolicy: NotePolicy };
export type DocumentModelV1 = Omit<DocumentModel, "version" | "sections" | "notes" | "notePolicy" | "sources" | "bibliography"> & { version: 1 | 2 | 3 | 4 | 5; sections: Record<string, SectionRecordV1 | SectionRecord>; notes?: Record<string, NoteRecord>; notePolicy?: NotePolicy };
export class DocumentModelError extends Error {
  constructor(public code: "unsupported-version" | "invalid-model", message: string) { super(message); this.name = "DocumentModelError"; }
}
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const xml = (value: string) => {
  const doc = new DOMParser().parseFromString(value, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new DocumentModelError("invalid-model", "Invalid section XML");
  return doc;
};
const all = (node: Document | Element, name: string) => Array.from(node.getElementsByTagNameNS(W, name));
const serialize = (node: Node) => new XMLSerializer().serializeToString(node);
export function validSectionPage(page: SectionPage): boolean {
  if (!page || !page.margins) return false;
  const { width, height, margins: m } = page;
  return [width, height, m.top, m.right, m.bottom, m.left].every(Number.isFinite)
    && width >= 720 && height >= 720 && width <= 31680 && height <= 31680
    && [m.top, m.right, m.bottom, m.left].every(n => n >= 0)
    && m.left + m.right <= width - 720 && m.top + m.bottom <= height - 720;
}
function assertModel(value: unknown): asserts value is DocumentModel | DocumentModelV1 {
  const model = value as DocumentModel | DocumentModelV1;
  if (!model || typeof model !== "object" || !Number.isInteger(model.version)) throw new DocumentModelError("invalid-model", "Invalid document model version");
  if (![1, 2, 3, 4, 5, 6].includes(model.version)) throw new DocumentModelError("unsupported-version", "This document model version is not supported");
  if (!isDocumentIdentity(model.id, "document") || !isDocumentIdentity(model.finalSectionId, "section") || !model.sections || typeof model.sections !== "object" || Array.isArray(model.sections))
    throw new DocumentModelError("invalid-model", "Invalid document identity or section registry");
  for (const [id, section] of Object.entries(model.sections)) {
    if (!isDocumentIdentity(id, "section") || !section || !validSectionPage(section.page) || !["nextPage", "continuous", "oddPage", "evenPage"].includes(section.start)
      || !section.numbering || typeof section.numbering !== "object" || Array.isArray(section.numbering) || !section.running || typeof section.running !== "object" || Array.isArray(section.running))
      throw new DocumentModelError("invalid-model", "Invalid section record");
    if (model.version >= 3 && (!validSectionColumns((section as SectionRecord).columns, section.page) || !["ltr", "rtl", "preserved"].includes((section as SectionRecord).flowDirection))) throw new DocumentModelError("invalid-model", "Invalid section columns or direction");
    if (section.numbering.start !== undefined && (!Number.isInteger(section.numbering.start) || section.numbering.start < 1)) throw new DocumentModelError("invalid-model", "Invalid page numbering start");
    if (section.numbering.format !== undefined && typeof section.numbering.format !== "string") throw new DocumentModelError("invalid-model", "Invalid page numbering format");
    if (section.rawProperties !== undefined && typeof section.rawProperties !== "string") throw new DocumentModelError("invalid-model", "Invalid section source properties");
    for (const [key, slot] of Object.entries(section.running)) if (!/^(default|first|even):(header|footer)$/.test(key) || !slot || typeof slot.html !== "string" || typeof slot.linked !== "boolean" || !Number.isFinite(slot.distance) || slot.distance < 0 || !Number.isFinite(slot.height) || slot.height < 0)
      throw new DocumentModelError("invalid-model", "Invalid section header or footer");
  }
  if (!Object.hasOwn(model.sections, model.finalSectionId)) throw new DocumentModelError("invalid-model", "The final section is missing");
  if (model.version >= 5) {
    try { validateNoteModel(model); }
    catch (error) { throw new DocumentModelError("invalid-model", error instanceof Error ? error.message : "Invalid note model"); }
  }
  if (model.version === 6) { try { validateBibliographyModel(model); } catch (error) { throw new DocumentModelError("invalid-model", error instanceof Error ? error.message : "Invalid bibliography model"); } }
}
export function getDocumentModel(doc: PMNode): DocumentModel | null {
  const value = doc.attrs.documentModel;
  if (value == null) return null;
  assertModel(value);
  if (value.version === 6) return value;
  return { ...value, version: 6, sources: {}, bibliography: defaultBibliographyConfiguration(), notes: value.version === 5 ? value.notes! : {}, notePolicy: value.version === 5 ? value.notePolicy! : defaultNotePolicy(), sections: value.version >= 3 ? value.sections as Record<string, SectionRecord> : Object.fromEntries(Object.entries(value.sections).map(([id, record]) => [id, { ...record, ...parseSectionColumns(record.rawProperties, record.page) }])) };
}
/** Read this envelope before parsing HTML so a future version cannot be silently dropped. */
export function readDocumentModel(root: HTMLElement): DocumentModel | DocumentModelV1 | null {
  const el = root.hasAttribute(DOCUMENT_MODEL_ATTRIBUTE) ? root : root.querySelector(`[${DOCUMENT_MODEL_ATTRIBUTE}]`);
  if (!el) return null;
  let value: unknown;
  try { value = JSON.parse(el.getAttribute(DOCUMENT_MODEL_ATTRIBUTE) || ""); }
  catch { throw new DocumentModelError("invalid-model", "The document model metadata is invalid"); }
  assertModel(value); return value;
}
export function sectionIdentityOrder(doc: PMNode, model: DocumentModel): string[] {
  const result: string[] = [];
  doc.forEach(node => { if (node.attrs.sectionEndId) result.push(String(node.attrs.sectionEndId)); });
  result.push(model.finalSectionId); return result;
}
function validateBoundaries(doc: PMNode, model: DocumentModel) {
  doc.descendants((node, _pos, parent) => {
    if (node.attrs.sectionEndId && parent?.type.name !== "doc") throw new DocumentModelError("invalid-model", "Section boundaries cannot be nested inside another block");
  });
  const ids = sectionIdentityOrder(doc, model);
  if (new Set(ids).size !== ids.length || ids.some(id => !Object.hasOwn(model.sections, id)) || Object.keys(model.sections).length !== ids.length)
    throw new DocumentModelError("invalid-model", "Section boundaries do not match the section registry");
}
function rawSection(raw: string | undefined): string | undefined {
  if (!raw?.includes("sectPr")) return undefined;
  const source = xml(raw), section = source.documentElement.localName === "sectPr" ? source.documentElement : all(source, "sectPr")[0];
  return section ? serialize(section) : undefined;
}
export function removeSectionProperties(raw: string | null | undefined): string | null {
  if (!raw?.includes("sectPr")) return raw || null;
  const source = xml(raw);
  if (source.documentElement.localName === "sectPr") return null;
  all(source, "sectPr").forEach(section => section.remove()); return serialize(source.documentElement);
}
/** Updates native known section properties while retaining unrecognized children. */
export function sectionRecordXml(record: SectionRecord): string {
  const source = xml(record.rawProperties || `<w:sectPr xmlns:w="${W}"/>`), section = source.documentElement;
  if (section.namespaceURI !== W || section.localName !== "sectPr") throw new DocumentModelError("invalid-model", "Section source properties must contain a native sectPr root");
  const ensure = (name: string) => {
    let el = Array.from(section.children).find(el => el.namespaceURI === W && el.localName === name);
    if (!el) { el = source.createElementNS(W, `w:${name}`); section.appendChild(el); }
    return el;
  };
  const set = (el: Element, key: string, value: string | number) => el.setAttributeNS(W, `w:${key}`, String(value));
  const size = ensure("pgSz"); set(size, "w", record.page.width); set(size, "h", record.page.height);
  if (record.page.width > record.page.height) set(size, "orient", "landscape"); else size.removeAttributeNS(W, "orient");
  const margins = ensure("pgMar"); for (const [key, value] of Object.entries(record.page.margins)) set(margins, key, value);
  set(ensure("type"), "val", record.start);
  let numbering = Array.from(section.children).find(el => el.namespaceURI === W && el.localName === "pgNumType");
  if (numbering || record.numbering.start !== undefined || record.numbering.format) {
    numbering = numbering || ensure("pgNumType");
    if (record.numbering.start !== undefined) set(numbering, "start", record.numbering.start); else numbering.removeAttributeNS(W, "start");
    if (record.numbering.format) set(numbering, "fmt", record.numbering.format); else numbering.removeAttributeNS(W, "fmt");
  }
  for (const kind of ["header", "footer"] as const) {
    const own = Object.entries(record.running).filter(([key]) => key.endsWith(`:${kind}`));
    const last = own.at(-1)?.[1]; if (last) set(margins, kind, last.distance);
    for (const [key, slot] of own) if (slot.linked) {
      const variant = key.split(":")[0];
      Array.from(section.children).filter(el => el.localName === `${kind}Reference` && el.getAttributeNS(W, "type") === variant).forEach(el => el.remove());
    }
  }
  writeSectionColumns(section, record.columns, record.flowDirection);
  const order = "headerReference footerReference footnotePr endnotePr type pgSz pgMar paperSrc pgBorders lnNumType pgNumType cols formProt vAlign noEndnote titlePg textDirection bidi rtlGutter docGrid printerSettings sectPrChange".split(" ");
  Array.from(section.children).map((el, index) => ({ el, index })).sort((a, b) => {
    const left = order.indexOf(a.el.localName), right = order.indexOf(b.el.localName);
    return (left < 0 ? 1000 : left) - (right < 0 ? 1000 : right) || a.index - b.index;
  }).forEach(({ el }) => section.appendChild(el));
  return serialize(section);
}
/** Keep following geometry while materializing headers inherited through the
 * removed preceding section. Shared by explicit removal and ordinary deletion.
 */
export function inheritRemovedSection(before: SectionRecord, following: SectionRecord): SectionRecord {
  const running = { ...following.running };
  const raw = xml(sectionRecordXml(following)), prior = xml(sectionRecordXml(before));
  for (const [key, slot] of Object.entries(before.running)) {
    const [variant, kind] = key.split(":");
    const owns = Array.from(raw.documentElement.children).some(el => el.localName === `${kind}Reference` && el.getAttributeNS(W, "type") === variant);
    if (!slot.linked && !owns && (!running[key] || running[key].linked)) running[key] = { ...slot };
  }
  for (const ref of Array.from(prior.documentElement.children).filter(el => ["headerReference", "footerReference"].includes(el.localName))) {
    const kind = ref.localName === "headerReference" ? "header" : "footer", variant = ref.getAttributeNS(W, "type") || "default", key = `${variant}:${kind}`;
    const owns = Array.from(raw.documentElement.children).some(el => el.localName === ref.localName && el.getAttributeNS(W, "type") === variant);
    if (!owns && (!running[key] || running[key].linked)) { raw.documentElement.appendChild(raw.importNode(ref, true)); delete running[key]; }
  }
  return { ...following, rawProperties: serialize(raw.documentElement), running };
}
function paragraphProperties(raw: string | null | undefined, section: string): string {
  const source = xml(removeSectionProperties(raw) || `<w:pPr xmlns:w="${W}"/>`);
  source.documentElement.appendChild(source.importNode(xml(section).documentElement, true)); return serialize(source.documentElement);
}
/** layout index maps are projections, regenerated only against this exact ID order. */
export function projectDocumentModel(tr: Transaction, model: DocumentModel): Transaction {
  assertModel(model); validateBoundaries(tr.doc, model);
  const order = sectionIdentityOrder(tr.doc, model), layout: DocumentLayout = tr.doc.attrs.layout || defaultDocumentLayout();
  model = { ...model, sections: Object.fromEntries(order.map(id => [id, model.sections[id]])) };
  const running: NonNullable<DocumentLayout["running"]> = {}, sectionMargins: NonNullable<DocumentLayout["sectionMargins"]> = {};
  order.forEach((id, index) => {
    const record = model.sections[id]; sectionMargins[index] = { ...record.page.margins };
    for (const [key, slot] of Object.entries(record.running)) running[`${index}:${key}`] = { ...slot };
  });
  tr.doc.forEach((node, pos) => {
    const id = node.attrs.sectionEndId;
    const properties = id ? paragraphProperties(node.attrs.docxProperties, sectionRecordXml(model.sections[id])) : removeSectionProperties(node.attrs.docxProperties);
    if (node.attrs.docxProperties !== undefined && node.attrs.docxProperties !== properties) tr.setNodeMarkup(pos, undefined, { ...node.attrs, docxProperties: properties });
  });
  const first = model.sections[order[0]].page;
  const projected = { ...layout, ...documentTabSettings(layout), width: first.width, height: first.height, margins: { ...first.margins }, sectionMargins,
    running, section: sectionRecordXml(model.sections[model.finalSectionId]), overrides: { ...layout.overrides, margins: false, orientation: false } };
  if (JSON.stringify(tr.doc.attrs.documentModel) !== JSON.stringify(model)) tr.setDocAttribute("documentModel", model);
  if (JSON.stringify(layout) !== JSON.stringify(projected)) tr.setDocAttribute("layout", projected);
  return tr;
}
type NoteImportData = { notes: Record<string, NoteRecord>; notePolicy?: NotePolicy; sectionNotePolicies?: (NoteSectionPolicy | null | undefined)[] };
function finishNoteMigration(doc: PMNode, importedNotes?: unknown, importedBibliography?: unknown): PMNode {
  let model = getDocumentModel(doc)!;
  if (importedNotes !== undefined) {
    if (!importedNotes || typeof importedNotes !== "object" || Array.isArray(importedNotes) || Object.keys(model.notes).length) throw new DocumentModelError("invalid-model", "Conflicting note import metadata");
    const data = importedNotes as NoteImportData, order = sectionIdentityOrder(doc, model);
    if (data.sectionNotePolicies !== undefined && (!Array.isArray(data.sectionNotePolicies) || (data.sectionNotePolicies.length !== 0 && data.sectionNotePolicies.length !== order.length))) throw new DocumentModelError("invalid-model", "Native note policies do not match the document sections");
    if (data.sectionNotePolicies?.some(policy => policy != null && (typeof policy !== "object" || Array.isArray(policy)))) throw new DocumentModelError("invalid-model", "Invalid native section note policy");
    model = { ...model, notes: data.notes, notePolicy: data.notePolicy || defaultNotePolicy(), sections: Object.fromEntries(order.map((id, index) => [id, data.sectionNotePolicies?.[index] ? { ...model.sections[id], notePolicy: data.sectionNotePolicies[index]! } : model.sections[id]])) };
  }
  if (importedBibliography !== undefined) {
    if (!importedBibliography || typeof importedBibliography !== "object" || Array.isArray(importedBibliography) || Object.keys(model.sources).length) throw new DocumentModelError("invalid-model", "Conflicting bibliography import metadata");
    const data = importedBibliography as Pick<DocumentModel, "sources" | "bibliography">; model = { ...model, sources: data.sources, bibliography: data.bibliography };
  }
  try {
    validateBibliographyModel(model);
    validateNoteModel(model, doc.type.schema);
    const notes = Object.fromEntries(Object.entries(model.notes).map(([id, record]) => [id, { ...record, body: validateNoteBody(record.body, doc.type.schema) }]));
    if (JSON.stringify(notes) !== JSON.stringify(model.notes)) model = { ...model, notes };
    const result = doc.type.create({ ...doc.attrs, documentModel: model }, doc.content, doc.marks);
    const bibliographyErrors = validateBibliographyGraph(result);
    if (bibliographyErrors.length) throw new Error(bibliographyErrors[0].message);
    const diagnostics = validateNoteGraph(result);
    if (diagnostics.length) throw new Error(diagnostics[0].message);
    const projectionErrors = validateNoteProjection(result);
    if (projectionErrors.length) throw new Error(projectionErrors[0].message);
    return projectDocumentModel(refreshNoteLabels(projectEndnotes(EditorState.create({ doc: result }).tr)), model).doc;
  } catch (error) { throw new DocumentModelError("invalid-model", error instanceof Error ? error.message : "Invalid note graph"); }
}
/** v0–v4 -> v5 migration. Existing section/reference IDs never regenerate on open/restore. */
export function migrateDocumentNode(doc: PMNode, createToken: () => string = () => crypto.randomUUID(), importedFinalSectionId?: unknown, importedNotes?: unknown, importedBibliography?: unknown): PMNode {
  const existing = getDocumentModel(doc);
  if (existing) { validateBoundaries(doc, existing); return finishNoteMigration(normalizeReferenceIdentities(projectDocumentModel(EditorState.create({ doc }).tr, existing).doc, createToken), importedNotes, importedBibliography); }
  const layout: DocumentLayout = doc.attrs.layout || defaultDocumentLayout(), reserved = new Set<string>();
  doc.descendants((node, _pos, parent) => {
    if (String(node.attrs.docxProperties || "").includes("sectPr") && parent?.type.name !== "doc") throw new DocumentModelError("invalid-model", "A nested source section boundary cannot be migrated safely");
  });
  const boundaryIds: unknown[] = [], allMarkers: unknown[] = [];
  doc.forEach(node => {
    if (String(node.attrs.docxProperties || "").includes("sectPr")) boundaryIds.push(node.attrs.sectionEndId);
    if (node.attrs.sectionEndId) allMarkers.push(node.attrs.sectionEndId);
  });
  const nativeIds = [...boundaryIds, importedFinalSectionId];
  const reuseNativeIds = allMarkers.length === boundaryIds.length && nativeIds.every(id => isDocumentIdentity(id, "section")) && new Set(nativeIds).size === nativeIds.length;
  // A partial/untrusted set is discarded as a whole, rather than mixing identity generations.
  for (const id of [...allMarkers, importedFinalSectionId]) if (isDocumentIdentity(id, "section")) reserved.add(id);
  const fresh = <K extends "document" | "section">(kind: K) => { const id = allocateDocumentIdentity(kind, reserved, createToken); reserved.add(id); return id; };
  const sections: DocumentModel["sections"] = {}, children: PMNode[] = [];
  const make = (raw: string | undefined, index: number) => {
    const id = reuseNativeIds ? nativeIds[index] as DocumentIdentity<"section"> : fresh("section"), geometry = sectionGeometry(raw, layout);
    const page = { width: layout.overrides?.orientation ? layout.width : geometry.width, height: layout.overrides?.orientation ? layout.height : geometry.height,
      margins: { ...(layout.sectionMargins?.[index] || (layout.overrides?.margins ? layout.margins : geometry.margins)) } };
    const running = Object.fromEntries(Object.entries(layout.running || {}).filter(([key]) => key.startsWith(`${index}:`)).map(([key, slot]) => [key.slice(key.indexOf(":") + 1), { ...slot }]));
    sections[id] = { page, start: ["nextPage", "continuous", "oddPage", "evenPage"].includes(geometry.startType || "") ? geometry.startType as SectionStart : "nextPage",
      numbering: { ...(geometry.numberStart !== undefined ? { start: geometry.numberStart } : {}), ...(geometry.numberFormat ? { format: geometry.numberFormat } : {}) },
      rawProperties: rawSection(raw), running, ...parseSectionColumns(rawSection(raw), page) };
    return id;
  };
  let index = 0;
  doc.forEach(node => { if (String(node.attrs.docxProperties || "").includes("sectPr")) {
    if (!Object.hasOwn(node.type.spec.attrs || {}, "sectionEndId")) throw new DocumentModelError("invalid-model", "This section boundary cannot be represented safely");
    const id = make(node.attrs.docxProperties, index++); children.push(node.type.create({ ...node.attrs, sectionEndId: id }, node.content, node.marks));
  } else children.push(node.attrs.sectionEndId ? node.type.create({ ...node.attrs, sectionEndId: null }, node.content, node.marks) : node); });
  const finalSectionId = make(layout.section, index), model: DocumentModel = { version: 6, sources: {}, bibliography: defaultBibliographyConfiguration(), id: fresh("document"), finalSectionId, sections, notes: {}, notePolicy: defaultNotePolicy() };
  for (const key of Object.keys(layout.sectionMargins || {})) if (!/^\d+$/.test(key) || Number(key) > index) throw new DocumentModelError("invalid-model", "A legacy section margin has no matching section");
  for (const key of Object.keys(layout.running || {})) if (!/^\d+:(default|first|even):(header|footer)$/.test(key) || Number(key.split(":")[0]) > index) throw new DocumentModelError("invalid-model", "A legacy header or footer has no matching section");
  assertModel(model);
  const migrated = doc.type.create({ ...doc.attrs, documentModel: model }, children, doc.marks);
  return finishNoteMigration(normalizeReferenceIdentities(projectDocumentModel(EditorState.create({ doc: migrated }).tr, model).doc, createToken), importedNotes, importedBibliography);
}
export function parseDocumentHtml(html: string, schema: Schema): PMNode {
  const dom = new DOMParser().parseFromString(html || "<p></p>", "text/html"), model = readDocumentModel(dom.body);
  const importedFinalSectionId = dom.body.querySelector("[data-edtr-docx-final-section-id]")?.getAttribute("data-edtr-docx-final-section-id");
  const noteCarrier = dom.body.querySelector("[data-edtr-notes-import]");
  let importedNotes: unknown;
  if (noteCarrier) {
    if (dom.body.querySelectorAll("[data-edtr-notes-import]").length !== 1) throw new DocumentModelError("invalid-model", "Conflicting note import metadata");
    try { importedNotes = JSON.parse(noteCarrier.getAttribute("data-edtr-notes-import") || ""); }
    catch { throw new DocumentModelError("invalid-model", "Invalid note import metadata"); }
  }
  const bibliographyCarriers = dom.body.querySelectorAll("[data-edtr-bibliography-import]");
  let importedBibliography: unknown;
  if (bibliographyCarriers.length > 1) throw new DocumentModelError("invalid-model", "Conflicting bibliography import metadata");
  if (bibliographyCarriers.length) { try { importedBibliography = JSON.parse(bibliographyCarriers[0].getAttribute("data-edtr-bibliography-import") || ""); } catch { throw new DocumentModelError("invalid-model", "Invalid bibliography import metadata"); } }
  const doc = PMParser.fromSchema(schema).parse(dom.body, { topNode: schema.nodes.doc.create({ layout: readLayout(dom.body) || defaultDocumentLayout(), documentModel: model }) });
  return migrateDocumentNode(normalizeTabCharacters(doc), undefined, importedFinalSectionId, importedNotes, importedBibliography);
}
function captureLegacyProjection(doc: PMNode, model: DocumentModel): DocumentModel {
  const layout: DocumentLayout = doc.attrs.layout || defaultDocumentLayout(), sections = { ...model.sections };
  sectionIdentityOrder(doc, model).forEach((id, index) => {
    const previous = sections[id]; if (!previous) return;
    const page = { ...previous.page, ...(layout.overrides?.orientation ? { width: layout.width, height: layout.height } : {}),
      margins: { ...(layout.sectionMargins?.[index] || (layout.overrides?.margins ? layout.margins : previous.page.margins)) } };
    const running = Object.fromEntries(Object.entries(layout.running || {}).filter(([key]) => key.startsWith(`${index}:`)).map(([key, slot]) => [key.slice(key.indexOf(":") + 1), { ...slot }]));
    sections[id] = { ...previous, page, running };
  });
  return { ...model, sections };
}
/** Existing header/footer/layout writers are ingested by ID before reprojection. */
export function documentModelPlugin(onBlocked?: () => void): Plugin {
  return new Plugin({
    filterTransaction(tr) {
      if (!tr.docChanged) return true;
      let nested = false;
      tr.doc.descendants((node, _pos, parent) => { if (node.attrs.sectionEndId && parent?.type.name !== "doc") nested = true; });
      if (!nested) return true;
      if (!tr.getMeta("documentLoad")) onBlocked?.();
      return false;
    },
    props: { transformPasted(slice) {
      const clean = (node: PMNode): PMNode => {
        if (node.isText) return node;
        const attrs = { ...node.attrs };
        if (Object.hasOwn(attrs, "sectionEndId")) attrs.sectionEndId = null;
        if (Object.hasOwn(attrs, "docxProperties")) attrs.docxProperties = removeSectionProperties(attrs.docxProperties);
        return node.type.create(attrs, node.isLeaf ? undefined : Fragment.fromArray(Array.from({ length: node.childCount }, (_, i) => clean(node.child(i)))), node.marks);
      };
      return new Slice(Fragment.fromArray(Array.from({ length: slice.content.childCount }, (_, i) => clean(slice.content.child(i)))), slice.openStart, slice.openEnd);
    } },
    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some(tr => tr.docChanged)) return null;
      let model = getDocumentModel(newState.doc);
      if (!model) { const migrated = migrateDocumentNode(newState.doc); return newState.tr.replaceWith(0, newState.doc.content.size, migrated.content).setDocAttribute("documentModel", migrated.attrs.documentModel).setMeta("addToHistory", false); }
      const tr = newState.tr;
      if (oldState.doc.attrs.documentModel === newState.doc.attrs.documentModel && oldState.doc.attrs.layout !== newState.doc.attrs.layout) model = captureLegacyProjection(newState.doc, model);
      // ProseMirror copies paragraph attrs when Enter splits a boundary paragraph.
      // Keep its boundary on the rightmost split, rather than defining it twice.
      const last = new Map<string, number>(); newState.doc.forEach((node, pos) => { if (node.attrs.sectionEndId) last.set(node.attrs.sectionEndId, pos); });
      tr.doc.forEach((node, pos) => { if (node.attrs.sectionEndId && (last.get(node.attrs.sectionEndId) !== pos || node.attrs.sectionEndId === model!.finalSectionId)) tr.setNodeMarkup(pos, undefined, { ...node.attrs, sectionEndId: null, docxProperties: removeSectionProperties(node.attrs.docxProperties) }); });
      const order = sectionIdentityOrder(tr.doc, model);
      const records = { ...model.sections }, previousModel = getDocumentModel(oldState.doc);
      if (previousModel?.id === model.id) {
        const previousOrder = sectionIdentityOrder(oldState.doc, previousModel), retained = new Set(order);
        // Materialize left-to-right, including runs of removed boundaries: an
        // inherited header from A must survive A -> B -> C when both A/B vanish.
        for (let index = 0; index < previousOrder.length - 1; index++) {
          const id = previousOrder[index], following = previousOrder[index + 1];
          if (!retained.has(id) && records[id] && records[following]) {
            records[following] = inheritRemovedSection(records[id], records[following]); delete records[id];
          }
        }
      }
      model = { ...model, sections: Object.fromEntries(order.map(id => [id, records[id]])) };
      projectDocumentModel(tr, model);
      return tr.docChanged ? tr : transactions.some(transaction => transaction.getMeta("edtr-section-command") || transaction.getMeta("edtr-tab-command") || transaction.getMeta("edtr-column-break-command")) ? closeHistory(tr).setMeta("addToHistory", false) : null;
    },
  });
}
