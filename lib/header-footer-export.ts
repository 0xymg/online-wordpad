/** Patch only explicitly edited header/footer slots. Original parts stay intact. */
import JSZip from "jszip";
import type { Node as PMNode } from "prosemirror-model";
import { documentSections } from "./document-sections";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const P = "http://schemas.openxmlformats.org/package/2006/relationships";
const C = "http://schemas.openxmlformats.org/package/2006/content-types";
const parse = (s: string) => new DOMParser().parseFromString(s, "application/xml");
const xml = (n: Node) => new XMLSerializer().serializeToString(n);
const child = (p: Element, name: string) => Array.from(p.children).find(n => n.namespaceURI === W && n.localName === name);
function property(parent: Element, name: string) { return child(parent, name) || parent.appendChild(parent.ownerDocument.createElementNS(W, `w:${name}`)); }
export async function exportRunning(blob: Blob, doc: PMNode, convert: (html: string) => Promise<Blob>): Promise<Blob> {
  const edits = doc.attrs.layout?.running; if (!edits || !Object.keys(edits).length) return blob;
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const main = parse(await zip.file("word/document.xml")!.async("string"));
  const sections = Array.from(main.getElementsByTagNameNS(W, "sectPr"));
  const geometry = documentSections(doc);
  const relations = parse(await zip.file("word/_rels/document.xml.rels")!.async("string"));
  const types = parse(await zip.file("[Content_Types].xml")!.async("string"));
  const settings = parse(await zip.file("word/settings.xml")!.async("string"));
  const overrideType = (path: string, type: string) => { const el = types.createElementNS(C, "Override"); el.setAttribute("PartName", `/${path}`); el.setAttribute("ContentType", type); types.documentElement.appendChild(el); };
  for (const [key, slot] of Object.entries(edits) as [string, { html: string; linked: boolean; distance: number; height: number }][]) {
    const [index, variant, kind] = key.split(":");
    if (!["header", "footer"].includes(kind) || !["default", "first", "even"].includes(variant)) continue;
    const section = sections[Number(index)]; if (!section) continue;
    for (const ref of Array.from(section.children)) if (ref.localName === `${kind}Reference` && ref.getAttributeNS(W, "type") === variant) ref.remove();
    if (variant === "first") property(section, "titlePg").setAttributeNS(W, "w:val", "1");
    if (variant === "even") property(settings.documentElement, "evenAndOddHeaders").setAttributeNS(W, "w:val", "1");
    const margin = property(section, "pgMar"); margin.setAttributeNS(W, `w:${kind}`, String(slot.distance));
    const g = geometry[Number(index)]?.geometry;
    if (g) { margin.setAttributeNS(W, "w:top", String(g.margins.top)); margin.setAttributeNS(W, "w:bottom", String(g.margins.bottom)); }
    if (slot.linked && Number(index) > 0) continue;
    const mini = await JSZip.loadAsync(await (await convert(slot.html)).arrayBuffer());
    const miniMain = parse(await mini.file("word/document.xml")!.async("string"));
    const part = parse(`<w:${kind === "header" ? "hdr" : "ftr"} xmlns:w="${W}" xmlns:r="${R}"/>`);
    const body = miniMain.getElementsByTagNameNS(W, "body")[0];
    for (const node of Array.from(body.children)) if (node.localName !== "sectPr") part.documentElement.appendChild(node.cloneNode(true));
    const prefix = `word/edtr-custom/${index}-${variant}-${kind}/`;
    const partPath = `${prefix}content.xml`, partRelations = parse(`<Relationships xmlns="${P}"/>`);
    const miniRels = parse(await mini.file("word/_rels/document.xml.rels")!.async("string"));
    const miniTypes = parse(await mini.file("[Content_Types].xml")!.async("string"));
    for (const rel of Array.from(miniRels.documentElement.children)) {
      const type = rel.getAttribute("Type") || "";
      if (!type.endsWith("/image") && !type.endsWith("/hyperlink")) continue;
      const copy = rel.cloneNode(true) as Element;
      if (copy.getAttribute("TargetMode") !== "External") {
        const target = copy.getAttribute("Target") || "";
        const original = target.startsWith("/") ? target.slice(1) : `word/${target}`;
        const file = mini.file(original); if (!file) continue;
        const destination = `${prefix}${original}`;
        zip.file(destination, await file.async("uint8array"));
        copy.setAttribute("Target", `/${destination}`);
        const contentType = Array.from(miniTypes.documentElement.children).find(t => t.getAttribute("PartName") === `/${original}`)?.getAttribute("ContentType") || Array.from(miniTypes.documentElement.children).find(t => t.getAttribute("Extension") === original.split(".").at(-1))?.getAttribute("ContentType");
        if (contentType) overrideType(destination, contentType);
      }
      partRelations.documentElement.appendChild(copy);
    }
    zip.file(partPath, xml(part)); zip.file(`${prefix}_rels/content.xml.rels`, xml(partRelations));
    overrideType(partPath, `application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml`);
    const id = `EDTRCustom_${index}_${variant}_${kind}`;
    Array.from(relations.documentElement.children).filter(r => r.getAttribute("Id") === id).forEach(r => r.remove());
    const rel = relations.createElementNS(P, "Relationship"); rel.setAttribute("Id", id); rel.setAttribute("Type", `${R}/${kind}`); rel.setAttribute("Target", partPath.slice(5)); relations.documentElement.appendChild(rel);
    const ref = main.createElementNS(W, `w:${kind}Reference`); ref.setAttributeNS(W, "w:type", variant); ref.setAttributeNS(R, "r:id", id); section.insertBefore(ref, section.firstChild);
  }
  const order = "headerReference footerReference footnotePr endnotePr type pgSz pgMar paperSrc pgBorders lnNumType pgNumType cols formProt vAlign noEndnote titlePg textDirection bidi rtlGutter docGrid printerSettings sectPrChange".split(" ");
  for (const section of sections) for (const node of Array.from(section.children).sort((a,b) => { const x=order.indexOf(a.localName),y=order.indexOf(b.localName); return (x<0?100:x)-(y<0?100:y); })) section.appendChild(node);
  const referenced = new Set([...Array.from(main.getElementsByTagNameNS(W, "headerReference")), ...Array.from(main.getElementsByTagNameNS(W, "footerReference"))].map(ref => ref.getAttributeNS(R, "id")));
  for (const rel of Array.from(relations.documentElement.children)) if (/\/(?:header|footer)$/.test(rel.getAttribute("Type") || "") && !referenced.has(rel.getAttribute("Id"))) rel.remove();
  zip.file("word/document.xml", xml(main)); zip.file("word/_rels/document.xml.rels", xml(relations)); zip.file("word/settings.xml", xml(settings));
  // Remove replaced private text and assets from the output, including parts
  // that Word would no longer display but could otherwise still be extracted.
  const reachable = new Set<string>();
  const resolve = (base: string, target: string) => { const out: string[] = []; for (const s of (target.startsWith("/") ? target.slice(1) : base.slice(0, base.lastIndexOf("/") + 1) + target).split("/")) { if (s === "..") out.pop(); else if (s && s !== ".") out.push(s); } return out.join("/"); };
  async function visit(path: string) {
    if (reachable.has(path)) return; reachable.add(path);
    const relPath = path ? path.replace(/([^/]+)$/, "_rels/$1.rels") : "_rels/.rels";
    const file = zip.file(relPath); if (!file) return; reachable.add(relPath);
    for (const rel of Array.from(parse(await file.async("string")).documentElement.children)) if (rel.getAttribute("TargetMode") !== "External") await visit(resolve(path, rel.getAttribute("Target") || ""));
  }
  await visit("");
  for (const [path, entry] of Object.entries(zip.files)) if (!entry.dir && /^word\/edtr-(?:source|custom)\//.test(path) && !reachable.has(path)) zip.remove(path);
  for (const type of Array.from(types.documentElement.children)) { const name = type.getAttribute("PartName"); if (name && !zip.file(name.slice(1))) type.remove(); }
  zip.file("[Content_Types].xml", xml(types));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}
