/** Native reference helpers. A field is interpreted only when every switch is supported. */
import JSZip from "jszip";
import { parseXml, xmlString, W } from "./docx-preservation";

export class ReferenceDocxError extends Error {
  readonly code = "unsupported-reference";
  constructor(message: string) { super(message); this.name = "ReferenceDocxError"; }
}

export type NativeReference = { name: string; display: "text" | "number" | "page" };

export function parseNativeReference(instruction: string): NativeReference | null {
  // Quoted bookmark names are accepted, but unknown switches must not be
  // approximated: several REF switches change what Word calculates.
  const match = /^\s*(REF|PAGEREF)\s+(?:"([^"\r\n]+)"|([^\s\\]+))((?:\s+\\[A-Za-z]+)*)\s*$/i.exec(instruction);
  if (!match) return null;
  const switches = [...match[4].matchAll(/\\([A-Za-z]+)/g)].map(m => m[1].toLowerCase());
  if (new Set(switches).size !== switches.length) return null;
  const page = match[1].toUpperCase() === "PAGEREF";
  // Word's REF \n refers to native paragraph numbering, which is not
  // interchangeable with the editor's caption ordinal.
  if (switches.some(s => s !== "h")) return null;
  const name = match[2] || match[3];
  return { name, display: page ? "page" : "text" };
}

/** Word bookmark names are ASCII, at most 40 characters, and case-insensitive. */
function checksum(token: string): string {
  let hash = 0x811c9dc5;
  for (const char of token) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(-4);
}
export function nativeReferenceAlias(id: string, kind: "bookmark" | "heading" | "caption" | "transport" | "number" = "bookmark"): string | null {
  const match = /^tgt_([0-9a-f]{32})$/.exec(id);
  return match ? `ED${kind === "heading" ? "H" : kind === "caption" ? "C" : kind === "transport" ? "T" : kind === "number" ? "N" : "R"}${match[1]}${checksum(match[1])}` : null;
}

export function identityFromNativeAlias(name: string): string | null {
  const m = /^ED[RHCTN]([0-9a-f]{32})([0-9a-f]{4})$/i.exec(name);
  const token = m?.[1].toLowerCase();
  return token && checksum(token) === m![2].toLowerCase() ? `tgt_${token}` : null;
}

export function nativeTocAlias(id: string, markerOnly = false): string | null {
  const match = /^fld_([0-9a-f]{32})$/.exec(id);
  return match ? `ED${markerOnly ? "G" : "F"}${match[1]}${checksum(markerOnly ? `G${match[1]}` : match[1])}` : null;
}
function tocIdentityFromAlias(name: string): string | null {
  const match = /^ED([FG])([0-9a-f]{32})([0-9a-f]{4})$/i.exec(name), token = match?.[2].toLowerCase();
  return token && checksum(match![1].toUpperCase() === "G" ? `G${token}` : token) === match![3].toLowerCase() ? `fld_${token}` : null;
}

function captionSalt(targetId: string): string {
  let hash = 0x811c9dc5;
  for (const ch of targetId) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Transport arbitrary caption labels in bounded, checksummed zero-width bookmarks. */
export function captionMetadataNames(label: string, targetId: string): string[] {
  const bytes = new TextEncoder().encode(label);
  if (!bytes.length || bytes.length > 512) throw new Error("Cannot export an empty or oversized caption label");
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  const parts = hex.match(/.{1,20}/g)!;
  const salt = captionSalt(targetId);
  return parts.map((part, index) => `EDM${index.toString(16).padStart(2, "0")}${parts.length.toString(16).padStart(2, "0")}${checksum(hex)}${salt}${part}`);
}
export function captionSequenceAlias(label: string): string {
  const hex = Array.from(new TextEncoder().encode(label), b => b.toString(16).padStart(2, "0")).join("");
  // Registry collision detection is mandatory: this is a Word sequence name,
  // not an identity. The original label is carried separately in metadata.
  let hash = 0x811c9dc5; for (const ch of hex) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 0x01000193); }
  return `EDS${(hash >>> 0).toString(16).padStart(8, "0")}${hex.length.toString(16)}`;
}

export type ReferenceReplacement = { marker: string; kind: "start" | "end" | "xml"; name?: string; id: number; xml?: string; headingLevel?: number };
/** Replace private temporary text runs with independently positioned native ranges. */
export async function replaceReferenceBookmarks(blob: Blob, replacements: ReferenceReplacement[]): Promise<Blob> {
  if (!replacements.length) return blob;
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const part = zip.file("word/document.xml");
  if (!part) throw new Error("DOCX document part missing");
  const doc = parseXml(await part.async("string"));
  const starts = Array.from(doc.getElementsByTagNameNS(W, "bookmarkStart"));
  const ends = Array.from(doc.getElementsByTagNameNS(W, "bookmarkEnd"));
  const allocated = new Map<number, number>();
  const occupied = new Set([...starts, ...ends].map(el => Number(el.getAttributeNS(W, "id"))).filter(Number.isSafeInteger));
  let nextId = 1;
  for (const replacement of replacements) {
    const found = Array.from(doc.getElementsByTagNameNS(W, "t")).filter(el => el.textContent === replacement.marker);
    if (found.length !== 1) throw new Error("A reference export anchor was lost or duplicated");
    const marker = found[0].parentElement;
    if (!marker || marker.namespaceURI !== W || marker.localName !== "r" || Array.from(marker.children).some(el => el.namespaceURI !== W || !["rPr", "t"].includes(el.localName)) || marker.getElementsByTagNameNS(W, "t").length !== 1) throw new Error("A reference export anchor was combined with content");
    if (replacement.kind === "xml") {
      const wrapper = parseXml(`<w:root xmlns:w="${W}">${replacement.xml || ""}</w:root>`).documentElement;
      const children = Array.from(wrapper.children);
      if (!children.length || children.some(el => el.namespaceURI !== W || !["r", "fldSimple"].includes(el.localName)) || Array.from(wrapper.getElementsByTagName("*")).some(el => Array.from(el.attributes).some(a => a.namespaceURI === "http://schemas.openxmlformats.org/officeDocument/2006/relationships"))) throw new Error("Unsupported native field XML cannot be exported safely");
      marker.replaceWith(...children.map(el => doc.importNode(el, true)));
      continue;
    }
    if (replacement.kind === "start" && replacement.headingLevel) {
      let paragraph = marker.parentElement;
      while (paragraph && !(paragraph.namespaceURI === W && paragraph.localName === "p")) paragraph = paragraph.parentElement;
      if (!paragraph) throw new Error("A heading reference anchor lost its paragraph");
      let pPr = Array.from(paragraph.children).find(el => el.namespaceURI === W && el.localName === "pPr");
      if (!pPr) { pPr = doc.createElementNS(W, "w:pPr"); paragraph.insertBefore(pPr, paragraph.firstChild); }
      for (const prior of Array.from(pPr.children)) if (prior.namespaceURI === W && prior.localName === "outlineLvl") prior.remove();
      const outline = doc.createElementNS(W, "w:outlineLvl"); outline.setAttributeNS(W, "w:val", String(replacement.headingLevel - 1));
      const following = Array.from(pPr.children).find(el => el.namespaceURI === W && ["divId", "cnfStyle", "rPr", "sectPr", "pPrChange"].includes(el.localName));
      pPr.insertBefore(outline, following || null);
    }
    let id = allocated.get(replacement.id);
    if (!id) { while (occupied.has(nextId)) nextId++; id = nextId++; occupied.add(id); allocated.set(replacement.id, id); }
    const native = doc.createElementNS(W, `w:bookmark${replacement.kind === "start" ? "Start" : "End"}`);
    native.setAttributeNS(W, "w:id", String(id));
    if (replacement.kind === "start") native.setAttributeNS(W, "w:name", replacement.name!);
    marker.replaceWith(native);
  }
  zip.file("word/document.xml", xmlString(doc));
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

/** Extract body reference fields and bookmark boundaries before Mammoth flattens them. */
export async function prepareReferenceImport(arrayBuffer: ArrayBuffer): Promise<{ arrayBuffer: ArrayBuffer; restore: (html: string) => string }> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const part = zip.file("word/document.xml");
  if (!part) return { arrayBuffer, restore: html => html };
  const doc = parseXml(await part.async("string"));
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  if (!body) throw new Error("DOCX has no document body");
  const elements = (root: Element, local: string) => Array.from(root.getElementsByTagNameNS(W, local));
  const attr = (node: Element, name: string) => node.getAttributeNS(W, name) || "";
  let starts = elements(body, "bookmarkStart"), ends = elements(body, "bookmarkEnd");
  // A private-looking bookmark that another native field or hyperlink names
  // is a user-visible target. Never consume it as transport metadata.
  const instructionText = [elements(body, "instrText").map(el => el.textContent || "").join(""), ...elements(body, "fldSimple").map(el => attr(el, "instr"))].join(" ").toLowerCase();
  const linkedAnchors = new Set(elements(body, "hyperlink").map(el => attr(el, "anchor").toLowerCase()).filter(Boolean));
  const addressed = (name: string) => instructionText.includes(name.toLowerCase()) || linkedAnchors.has(name.toLowerCase());
  const transported = new Map<Element, string>(), numberAliases = new Map<string, string>();
  // A private label or number anchor is recognized only alongside the
  // matching verifiable caption target, not from its name alone.
  const captionTargets = new Map<string, Element>();
  for (const start of starts) {
    const name = attr(start, "name"), identity = /^EDC/i.test(name) && identityFromNativeAlias(name);
    if (identity && start.parentElement?.namespaceURI === W && start.parentElement.localName === "p") captionTargets.set(identity, start.parentElement);
  }
  const captionParagraphs = new Set(captionTargets.values());
  const captionParts = new Map<Element, { total: number; digest: string; parts: Map<number, string> }>();
  const emptyRangeEnd = (start: Element) => {
    const matches = ends.filter(end => attr(end, "id") === attr(start, "id"));
    if (matches.length !== 1 || matches[0].parentElement !== start.parentElement) return null;
    let node = start.nextElementSibling;
    while (node && node !== matches[0]) {
      if (node.namespaceURI !== W || !["bookmarkStart", "bookmarkEnd"].includes(node.localName)) return null;
      node = node.nextElementSibling;
    }
    return node === matches[0] ? matches[0] : null;
  };
  for (const start of starts) {
    const name = attr(start, "name");
    const modernMetadata = /^EDM([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{4})[0-9a-f]{8}([0-9a-f]{2,20})$/i.exec(name);
    const owner = [...captionTargets].find(([, paragraph]) => paragraph === start.parentElement)?.[0];
    const ownedModern = modernMetadata && owner && name.slice(11, 19).toLowerCase() === captionSalt(owner);
    const metadata = (ownedModern ? modernMetadata : null) || /^EDL([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{4})([0-9a-f]{2,28})$/i.exec(name);
    if (metadata && start.parentElement && captionParagraphs.has(start.parentElement)) {
      if (addressed(name)) throw new ReferenceDocxError("Cannot safely import addressed caption metadata");
      const end = emptyRangeEnd(start), paragraph = start.parentElement;
      if (!paragraph || paragraph.localName !== "p" || !end) throw new ReferenceDocxError("Invalid native caption metadata");
      const index = parseInt(metadata[1],16), total = parseInt(metadata[2],16), digest = metadata[3].toLowerCase();
      const group = captionParts.get(paragraph) || { total, digest, parts: new Map<number, string>() };
      if (!total || index >= total || group.total !== total || group.digest !== digest || group.parts.has(index)) throw new ReferenceDocxError("Conflicting native caption metadata");
      group.parts.set(index, metadata[4].toLowerCase()); captionParts.set(paragraph, group); start.remove(); end.remove(); continue;
    }
    const numberIdentity = /^EDN/i.test(name) && identityFromNativeAlias(name);
    if (numberIdentity && captionTargets.get(numberIdentity) === start.parentElement) {
      const matching = ends.filter(end => attr(end, "id") === attr(start, "id"));
      if (matching.length !== 1 || starts.filter(candidate => attr(candidate, "id") === attr(start, "id")).length !== 1 || !(start.compareDocumentPosition(matching[0]) & Node.DOCUMENT_POSITION_FOLLOWING) || numberAliases.has(name.toLowerCase())) throw new ReferenceDocxError("Invalid native caption number anchor");
      const content: Element[] = []; let item = start.nextElementSibling;
      while (item && item !== matching[0]) { content.push(item); item = item.nextElementSibling; }
      const instructions = content.flatMap(el => [...(el.localName === "fldSimple" ? [attr(el, "instr")] : []), ...elements(el, "instrText").map(code => code.textContent || "")]).join("");
      if (item === matching[0] && /^\s*SEQ\s+[A-Za-z][A-Za-z0-9_]{0,39}\s*$/i.test(instructions)) {
        numberAliases.set(name.toLowerCase(), numberIdentity); start.remove(); matching[0].remove(); continue;
      }
    }
    const identity = !addressed(name) && /^EDT/i.test(name) && identityFromNativeAlias(name);
    if (!identity) continue;
    const end = emptyRangeEnd(start);
    if (!end) throw new ReferenceDocxError("Invalid native reference identity transport");
    const candidates: Element[] = []; let sibling = start.nextElementSibling;
    while (sibling && sibling !== end) { if (sibling.localName === "bookmarkStart" && !/^_Toc/i.test(attr(sibling, "name"))) candidates.push(sibling); sibling = sibling.nextElementSibling; }
    if (!candidates.length && end.nextElementSibling?.namespaceURI === W && end.nextElementSibling.localName === "bookmarkStart") candidates.push(end.nextElementSibling);
    if (candidates.length !== 1 || transported.has(candidates[0])) throw new ReferenceDocxError("Invalid native reference identity transport");
    transported.set(candidates[0], identity); start.remove(); end.remove();
  }
  const captionLabels = new Map<Element, string>();
  for (const [paragraph, group] of captionParts) {
    if (group.parts.size !== group.total) throw new ReferenceDocxError("Incomplete native caption metadata");
    const hex = Array.from({length: group.total}, (_, i) => group.parts.get(i) || "").join("");
    if (hex.length % 2 || checksum(hex) !== group.digest) throw new ReferenceDocxError("Invalid native caption metadata checksum");
    const bytes = Uint8Array.from(hex.match(/../g) || [], pair => parseInt(pair, 16));
    let label: string; try { label = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new ReferenceDocxError("Invalid native caption label"); }
    captionLabels.set(paragraph, label);
  }
  const sequenceLabels = new Map<string, string>();
  for (const [paragraph, label] of captionLabels) {
    const simple = elements(paragraph, "fldSimple").map(el => attr(el, "instr"));
    const complex = elements(paragraph, "instrText").map(el => el.textContent || "").join("");
    for (const instruction of [...simple, complex]) {
      const sequence = /^\s*SEQ\s+(EDS[A-Za-z0-9_]+)\s*$/i.exec(instruction)?.[1]?.toLowerCase();
      if (!sequence) continue;
      const previous = sequenceLabels.get(sequence);
      if (previous !== undefined && previous !== label) throw new ReferenceDocxError("Conflicting native caption sequence metadata");
      sequenceLabels.set(sequence, label);
    }
  }
  starts = elements(body, "bookmarkStart"); ends = elements(body, "bookmarkEnd");
  const usedNumbers = new Set([...starts, ...ends].map(el => Number(attr(el, "id"))).filter(Number.isSafeInteger));
  let next = 1; while (usedNumbers.has(next)) next++;
  const uniqueId = () => { while (usedNumbers.has(next)) next++; usedNumbers.add(next); return next++; };
  const token = crypto.randomUUID().replace(/-/g, "");
  let serial = 0;
  const markers = new Map<string, { type: "start" | "end" | "field" | "block-start" | "block-end" | "toc" | "toc-entry" | "toc-title"; attrs: Record<string, string> }>();
  function marker(replace: Element, value: { type: "start" | "end" | "field" | "block-start" | "block-end" | "toc" | "toc-entry" | "toc-title"; attrs: Record<string, string> }) {
    const name = `EDTRI${token}${serial++}`;
    const id = String(uniqueId());
    const a = doc.createElementNS(W, "w:bookmarkStart"), b = doc.createElementNS(W, "w:bookmarkEnd");
    a.setAttributeNS(W, "w:id", id); a.setAttributeNS(W, "w:name", name); b.setAttributeNS(W, "w:id", id);
    replace.replaceWith(a, b); markers.set(name, value);
  }
  // Complex TOCs are captured while they are still a field tree. Their cache
  // paragraphs become owned entries, and the live coordinator regenerates them.
  type FieldFrame = { begin: Element; separator?: Element; end?: Element; instruction: string; nested: boolean };
  const stack: FieldFrame[] = [], tocs: FieldFrame[] = [];
  for (const run of elements(body, "r")) {
    for (const child of Array.from(run.children)) {
      if (child.namespaceURI !== W) continue;
      if (child.localName === "instrText" && stack.length) stack[stack.length - 1].instruction += child.textContent || "";
      if (child.localName !== "fldChar") continue;
      const kind = attr(child, "fldCharType");
      if (kind === "begin") { if (stack.length) stack[stack.length - 1].nested = true; stack.push({ begin: run, instruction: "", nested: false }); }
      else if (kind === "separate" && stack.length) stack[stack.length - 1].separator = run;
      else if (kind === "end" && stack.length) { const frame = stack.pop()!; frame.end = run; if (/^\s*TOC\b/i.test(frame.instruction)) tocs.push(frame); }
    }
  }
  if (stack.some(frame => /^\s*TOC\b/i.test(frame.instruction))) throw new ReferenceDocxError("Cannot safely import an unclosed native table of contents");
  for (const toc of tocs) {
    const range = /^\s*TOC\s+\\o\s+"([1-6])-([1-6])"(?:\s+\\h)?\s*$/i.exec(toc.instruction);
    const styles = /^\s*TOC\s+\\t\s+"([^"]+)"(?:\s+\\h)?\s*$/i.exec(toc.instruction);
    let levels: number[] = [];
    if (range && Number(range[1]) <= Number(range[2])) levels = Array.from({ length: Number(range[2]) - Number(range[1]) + 1 }, (_, n) => Number(range[1]) + n);
    if (styles) {
      const pairs = styles[1].split(",");
      if (pairs.length % 2 === 0) {
        const extracted = [] as number[];
        for (let i = 0; i < pairs.length; i += 2) {
          const style = /^heading ([1-6])$/i.exec(pairs[i].trim());
          if (!style || pairs[i + 1].trim() !== style[1]) { extracted.length = 0; break; }
          extracted.push(Number(style[1]));
        }
        if (extracted.every((n, i) => !i || n > extracted[i - 1])) levels = extracted;
      }
    }
    if (!levels.length || !toc.separator || !toc.end) throw new ReferenceDocxError("Cannot safely import this unsupported native table of contents");
    const list = elements(body, "r"), first = list.indexOf(toc.begin), separator = list.indexOf(toc.separator), last = list.indexOf(toc.end);
    if (first < 0 || separator <= first || last <= separator) throw new ReferenceDocxError("Invalid native table of contents field order");
    const paragraphOf = (run: Element) => { let p: Element | null = run; while (p && !(p.namespaceURI === W && p.localName === "p")) p = p.parentElement; return p; };
    const startP = paragraphOf(toc.begin), endP = paragraphOf(toc.end);
    if (!startP || !endP) throw new Error("Native table of contents has no paragraph");
    const paragraphRuns = (p: Element) => elements(p, "r").filter(run => paragraphOf(run) === p);
    if (paragraphRuns(endP).at(-1) !== toc.end) throw new ReferenceDocxError("Cannot safely split mixed native table of contents text");
    const controls = list.slice(first, separator + 1).concat(toc.end);
    if (controls.some(run => Array.from(run.children).some(el => el.namespaceURI !== W || !["rPr", "fldChar", "instrText"].includes(el.localName)))) throw new ReferenceDocxError("Cannot safely split a native table of contents control run");
    // Only an adjacent checksummed private marker identifies an application
    // TOC title; arbitrary preceding Word paragraphs are never guessed.
    const prior = startP.previousElementSibling;
    const titleParagraphs = [startP, ...(prior?.namespaceURI === W && prior.localName === "p" ? [prior] : [])];
    const titleAnchors = titleParagraphs.flatMap(p => Array.from(p.children).filter(el => el.namespaceURI === W && el.localName === "bookmarkStart" && !addressed(attr(el, "name")) && !!tocIdentityFromAlias(attr(el, "name"))));
    if (titleAnchors.length > 1) throw new ReferenceDocxError("Conflicting native table of contents identities");
    const titleAnchor = titleAnchors[0], titleEnd = titleAnchor?.nextElementSibling;
    if (titleAnchor && (!titleEnd || titleEnd.namespaceURI !== W || titleEnd.localName !== "bookmarkEnd" || attr(titleEnd, "id") !== attr(titleAnchor, "id"))) throw new ReferenceDocxError("Invalid native table of contents identity");
    if (titleAnchor && titleAnchor.parentElement !== startP) {
      const priorRuns = paragraphRuns(startP).slice(0, paragraphRuns(startP).indexOf(toc.begin));
      if (priorRuns.some(run => Array.from(run.children).some(child => child.namespaceURI !== W || child.localName !== "rPr"))) throw new ReferenceDocxError("Cannot safely import prose before a table of contents field");
    }
    const id = (titleAnchor && tocIdentityFromAlias(attr(titleAnchor, "name"))) || `fld_${crypto.randomUUID().replace(/-/g, "")}`;
    if (titleAnchor) { marker(titleAnchor, { type: "toc-title", attrs: { "data-edtr-toc": JSON.stringify({ fieldId: id, levels, ...(/^EDG/i.test(attr(titleAnchor,"name")) ? { markerOnly:true } : {}) }) } }); titleEnd!.remove(); }
    const entries = [...new Set(list.slice(separator + 1, last).map(paragraphOf).filter((p): p is Element => !!p))];
    for (const p of entries) {
      const probe = doc.createElementNS(W, "w:r");
      const pPr = Array.from(p.children).find(el => el.namespaceURI === W && el.localName === "pPr");
      p.insertBefore(probe, pPr ? pPr.nextSibling : p.firstChild);
      marker(probe, { type: "toc-entry", attrs: { "data-toc-owner-id": id } });
    }
    marker(toc.begin, { type: "toc", attrs: { "data-edtr-toc": JSON.stringify({ fieldId: id, levels }), ...(titleAnchor ? { "data-managed-title": "true" } : {}) } });
    controls.slice(1).forEach(run => run.remove());
  }
  const targetNames = new Map<string, string[]>(Array.from(numberAliases, ([name, id]) => [name, [id]]));
  for (const start of starts) {
    if (!start.isConnected) continue;
    const name = attr(start, "name"), id = attr(start, "id");
    if (!name || /^(?:EDTRLayout|EDTRTextBoxImport|_edtrsec)/i.test(name)) continue;
    const matching = ends.filter(end => attr(end, "id") === id);
    if (starts.filter(el => attr(el, "id") === id).length !== 1 || matching.length !== 1 || !(start.compareDocumentPosition(matching[0]) & Node.DOCUMENT_POSITION_FOLLOWING)) throw new ReferenceDocxError(`Cannot safely import malformed bookmark ${name}`);
    if (start.hasAttributeNS(W, "colFirst") || start.hasAttributeNS(W, "colLast")) throw new ReferenceDocxError("Cannot safely import a column-scoped bookmark");
    const targetId = transported.get(start) || (/^ED[RHC]/i.test(name) ? identityFromNativeAlias(name) : null) || `tgt_${crypto.randomUUID().replace(/-/g, "")}`;
    const key = name.toLowerCase(), ids = targetNames.get(key) || []; ids.push(targetId); targetNames.set(key, ids);
    const ownBlock = !!identityFromNativeAlias(name) && /^ED[HC]/i.test(name);
    marker(matching[0], { type: ownBlock ? "block-end" : "end", attrs: { "data-target-id": targetId } });
    marker(start, { type: ownBlock ? "block-start" : "start", attrs: { "data-target-id": targetId, "data-name": name, "data-native-name": name } });
  }
  function fieldValue(instruction: string, cached: string, nativeXml: string, context: Element) {
    const parsed = parseNativeReference(instruction), ids = parsed ? targetNames.get(parsed.name.toLowerCase()) || [] : [];
    const seq = /^\s*SEQ\s+([A-Za-z][A-Za-z0-9_]{0,39})(?:\s+\\\*\s+ARABIC)?\s*$/i.exec(instruction);
    let paragraph: Element | null = context;
    while (paragraph && !(paragraph.namespaceURI === W && paragraph.localName === "p")) paragraph = paragraph.parentElement;
    const captionStyle = paragraph && elements(paragraph, "pStyle").some(el => attr(el, "val").toLowerCase() === "caption");
    const ownCaption = paragraph && elements(paragraph, "bookmarkStart").some(el => markers.get(attr(el, "name"))?.type === "block-start" && /^EDC/i.test(markers.get(attr(el, "name"))?.attrs["data-name"] || ""));
    const captionLabel = seq && paragraph && captionLabels.has(paragraph) ? captionLabels.get(paragraph)! : seq && ownCaption && /^EDS/i.test(seq[1]) ? sequenceLabels.get(seq[1].toLowerCase()) || "" : seq && (captionStyle || ownCaption) ? seq[1] : "";
    if (seq && ownCaption && /^EDS/i.test(seq[1]) && !captionLabel) throw new ReferenceDocxError("Cannot recover the native caption label safely");
    return { type: "field" as const, attrs: {
      "data-field-id": `fld_${crypto.randomUUID().replace(/-/g, "")}`, "data-target-id": ids.length === 1 ? ids[0] : "",
      "data-display": captionLabel || (parsed?.display === "text" && numberAliases.has(parsed.name.toLowerCase())) ? "number" : parsed?.display || "text", "data-cached": cached,
      "data-status": captionLabel ? "pending" : !parsed ? "unsupported" : ids.length === 0 ? "missing-target" : ids.length > 1 ? "ambiguous" : "pending",
      "data-instruction": captionLabel ? `SEQ ${captionLabel}` : instruction, "data-native-name": parsed?.name || "", "data-native-xml": nativeXml, "data-seq-label": captionLabel,
    } };
  }
  for (const simple of elements(body, "fldSimple")) {
    const instruction = attr(simple, "instr");
    if (/^\s*TOC\b/i.test(instruction) || elements(simple, "fldSimple").length || elements(simple, "fldChar").length || elements(simple, "bookmarkStart").length || elements(simple, "bookmarkEnd").length) throw new ReferenceDocxError("Cannot safely import a nested native field");
    marker(simple, fieldValue(instruction, elements(simple, "t").map(el => el.textContent || "").join(""), xmlString(simple), simple));
  }
  const containers = [body, ...Array.from(body.getElementsByTagNameNS(W, "*"))];
  for (const container of containers) {
    const runs = Array.from(container.children);
    for (let i = 0; i < runs.length; i++) {
      const begin = runs[i], fieldChar = begin.localName === "r" && begin.namespaceURI === W ? elements(begin, "fldChar")[0] : null;
      if (!fieldChar || attr(fieldChar, "fldCharType") !== "begin") continue;
      let separate = -1, end = -1, nested = false;
      for (let j = i + 1; j < runs.length; j++) {
        for (const c of elements(runs[j], "fldChar")) {
          const type = attr(c, "fldCharType");
          if (type === "begin") nested = true;
          if (type === "separate" && separate < 0) separate = j;
          if (type === "end") { end = j; break; }
        }
        if (end >= 0) break;
      }
      const instruction = runs.slice(i + 1, separate < 0 ? (end < 0 ? runs.length : end) : separate).flatMap(r => elements(r, "instrText")).map(el => el.textContent || "").join("");
      if (nested || end < 0 || separate < 0) throw new ReferenceDocxError("Cannot safely import nested or cross-paragraph reference field");
      const portion = runs.slice(i, end + 1), cached = runs.slice(separate + 1, end).flatMap(r => elements(r, "t")).map(el => el.textContent || "").join("");
      if (portion.some(run => run.namespaceURI !== W || run.localName !== "r")) throw new ReferenceDocxError("Cannot safely import a field containing non-run content");
      for (const control of [begin, runs[separate], runs[end]]) if (Array.from(control.children).some(el => el.namespaceURI !== W || !["rPr", "fldChar"].includes(el.localName))) throw new ReferenceDocxError("Cannot safely split a mixed field control run");
      marker(begin, fieldValue(instruction, cached, portion.map(xmlString).join(""), container));
      portion.slice(1).forEach(el => el.remove()); i = end;
    }
  }
  if (!markers.size) return { arrayBuffer, restore: html => html };
  zip.file("word/document.xml", xmlString(doc));
  return { arrayBuffer: await zip.generateAsync({ type: "arraybuffer" }), restore(html) {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    for (const [name, value] of markers) {
      const anchors = parsed.querySelectorAll(`[id="${name}"]`);
      if (anchors.length !== 1) throw new Error("A reference import anchor was lost or duplicated");
      if (value.type === "toc-title") {
        const block = anchors[0].closest("p"); if (!block) throw new Error("A native table of contents title lost its paragraph");
        block.setAttribute("data-edtr-toc", value.attrs["data-edtr-toc"]); anchors[0].remove(); continue;
      }
      if (value.type === "toc-entry") {
        const block = anchors[0].closest("p,h1,h2,h3,h4,h5,h6");
        if (!block) throw new Error("A native table of contents entry lost its paragraph");
        block.setAttribute("data-toc-owner-id", value.attrs["data-toc-owner-id"]); anchors[0].remove(); continue;
      }
      if (value.type === "toc") {
        if (value.attrs["data-managed-title"]) {
          const title = anchors[0].closest("p");
          if (title?.hasAttribute("data-edtr-toc") && title.hasAttribute("data-toc-owner-id")) {
            const result = parsed.createRange(); result.setStartAfter(anchors[0]); result.setEnd(title, title.childNodes.length);
            const entry = parsed.createElement("p"); entry.setAttribute("data-toc-owner-id", title.getAttribute("data-toc-owner-id")!);
            entry.appendChild(result.extractContents()); title.removeAttribute("data-toc-owner-id"); title.after(entry);
          }
          anchors[0].remove(); continue;
        }
        const block = anchors[0].closest("p,h1,h2,h3,h4,h5,h6");
        if (!block) throw new Error("A native table of contents lost its paragraph");
        const markerBlock = parsed.createElement("p"); markerBlock.setAttribute("data-edtr-toc", value.attrs["data-edtr-toc"]);
        const prefix = parsed.createRange(); prefix.setStart(block, 0); prefix.setEndBefore(anchors[0]);
        markerBlock.appendChild(prefix.extractContents());
        if (!markerBlock.textContent?.trim() && !markerBlock.querySelector("img,br,[data-edtr-reference]")) {
          markerBlock.setAttribute("data-edtr-toc", JSON.stringify({ ...JSON.parse(value.attrs["data-edtr-toc"]), markerOnly: true }));
        }
        block.before(markerBlock); anchors[0].remove();
        if (!block.textContent?.trim() && !block.querySelector("img,br,[data-edtr-reference]")) block.remove();
        continue;
      }
      if (value.type === "block-end") { anchors[0].remove(); continue; }
      if (value.type === "block-start") {
        const block = anchors[0].closest("p,h1,h2,h3,h4,h5,h6");
        if (!block) throw new Error("A native block target lost its paragraph");
        const caption = /^EDC/i.test(value.attrs["data-name"]);
        if (!caption && !/^H[1-6]$/.test(block.tagName)) throw new Error("A native heading target lost its heading");
        block.setAttribute("data-target-id", value.attrs["data-target-id"]);
        if (caption) block.setAttribute("data-target-kind", "caption");
        anchors[0].remove(); continue;
      }
      if (value.type === "field" && value.attrs["data-seq-label"]) {
        const block = anchors[0].closest("p");
        if (!block) throw new Error("A native caption sequence lost its paragraph");
        const id = block.getAttribute("data-target-id") || `tgt_${crypto.randomUUID().replace(/-/g, "")}`;
        block.setAttribute("data-target-id", id); block.setAttribute("data-target-kind", "caption");
        block.setAttribute("data-caption-label", value.attrs["data-seq-label"]);
        value.attrs["data-target-id"] = id;
      }
      const span = parsed.createElement("span");
      if (value.type === "field") span.setAttribute("data-edtr-reference", "true");
      else span.setAttribute("data-edtr-bookmark", value.type);
      for (const [key, valueAttr] of Object.entries(value.attrs)) if (valueAttr) span.setAttribute(key, valueAttr);
      if (value.type === "field") span.textContent = value.attrs["data-cached"];
      anchors[0].replaceWith(span);
    }
    for (const link of Array.from(parsed.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))) {
      const ids = targetNames.get((link.getAttribute("href") || "").slice(1).toLowerCase()) || [];
      if (ids.length === 1) link.setAttribute("href", `#edtr-target-${ids[0]}`);
    }
    return parsed.body.innerHTML;
  } };
}
