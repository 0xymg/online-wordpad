/** Native footnote/endnote transport around the common DOCX formatting chain.
 * Temporary main-part blocks deliberately reuse that chain for lists, tabs and
 * marks. The blocks never enter the editable document or exported main story.
 */
import JSZip from "jszip";
import { DOMParser as PMParser, type Node as PMNode, type Schema } from "prosemirror-model";
import { parseXml, xmlString, W } from "./docx-preservation";
import { defaultNotePolicy, validateNoteBody, validateNoteGraph, validateNoteModel, type NoteRecord, type NoteSectionPolicy, type NoteModelShape } from "./document-notes";

const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT = "http://schemas.openxmlformats.org/package/2006/content-types";
type Kind = "footnote" | "endnote";
type Numbering = { restart: "continuous" | "eachSection"; start: number; format: "decimal" | "lowerRoman" | "upperRoman" | "lowerLetter" | "upperLetter" };
type RecordValue = NoteRecord;
type SectionPolicy = NoteSectionPolicy;
const defaults = defaultNotePolicy;
const all = (node: Document | Element, name: string) => Array.from(node.getElementsByTagNameNS(W, name));
const children = (node: Element, name: string) => Array.from(node.children).filter(el => el.namespaceURI === W && el.localName === name);
const val = (node: Element, key = "val") => node.getAttributeNS(W, key) || "";
const relPath = (path: string) => path.replace(/([^/]+)$/, "_rels/$1.rels");
function partPath(base: string, target: string) {
  const parts: string[] = [];
  for (const piece of (target.startsWith("/") ? target.slice(1) : base.slice(0, base.lastIndexOf("/") + 1) + target).split("/")) {
    if (piece === "..") { if (!parts.length) throw new NoteDocxError("A native note relationship escapes the package"); parts.pop(); }
    else if (piece && piece !== ".") parts.push(piece);
  }
  return parts.join("/");
}
export class NoteDocxError extends Error { readonly code = "unsupported-note"; constructor(message: string) { super(message); this.name = "NoteDocxError"; } }
const fail = (message: string): never => { throw new NoteDocxError(message); };
const newId = () => `nte_${crypto.randomUUID().replace(/-/g, "")}`;
const noteAlias = /^EDNT([a-f0-9]{32})$/;
function nativeId(value: string): string {
  const number = Number(value);
  if (!/^-?\d+$/.test(value) || !Number.isInteger(number) || number < -2147483648 || number > 2147483647) fail("Invalid native note ID");
  return String(number);
}
async function readXml(zip: JSZip, path: string, empty?: string) {
  const source = await zip.file(path)?.async("string");
  if (!source && !empty) fail(`The native note package part ${path} is missing`);
  return parseXml(source || empty!);
}
async function packageMain(zip: JSZip) {
  const root = await readXml(zip, "_rels/.rels");
  const office = Array.from(root.documentElement.children).filter(el => el.getAttribute("Type") === `${R}/officeDocument`);
  if (office.length !== 1 || office[0].getAttribute("TargetMode") === "External") fail("The native note document relationship is invalid");
  const path = partPath("", office[0].getAttribute("Target") || "");
  const main = await readXml(zip, path), rels = await readXml(zip, relPath(path), `<Relationships xmlns="${PKG}"/>`);
  const body = children(main.documentElement, "body")[0];
  if (!body) fail("The native note document body is missing");
  return { path, main, rels, body };
}
function readPolicy(el: Element, kind: Kind, document: boolean) {
  const out: Partial<Numbering> & { placement?: string } = {};
  const seen = new Set<string>();
  for (const child of Array.from(el.children)) {
    const name = child.localName, value = val(child);
    const key = document && name === kind ? `${name}:${val(child, "id")}` : name;
    if (child.namespaceURI !== W || seen.has(key)) fail("Unsupported or duplicate native note policy");
    seen.add(key);
    if (name === "numStart") { const n = Number(value); if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < 1) fail("Unsupported native note starting number"); out.start = n; }
    else if (name === "numRestart") { if (!["continuous", "eachSect"].includes(value)) fail("Unsupported native note numbering restart"); out.restart = value === "eachSect" ? "eachSection" : "continuous"; }
    else if (name === "numFmt") { if (child.hasAttributeNS(W, "format") || !["decimal", "lowerRoman", "upperRoman", "lowerLetter", "upperLetter"].includes(value)) fail("Unsupported native note number format"); out.format = value as Numbering["format"]; }
    else if (name === "pos") {
      const placement = kind === "footnote" ? value === "pageBottom" && "pageBottom" : value === "docEnd" ? "documentEnd" : value === "sectEnd" && "sectionEnd";
      if (!placement || !document && placement !== (kind === "footnote" ? "pageBottom" : "documentEnd")) fail("Unsupported section-scoped native note placement");
      if (document) out.placement = String(placement);
    } else if (name === kind && document) {
      // Settings' separator references are package metadata, not user notes.
      if (!["-1", "0"].includes(val(child, "id"))) fail("Unsupported native note separator policy");
    } else fail("Unsupported native note policy");
  }
  return out;
}
function textRun(doc: Document, text: string) {
  const run = doc.createElementNS(W, "w:r"), t = doc.createElementNS(W, "w:t"); t.textContent = text; run.append(t); return run;
}
function markerParagraph(doc: Document, marker: string) { const p = doc.createElementNS(W, "w:p"); p.append(textRun(doc, marker)); return p!; }
function tokenText(root: Element, token: string): Text {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT); let found: Text | undefined;
  while (walker.nextNode()) { const text = walker.currentNode as Text; if (!text.data.includes(token)) continue; if (found || text.data.indexOf(token) !== text.data.lastIndexOf(token)) fail("A native note import marker was duplicated"); found = text; }
  if (!found) fail("A native note import marker was lost"); return found!;
}
function markerBlock(root: Element, token: string): Element {
  const text = tokenText(root, token), block = text.parentElement?.closest("p");
  if (!block || block.textContent !== token) fail("A native note body boundary was combined with content"); return block!;
}
function validateNativeBody(note: Element, kind: Kind): string | undefined {
  if (Array.from(note.children).some(el => el.namespaceURI !== W || el.localName !== "p")) fail("This native note contains an unsupported body block");
  const allowed = new Set(["p", "pPr", "r", "rPr", "t", "tab", "br", "cr", "hyperlink", `${kind}Ref`, "bookmarkStart", "bookmarkEnd"]);
  // Property trees are retained by the shared formatting codec; structural
  // controls inside them still cannot introduce another document story.
  const forbidden = new Set(["sectPr", "footnoteReference", "endnoteReference", "fldChar", "fldSimple", "instrText", "drawing", "pict", "object", "altChunk", "sdt", "ins", "del", "moveFrom", "moveTo"]);
  let ownId: string | undefined; const ownMarkers: Element[] = [];
  for (const el of Array.from(note.getElementsByTagName("*"))) {
    if (forbidden.has(el.localName)) fail("This native note contains unsupported nested content");
    let property = false; for (let p = el.parentElement; p && p !== note; p = p.parentElement) if (p.namespaceURI === W && ["pPr", "rPr"].includes(p.localName)) property = true;
    if (property) continue;
    if (el.namespaceURI !== W || !allowed.has(el.localName)) fail("This native note contains unsupported content");
    if (el.localName === "br" && val(el, "type") && val(el, "type") !== "textWrapping") fail("Page and column breaks inside native notes are unsupported");
    if (el.localName === "hyperlink" && (el.hasAttributeNS(W, "anchor") || !el.getAttributeNS(R, "id"))) fail("Internal note hyperlinks are unsupported");
    if (el.localName === "bookmarkStart") { const match = noteAlias.exec(val(el, "name")); if (!match || ownId) fail("Bookmark definitions inside native notes are unsupported"); ownId = `nte_${match![1]}`; ownMarkers.push(el); }
    if (el.localName === "bookmarkEnd") ownMarkers.push(el);
  }
  if (ownMarkers.length) {
    const [start, end] = ownMarkers;
    if (ownMarkers.length !== 2 || start.localName !== "bookmarkStart" || end.localName !== "bookmarkEnd" || start.nextElementSibling !== end || val(start, "id") !== val(end, "id")) fail("Invalid native note identity metadata");
    ownMarkers.forEach(el => el.remove());
  }
  const self = all(note, `${kind}Ref`); if (self.length > 1) fail("A native note has duplicate body reference marks"); self.forEach(el => el.remove());
  return ownId;
}
export async function prepareNoteImport(arrayBuffer: ArrayBuffer, options: { allowFootnotes?: boolean } = {}) {
  const zip = await JSZip.loadAsync(arrayBuffer), { path, main, rels, body } = await packageMain(zip);
  const policy = defaults();
  // Word uses lowerRoman when native endnote numFmt is absent (MS-OI29500
  // 2.1.306); newly created app notes still use defaultNotePolicy decimal.
  policy.endnote.format = "lowerRoman";
  let hasSettings = false;
  const settingsRels = Array.from(rels.documentElement.children).filter(el => el.getAttribute("Type") === `${R}/settings`);
  if (settingsRels.length > 1) fail("Duplicate native settings relationships");
  if (settingsRels[0]) {
    if (settingsRels[0].getAttribute("TargetMode") === "External") fail("External native note settings are unsupported");
    const settings = await readXml(zip, partPath(path, settingsRels[0].getAttribute("Target") || ""));
    for (const kind of ["footnote", "endnote"] as const) { const props = children(settings.documentElement, `${kind}Pr`); if (props.length > 1) fail("Duplicate native note policy"); if (props[0]) { Object.assign(policy[kind], readPolicy(props[0], kind, true)); hasSettings = true; } }
  }
  const sectionNotePolicies: SectionPolicy[] = all(main, "sectPr").filter(el => el.parentElement?.namespaceURI === W && ["pPr", "body"].includes(el.parentElement.localName)).map(section => {
    const override: SectionPolicy = {};
    for (const kind of ["footnote", "endnote"] as const) { const props = children(section, `${kind}Pr`); if (props.length > 1) fail("Duplicate section native note policy"); if (props[0]) { override[kind] = readPolicy(props[0], kind, false); hasSettings = true; } }
    return override;
  });
  const token = crypto.randomUUID().replace(/-/g, ""), imports: Array<{ id: string; kind: Kind; nativeId: string; part: string; start: string; end: string; owner: string }> = [], used = new Set<string>();
  const prepended: Element[] = [];
  for (const kind of ["footnote", "endnote"] as const) {
    const references = all(main, `${kind}Reference`);
    if (kind === "footnote" && references.length && options.allowFootnotes === false) fail("Page footnotes are not available in this release; the document was left unchanged");
    const partRels = Array.from(rels.documentElement.children).filter(el => el.getAttribute("Type") === `${R}/${kind}s`);
    if (partRels.length > 1 || partRels[0]?.getAttribute("TargetMode") === "External") fail("Invalid native note part relationships");
    if (!partRels.length) { if (references.length) fail("A native note owner has no related note part"); continue; }
    const part = partPath(path, partRels[0].getAttribute("Target") || ""), notesXml = await readXml(zip, part), noteRels = await readXml(zip, relPath(part), `<Relationships xmlns="${PKG}"/>`);
    if (notesXml.documentElement.namespaceURI !== W || notesXml.documentElement.localName !== `${kind}s`) fail("Invalid native note part root");
    const records = new Map<string, Element>(), nativeIds = new Set<string>();
    for (const note of Array.from(notesXml.documentElement.children)) {
      if (note.namespaceURI !== W || note.localName !== kind) fail("Invalid native note part record");
      const id = nativeId(val(note, "id")), type = val(note, "type");
      if (!/^-?\d+$/.test(id) || nativeIds.has(id)) fail("Duplicate or invalid native note ID");
      nativeIds.add(id);
      if (["separator", "continuationSeparator"].includes(type)) { if (!(id === "-1" && type === "separator" || id === "0" && type === "continuationSeparator")) fail("Unsupported native note separator identity"); continue; }
      if (type && type !== "normal" || Number(id) < 1) fail("Unsupported native note record type");
      records.set(id, note);
    }
    const owners = new Set<string>();
    for (const ref of references) {
      const sourceId = nativeId(val(ref, "id")); if (!records.has(sourceId) || owners.has(sourceId)) fail("Missing or multiply-owned native note body"); owners.add(sourceId);
      if (ref.hasAttributeNS(W, "customMarkFollows")) fail("Custom native note marks are unsupported");
      const note = records.get(sourceId)!, id = validateNativeBody(note, kind) || newId(); if (used.has(id)) fail("Duplicate native note identity"); used.add(id);
      const n = imports.length, start = `EDTRNOTE${token}START${n}`, end = `EDTRNOTE${token}END${n}`, owner = `EDTRNOTE${token}OWNER${n}`;
      for (const link of all(note, "hyperlink")) {
        const matching = Array.from(noteRels.documentElement.children).filter(el => el.getAttribute("Id") === link.getAttributeNS(R, "id"));
        if (matching.length !== 1 || matching[0].getAttribute("Type") !== `${R}/hyperlink` || matching[0].getAttribute("TargetMode") !== "External") fail("A native note hyperlink relationship is unsupported or missing");
        const rel = main.importNode(matching[0], true) as Element, relId = `EDTRNoteLink${token}${n}_${all(note, "hyperlink").indexOf(link)}`; rel.setAttribute("Id", relId); rels.documentElement.append(rel); link.setAttributeNS(R, "r:id", relId);
      }
      prepended.push(markerParagraph(main, start), ...Array.from(note.children).map(el => main.importNode(el, true) as Element), markerParagraph(main, end));
      const t = main.createElementNS(W, "w:t"); t.textContent = owner; ref.replaceWith(t);
      imports.push({ id, kind, nativeId: sourceId, part, start, end, owner });
    }
    if (owners.size !== records.size) fail("The native note package contains an orphaned body");
    // Mammoth must not independently append a second native note story.
    partRels[0].remove();
  }
  if (imports.length) { const first = body.firstChild; for (const el of prepended) body.insertBefore(el, first); zip.file(path, xmlString(main)); zip.file(relPath(path), xmlString(rels)); }
  return { arrayBuffer: imports.length ? await zip.generateAsync({ type: "arraybuffer" }) : arrayBuffer, restore(html: string, schema: Schema) {
    const parsed = new DOMParser().parseFromString(html, "text/html"), notes: Record<string, RecordValue> = {};
    for (const item of imports) {
      const start = markerBlock(parsed.body, item.start), end = markerBlock(parsed.body, item.end); if (start.parentElement !== end.parentElement) fail("Native note body boundaries lost their common story");
      const container = parsed.createElement("div"); let sibling = start.nextElementSibling;
      while (sibling && sibling !== end) { const next = sibling.nextElementSibling; container.append(sibling); sibling = next; }
      if (sibling !== end) fail("Native note body boundaries are out of order"); start.remove(); end.remove();
      const pm = PMParser.fromSchema(schema).parse(container); pm.check();
      const bodyJson = validateNoteBody(pm.toJSON(), schema); notes[item.id] = { kind: item.kind, body: bodyJson, native: { partUri: item.part, nativeId: item.nativeId } };
      const owner = tokenText(parsed.body, item.owner), offset = owner.data.indexOf(item.owner), after = owner.splitText(offset); after.splitText(item.owner.length);
      const span = parsed.createElement("span"); span.setAttribute("data-edtr-note-reference", "true"); span.setAttribute("data-note-id", item.id); after.replaceWith(span);
    }
    return { html: parsed.body.innerHTML, notes, notePolicy: policy, sectionNotePolicies, hasSettings };
  } };
}

/** Build note transport blocks using the SAME DocxBuilder as the main story.
 * Call finish only after main paragraph properties/styles have been restored. */
export function createNoteExport(doc: PMNode) {
  const model = doc.attrs.documentModel as NoteModelShape | null;
  const ownerMarkers = new Map<string, string>();
  const bodies: Array<{ noteId: string; startMarker: string; endMarker: string; body: PMNode }> = [];
  const token = crypto.randomUUID().replace(/-/g, "");
  if (model?.version === 5) {
    validateNoteModel(model, doc.type.schema);
    const diagnostics = validateNoteGraph(doc); if (diagnostics.length) fail(diagnostics[0].message);
    // Owner order is independent of registry object insertion order.
    const ordered: string[] = []; doc.descendants(node => { if (node.attrs.noteOwnerId) return false; if (node.type.name === "note_reference") ordered.push(String(node.attrs.noteId)); });
    ordered.forEach((noteId, index) => {
      ownerMarkers.set(noteId, `EDTRNOTE${token}EXPORTOWNER${index}`);
      bodies.push({ noteId, startMarker: `EDTRNOTE${token}EXPORTSTART${index}`, endMarker: `EDTRNOTE${token}EXPORTEND${index}`, body: doc.type.schema.nodeFromJSON(validateNoteBody(model.notes[noteId].body, doc.type.schema)) });
    });
  }
  return { ownerMarkers, bodies, async finish(blob: Blob): Promise<Blob> {
    if (!model || model.version !== 5) return blob;
    const zip = await JSZip.loadAsync(await blob.arrayBuffer()), { path, main, rels, body } = await packageMain(zip);
    const types = await readXml(zip, "[Content_Types].xml");
    function findRun(marker: string): Element {
      const matches = all(main, "t").filter(t => t.textContent?.includes(marker));
      if (matches.length !== 1 || matches[0].textContent !== marker) fail("A native note export marker was lost, duplicated or combined");
      const run = matches[0].parentElement; if (!run || run.namespaceURI !== W || run.localName !== "r" || Array.from(run.children).some(el => el.namespaceURI !== W || !["rPr", "t"].includes(el.localName))) fail("A native note export marker has mixed run content"); return run!;
    }
    function findBlock(marker: string): Element { const run = findRun(marker), p = run.parentElement; if (!p || p.parentElement !== body || p.localName !== "p" || all(p, "t").map(el => el.textContent).join("") !== marker) fail("A native note export boundary has mixed content"); return p!; }
    const parts = new Map<Kind, { xml: Document; rels: Document; path: string; next: number; relIds: Set<string> }>();
    for (const kind of ["footnote", "endnote"] as const) {
      if (!bodies.some(item => model.notes[item.noteId].kind === kind)) continue;
      const nativePath = `${path.slice(0, path.lastIndexOf("/") + 1)}${kind}s.xml`;
      const xml = parseXml(`<w:${kind}s xmlns:w="${W}" xmlns:r="${R}"/>`), noteRels = parseXml(`<Relationships xmlns="${PKG}"/>`);
      for (const [id, type, child] of [["-1", "separator", "separator"], ["0", "continuationSeparator", "continuationSeparator"]]) {
        const note = xml.createElementNS(W, `w:${kind}`); note.setAttributeNS(W, "w:id", id); note.setAttributeNS(W, "w:type", type);
        const p = xml.createElementNS(W, "w:p"), run = xml.createElementNS(W, "w:r"); run.append(xml.createElementNS(W, `w:${child}`)); p.append(run); note.append(p); xml.documentElement.append(note);
      }
      parts.set(kind, { xml, rels: noteRels, path: nativePath, next: 1, relIds: new Set() });
      for (const prior of Array.from(rels.documentElement.children).filter(el => el.getAttribute("Type") === `${R}/${kind}s`)) prior.remove();
      let id = `EDTR${kind}s`; while (Array.from(rels.documentElement.children).some(el => el.getAttribute("Id") === id)) id += "_";
      const rel = rels.createElementNS(PKG, "Relationship"); rel.setAttribute("Id", id); rel.setAttribute("Type", `${R}/${kind}s`); rel.setAttribute("Target", `${kind}s.xml`); rels.documentElement.append(rel);
      for (const prior of Array.from(types.documentElement.children).filter(el => el.getAttribute("PartName") === `/${nativePath}`)) prior.remove();
      const type = types.createElementNS(CT, "Override"); type.setAttribute("PartName", `/${nativePath}`); type.setAttribute("ContentType", `application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}s+xml`); types.documentElement.append(type);
    }
    const terminalIdentity: Element[] = [];
    let bookmarkId = Math.max(0, ...all(main, "bookmarkStart").map(el => Number(val(el, "id"))).filter(Number.isSafeInteger)) + 1;
    for (const item of bodies) {
      const record = model.notes[item.noteId], part = parts.get(record.kind)!, nativeId = String(part.next++), note = part.xml.createElementNS(W, `w:${record.kind}`);
      note.setAttributeNS(W, "w:id", nativeId);
      const start = findBlock(item.startMarker), end = findBlock(item.endMarker); let sibling = start.nextElementSibling;
      while (sibling && sibling !== end) {
        const next = sibling.nextElementSibling;
        if (sibling.namespaceURI !== W || sibling.localName !== "p" || all(sibling, "sectPr").length) fail("A native note export contains an unsupported body block");
        note.append(part.xml.importNode(sibling, true)); sibling.remove(); sibling = next;
      }
      if (sibling !== end) fail("Native note export boundaries are out of order");
      for (const anchor of all(end, "bookmarkStart")) {
        if (!val(anchor, "name").startsWith("_edtrsec")) fail("Unexpected native note boundary metadata");
        const close = anchor.nextElementSibling;
        if (val(anchor, "name") !== `_edtrsec${model.finalSectionId.slice(4)}` || !close || close.localName !== "bookmarkEnd" || val(anchor, "id") !== val(close, "id") || terminalIdentity.length) fail("Invalid native final section identity transport");
        terminalIdentity.push(anchor, close!); anchor.remove(); close!.remove();
      }
      start.remove(); end.remove();
      let first = children(note, "p")[0]; if (!first) { first = part.xml.createElementNS(W, "w:p"); note.append(first); }
      const pPr = children(first, "pPr")[0], reference = part.xml.createElementNS(W, "w:r"), rPr = part.xml.createElementNS(W, "w:rPr"), vertical = part.xml.createElementNS(W, "w:vertAlign"); vertical.setAttributeNS(W, "w:val", "superscript"); rPr.append(vertical); reference.append(rPr, part.xml.createElementNS(W, `w:${record.kind}Ref`));
      const a = part.xml.createElementNS(W, "w:bookmarkStart"), b = part.xml.createElementNS(W, "w:bookmarkEnd"); a.setAttributeNS(W, "w:id", String(bookmarkId)); a.setAttributeNS(W, "w:name", `EDNT${item.noteId.slice(4)}`); b.setAttributeNS(W, "w:id", String(bookmarkId++));
      const insertion = pPr ? pPr.nextSibling : first.firstChild; first.insertBefore(a, insertion); first.insertBefore(b, insertion); first.insertBefore(reference, insertion);
      const seen = part.relIds;
      for (const link of all(note, "hyperlink")) {
        const id = link.getAttributeNS(R, "id") || "", matches = Array.from(rels.documentElement.children).filter(el => el.getAttribute("Id") === id);
        if (matches.length !== 1 || matches[0].getAttribute("Type") !== `${R}/hyperlink` || matches[0].getAttribute("TargetMode") !== "External") fail("Cannot export an unsupported note hyperlink");
        if (!seen.has(id)) { part.rels.documentElement.append(part.rels.importNode(matches[0], true)); seen.add(id); }
      }
      part.xml.documentElement.append(note);
      const owner = findRun(ownerMarkers.get(item.noteId)!), ownerXml = main.createElementNS(W, `w:${record.kind}Reference`); ownerXml.setAttributeNS(W, "w:id", nativeId);
      const run = main.createElementNS(W, "w:r"), ownerPr = main.createElementNS(W, "w:rPr"), ownerVertical = main.createElementNS(W, "w:vertAlign"); ownerVertical.setAttributeNS(W, "w:val", "superscript"); ownerPr.append(ownerVertical); run.append(ownerPr, ownerXml); owner.replaceWith(run);
    }
    if (terminalIdentity.length) {
      const last = Array.from(body.children).filter(el => el.namespaceURI === W && el.localName !== "sectPr").at(-1);
      if (!last || last.localName !== "p") fail("Cannot safely restore the native final section identity");
      last!.append(...terminalIdentity);
    }
    for (const part of parts.values()) { zip.file(part.path, xmlString(part.xml)); if (part.rels.documentElement.children.length) zip.file(relPath(part.path), xmlString(part.rels)); else zip.remove(relPath(part.path)); }
    function policyElement(target: Document, kind: Kind, numbering: Partial<Numbering>, placement?: string) {
      const props = target.createElementNS(W, `w:${kind}Pr`);
      for (const [name, value] of [["pos", placement], ["numFmt", numbering.format], ["numStart", numbering.start], ["numRestart", numbering.restart === "eachSection" ? "eachSect" : numbering.restart]] as const) if (value !== undefined) { const el = target.createElementNS(W, `w:${name}`); el.setAttributeNS(W, "w:val", String(value)); props.append(el); }
      return props;
    }
    const settingsRels = Array.from(rels.documentElement.children).filter(el => el.getAttribute("Type") === `${R}/settings`);
    if (settingsRels.length !== 1) fail("Cannot export notes without one settings relationship");
    const settingsPath = partPath(path, settingsRels[0].getAttribute("Target") || ""), settings = await readXml(zip, settingsPath);
    for (const kind of ["footnote", "endnote"] as const) { children(settings.documentElement, `${kind}Pr`).forEach(el => el.remove()); const p = model.notePolicy[kind]; settings.documentElement.append(policyElement(settings, kind, p, kind === "footnote" ? "pageBottom" : p.placement === "sectionEnd" ? "sectEnd" : "docEnd")); }
    const sections = all(main, "sectPr").filter(el => el.parentElement?.namespaceURI === W && ["pPr", "body"].includes(el.parentElement.localName)), sectionIds: string[] = [];
    doc.forEach(node => { if (node.attrs.sectionEndId) sectionIds.push(String(node.attrs.sectionEndId)); }); sectionIds.push(model.finalSectionId);
    if (sections.length !== sectionIds.length) fail("Cannot export note policies with inconsistent sections");
    sections.forEach((section, index) => { for (const kind of ["footnote", "endnote"] as const) { children(section, `${kind}Pr`).forEach(el => el.remove()); const p = model.sections[sectionIds[index]]?.notePolicy?.[kind]; if (p) section.insertBefore(policyElement(main, kind, p), section.firstChild); } });
    const sectionOrder = "headerReference footerReference footnotePr endnotePr type pgSz pgMar paperSrc pgBorders lnNumType pgNumType cols formProt vAlign noEndnote titlePg textDirection bidi rtlGutter docGrid printerSettings sectPrChange".split(" ");
    for (const section of sections) for (const el of Array.from(section.children).sort((a, b) => sectionOrder.indexOf(a.localName) - sectionOrder.indexOf(b.localName))) section.append(el);
    // CT_Settings is a sequence: notes must precede compat, and defaultTabStop
    // must precede both. Word may silently ignore out-of-order note settings.
    const settingsOrder = "writeProtection view zoom removePersonalInformation removeDateAndTime doNotDisplayPageBoundaries displayBackgroundShape printPostScriptOverText printFractionalCharacterWidth printFormsData embedTrueTypeFonts embedSystemFonts saveSubsetFonts saveFormsData mirrorMargins alignBordersAndEdges bordersDoNotSurroundHeader bordersDoNotSurroundFooter gutterAtTop hideSpellingErrors hideGrammaticalErrors activeWritingStyle proofState formsDesign attachedTemplate linkStyles stylePaneFormatFilter stylePaneSortMethod documentType mailMerge revisionView trackRevisions doNotTrackMoves doNotTrackFormatting documentProtection autoFormatOverride styleLockTheme styleLockQFSet defaultTabStop autoHyphenation consecutiveHyphenLimit hyphenationZone doNotHyphenateCaps showEnvelope summaryLength clickAndTypeStyle defaultTableStyle evenAndOddHeaders bookFoldRevPrinting bookFoldPrinting bookFoldPrintingSheets drawingGridHorizontalSpacing drawingGridVerticalSpacing displayHorizontalDrawingGridEvery displayVerticalDrawingGridEvery doNotUseMarginsForDrawingGridOrigin drawingGridHorizontalOrigin drawingGridVerticalOrigin doNotShadeFormData noPunctuationKerning characterSpacingControl printTwoOnOne strictFirstAndLastChars noLineBreaksAfter noLineBreaksBefore savePreviewPicture doNotValidateAgainstSchema saveInvalidXml ignoreMixedContent alwaysShowPlaceholderText doNotDemarcateInvalidXml saveXmlDataOnly useXSLTWhenSaving saveThroughXslt showXMLTags alwaysMergeEmptyNamespace updateFields hdrShapeDefaults footnotePr endnotePr compat docVars rsids mathPr uiCompat97To2003 attachedSchema themeFontLang clrSchemeMapping doNotIncludeSubdocsInStats doNotAutoCompressPictures forceUpgrade captions readModeInkLockDown schemaLibrary shapeDefaults decimalSymbol listSeparator docId discardImageEditingData defaultImageDpi conflictMode chartTrackingRefBased".split(" ");
    const settingRank = (el: Element) => { const rank = settingsOrder.indexOf(el.localName); return rank < 0 ? settingsOrder.length : rank; };
    for (const el of Array.from(settings.documentElement.children).sort((a, b) => settingRank(a) - settingRank(b))) settings.documentElement.append(el);
    zip.file(settingsPath, xmlString(settings)); zip.file(path, xmlString(main)); zip.file(relPath(path), xmlString(rels)); zip.file("[Content_Types].xml", xmlString(types));
    return new Blob([await zip.generateAsync({ type: "arraybuffer" })], { type: blob.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  } };
}
