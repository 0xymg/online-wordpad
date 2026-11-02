/** Lazy source conversion. The original OOXML package remains untouched. */
import JSZip from "jszip";
import { DOMParser as PMParser, DOMSerializer, type Node as PMNode } from "prosemirror-model";
import { mySchema } from "@/app/components/editor-schema";
import { rawSections, runningKey, type RunningSlots, type RunningVariant, type RunningKind } from "./running-content";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const parse = (s: string) => new DOMParser().parseFromString(s, "application/xml");
const xml = (n: Node) => new XMLSerializer().serializeToString(n);
const canonical = (p: string) => p.replace(/^\//, "").replace(/^(?:word\/edtr-source\/)+/, "");
const cache = new Map<string, Promise<RunningSlots>>();
export async function readRunningSource(doc: PMNode): Promise<RunningSlots> {
  const source = doc.attrs.layout?.source as string | undefined;
  if (!source) return {};
  const sections = rawSections(doc);
  const key = `${source}:${sections.join("")}`;
  const existing = cache.get(key); if (existing) return existing;
  const promise = load(); cache.set(key, promise);
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  return promise;
  async function load() {
    const original = await JSZip.loadAsync(source!, { base64: true });
    const rels = parse(await original.file("edtr-relations.xml")!.async("string"));
    const result: RunningSlots = {};
    const converted = new Map<string, string>();
    for (let section = 0; section < sections.length; section++) {
      const props = parse(sections[section] || "<p/>");
      const margin = props.getElementsByTagNameNS(W, "pgMar")[0];
      for (const variant of ["default", "first", "even"] as RunningVariant[]) for (const kind of ["header", "footer"] as RunningKind[]) {
        const ref = Array.from(props.getElementsByTagNameNS(W, `${kind}Reference`)).find(r => r.getAttributeNS(W, "type") === variant);
        const rel = ref && Array.from(rels.documentElement.children).find(r => r.getAttribute("Id") === ref.getAttributeNS(R, "id"));
        const target = rel && canonical(`word/${rel.getAttribute("Target")}`);
        const distance = Number(margin?.getAttributeNS(W, kind)) || 283;
        const slotKey = runningKey(section, variant, kind);
        if (!target || !original.file(target)) {
          result[slotKey] = { html: section ? result[runningKey(section - 1, variant, kind)]?.html || "<p></p>" : "<p></p>", linked: section > 0, distance, height: 0 };
          continue;
        }
        let html = converted.get(target);
        if (!html) { html = await convert(target); converted.set(target, html); }
        result[slotKey] = { html, linked: false, distance, height: 0 };
      }
    }
    return result;
    async function convert(target: string) {
      const zip = new JSZip();
      for (const [path, entry] of Object.entries(original.files)) {
        if (entry.dir || path.startsWith("edtr-") || path === "[Content_Types].xml") continue;
        const bytes = await entry.async("uint8array"); zip.file(path, bytes); zip.file(`word/edtr-source/${path}`, bytes);
      }
      zip.file("[Content_Types].xml", await original.file("[Content_Types].xml")!.async("string"));
      zip.file("_rels/.rels", `<Relationships xmlns="${PKG}"><Relationship Id="main" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`);
      const header = parse(await original.file(target)!.async("string"));
      const token = `EDTRFIELD${crypto.randomUUID().replaceAll("-", "")}`;
      const fields = new Map<string, { kind: string; instruction: string; cached: string }>();
      const fieldText = (instruction: string, cached: string) => { const field = `${token}F${fields.size}`; const kind = instruction.trim().split(/\s/)[0].toUpperCase(); fields.set(field, { kind: ["PAGE", "NUMPAGES"].includes(kind) ? kind : "OTHER", instruction, cached }); return field; };
      for (const field of Array.from(header.getElementsByTagNameNS(W, "fldSimple"))) {
        const text = fieldText(field.getAttributeNS(W, "instr") || "", Array.from(field.getElementsByTagNameNS(W, "t")).map(t => t.textContent || "").join("")); if (!text) continue;
        const run = header.createElementNS(W, "w:r"), value = header.createElementNS(W, "w:t"); value.textContent = text;
        const format = field.getElementsByTagNameNS(W, "rPr")[0]; if (format) run.appendChild(format.cloneNode(true)); run.appendChild(value); field.replaceWith(run);
      }
      for (const p of Array.from(header.getElementsByTagNameNS(W, "p"))) {
        let depth = 0, instruction = "", nodes: Element[] = [];
        for (const n of Array.from(p.getElementsByTagName("*")).filter(n => n.namespaceURI === W && ["fldChar", "instrText", "t"].includes(n.localName))) {
          const type = n.localName === "fldChar" ? n.getAttributeNS(W, "fldCharType") : "";
          if (type === "begin") { if (!depth) { nodes = []; instruction = ""; } depth++; }
          if (depth) { nodes.push(n); if (n.localName === "instrText") instruction += n.textContent; }
          if (type === "end" && depth && --depth === 0) {
            const text = fieldText(instruction, nodes.filter(n => n.localName === "t").map(t => t.textContent || "").join("")); if (!text) continue;
            const value = header.createElementNS(W, "w:t"); value.textContent = text; nodes[0].before(value); nodes.forEach(n => n.remove());
          }
        }
      }
      const main = parse(`<w:document xmlns:w="${W}"><w:body/></w:document>`);
      const body = main.getElementsByTagNameNS(W, "body")[0];
      for (const child of Array.from(header.documentElement.childNodes)) body.appendChild(child.cloneNode(true));
      zip.file("word/document.xml", xml(main));
      zip.file("word/styles.xml", await original.file("edtr-styles.xml")!.async("string"));
      const relPath = target.replace(/([^/]+)$/, "_rels/$1.rels");
      const partRels = parse(await original.file(relPath)?.async("string") || `<Relationships xmlns="${PKG}"/>`);
      const styles = partRels.createElementNS(PKG, "Relationship"); styles.setAttribute("Id", "EDTRStyles"); styles.setAttribute("Type", `${R}/styles`); styles.setAttribute("Target", "styles.xml"); partRels.documentElement.appendChild(styles);
      const theme = await original.file("edtr-theme.xml")?.async("string");
      if (theme) { zip.file("word/theme/theme1.xml", theme); const rel = partRels.createElementNS(PKG, "Relationship"); rel.setAttribute("Id", "EDTRTheme"); rel.setAttribute("Type", `${R}/theme`); rel.setAttribute("Target", "theme/theme1.xml"); partRels.documentElement.appendChild(rel); }
      zip.file("word/_rels/document.xml.rels", xml(partRels));
      const [{ prepareDocxFormatting }, mammoth] = await Promise.all([import("./docx-formatting"), import("mammoth")]);
      const prepared = await prepareDocxFormatting(await zip.generateAsync({ type: "arraybuffer" }));
      const converted = await mammoth.convertToHtml({ arrayBuffer: prepared.arrayBuffer }, { styleMap: prepared.styleMap, ignoreEmptyParagraphs: false, includeEmbeddedStyleMap: false });
      const dom = new DOMParser().parseFromString(prepared.restore(converted.value), "text/html");
      const walker = dom.createTreeWalker(dom.body, NodeFilter.SHOW_TEXT), texts: Text[] = [];
      while (walker.nextNode()) texts.push(walker.currentNode as Text);
      for (const text of texts) {
        const value = text.textContent || ""; if (!value.includes(token)) continue;
        const fragment = dom.createDocumentFragment();
        for (const part of value.split(new RegExp(`(${token}F\\d+)`))) {
          if (part.startsWith(token)) { const span = dom.createElement("span"); const field = fields.get(part)!; span.setAttribute("data-doc-field", field.kind); if (field.kind === "OTHER") { span.setAttribute("data-field-instruction", field.instruction); span.setAttribute("data-field-cached", field.cached); } span.textContent = field.cached || "1"; fragment.appendChild(span); }
          else fragment.appendChild(dom.createTextNode(part));
        }
        text.replaceWith(fragment);
      }
      const clean = PMParser.fromSchema(mySchema).parse(dom.body), output = document.createElement("div");
      output.appendChild(DOMSerializer.fromSchema(mySchema).serializeFragment(clean.content)); return output.innerHTML;
    }
  }
}
