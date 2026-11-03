/** Formatted-copy profile: ordinary native content, paired bookmarks and related v3 metadata.
 * No content controls (Word Online makes those view-only) or Word CITATION fields. */
import JSZip from "jszip";
import { parseXml, xmlString, W } from "./docx-preservation";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const NS = "urn:edtrdocs:bibliography:1";
const LEGACY_REL = `${NS}/graph`;
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml";
const BOOKMARK = "EDBC";
const TAG = "EDTRBibliography1:";
export class BibliographyDocxError extends Error {
  readonly code = "unsupported-bibliography";
  constructor(message: string) { super(message); this.name = "BibliographyDocxError"; }
}
export type BibliographyDocxGraph = { sources: Record<string, unknown>; bibliography: unknown };
export type BibliographyDocxCarrier = { fieldId: string; kind: "citation" | "bibliography"; html: string };
type StoredCarrier = BibliographyDocxCarrier & { signature: string };
const all = (node: Document | Element, name: string) => Array.from(node.getElementsByTagNameNS(W, name));
const children = (node: Element, name: string) => Array.from(node.children).filter(el => el.namespaceURI === W && el.localName === name);
function fail(message: string): never { throw new BibliographyDocxError(message); }
function resolve(base: string, target: string): string {
  if (!target || /[\\?#%]/.test(target)) fail("Invalid bibliography relationship target");
  const parts: string[] = [];
  for (const component of (target.startsWith("/") ? target.slice(1) : base.slice(0, base.lastIndexOf("/") + 1) + target).split("/")) {
    if (component === "..") { if (!parts.length) fail("Bibliography relationship escapes package"); parts.pop(); }
    else if (component && component !== ".") parts.push(component);
  }
  return parts.join("/");
}
async function mainPart(zip: JSZip) {
  const rels = parseXml(await zip.file("_rels/.rels")?.async("string") || `<Relationships xmlns="${PKG}"/>`);
  const found = Array.from(rels.documentElement.children).filter(el => el.namespaceURI === PKG && el.getAttribute("Type") === "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument");
  if (found.length !== 1 || found[0].hasAttribute("TargetMode")) fail("DOCX main relationship is missing or ambiguous");
  const path = resolve("", found[0].getAttribute("Target") || "");
  const file = zip.file(path); if (!file) fail("DOCX main part missing");
  const doc = parseXml(await file.async("string"));
  const relPath = path.replace(/([^/]+)$/, "_rels/$1.rels");
  const relations = parseXml(await zip.file(relPath)?.async("string") || `<Relationships xmlns="${PKG}"/>`);
  return { path, doc, relPath, relations };
}
/** Ignore serialization prefixes and volatile Word revision ids, but retain all visible structure/properties. */
function signature(node: Element): string {
  const encode = (el: Element): unknown => [el.namespaceURI, el.localName,
    Array.from(el.attributes).filter(a => a.namespaceURI !== "http://www.w3.org/2000/xmlns/" && !(a.namespaceURI === W && /^rsid/.test(a.localName)))
      .map(a => [a.namespaceURI, a.localName, a.value]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    Array.from(el.childNodes).filter(n => n.nodeType === 1 || (n.nodeType === 3 && (el.localName === "t" || el.localName === "instrText")))
      .map(n => n.nodeType === 1 ? encode(n as Element) : n.textContent)];
  return JSON.stringify(Array.from(node.children).map(encode));
}
function nativeSignature(content: Element, relations: Document): string {
  const namespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const references = new Set(Array.from(content.getElementsByTagName("*")).flatMap(el => Array.from(el.attributes).filter(a=>a.namespaceURI === namespace).map(a=>a.value)));
  const related = [...references].sort().map(id => {
    const matches = Array.from(relations.documentElement.children).filter(el => el.namespaceURI === PKG && el.getAttribute("Id") === id);
    if(matches.length !== 1) fail("Bibliography visible relationship is missing or ambiguous");
    return [id,matches[0].getAttribute("Type"),matches[0].getAttribute("Target"),matches[0].getAttribute("TargetMode")];
  });
  return JSON.stringify([signature(content),related]);
}
/** v3 correspondence compares effective rich runs rather than serialization boundaries.
 * Unknown properties remain in the signature. No direction, font or language is discarded. */
async function semanticContext(zip: JSZip, main: Awaited<ReturnType<typeof mainPart>>) {
  const rels = Array.from(main.relations.documentElement.children).filter(el => el.getAttribute("Type") === "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles");
  if (rels.length > 1 || rels.some(el => el.hasAttribute("TargetMode"))) fail("Bibliography styles relationship ambiguous");
  const file = zip.file(rels.length ? resolve(main.path, rels[0].getAttribute("Target") || "") : main.path.replace(/[^/]+$/, "styles.xml"));
  return file ? parseXml(await file.async("string")) : undefined;
}
function semanticSignature(content: Element, relations: Document, styles: Document | undefined, paragraph?: Element | null): string {
  const bool = new Set("b bCs i iCs caps smallCaps strike dstrike outline shadow emboss imprint vanish webHidden rtl cs snapToGrid noProof specVanish oMath".split(" "));
  const canonical = (el: Element): unknown => {
    const attrs = Array.from(el.attributes).filter(a => a.namespaceURI !== "http://www.w3.org/2000/xmlns/" && !(a.namespaceURI === W && /^rsid/.test(a.localName)) && !(a.namespaceURI === "http://schemas.microsoft.com/office/word/2010/wordml" && ["paraId","textId"].includes(a.localName)))
      .map(a => [a.namespaceURI, a.localName, a.value]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return [el.namespaceURI,el.localName,attrs,Array.from(el.childNodes).filter(n=>n.nodeType===1 || n.nodeType===3 && ["t","instrText"].includes(el.localName)).map(n=>n.nodeType===1?canonical(n as Element):n.textContent)];
  };
  type Properties = Map<string, unknown>;
  const merge = (target: Properties, properties?: Element) => {
    if (!properties) return;
    const seen = new Set<string>();
    for (const el of Array.from(properties.children)) {
      const identity=`${el.namespaceURI}:${el.localName}`;
      if(seen.has(identity))fail("Duplicate bibliography formatting property");seen.add(identity);
      if(el.namespaceURI === W && ["rStyle","pStyle"].includes(el.localName))continue;
      const key = `${el.namespaceURI}:${el.localName}`;
      if(el.namespaceURI === W && bool.has(el.localName) && !el.children.length && Array.from(el.attributes).every(a=>a.namespaceURI === W && a.localName === "val")) {
        const value = el.getAttributeNS(W,"val");
        if(value !== null && !["true","false","1","0","on","off"].includes(value))fail("Invalid bibliography boolean property");
        if(["false","0","off"].includes(value || ""))target.delete(key);else target.set(key,true);
      } else target.set(key,canonical(el));
    }
  };
  const ordered = (props: Properties) => [...props].sort(([a],[b])=>a.localeCompare(b));
  const styleElements = styles ? all(styles,"style") : [];
  const chain = (id: string | null, type: string, seen = new Set<string>()): Element[] => {
    if(!id)return [];
    if(seen.has(id))fail("Cyclic bibliography formatting style");seen.add(id);
    const matches=styleElements.filter(el=>el.getAttributeNS(W,"styleId")===id && el.getAttributeNS(W,"type")===type);
    // Word exports routinely reference implicit Normal/DefaultParagraphFont.
    if(!matches.length && ["Normal","DefaultParagraphFont"].includes(id))return [];
    if(matches.length!==1)fail("Bibliography formatting style missing or ambiguous");
    return [...chain(children(matches[0],"basedOn")[0]?.getAttributeNS(W,"val") || null,type,seen),matches[0]];
  };
  const defaults = styles ? all(styles,"docDefaults")[0] : undefined;
  const usedStyles = new Map<string,unknown>();
  const defaultRun = defaults && children(defaults,"rPrDefault")[0];
  const defaultParagraph = defaults && children(defaults,"pPrDefault")[0];
  const paragraphProperties = (p?: Element | null) => {
    const direct=p && children(p,"pPr")[0];
    const defaultStyle=styleElements.find(el=>el.getAttributeNS(W,"type")==="paragraph" && ["1","true","on"].includes(el.getAttributeNS(W,"default") || ""));
    const id=direct && children(direct,"pStyle")[0]?.getAttributeNS(W,"val");
    const inherited=chain(id || defaultStyle?.getAttributeNS(W,"styleId") || null,"paragraph");
    const pp:Properties=new Map(),rp:Properties=new Map();
    merge(pp,defaultParagraph && children(defaultParagraph,"pPr")[0]);merge(rp,defaultRun && children(defaultRun,"rPr")[0]);
    for(const style of inherited){usedStyles.set(`paragraph:${style.getAttributeNS(W,"styleId")}`,Array.from(style.children).filter(el=>el.namespaceURI===W && ["pPr","rPr"].includes(el.localName)).map(canonical));merge(pp,children(style,"pPr")[0]);merge(rp,children(style,"rPr")[0]);}
    merge(pp,direct || undefined);
    return {pp,rp};
  };
  const encodeChildren = (parent: Element, inherited: Properties): unknown[] => {
    const result: {key:string;text?:string;node?:unknown}[]=[];
    for(const el of Array.from(parent.children)) {
      if(el.namespaceURI === W && el.localName === "pPr")continue;
      if(el.namespaceURI === W && el.localName === "r") {
        const props=new Map(inherited),direct=children(el,"rPr")[0];
        for(const style of chain(direct && children(direct,"rStyle")[0]?.getAttributeNS(W,"val") || null,"character")){usedStyles.set(`character:${style.getAttributeNS(W,"styleId")}`,children(style,"rPr").map(canonical));merge(props,children(style,"rPr")[0]);}
        merge(props,direct);
        // Run attributes other than revision IDs retain their full meaning.
        const shell=el.cloneNode(false) as Element;
        const key=JSON.stringify([canonical(shell),ordered(props)]);
        for(const child of Array.from(el.children).filter(c=>!(c.namespaceURI===W && c.localName==="rPr"))) {
          if(child.namespaceURI===W && child.localName==="t" && Array.from(child.attributes).every(a=>a.namespaceURI==="http://www.w3.org/XML/1998/namespace" && a.localName==="space")) {
            const last=result[result.length-1];
            if(last?.key===key && last.text!==undefined)last.text+=child.textContent || "";else result.push({key,text:child.textContent || ""});
          }else result.push({key,node:canonical(child)});
        }
      } else if(el.namespaceURI===W && el.localName==="p") {
        const {pp,rp}=paragraphProperties(el),shell=el.cloneNode(false) as Element;
        result.push({key:"paragraph",node:[canonical(shell),ordered(pp),encodeChildren(el,rp)]});
      } else if(el.namespaceURI===W && el.localName==="hyperlink") {
        // Canonicalize relationship identity by target, preserving all other attributes.
        const shell=el.cloneNode(false) as Element,ns="http://schemas.openxmlformats.org/officeDocument/2006/relationships",id=shell.getAttributeNS(ns,"id");
        let relationship:unknown=null;
        if(id){const matches=Array.from(relations.documentElement.children).filter(r=>r.getAttribute("Id")===id);if(matches.length!==1)fail("Bibliography hyperlink missing or ambiguous");relationship=[matches[0].getAttribute("Type"),matches[0].getAttribute("Target"),matches[0].getAttribute("TargetMode")];shell.removeAttributeNS(ns,"id");}
        result.push({key:"hyperlink",node:[canonical(shell),relationship,encodeChildren(el,inherited)]});
      } else result.push({key:"structural",node:canonical(el)});
    }
    return result;
  };
  const {pp,rp}=paragraphProperties(paragraph);
  const encoded=encodeChildren(content,rp);
  // Retain inherited declarations as well: OOXML style toggles and partially
  // inherited compound properties must never collapse into a false equivalence.
  return JSON.stringify([paragraph?ordered(pp):null,encoded,defaults?canonical(defaults):null,[...usedStyles].sort(([a],[b])=>a.localeCompare(b))]);
}
function markerRun(doc: Document, marker: string) {
  const run = doc.createElementNS(W, "w:r"), text = doc.createElementNS(W, "w:t"); text.textContent = marker; run.append(text); return run;
}
function findRun(doc: Document, marker: string): Element {
  const texts = all(doc, "t").filter(el => el.textContent === marker);
  if (texts.length !== 1) fail("Bibliography export marker lost or duplicated");
  const run = texts[0].parentElement;
  if (!run || run.namespaceURI !== W || run.localName !== "r" || all(run, "t").length !== 1 || Array.from(run.children).some(el => el.namespaceURI !== W || !["rPr","t"].includes(el.localName))) fail("Bibliography marker combined with user content");
  return run;
}
export function createBibliographyExport(graph: BibliographyDocxGraph, carriers: BibliographyDocxCarrier[]) {
  const ids = new Set<string>();
  for (const item of carriers) { if (!/^fld_[0-9a-f]{32}$/.test(item.fieldId) || ids.has(item.fieldId)) fail("Invalid or duplicate bibliography carrier identity"); ids.add(item.fieldId); }
  const token = crypto.randomUUID().replace(/-/g, "");
  const markers = carriers.map((_, i) => ({start:`EDTRBibStart${token}${i}`,end:`EDTRBibEnd${token}${i}`}));
  return { markers, async finish(blob: Blob): Promise<Blob> {
    const zip = await JSZip.loadAsync(await blob.arrayBuffer()), main = await mainPart(zip);
    if (Array.from(main.relations.documentElement.children).some(el => el.getAttribute("Type") === LEGACY_REL)) fail("Duplicate bibliography metadata");
    const stored: StoredCarrier[] = [];
    const styles = await semanticContext(zip,main);
    const occupiedBookmarks = new Set(all(main.doc,"bookmarkStart").map(el=>el.getAttributeNS(W,"name")?.toLowerCase()));
    const occupiedIds = new Set([...all(main.doc,"bookmarkStart"),...all(main.doc,"bookmarkEnd")].map(el=>el.getAttributeNS(W,"id"))); let nextBookmarkId=1;
    carriers.forEach((carrier, i) => {
      const startRun = findRun(main.doc, markers[i].start), endRun = findRun(main.doc, markers[i].end);
      let start = startRun, end = endRun;
      if (carrier.kind === "bibliography") {
        const p = startRun.parentElement, q = endRun.parentElement;
        if (!p || !q || p.localName !== "p" || q.localName !== "p" || all(p,"t").length !== 1 || all(q,"t").length !== 1) fail("Bibliography block markers require separate paragraphs");
        start = p; end = q;
      }
      const parent = start.parentElement;
      if (!parent || parent !== end.parentElement) fail("Bibliography range crosses containers");
      const nodes: Node[] = []; for (let node = start.nextSibling; node && node !== end; node = node.nextSibling) nodes.push(node);
      if (!nodes.length || nodes[nodes.length-1].nextSibling !== end || nodes.some(n => n.nodeType !== 1 || (n as Element).namespaceURI !== W || !(carrier.kind === "citation" ? ["r","hyperlink"] : ["p"]).includes((n as Element).localName))) fail("Unsupported bibliography native range");
      const content=main.doc.createElementNS(W,"w:scope"); nodes.forEach(node=>content.append(node.cloneNode(true)));
      const name=BOOKMARK+carrier.fieldId.slice(4);if(occupiedBookmarks.has(name.toLowerCase()))fail("Duplicate bibliography bookmark name");occupiedBookmarks.add(name.toLowerCase());
      while(occupiedIds.has(String(nextBookmarkId)))nextBookmarkId++;const bookmarkId=String(nextBookmarkId++);occupiedIds.add(bookmarkId);
      const first=main.doc.createElementNS(W,"w:bookmarkStart"),last=main.doc.createElementNS(W,"w:bookmarkEnd");first.setAttributeNS(W,"w:id",bookmarkId);first.setAttributeNS(W,"w:name",name);last.setAttributeNS(W,"w:id",bookmarkId);
      if(carrier.kind === "citation") {parent.insertBefore(first,start);parent.insertBefore(last,end);}
      else {const firstParagraph=nodes[0] as Element,lastParagraph=nodes[nodes.length-1] as Element;const properties=children(firstParagraph,"pPr")[0];firstParagraph.insertBefore(first,properties?properties.nextSibling:firstParagraph.firstChild);lastParagraph.append(last);}
      start.remove();end.remove();
      stored.push({...carrier,signature:semanticSignature(content,main.relations,styles,carrier.kind === "citation" ? parent : null)});
    });
    let part = "customXml/itemBibliography.xml", suffix = 0; while(zip.file(part)) part = `customXml/itemBibliography${++suffix}.xml`;
    const metadata = parseXml(`<bibliography xmlns="${NS}" version="3"/>`); metadata.documentElement.textContent = JSON.stringify({graph,carriers:stored}); zip.file(part,xmlString(metadata));
    const relationship = main.relations.createElementNS(PKG,"Relationship"); let id = 1; const occupied = new Set(Array.from(main.relations.documentElement.children).map(el=>el.getAttribute("Id"))); while(occupied.has(`rIdBibliography${id}`)) id++;
    relationship.setAttribute("Id",`rIdBibliography${id}`); relationship.setAttribute("Type",REL); relationship.setAttribute("Target",`/${part}`); main.relations.documentElement.append(relationship);
    zip.file(main.path,xmlString(main.doc)); zip.file(main.relPath,xmlString(main.relations)); return new Blob([await zip.generateAsync({type:"arraybuffer"})],{type:blob.type});
  }};
}
export async function prepareBibliographyImport(arrayBuffer: ArrayBuffer): Promise<{arrayBuffer: ArrayBuffer; graph?: BibliographyDocxGraph; restore:(html:string)=>string}> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  // Older plain DOCX writers omit package relationships. Leave this existing
  // generic-import path untouched only when there is no bibliography ownership.
  if (!zip.file("_rels/.rels") && zip.file("word/document.xml")) {
    const document = parseXml(await zip.file("word/document.xml")!.async("string"));
    const native = [...all(document,"instrText").map(el=>el.textContent || ""),...all(document,"fldSimple").map(el=>el.getAttributeNS(W,"instr") || "")];
    const owned = all(document,"bookmarkStart").some(el=>el.getAttributeNS(W,"name")?.startsWith(BOOKMARK)) || all(document,"tag").some(el=>el.getAttributeNS(W,"val")?.startsWith(TAG));
    let metadata = false;
    for (const [path,file] of Object.entries(zip.files)) {
      if(!file.dir && /(?:\.xml|\.rels)$/.test(path) && (await file.async("string")).includes(NS))metadata=true;
    }
    if(owned || metadata || /\b(?:CITATION|BIBLIOGRAPHY)\b/i.test(native.join(" ")+" "+native.join("")))fail("Bibliography package relationship missing");
    return {arrayBuffer,restore:html=>html};
  }
  const main = await mainPart(zip);
  const owned = all(main.doc,"sdt").filter(el => children(el,"sdtPr").some(pr => children(pr,"tag").some(tag => tag.getAttributeNS(W,"val")?.startsWith(TAG))));
  const bookmarks=all(main.doc,"bookmarkStart").filter(el=>el.getAttributeNS(W,"name")?.startsWith(BOOKMARK));
  const relationships: Element[] = [];
  for(const relationship of Array.from(main.relations.documentElement.children)) {
    if(relationship.namespaceURI !== PKG)continue;
    if(relationship.getAttribute("Type") === LEGACY_REL){relationships.push(relationship);continue;}
    if(relationship.getAttribute("Type") !== REL || relationship.hasAttribute("TargetMode"))continue;
    const path=resolve(main.path,relationship.getAttribute("Target") || ""),related=zip.file(path);if(!related)continue;
    const raw=await related.async("string");
    let relatedXml:Document;try{relatedXml=parseXml(raw);}catch{continue;}
    if(relatedXml.documentElement.namespaceURI === NS)relationships.push(relationship);
  }
  // Native Word fields remain separately gated; never feed them to a generic flattener.
  const instructions = [...all(main.doc,"instrText").map(el=>el.textContent || ""), ...all(main.doc,"fldSimple").map(el=>el.getAttributeNS(W,"instr") || "")];
  if (/\b(?:CITATION|BIBLIOGRAPHY)\b/i.test(instructions.join(" ")+" "+instructions.join(""))) fail("Native Word bibliography fields require a separately supported profile");
  if (!relationships.length && !owned.length && !bookmarks.length) return {arrayBuffer,restore:html=>html};
  if (relationships.length !== 1 || relationships[0].hasAttribute("TargetMode")) fail("Bibliography metadata relationship missing or ambiguous");
  const part = resolve(main.path,relationships[0].getAttribute("Target") || ""), file = zip.file(part); if (!file) fail("Bibliography metadata part missing");
  const metadata = parseXml(await file.async("string"));
  if (metadata.documentElement.namespaceURI !== NS || metadata.documentElement.localName !== "bibliography" || !["1","2","3"].includes(metadata.documentElement.getAttribute("version") || "")) fail("Unsupported bibliography metadata version");
  let saved: {graph: BibliographyDocxGraph; carriers: StoredCarrier[]};
  try { saved = JSON.parse(metadata.documentElement.textContent || ""); } catch { fail("Malformed bibliography metadata"); }
  if (!saved || !saved.graph || typeof saved.graph.sources !== "object" || !saved.graph.sources || !saved.graph.bibliography || !Array.isArray(saved.carriers) || owned.length + bookmarks.length !== saved.carriers.length) fail("Incomplete bibliography graph or carriers");
  const styles = metadata.documentElement.getAttribute("version") === "3" ? await semanticContext(zip,main) : undefined;
  const ids = new Set<string>(), replacements: {token:string;html:string;block:boolean}[] = [], token = crypto.randomUUID().replace(/-/g,"");
  for (const [index, carrier] of saved.carriers.entries()) {
    if (!carrier || !/^fld_[0-9a-f]{32}$/.test(carrier.fieldId) || ids.has(carrier.fieldId) || !["citation","bibliography"].includes(carrier.kind) || typeof carrier.html !== "string" || typeof carrier.signature !== "string") fail("Malformed bibliography carrier"); ids.add(carrier.fieldId);
    const marker = `EDTRBibImport${token}${index}`, run = markerRun(main.doc,marker);
    if(metadata.documentElement.getAttribute("version") === "1") {
      const matches = owned.filter(el=>children(el,"sdtPr").some(pr=>children(pr,"tag").some(tag=>tag.getAttributeNS(W,"val") === TAG + carrier.fieldId)));
      if (matches.length !== 1) fail("Bibliography carrier identity lost or duplicated");
      const sdt = matches[0], content = children(sdt,"sdtContent");
      if (content.length !== 1 || nativeSignature(content[0],main.relations) !== carrier.signature) fail("Bibliography visible content changed; preserving the source graph would overwrite Word edits");
      if (carrier.kind === "bibliography") { const p = main.doc.createElementNS(W,"w:p"); p.append(run); sdt.replaceWith(p); } else sdt.replaceWith(run);
    } else {
      const starts=bookmarks.filter(el=>el.getAttributeNS(W,"name") === BOOKMARK+carrier.fieldId.slice(4));
      if(starts.length!==1)fail("Bibliography carrier identity lost or duplicated");
      const start=starts[0],id=start.getAttributeNS(W,"id"),ends=all(main.doc,"bookmarkEnd").filter(el=>el.getAttributeNS(W,"id")===id);
      if(!id||ends.length!==1||all(main.doc,"bookmarkStart").filter(el=>el.getAttributeNS(W,"id")===id).length!==1)fail("Bibliography bookmark endpoints missing or ambiguous");
      const end=ends[0],content=main.doc.createElementNS(W,"w:scope");const nodes:Node[]=[];
      if(carrier.kind === "citation") {
        if(start.parentElement!==end.parentElement)fail("Bibliography citation range crosses paragraphs");
        for(let node=start.nextSibling;node&&node!==end;node=node.nextSibling)nodes.push(node);
        if(!nodes.length||nodes[nodes.length-1].nextSibling!==end)fail("Bibliography bookmark range is inverted");
        nodes.forEach(node=>content.append(node.cloneNode(true)));
      } else {
        const first=start.parentElement,last=end.parentElement;
        if(!first||!last||first.namespaceURI!==W||last.namespaceURI!==W||first.localName!=="p"||last.localName!=="p"||first.parentElement!==last.parentElement)fail("Bibliography block range crosses containers");
        if(Array.from(first.childNodes).filter(n=>n!==children(first,"pPr")[0])[0]!==start||last.lastChild!==end)fail("Bibliography block boundary changed");
        for(let node:Node|null=first;node;node=node.nextSibling){nodes.push(node);if(node===last)break;}
        if(nodes[nodes.length-1]!==last||nodes.some(n=>n.nodeType!==1||(n as Element).namespaceURI!==W||(n as Element).localName!=="p"))fail("Bibliography block range is invalid");
        nodes.forEach(node=>content.append(node.cloneNode(true)));
        for(const el of [...all(content,"bookmarkStart"),...all(content,"bookmarkEnd")])if(el.getAttributeNS(W,"id")===id)el.remove();
      }
      if((metadata.documentElement.getAttribute("version") === "3" ? semanticSignature(content,main.relations,styles,carrier.kind === "citation" ? start.parentElement : null) : nativeSignature(content,main.relations))!==carrier.signature)fail("Bibliography visible content changed; preserving the source graph would overwrite Word edits");
      if(carrier.kind === "citation"){start.replaceWith(run);nodes.forEach(n=>n.parentNode?.removeChild(n));end.remove();}
      else {const p=main.doc.createElementNS(W,"w:p");p.append(run);nodes[0].parentNode!.insertBefore(p,nodes[0]);nodes.forEach(n=>n.parentNode?.removeChild(n));}
    }
    replacements.push({token:marker,html:carrier.html,block:carrier.kind === "bibliography"});
  }
  zip.file(main.path,xmlString(main.doc));
  return {arrayBuffer:await zip.generateAsync({type:"arraybuffer"}),graph:saved.graph,restore(html:string) {
    const parsed = new DOMParser().parseFromString(html,"text/html");
    for (const replacement of replacements) {
      const walker = parsed.createTreeWalker(parsed.body,4), matches: Text[] = []; let current: Node | null;
      while ((current=walker.nextNode())) if (current.textContent?.includes(replacement.token)) matches.push(current as Text);
      if (matches.length !== 1 || matches[0].data.split(replacement.token).length !== 2) fail("Bibliography import marker lost or duplicated");
      const fragment = parsed.createElement("template"); fragment.innerHTML = replacement.html;
      if (replacement.block) { const p = matches[0].parentElement?.closest("p"); if (!p || p.textContent !== replacement.token) fail("Bibliography import block lost"); p.replaceWith(fragment.content); }
      else {
        // Mammoth legitimately merges adjacent native runs into one HTML text node.
        // Split only the exact one-use transport token, retaining the user prefix/suffix.
        const text = matches[0], offset = text.data.indexOf(replacement.token);
        const marker = offset ? text.splitText(offset) : text;
        marker.splitText(replacement.token.length);
        marker.replaceWith(fragment.content);
      }
    }
    const carrier = parsed.createElement("span"); carrier.setAttribute("data-edtr-bibliography-import",JSON.stringify(saved.graph)); parsed.body.prepend(carrier);
    return parsed.body.innerHTML;
  }};
}
