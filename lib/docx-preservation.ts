/** Lossless OOXML layout/table properties around the editable document model.
 * Header/footer parts are retained with their relationship graph, including PAGE
 * fields, images and first/even-page variants. They are not flattened to text.
 */
import JSZip from "jszip";
import { TableMap } from "prosemirror-tables";
import type { Node as PMNode } from "prosemirror-model";
import type { DocumentLayout } from "./document-layout";
export const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT = "http://schemas.openxmlformats.org/package/2006/content-types";
export const parseXml = (s: string) => {
  const doc = new DOMParser().parseFromString(s, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Invalid DOCX layout XML");
  return doc;
};
export const xmlString = (el?: Node | null) => el ? new XMLSerializer().serializeToString(el) : "";
const kids = (el: Element, name: string) => Array.from(el.children).filter(e => e.namespaceURI === W && e.localName === name);
const first = (el: Element, name: string) => kids(el, name)[0];
const val = (el: Element | undefined, key = "val") => el?.getAttributeNS(W, key) ?? "";
const all = (el: Document | Element, name: string) => Array.from(el.getElementsByTagNameNS(W, name));
const canonicalPart = (path: string) => path.replace(/^(?:word\/edtr-source\/)+/, "");
const sourceId = (id: string) => id.startsWith("EDTRSource_") ? id : `EDTRSource_${id}`;
const relPath = (p: string) => p.replace(/([^/]+)$/, "_rels/$1.rels");
function targetPath(base: string, target: string) {
  const parts: string[] = [];
  for (const p of (target.startsWith("/") ? target.slice(1) : base.slice(0, base.lastIndexOf("/") + 1) + target).split("/")) {
    if (p === "..") parts.pop(); else if (p && p !== ".") parts.push(p);
  }
  return parts.join("/");
}
function renameStyles(doc: Document | Element) {
  for (const name of ["style", "pStyle", "rStyle", "tblStyle", "basedOn", "next", "link"]) {
    for (const el of all(doc, name)) {
      const key = name === "style" ? "styleId" : "val";
      const id = val(el, key);
      if (id) el.setAttributeNS(W, `w:${key}`, id.startsWith("EDTRSource_") ? id : `EDTRSource_${id}`);
      if (name === "style") el.removeAttributeNS(W, "default");
    }
  }
}
export async function captureLayout(zip: JSZip, mainPath: string, main: Document, styles: Document) {
  const source = new JSZip();
  const relations = parseXml(await zip.file(relPath(mainPath))?.async("string") || `<Relationships xmlns="${PKG}"/>`);
  const savedRelations = parseXml(`<Relationships xmlns="${PKG}"/>`);
  const seen = new Set<string>();
  async function copyPart(path: string) {
    if (seen.has(path)) return;
    seen.add(path);
    const entry = zip.file(path);
    if (!entry) return;
    if (path.endsWith(".xml")) {
      const doc = parseXml(await entry.async("string"));
      renameStyles(doc);
      source.file(canonicalPart(path), xmlString(doc));
    } else source.file(canonicalPart(path), await entry.async("uint8array"));
    const relEntry = zip.file(relPath(path));
    if (relEntry) {
      const rels = parseXml(await relEntry.async("string"));
      for (const rel of Array.from(rels.documentElement.children)) {
        if (rel.getAttribute("TargetMode") === "External") continue;
        const dest = targetPath(path, rel.getAttribute("Target") || "");
        await copyPart(dest);
        // Absolute paths are moved into the same isolated package namespace.
        rel.setAttribute("Target", `/word/edtr-source/${canonicalPart(dest)}`);
      }
      source.file(relPath(canonicalPart(path)), xmlString(rels));
    }
  }
  const sections = all(main, "sectPr");
  const refs = new Set(sections.flatMap(s => [...kids(s, "headerReference"), ...kids(s, "footerReference")].map(e => e.getAttributeNS(R, "id"))));
  for (const rel of Array.from(relations.documentElement.children)) {
    if (!refs.has(rel.getAttribute("Id"))) continue;
    const dest = targetPath(mainPath, rel.getAttribute("Target") || "");
    await copyPart(dest);
    const copy = rel.cloneNode(true) as Element;
    copy.setAttribute("Target", `edtr-source/${canonicalPart(dest)}`);
    copy.setAttribute("Id", sourceId(rel.getAttribute("Id") || ""));
    savedRelations.documentElement.appendChild(copy);
  }
  source.file("edtr-relations.xml", xmlString(savedRelations));
  const styleCopy = styles.cloneNode(true) as Document;
  renameStyles(styleCopy);
  const uniqueStyles = new Map<string, Element>();
  for (const style of all(styleCopy, "style")) {
    const id = val(style, "styleId");
    uniqueStyles.get(id)?.remove(); uniqueStyles.set(id, style);
  }
  source.file("edtr-styles.xml", xmlString(styleCopy));
  const capturedTypes = parseXml(await zip.file("[Content_Types].xml")!.async("string"));
  for (const type of Array.from(capturedTypes.documentElement.children)) {
    const path = type.getAttribute("PartName");
    if (path) type.setAttribute("PartName", `/${canonicalPart(path.slice(1))}`);
  }
  source.file("[Content_Types].xml", xmlString(capturedTypes));
  let evenAndOddHeaders = false;
  const settingsRel = Array.from(relations.documentElement.children).find(r => r.getAttribute("Type")?.endsWith("/settings"));
  if (settingsRel) {
    const settings = await zip.file(targetPath(mainPath, settingsRel.getAttribute("Target")!))?.async("string");
    if (settings) {
      source.file("edtr-settings.xml", settings);
      const even = all(parseXml(settings), "evenAndOddHeaders")[0];
      evenAndOddHeaders = !!even && !["0", "false", "off"].includes(val(even));
    }
  }
  const themeRel = Array.from(relations.documentElement.children).find(r => r.getAttribute("Type")?.endsWith("/theme"));
  if (themeRel) {
    const theme = await zip.file(targetPath(mainPath, themeRel.getAttribute("Target")!))?.async("string");
    if (theme) source.file("edtr-theme.xml", theme);
  }
  const sectionXml = (s: Element) => {
    const copy = s.cloneNode(true) as Element;
    for (const ref of [...kids(copy, "headerReference"), ...kids(copy, "footerReference")]) ref.setAttributeNS(R, "r:id", sourceId(ref.getAttributeNS(R, "id") || ""));
    return xmlString(copy);
  };
  const section = sections.at(-1);
  const initial = sections[0];
  const size = initial && first(initial, "pgSz");
  const margins = initial && first(initial, "pgMar");
  let pageNumbers: DocumentLayout["pageNumbers"] = "off";
  let pageNumberFormat: DocumentLayout["pageNumberFormat"] = "plain";
  let numberingStyle: DocumentLayout["numberingStyle"];
  // Derive the ordinary-page preview from the actual referenced field paragraph.
  for (const ref of initial ? [...kids(initial, "headerReference"), ...kids(initial, "footerReference")] : []) {
    if (val(ref, "type") !== "default") continue;
    const rel = Array.from(relations.documentElement.children).find(r => r.getAttribute("Id") === ref.getAttributeNS(R, "id"));
    const content = rel && await zip.file(targetPath(mainPath, rel.getAttribute("Target") || ""))?.async("string");
    if (!content) continue;
    const header = parseXml(content);
    const numberP = all(header, "p").find(p => all(p, "instrText").some(i => /\bPAGE\b/.test(i.textContent || "")) || all(p, "fldSimple").some(i => /\bPAGE\b/.test(val(i, "instr"))));
    if (!numberP) continue;
    pageNumbers = ref.localName === "headerReference" ? "top" : "bottom";
    let instruction = "", inField = false, emitted = false, template = "";
    const token = (value: string) => /\bNUMPAGES\b/.test(value) ? "{{NUMPAGES}}" : /\bPAGE\b/.test(value) ? "{{PAGE}}" : "";
    const walk = (e: Element) => {
      if (e.localName === "fldSimple") { template += token(val(e, "instr")); return; }
      if (e.localName === "fldChar") {
        const type = val(e, "fldCharType");
        if (type === "begin") { inField = true; instruction = ""; emitted = false; }
        else if (type === "separate" || type === "end") { if (!emitted) template += token(instruction); emitted = true; if (type === "end") inField = false; }
      } else if (e.localName === "instrText") instruction += e.textContent;
      else if (e.localName === "t" && !inField) template += e.textContent;
      else for (const c of Array.from(e.children)) walk(c);
    };
    walk(numberP);
    const pPr = first(numberP, "pPr");
    const firstRef = kids(initial!, ref.localName).find(r => val(r, "type") === "first");
    numberingStyle = { start: Number(val(first(initial!, "pgNumType"), "start")) || 1, format: val(first(initial!, "pgNumType"), "fmt") || "decimal", alignment: pPr && val(first(pPr, "jc")) || "left", template: template || "{{PAGE}}", hideFirst: !!first(initial!, "titlePg") && !firstRef };
    pageNumberFormat = template.includes("{{NUMPAGES}}") ? "of" : "plain";
  }
  const layout: DocumentLayout = {
    width: Number(val(size, "w")) || 11906, height: Number(val(size, "h")) || 16838,
    margins: Object.fromEntries(["top", "right", "bottom", "left"].map(k => [k, val(margins, k) ? Number(val(margins, k)) : 1440])) as DocumentLayout["margins"],
    pageNumbers, pageNumberFormat, numberingStyle, evenAndOddHeaders,
    section: section ? sectionXml(section) : undefined,
    source: await source.generateAsync({ type: "base64", compression: "DEFLATE" }),
  };
  return { layout, sectionXml };
}

/** Called using the existing import bookmark identity, not text/index matching. */
export function restoreLayoutProperties(p: Element, block: HTMLElement, sectionXml: (s: Element) => string) {
  const props = first(p, "pPr");
  if (props) {
    const copy = props.cloneNode(true) as Element;
    // Run styling and paragraph alignment are managed by the editable schema.
    for (const e of Array.from(copy.children)) if (!["sectPr", "tabs", "spacing", "ind", "keepNext", "keepLines", "pageBreakBefore", "widowControl", "pBdr", "shd", "textDirection"].includes(e.localName)) e.remove();
    const section = first(copy, "sectPr");
    if (section) section.replaceWith(parseXml(sectionXml(section)).documentElement);
    if (copy.children.length) block.setAttribute("data-docx-properties", xmlString(copy));
    const spacing = first(copy, "spacing");
    for (const [name, css] of [["before", "marginTop"], ["after", "marginBottom"]] as const) if (val(spacing, name)) block.style[css] = `${Number(val(spacing, name)) / 20}pt`;
    if (["exact", "atLeast"].includes(val(spacing, "lineRule"))) block.style.lineHeight = `${Number(val(spacing, "line")) / 20}pt`;
    const ind = first(copy, "ind");
    for (const [name, css] of [["left", "marginLeft"], ["right", "marginRight"]] as const) if (val(ind, name)) block.style[css] = `${Number(val(ind, name)) / 20}pt`;
    const textIndent = Number(val(ind, "firstLine")) - Number(val(ind, "hanging"));
    if (textIndent) block.style.textIndent = `${textIndent / 20}pt`;
  }
  const ancestor = (name: string) => { let e = p.parentElement; while (e && e.localName !== name) e = e.parentElement; return e; };
  const cell = ancestor("tc"), row = ancestor("tr"), table = ancestor("tbl");
  const htmlCell = block.closest<HTMLElement>("td,th"), htmlRow = htmlCell?.parentElement, htmlTable = htmlCell?.closest("table");
  if (!cell || !row || !table || !htmlCell || !htmlRow || !htmlTable) return;
  const tcPr = first(cell, "tcPr"), tblPr = first(table, "tblPr"), trPr = first(row, "trPr");
  const setRaw = (html: HTMLElement, raw?: Element) => { if (!raw || html.hasAttribute("data-docx-properties")) return; const copy = raw.cloneNode(true) as Element; renameStyles(copy); html.setAttribute("data-docx-properties", xmlString(copy)); };
  setRaw(htmlCell, tcPr); setRaw(htmlRow, trPr); setRaw(htmlTable, tblPr);
  if (tblPr) {
    const alignment = val(first(tblPr, "jc"));
    if (alignment === "center") { htmlTable.style.marginLeft = "auto"; htmlTable.style.marginRight = "auto"; }
    if (alignment === "right" || alignment === "end") { htmlTable.style.marginLeft = "auto"; htmlTable.style.marginRight = "0"; }
    const tableMargins = first(tblPr, "tblCellMar");
    const cellMargins = tcPr && first(tcPr, "tcMar");
    for (const side of ["top", "right", "bottom", "left"]) {
      const margin = cellMargins && first(cellMargins, side) || tableMargins && first(tableMargins, side);
      if (margin && val(margin, "type") !== "nil") htmlCell.style.setProperty(`padding-${side}`, `${Number(val(margin, "w")) / 20}pt`);
    }
  }
  const height = trPr && first(trPr, "trHeight");
  if (height) htmlRow.style.height = `${Number(val(height)) / 20}pt`;
  const grid = first(table, "tblGrid");
  const widths = grid ? kids(grid, "gridCol").map(c => Number(val(c, "w"))) : [];
  htmlTable.setAttribute("data-docx-grid", JSON.stringify(widths));
  let column = 0;
  for (const c of kids(row, "tc")) { if (c === cell) break; column += Number(val(first(first(c, "tcPr") ?? c, "gridSpan"))) || 1; }
  const sourceRows = kids(table, "tr");
  htmlTable.setAttribute("data-docx-rows", JSON.stringify(sourceRows.map(r => xmlString(first(r, "trPr")))));
  if (tcPr && val(first(tcPr, "vMerge")) === "restart") {
    const continuation: string[] = [];
    for (let r = sourceRows.indexOf(row) + 1; r < sourceRows.length; r++) {
      let c = 0;
      const next = kids(sourceRows[r], "tc").find(cell => { const here = c; c += Number(val(first(first(cell, "tcPr") ?? cell, "gridSpan"))) || 1; return here === column; });
      const nextPr = next && first(next, "tcPr");
      const merge = nextPr && first(nextPr, "vMerge");
      if (!merge || val(merge) === "restart") break;
      continuation.push(xmlString(nextPr));
    }
    if (continuation.length) htmlCell.setAttribute("data-docx-continuations", JSON.stringify(continuation));
  }
  const span = Number(val(tcPr && first(tcPr, "gridSpan"))) || 1;
  if (widths.length) htmlCell.setAttribute("data-colwidth", widths.slice(column, column + span).map(w => Math.round(w / 15)).join(","));
  const fill = tcPr && val(first(tcPr, "shd"), "fill");
  if (fill && /^[a-f\d]{6}$/i.test(fill)) htmlCell.style.backgroundColor = `#${fill}`;
  else if (fill === "auto") htmlCell.style.backgroundColor = "transparent";
  const vertical = tcPr && val(first(tcPr, "vAlign"));
  if (vertical) htmlCell.style.verticalAlign = vertical === "center" ? "middle" : vertical;
  const borders = tcPr && first(tcPr, "tcBorders") || tblPr && first(tblPr, "tblBorders");
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const border = borders && first(borders, side);
    if (!border) continue;
    const kind = val(border);
    const color = val(border, "color");
    htmlCell.style.setProperty(`border-${side}`, ["nil", "none"].includes(kind) ? "none" : `${(Number(val(border, "sz")) || 4) / 8}pt ${kind === "double" ? "double" : kind.includes("dash") ? "dashed" : "solid"} ${/^[a-f\d]{6}$/i.test(color) ? `#${color}` : "#000"}`);
  }
}

function replaceProperties(parent: Element, raw: string, preserve: string[] = []) {
  if (!raw) return;
  const copy = parseXml(raw).documentElement;
  const old = first(parent, copy.localName);
  for (const name of preserve) { for (const el of kids(copy, name)) el.remove(); for (const el of old ? kids(old, name) : []) copy.appendChild(el.cloneNode(true)); }
  if (old) old.replaceWith(copy); else parent.insertBefore(copy, parent.firstChild);
}
export async function restoreDocxPackage(blob: Blob, doc: PMNode, paragraphs: Array<{ id: string; properties: string }>) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const main = parseXml(await zip.file("word/document.xml")!.async("string"));
  const layout = doc.attrs.layout as DocumentLayout | null;
  if (layout?.source) {
    const source = await JSZip.loadAsync(layout.source, { base64: true });
    const types = parseXml(await zip.file("[Content_Types].xml")!.async("string"));
    const sourceTypes = parseXml(await source.file("[Content_Types].xml")!.async("string"));
    for (const [path, entry] of Object.entries(source.files)) {
      if (entry.dir || path.startsWith("edtr-") || path === "[Content_Types].xml") continue;
      const dest = `word/edtr-source/${path}`;
      zip.file(dest, await entry.async("uint8array"));
      const contentType = Array.from(sourceTypes.documentElement.children).find(e => e.getAttribute("PartName") === `/${path}`)?.getAttribute("ContentType") || Array.from(sourceTypes.documentElement.children).find(e => e.getAttribute("Extension") === path.split(".").at(-1))?.getAttribute("ContentType");
      if (contentType) { const e = types.createElementNS(CT, "Override"); e.setAttribute("PartName", `/${dest}`); e.setAttribute("ContentType", contentType); types.documentElement.appendChild(e); }
    }
    const rels = parseXml(await zip.file("word/_rels/document.xml.rels")!.async("string"));
    const originalRels = parseXml(await source.file("edtr-relations.xml")!.async("string"));
    for (const rel of Array.from(originalRels.documentElement.children)) rels.documentElement.appendChild(rel.cloneNode(true));
    const styleDoc = parseXml(await zip.file("word/styles.xml")!.async("string"));
    const originalStyles = parseXml(await source.file("edtr-styles.xml")!.async("string"));
    for (const s of all(originalStyles, "style")) styleDoc.documentElement.appendChild(s.cloneNode(true));
    zip.file("word/styles.xml", xmlString(styleDoc));
    const settings = parseXml(await zip.file("word/settings.xml")!.async("string"));
    const originalSettings = await source.file("edtr-settings.xml")?.async("string");
    if (originalSettings) for (const name of ["evenAndOddHeaders", "mirrorMargins", "gutterAtTop", "defaultTabStop"]) {
      const e = all(parseXml(originalSettings), name)[0];
      if (e) { all(settings, name).forEach(n => n.remove()); settings.documentElement.appendChild(e.cloneNode(true)); }
    }
    zip.file("word/settings.xml", xmlString(settings));
    const theme = await source.file("edtr-theme.xml")?.async("string");
    if (theme) {
      zip.file("word/edtr-theme.xml", theme);
      for (const rel of Array.from(rels.documentElement.children)) if (rel.getAttribute("Type")?.endsWith("/theme")) rel.remove();
      const rel = rels.createElementNS(PKG, "Relationship"); rel.setAttribute("Id", "EDTRTheme"); rel.setAttribute("Type", `${R}/theme`); rel.setAttribute("Target", "edtr-theme.xml"); rels.documentElement.appendChild(rel);
      const type = types.createElementNS(CT, "Override"); type.setAttribute("PartName", "/word/edtr-theme.xml"); type.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.theme+xml"); types.documentElement.appendChild(type);
    }
    zip.file("word/_rels/document.xml.rels", xmlString(rels)); zip.file("[Content_Types].xml", xmlString(types));
  }
  // Retain section boundaries on their paragraph, including differing margins.
  for (const item of paragraphs) {
    const marker = all(main, "bookmarkStart").find(e => val(e, "name") === item.id);
    const p = marker?.parentElement;
    if (!p) continue;
    const pPr = first(p, "pPr") ?? p.insertBefore(main.createElementNS(W, "w:pPr"), p.firstChild);
    const raw = parseXml(item.properties).documentElement;
    for (const el of Array.from(raw.children)) { kids(pPr, el.localName).forEach(e => e.remove()); pPr.appendChild(el.cloneNode(true)); }
    const id = val(marker!, "id"); marker!.remove(); all(p, "bookmarkEnd").filter(e => val(e, "id") === id).forEach(e => e.remove());
  }
  const body = all(main, "body")[0];
  const generatedSection = first(body, "sectPr")?.cloneNode(true) as Element | undefined;
  if (layout?.section) replaceProperties(body, layout.section);
  // Explicit user layout changes win over imported settings in every section.
  for (const [index,section] of all(main, "sectPr").entries()) {
    const selectedMargins = layout?.sectionMargins?.[index] || (layout?.overrides?.margins ? layout.margins : null);
    if (selectedMargins) {
      const margins = first(section, "pgMar") ?? section.appendChild(main.createElementNS(W, "w:pgMar"));
      for (const [side, n] of Object.entries(selectedMargins)) margins.setAttributeNS(W, `w:${side}`, String(n));
    }
    if (layout?.overrides?.orientation) {
      const size = first(section, "pgSz") ?? section.appendChild(main.createElementNS(W, "w:pgSz"));
      size.setAttributeNS(W, "w:w", String(layout.width)); size.setAttributeNS(W, "w:h", String(layout.height)); size.setAttributeNS(W, "w:orient", layout.width > layout.height ? "landscape" : "portrait");
    }
  }
  if (layout?.overrides?.pageNumbers && generatedSection) {
    const rels = parseXml(await zip.file("word/_rels/document.xml.rels")!.async("string"));
    const target = (ref: Element) => {
      const rel = Array.from(rels.documentElement.children).find(r => r.getAttribute("Id") === ref.getAttributeNS(R, "id"));
      return rel ? targetPath("word/document.xml", rel.getAttribute("Target") || "") : "";
    };
    const activeKind = layout.pageNumbers === "top" ? "headerReference" : "footerReference";
    const generatedRef = first(generatedSection, activeKind);
    const generatedPart = generatedRef && await zip.file(target(generatedRef))?.async("string");
    const numberParagraph = generatedPart && all(parseXml(generatedPart), "p")[0];
    const editedParts = new Set<string>();
    for (const section of all(main, "sectPr")) {
      for (const kind of ["headerReference", "footerReference"]) {
        const refs = kids(section, kind);
        for (const ref of refs) {
          const path = target(ref);
          if (!path || editedParts.has(path)) continue;
          editedParts.add(path);
          const content = await zip.file(path)?.async("string"); if (!content) continue;
          const part = parseXml(content);
          for (const p of all(part, "p")) {
            const hasNumber = all(p, "instrText").some(i => /\b(?:PAGE|NUMPAGES)\b/.test(i.textContent || "")) || all(p, "fldSimple").some(i => /\b(?:PAGE|NUMPAGES)\b/.test(val(i, "instr")));
            if (hasNumber) {
              // Remove field instructions/results while retaining unrelated text
              // in a shared letterhead/footer paragraph.
              for (const field of all(p, "fldSimple")) if (/\b(?:PAGE|NUMPAGES)\b/.test(val(field, "instr"))) field.remove();
              let depth = 0, instruction = "";
              let fieldNodes: Element[] = [];
              for (const node of Array.from(p.getElementsByTagName("*")).filter(n => n.namespaceURI === W && ["fldChar", "instrText", "t", "tab", "br"].includes(n.localName))) {
                const kind = node.localName === "fldChar" ? val(node, "fldCharType") : "";
                if (kind === "begin") { if (!depth) { fieldNodes = []; instruction = ""; } depth++; }
                if (depth) { fieldNodes.push(node); if (node.localName === "instrText") instruction += node.textContent; }
                if (kind === "end" && depth && --depth === 0 && /\b(?:PAGE|NUMPAGES)\b/.test(instruction)) fieldNodes.forEach(n => n.remove());
              }
              const staticText = all(p, "t").map(t => t.textContent || "").join("").replace(/\b(?:page|pages|of|sayfa)\b/gi, "").replace(/[\s/|:–—-]/g, "");
              if (!staticText && !all(p, "drawing").length) p.remove();
            }
          }
          if (kind === activeKind && layout.pageNumbers !== "off" && numberParagraph) part.documentElement.appendChild(numberParagraph.cloneNode(true));
          if (!part.documentElement.children.length) part.documentElement.appendChild(part.createElementNS(W, "w:p"));
          zip.file(path, xmlString(part));
        }
        if (kind === activeKind && layout.pageNumbers !== "off" && !refs.some(r => val(r, "type") === "default") && generatedRef) section.insertBefore(generatedRef.cloneNode(true), section.firstChild);
      }
    }
  }
  const tables: PMNode[] = [];
  doc.descendants(n => { if (n.type.name === "table") tables.push(n); });
  all(main, "tbl").forEach((table, index) => {
    const model = tables[index]; if (!model) return;
    if (model.attrs.docxProperties) replaceProperties(table, model.attrs.docxProperties);
    const generatedWidths = kids(first(table, "tblGrid")!, "gridCol").map(c => Number(val(c, "w")));
    const originalWidths: number[] = model.attrs.docxGrid ? JSON.parse(model.attrs.docxGrid) : [];
    if (originalWidths.length && generatedWidths.some((w, c) => w !== originalWidths[c])) {
      const pr = first(table, "tblPr")!;
      const width = first(pr, "tblW") ?? pr.appendChild(main.createElementNS(W, "w:tblW"));
      width.setAttributeNS(W, "w:type", "dxa"); width.setAttributeNS(W, "w:w", String(generatedWidths.reduce((sum, n) => sum + n, 0)));
    }
    const rows = kids(table, "tr");
    const originalRows: string[] = model.attrs.docxRows ? JSON.parse(model.attrs.docxRows) : [];
    const map = TableMap.get(model);
    model.forEach((row, rowOffset, r) => {
      const output = rows[r]; if (!output) return;
      if (row.attrs.docxProperties) replaceProperties(output, row.attrs.docxProperties);
      else if (rows.length === originalRows.length && originalRows[r]) replaceProperties(output, originalRows[r]);
      const cells = kids(output, "tc").filter(c => { const pr = first(c, "tcPr"); const merge = pr && first(pr, "vMerge"); return !merge || val(merge) === "restart"; });
      row.forEach((cell, cellOffset, c) => {
        if (cells[c] && cell.attrs.docxProperties) replaceProperties(cells[c], cell.attrs.docxProperties, ["gridSpan", "vMerge", "tcW"]);
        const continuation: string[] = cell.attrs.docxContinuations ? JSON.parse(cell.attrs.docxContinuations) : [];
        const left = map.findCell(rowOffset + cellOffset + 1).left;
        for (let offset = 1; offset < cell.attrs.rowspan && offset <= continuation.length; offset++) {
          const row = rows[r + offset]; if (!row) break;
          let column = 0;
          const next = kids(row, "tc").find(tc => { const here = column; const pr = first(tc, "tcPr"); column += Number(val(pr && first(pr, "gridSpan"))) || 1; return here === left; });
          if (next) replaceProperties(next, continuation[offset - 1], ["gridSpan", "vMerge", "tcW"]);
        }
      });
    });
  });
  // OOXML property children have a schema-defined order. Merging preserved and
  // newly edited properties must not produce files that Word needs to repair.
  const orders: Record<string, string[]> = {
    pPr: "pStyle keepNext keepLines pageBreakBefore framePr widowControl numPr suppressLineNumbers pBdr shd tabs suppressAutoHyphens kinsoku wordWrap overflowPunct topLinePunct autoSpaceDE autoSpaceDN bidi adjustRightInd snapToGrid spacing ind contextualSpacing mirrorIndents suppressOverlap jc textDirection textAlignment textboxTightWrap outlineLvl divId cnfStyle rPr sectPr pPrChange".split(" "),
    sectPr: "headerReference footerReference footnotePr endnotePr type pgSz pgMar paperSrc pgBorders lnNumType pgNumType cols formProt vAlign noEndnote titlePg textDirection bidi rtlGutter docGrid printerSettings sectPrChange".split(" "),
    trPr: "cnfStyle divId gridBefore gridAfter wBefore wAfter cantSplit trHeight tblHeader tblCellSpacing jc hidden ins del trPrChange".split(" "),
    tcPr: "cnfStyle tcW gridSpan hMerge vMerge tcBorders shd noWrap tcMar textDirection tcFitText vAlign hideMark headers cellIns cellDel cellMerge tcPrChange".split(" "),
    tblPr: "tblStyle tblpPr tblOverlap bidiVisual tblStyleRowBandSize tblStyleColBandSize tblW jc tblCellSpacing tblInd tblBorders shd tblLayout tblCellMar tblLook tblCaption tblDescription tblPrChange".split(" "),
  };
  for (const [name, order] of Object.entries(orders)) for (const props of all(main, name)) {
    const rank = (el: Element) => { const index = order.indexOf(el.localName); return index < 0 ? order.length : index; };
    for (const child of Array.from(props.children).sort((a, b) => rank(a) - rank(b))) props.appendChild(child);
  }
  for (const props of all(main, "pPr")) {
    const section = first(props, "sectPr");
    if (section) props.insertBefore(section, first(props, "pPrChange") ?? null);
  }
  zip.file("word/document.xml", xmlString(main));
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", compression: "DEFLATE" });
}
