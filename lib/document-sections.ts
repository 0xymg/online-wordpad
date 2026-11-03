import { effectiveParagraph } from "./paragraph-format";
import type { Node as PMNode } from "prosemirror-model";
import { defaultDocumentLayout, type DocumentLayout } from "./document-layout";
import { getDocumentModel, sectionRecordXml } from "./document-model";
export type PageGeometry = Pick<DocumentLayout, "width" | "height" | "margins"> & {
  headerDistance?: number; footerDistance?: number; startType?: string; numberStart?: number; numberFormat?: string; differentFirst?: boolean;
};
export type DocumentSection = { id: string; from: number; to: number; geometry: PageGeometry };
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const cache = new WeakMap<PMNode, DocumentSection[]>();
export function sectionGeometry(raw: string | undefined, fallback: PageGeometry): PageGeometry {
  if (!raw) return { ...fallback,headerDistance:fallback.headerDistance ?? Math.min(fallback.margins.top/2,720),footerDistance:fallback.footerDistance ?? Math.min(fallback.margins.bottom/2,720) };
  const xml = new DOMParser().parseFromString(raw, "application/xml");
  const get = (name: string) => xml.getElementsByTagNameNS(W, name)[0];
  const attr = (name: string, key: string) => get(name)?.getAttributeNS(W, key);
  const number = (name: string, key: string, otherwise: number) => { const text = attr(name, key); const n = Number(text); return text && Number.isFinite(n) ? n : otherwise; };
  const geometry: PageGeometry = {
    width: Math.max(720, number("pgSz", "w", fallback.width)), height: Math.max(720, number("pgSz", "h", fallback.height)),
    margins: { top: Math.abs(number("pgMar", "top", fallback.margins.top)), right: Math.max(0, number("pgMar", "right", fallback.margins.right)), bottom: Math.abs(number("pgMar", "bottom", fallback.margins.bottom)), left: Math.max(0, number("pgMar", "left", fallback.margins.left)) },
    headerDistance: Math.max(0, number("pgMar", "header", Math.min(fallback.margins.top / 2, 720))), footerDistance: Math.max(0, number("pgMar", "footer", Math.min(fallback.margins.bottom / 2, 720))),
    startType: attr("type", "val") || "nextPage", numberFormat: attr("pgNumType", "fmt") || undefined,
    numberStart: attr("pgNumType", "start") !== null && attr("pgNumType", "start") !== undefined ? number("pgNumType", "start", 1) : undefined,
    differentFirst: !!get("titlePg") && !["0", "false", "off"].includes(attr("titlePg", "val") || ""),
  };
  return geometry;
}
export function sameGeometry(a: PageGeometry, b: PageGeometry): boolean {
  return a.width === b.width && a.height === b.height && Object.keys(a.margins).every(k => a.margins[k as keyof typeof a.margins] === b.margins[k as keyof typeof b.margins]);
}
export function documentSections(doc: PMNode): DocumentSection[] {
  const cached = cache.get(doc); if (cached) return cached;
  const layout = doc.attrs.layout as DocumentLayout | null;
  const model = getDocumentModel(doc);
  const fallback = layout || defaultDocumentLayout();
  const applyOverrides = (geometry: PageGeometry): PageGeometry => ({ ...geometry,
    ...(layout?.overrides?.orientation ? { width: layout.width, height: layout.height } : {}),
    ...(layout?.overrides?.margins ? { margins: layout.margins } : {}),
  });
  const sections: DocumentSection[] = [];
  const rawSections: string[] = [];
  let from = 0;
  doc.forEach((node, pos) => {
    const id = model ? node.attrs.sectionEndId : null;
    const raw = model ? id && model.sections[id] ? sectionRecordXml(model.sections[id]) : "" : String(node.attrs.docxProperties || "");
    if (model ? !id : !raw.includes("sectPr")) return;
    const end = pos + node.nodeSize;
    rawSections.push(raw);
    sections.push({ id: id || `legacy:${sections.length}`, from, to: end, geometry: model ? sectionGeometry(raw, model.sections[id].page) : applyOverrides(sectionGeometry(raw, fallback)) });
    from = end;
  });
  const finalRaw = model ? sectionRecordXml(model.sections[model.finalSectionId]) : layout?.section || "";
  sections.push({ id: model?.finalSectionId || `legacy:${sections.length}`, from, to: doc.content.size,
    geometry: model ? sectionGeometry(finalRaw, model.sections[model.finalSectionId].page) : applyOverrides(sectionGeometry(finalRaw, fallback)) });
  rawSections.push(finalRaw);
  for (let index = 0; index < sections.length; index++) {
    const g = sections[index].geometry;
    if (!model && layout?.sectionMargins?.[index]) g.margins = { ...layout.sectionMargins[index] };
    const own = Object.entries(layout?.running || {}).filter(([key]) => key.startsWith(`${index}:`));
    if (own.some(([key]) => key.includes(":first:"))) g.differentFirst = true;
    for (const kind of ["header", "footer"] as const) {
      const modified = own.filter(([key]) => key.endsWith(`:${kind}`)).at(-1)?.[1];
      const distance = modified?.distance ?? (kind === "header" ? g.headerDistance : g.footerDistance) ?? 283;
      if (kind === "header") g.headerDistance = distance; else g.footerDistance = distance;
      let reserve = 0;
      for (const variant of ["default", "first", "even"]) {
        for (let source = index; source >= 0; source--) {
          const slot = layout?.running?.[`${source}:${variant}:${kind}`];
          if (slot) { if (slot.linked && source) continue; reserve = Math.max(reserve, slot.height ? distance + slot.height + 120 : 0); break; }
          const xml = new DOMParser().parseFromString(rawSections[source] || "<p/>", "application/xml");
          if (Array.from(xml.getElementsByTagNameNS(W, `${kind}Reference`)).some(r => r.getAttributeNS(W, "type") === variant)) break;
        }
      }
      if (reserve) g.margins = { ...g.margins, [kind === "header" ? "top" : "bottom"]: Math.max(g.margins[kind === "header" ? "top" : "bottom"], reserve) };
    }
  }
  cache.set(doc, sections); return sections;
}
/** Reflow only; these widths never enter the document's saved attributes. */
export function sectionBlockStyle(node: PMNode, geometry: PageGeometry, first: PageGeometry, maximumWidth: number): string {
  const source = document.createElement("div"); source.style.cssText = node.attrs.layoutStyle || "";
  const px = (text: string) => { const n = Number.parseFloat(text) || 0; return text.endsWith("pt") ? n * 4 / 3 : text.endsWith("cm") ? n * 96 / 2.54 : n; };
  const p=effectiveParagraph(node);
  const width = (geometry.width - geometry.margins.left - geometry.margins.right) / 15 - (p.left!==undefined?p.left/15:px(source.style.marginLeft)) - (p.right!==undefined?p.right/15:px(source.style.marginRight));
  const left = ((maximumWidth - geometry.width) / 2 + geometry.margins.left - first.margins.left) / 15;
  return `width:${Math.max(20, width)}px;max-width:none;position:relative;left:${left}px`;
}
