/** Preserve Word formatting around Mammoth's semantic conversion.
 * Temporary run styles and bookmarks provide identity through conversion, including
 * repeated text, lists, tables and notes. Never match paragraphs by text or order.
 * This module is reached only through the lazy DOCX import path.
 */
import JSZip from "jszip";
import { mergeParagraphFormats, paragraphFromXml, type ParagraphFormat, type DocumentStyles, type StyleText } from "./paragraph-format";
import { resolveStyle } from "./document-styles";
import { captureLayout, restoreLayoutProperties } from "./docx-preservation";
import { wrapDocumentHtml } from "./document-layout";
import { DEFAULT_DOCUMENT_FONT_CSS } from "./document-font";
import { wordAutomaticLineHeight } from "./word-font-metrics";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
type Properties = Record<string, string>;
type Style = { basedOn?: string; paragraph: Properties; run: Properties };
type RunFormat = {
  css: Properties;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  vertical?: string;
  image?: { position: string; textPlane: string; x: number; y: number; layer: number; width: number; ratio: number; align: string; wrap: string; distance: number; rotate: number; flipX: boolean; flipY: boolean };
};

function child(node: Element | undefined, name: string): Element | undefined {
  return Array.from(node?.children ?? []).find(
    (el) => el.namespaceURI === W && el.localName === name,
  );
}
function attr(node: Element | undefined, name = "val"): string | undefined {
  return node?.getAttributeNS(W, name) ?? undefined;
}
function xml(source: string): Document {
  const doc = new DOMParser().parseFromString(source, "application/xml");
  if (doc.getElementsByTagName("parsererror").length)
    throw new Error("Invalid DOCX XML");
  return doc;
}
function wordElements(node: Document | Element, name: string): Element[] {
  return Array.from(node.getElementsByTagNameNS(W, name));
}
function nearestParagraph(node: Element): Element | null {
  let parent = node.parentElement;
  while (parent && !(parent.namespaceURI === W && parent.localName === "p"))
    parent = parent.parentElement;
  return parent;
}
/** Accept only a complete, unique set of paired hidden bookmarks at the
 * verified body-section terminals. Partial or misplaced sets are ignored. */
function nativeSectionBookmarks(doc: Document): { boundaries: Map<Element, string>; finalId: string } | null {
  const body = child(doc.documentElement, "body"); if (!body) return null;
  const blocks = Array.from(body.children).filter(el => el.namespaceURI === W && el.localName !== "sectPr");
  const last = blocks.at(-1);
  if (!last || last.localName !== "p") return null;
  const boundaries = blocks.filter(el => el.localName === "p" && !!child(child(el, "pPr"), "sectPr"));
  const terminals = [...boundaries, last];
  const allReserved = wordElements(doc, "bookmarkStart").filter(el => (attr(el, "name") || "").startsWith("_edtrsec"));
  if (allReserved.length !== terminals.length) return null;
  const ids: string[] = [], pairs: Array<[Element, Element]> = [];
  for (const paragraph of terminals) {
    const markers = Array.from(paragraph.children).filter(el => el.namespaceURI === W && el.localName === "bookmarkStart" && (attr(el, "name") || "").startsWith("_edtrsec"));
    if (markers.length !== 1) return null;
    const start = markers[0], name = attr(start, "name") || "", match = /^_edtrsec([a-f0-9]{32})$/.exec(name);
    const end = start.nextElementSibling, id = attr(start, "id");
    if (!match || !id || !end || end.namespaceURI !== W || end.localName !== "bookmarkEnd" || attr(end, "id") !== id) return null;
    if (wordElements(doc, "bookmarkStart").filter(el => attr(el, "id") === id).length !== 1 || wordElements(doc, "bookmarkEnd").filter(el => attr(el, "id") === id).length !== 1) return null;
    ids.push(`sec_${match[1]}`); pairs.push([start, end]);
  }
  if (new Set(ids).size !== ids.length) return null;
  pairs.forEach(([start, end]) => { start.remove(); end.remove(); });
  return { boundaries: new Map(boundaries.map((p, i) => [p, ids[i]])), finalId: ids[ids.length - 1] };
}
function properties(node: Element | undefined): Properties {
  const values: Properties = {};
  for (const el of Array.from(node?.children ?? [])) {
    if (el.namespaceURI !== W) continue;
    // Flatten individual attributes so a direct font/spacing override does not
    // erase other inherited attributes in the same OOXML property element.
    values[el.localName] = attr(el) ?? "1";
    for (const a of Array.from(el.attributes)) {
      if (a.namespaceURI === W)
        values[`${el.localName}.${a.localName}`] = a.value;
    }
    if (el.localName === "pBdr") for (const edge of Array.from(el.children)) {
      if (edge.namespaceURI !== W) continue;
      values[`pBdr.${edge.localName}`] = attr(edge) ?? "1";
      for (const a of Array.from(edge.attributes)) if (a.namespaceURI === W)
        values[`pBdr.${edge.localName}.${a.localName}`] = a.value;
    }
  }
  return values;
}
const enabled = (value?: string) =>
  value !== undefined && !["0", "false", "off", "none"].includes(value);
const toggleProperties = ["b", "i", "strike"];
function mergeProperties(base: Properties, override: Properties): Properties {
  const result = { ...base, ...override };
  for (const slot of ["ascii", "hAnsi", "eastAsia", "cs"]) {
    const direct = `rFonts.${slot}`;
    const theme = `rFonts.${slot}Theme`;
    if (override[direct] !== undefined && override[theme] === undefined)
      delete result[theme];
    if (override[theme] !== undefined && override[direct] === undefined)
      delete result[direct];
  }
  if (
    override.color !== undefined &&
    override["color.themeColor"] === undefined
  ) {
    delete result["color.themeColor"];
    delete result["color.themeTint"];
    delete result["color.themeShade"];
  }
  return result;
}
function mergeStyle(base: Properties, override: Properties): Properties {
  const result = mergeProperties(base, override);
  // In a style hierarchy b/i/strike are toggles; in direct formatting they are
  // absolute values (direct properties use mergeProperties below).
  for (const key of toggleProperties) {
    if (override[key] !== undefined)
      result[key] = enabled(override[key])
        ? enabled(base[key])
          ? "0"
          : "1"
        : (base[key] ?? "0");
  }
  return result;
}
function partPath(base: string, target: string): string {
  const segments = (
    target.startsWith("/") ? target.slice(1) : `${base}${target}`
  ).split("/");
  const result: string[] = [];
  for (const segment of segments) {
    if (segment === "..") result.pop();
    else if (segment && segment !== ".") result.push(segment);
  }
  return result.join("/");
}
function relationship(
  doc: Document | undefined,
  kind: string,
): string | undefined {
  return (
    Array.from(doc?.getElementsByTagNameNS("*", "Relationship") ?? [])
      .find(
        (el) =>
          el.getAttribute("Type")?.endsWith(`/${kind}`) &&
          el.getAttribute("TargetMode") !== "External",
      )
      ?.getAttribute("Target") ?? undefined
  );
}
function setStyles(element: HTMLElement, css: Properties) {
  for (const [property, value] of Object.entries(css))
    element.style.setProperty(property, value);
}

type NativeListPosition = { numId: string; level: number; ordinal: number; ordered: boolean };
/** Mammoth retains list nesting/type but drops start and concrete overrides.
 * Count in each original Word story before HTML grouping loses those values. */
function nativeListPositions(numbering: Document | undefined, styles: Document) {
  const abstracts = new Map((numbering ? wordElements(numbering, "abstractNum") : []).map(el => [attr(el, "abstractNumId"), el]));
  const concrete = new Map((numbering ? wordElements(numbering, "num") : []).map(el => [attr(el, "numId"), el]));
  const styleNodes = new Map(wordElements(styles, "style").map(el => [attr(el, "styleId"), el]));
  const counters = new Map<string, Map<number, number>>();
  function styleNumber(id: string | undefined, seen = new Set<string>()): { numId?: string; level?: string } {
    if (!id || seen.has(id)) return {};
    seen.add(id); const style = styleNodes.get(id), own = child(child(style, "pPr"), "numPr"), parent = styleNumber(attr(child(style, "basedOn")), seen);
    return { numId: attr(child(own, "numId")) ?? parent.numId, level: attr(child(own, "ilvl")) ?? parent.level };
  }
  function definition(numId: string, level: number, seen = new Set<string>()): { start: number; ordered: boolean; restart: number } | null {
    if (seen.has(numId)) throw new Error("Cyclic DOCX numbering style");
    seen.add(numId); const num = concrete.get(numId), abstract = abstracts.get(attr(child(num, "abstractNumId")));
    if (!num || !abstract) return null;
    const styleLink = attr(child(abstract, "numStyleLink"));
    if (styleLink) { const linked = styleNumber(styleLink).numId; return linked ? definition(linked, level, seen) : null; }
    const override = Array.from(num.children).find(el => el.namespaceURI === W && el.localName === "lvlOverride" && Number(attr(el, "ilvl")) === level);
    const base = Array.from(abstract.children).find(el => el.namespaceURI === W && el.localName === "lvl" && Number(attr(el, "ilvl")) === level);
    const effective = child(override, "lvl") || base; if (!effective) return null;
    const ordered = attr(child(effective, "numFmt")) !== "bullet";
    let start = Number(attr(child(override, "startOverride")) ?? attr(child(effective, "start")) ?? 1);
    if (!Number.isSafeInteger(start) || start < 1 || start > 2147483647) {
      if (ordered) throw new Error("Unsupported DOCX ordered-list start");
      start = 1; // A bullet's numeric start is not visible ordered-list data.
    }
    const explicitRestart = attr(child(effective, "lvlRestart"));
    return { start, ordered, restart: explicitRestart === "0" ? -1 : explicitRestart === undefined ? level - 1 : Number(explicitRestart) - 1 };
  }
  return (p: Element, path: string, paragraphStyle: string): NativeListPosition | null => {
    const inherited = styleNumber(paragraphStyle), numPr = child(child(p, "pPr"), "numPr"), numId = attr(child(numPr, "numId")) ?? inherited.numId, level = Number(attr(child(numPr, "ilvl")) ?? inherited.level ?? 0);
    let story = p.getAttributeNS("urn:edtr:docx-import:note-story", "story");
    p.removeAttributeNS("urn:edtr:docx-import:note-story", "story");
    if (!numId || numId === "0" || !Number.isInteger(level) || level < 0 || level > 8) return null;
    if (!story) { let ancestor = p.parentElement; while (ancestor && !["footnote", "endnote", "comment"].includes(ancestor.localName)) ancestor = ancestor.parentElement; story = ancestor ? `${ancestor.localName}:${attr(ancestor, "id")}` : "main"; }
    const own = definition(numId, level); if (!own) return null;
    const key = `${path}:${story}:${numId}`, values = counters.get(key) || new Map<number, number>();
    const ordinal = values.has(level) ? values.get(level)! + 1 : own.start; values.set(level, ordinal);
    for (const deeper of [...values.keys()]) if (deeper > level && definition(numId, deeper)?.restart === level) values.delete(deeper);
    counters.set(key, values); return { numId, level, ordinal, ordered: own.ordered };
  };
}
function restoreListPosition(block: HTMLElement, position: NativeListPosition, seen: Map<Element, string>) {
  if (!position.ordered) return;
  const item = block.closest("li"), parent = item?.parentElement;
  if (!item || parent?.tagName !== "OL") return;
  let list = parent;
  const items = Array.from(list.children).filter(el => el.tagName === "LI"), index = items.indexOf(item), key = `${position.numId}:${position.level}`;
  const start = Number(list.getAttribute("start") || 1);
  if (index > 0 && (seen.get(list) !== key || start + index !== position.ordinal)) {
    const split = list.cloneNode(false) as HTMLElement;
    let sibling: ChildNode | null = item;
    while (sibling) { const next: ChildNode | null = sibling.nextSibling; split.appendChild(sibling); sibling = next; }
    list.after(split); list = split;
  }
  if (!seen.has(list)) { list.setAttribute("start", String(position.ordinal)); seen.set(list, key); }
}

export async function prepareDocxFormatting(arrayBuffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const read = async (path: string) => {
    const entry = zip.file(path);
    return entry ? xml(await entry.async("string")) : undefined;
  };
  const rootRelations = await read("_rels/.rels");
  const mainPath = partPath(
    "",
    relationship(rootRelations, "officeDocument") ?? "word/document.xml",
  );
  const base = mainPath.slice(0, mainPath.lastIndexOf("/") + 1);
  const relations = await read(
    `${base}_rels/${mainPath.slice(base.length)}.rels`,
  );
  const relatedPath = (kind: string, fallback = `word/${kind}.xml`) => {
    const target = relationship(relations, kind);
    return target ? partPath(base, target) : fallback;
  };
  const stylesPath = relatedPath("styles");
  const [stylesDoc, theme, settings] = await Promise.all([
    read(stylesPath),
    read(relatedPath("theme", `${base}theme/theme1.xml`)),
    read(relatedPath("settings", `${base}settings.xml`)),
  ]);
  const styleXml = stylesDoc ?? xml(`<w:styles xmlns:w="${W}"/>`);
  const compatibilityValue = settings ? wordElements(settings,"compatSetting").find(el => attr(el,"name") === "compatibilityMode")?.getAttributeNS(W,"val") : null;
  const compatibilityMode = compatibilityValue && /^\d+$/.test(compatibilityValue) ? Number(compatibilityValue) : null;
  const listPosition = nativeListPositions(await read(relatedPath("numbering")), styleXml);
  const listPositions = new Map<string, NativeListPosition>();
  const mainDocument = await read(mainPath);
  if (!mainDocument) throw new Error("DOCX document part is missing");
  const preservation = await captureLayout(zip, mainPath, mainDocument, styleXml);
  const nativeSectionIds = nativeSectionBookmarks(mainDocument);
  const sourceParagraphs = new Map<string, Element>();
  const definitions = new Map<string, Style>();
  let defaultParagraph: string | undefined;
  for (const el of wordElements(styleXml, "style")) {
    const id = attr(el, "styleId");
    if (!id) continue;
    if (attr(el, "type") === "paragraph" && enabled(attr(el, "default")))
      defaultParagraph = id;
    if (!definitions.has(id))
      definitions.set(id, {
        basedOn: attr(child(el, "basedOn")),
        paragraph: properties(child(el, "pPr")),
        run: properties(child(el, "rPr")),
      });
  }
  const defaults = wordElements(styleXml, "docDefaults")[0];
  const defaultRun = properties(child(child(defaults, "rPrDefault"), "rPr"));
  const defaultPara = properties(child(child(defaults, "pPrDefault"), "pPr"));
  const resolve = (id?: string, seen = new Set<string>()): Style => {
    if (!id || seen.has(id) || !definitions.has(id))
      return { paragraph: {}, run: {} };
    seen.add(id);
    const current = definitions.get(id)!;
    const parent = resolve(current.basedOn, seen);
    return {
      paragraph: { ...parent.paragraph, ...current.paragraph },
      run: mergeStyle(parent.run, current.run),
    };
  };
  const themeFonts: Properties = {};
  const themeColors: Properties = {};
  for (const family of ["major", "minor"]) {
    const group = theme?.getElementsByTagNameNS(A, `${family}Font`)[0];
    for (const script of ["latin", "ea", "cs"]) {
      const font = group
        ?.getElementsByTagNameNS(A, script)[0]
        ?.getAttribute("typeface");
      if (font) themeFonts[`${family}.${script}`] = font;
    }
  }
  const colors = theme?.getElementsByTagNameNS(A, "clrScheme")[0];
  for (const el of Array.from(colors?.children ?? [])) {
    const value = el.firstElementChild;
    const rgb = value?.getAttribute("lastClr") ?? value?.getAttribute("val");
    if (rgb && /^[\da-f]{6}$/i.test(rgb)) themeColors[el.localName] = rgb;
  }
  const colorNames: Properties = {
    dark1: "dk1",
    dark2: "dk2",
    light1: "lt1",
    light2: "lt2",
    text1: "dk1",
    text2: "dk2",
    background1: "lt1",
    background2: "lt2",
    hyperlink: "hlink",
    followedHyperlink: "folHlink",
  };
  function color(props: Properties): string | undefined {
    const themeName = props["color.themeColor"];
    let value = themeColors[colorNames[themeName] ?? themeName] ?? props.color;
    if (!value || !/^[\da-f]{6}$/i.test(value))
      return value === "auto" ? "#000000" : undefined;
    for (const kind of ["themeShade", "themeTint"]) {
      const modifier = props[`color.${kind}`];
      if (modifier && /^[\da-f]{2}$/i.test(modifier)) {
        const factor = parseInt(modifier, 16) / 255;
        value = value
          .match(/../g)!
          .map((pair) => {
            const channel = parseInt(pair, 16);
            return Math.round(
              kind === "themeShade"
                ? channel * factor
                : channel + (255 - channel) * factor,
            )
              .toString(16)
              .padStart(2, "0");
          })
          .join("");
      }
    }
    return `#${value}`;
  }
  const highlights: Properties = {
    yellow: "#ffff00",
    green: "#00ff00",
    cyan: "#00ffff",
    magenta: "#ff00ff",
    blue: "#0000ff",
    red: "#ff0000",
    darkBlue: "#000080",
    darkCyan: "#008080",
    darkGreen: "#008000",
    darkMagenta: "#800080",
    darkRed: "#800000",
    darkYellow: "#808000",
    darkGray: "#808080",
    lightGray: "#c0c0c0",
    black: "#000000",
    white: "#ffffff",
  };
  function runFormat(props: Properties): RunFormat {
    const css: Properties = {};
    const themedFont = (slot: string, script: string) => {
      const theme = props[`rFonts.${slot}Theme`];
      return theme
        ? themeFonts[
            `${theme.startsWith("major") ? "major" : "minor"}.${script}`
          ]
        : undefined;
    };
    const ascii = themedFont("ascii", "latin") ?? props["rFonts.ascii"];
    const highAnsi = themedFont("hAnsi", "latin") ?? props["rFonts.hAnsi"];
    const complex = themedFont("cs", "cs") ?? props["rFonts.cs"];
    const eastAsian = themedFont("eastAsia", "ea") ?? props["rFonts.eastAsia"];
    const complexScript = enabled(props.cs) || enabled(props.rtl);
    const family = complexScript
      ? (complex ?? ascii ?? highAnsi)
      : (ascii ?? highAnsi ?? complex ?? eastAsian);
    if (family) {
      // Preserve the actual family for editing/export, while retaining a usable
      // display fallback on devices without the source document's fonts.
      const fallback = /courier|consolas|monospace/i.test(family)
        ? "monospace"
        : /times|georgia|garamond|cambria|serif|baskerville/i.test(family)
          ? "serif"
          : "sans-serif";
      css["font-family"] =
        family.toLowerCase() === "calibri"
          ? DEFAULT_DOCUMENT_FONT_CSS
          : `${JSON.stringify(family)}, ${fallback}`;
    }
    const size =
      Number(
        complexScript ? (props.szCs ?? props.sz) : (props.sz ?? props.szCs),
      ) / 2;
    if (Number.isFinite(size) && size > 0 && size <= 1638)
      css["font-size"] = `${size}pt`;
    const foreground = color(props);
    if (foreground) css.color = foreground;
    const highlight = highlights[props.highlight];
    const shading = props["shd.fill"];
    if (highlight) css["background-color"] = highlight;
    else if (shading && /^[\da-f]{6}$/i.test(shading))
      css["background-color"] = `#${shading}`;
    return {
      css,
      bold: enabled(props.b),
      italic: enabled(props.i),
      underline: enabled(props.u),
      strike: enabled(props.strike),
      vertical: props.vertAlign,
    };
  }
  function paragraphFormat(props: Properties, run: Properties): Properties {
    const css: Properties = { "margin-top": "0pt", "margin-bottom": "0pt", "line-height": "normal" };
    // A Word single bottom border sits outside the line box, separated from
    // the text by its point-valued space. Keep it in layout, not as a text
    // decoration: later paragraphs must move down by its width and space.
    if (props["pBdr.bottom"] === "single") {
      const size = Number(props["pBdr.bottom.sz"]), space = Number(props["pBdr.bottom.space"]);
      const borderColor = color({ color: props["pBdr.bottom.color"], "color.themeColor": props["pBdr.bottom.themeColor"], "color.themeShade": props["pBdr.bottom.themeShade"], "color.themeTint": props["pBdr.bottom.themeTint"] });
      if (Number.isFinite(size) && size > 0 && size <= 96) {
        css["border-bottom"] = `${size / 8}pt solid ${borderColor || "#000000"}`;
        if (Number.isFinite(space) && space >= 0 && space <= 31) css["padding-bottom"] = `${space}pt`;
      }
    }
    const rtl = enabled(props.bidi);
    const alignment =
      {
        both: "justify",
        distribute: "justify",
        start: rtl ? "right" : "left",
        end: rtl ? "left" : "right",
      }[props.jc] ?? props.jc;
    if (["left", "right", "center", "justify"].includes(alignment))
      css["text-align"] = alignment;
    // Word automatic spacing uses the font's single-line metrics. Preserve the
    // original native multiple separately; CSS's multiple is relative to em.
    const line = Number(props["spacing.line"]);
    if (
      line > 0 &&
      (!props["spacing.lineRule"] || props["spacing.lineRule"] === "auto")
    )
      css["line-height"] = String(wordAutomaticLineHeight(line / 240, runFormat(run).css["font-family"] || ""));
    return css;
  }
  const importedStyles: DocumentStyles = {};
  for (const el of wordElements(styleXml,"style")) {
    const id = attr(el,"styleId");
    if (!id || attr(el,"type") !== "paragraph" || id.startsWith("EDTRSource_") || ["__proto__","constructor","prototype"].includes(id)) continue;
    const definition = definitions.get(id)!;
    const own = definition.basedOn ? definition.run : mergeStyle(defaultRun,definition.run), format = runFormat(own), text: Partial<StyleText> = {};
    if (format.css["font-family"]) text.family = format.css["font-family"];
    if (format.css["font-size"]) text.size = Number.parseFloat(format.css["font-size"]);
    if (format.css.color) text.color = format.css.color;
    if (own.b !== undefined) text.bold = !!format.bold;
    if (own.i !== undefined) text.italic = !!format.italic;
    if (own.u !== undefined) text.underline = !!format.underline;
    const pPr = child(el,"pPr"), paragraph = paragraphFromXml(pPr || null);
    const paragraphDefaults = !definition.basedOn ? mergeParagraphFormats({ before:0,after:0,lineMode:"multiple",lineValue:1,lineBasis:"font" }, paragraphFromXml(child(child(defaults,"pPrDefault"),"pPr") || null)) : undefined;
    const level = Number(attr(child(pPr,"outlineLvl")));
    importedStyles[id] = { name:attr(child(el,"name")) || id,basedOn:definition.basedOn,...(Number.isFinite(level) && attr(child(pPr,"outlineLvl")) !== undefined && (level < 6 || level === 9) ? {level:level===9?0:level+1}:{}),paragraph,...(paragraphDefaults ? {paragraphDefaults} : {}),text,
      ...(pPr ? { rawParagraphProperties: new XMLSerializer().serializeToString(pPr) } : {}) };
  }
  preservation.layout.styles = importedStyles;
  // Table cell margins can be inherited through table styles even when the
  // table/cell itself has no tblCellMar/tcMar. Resolve these for display only;
  // the original native styles and cell properties remain intact for export.
  const tableStyles = new Map<string, Element>(); let defaultTableStyle: string | undefined;
  for (const style of wordElements(styleXml, "style")) if (attr(style, "type") === "table") {
    const id = attr(style, "styleId"); if (!id) continue;
    tableStyles.set(id, style); if (enabled(attr(style, "default"))) defaultTableStyle = id;
  }
  const tableStyleMargins = (table: Element): Partial<Record<"top" | "right" | "bottom" | "left", number>> => {
    const result: Partial<Record<"top" | "right" | "bottom" | "left", number>> = {}, chain: Element[] = [], seen = new Set<string>();
    let id = attr(child(child(table, "tblPr"), "tblStyle")) || defaultTableStyle;
    while (id && !seen.has(id)) { seen.add(id); const style = tableStyles.get(id); if (!style) break; chain.unshift(style); id = attr(child(style, "basedOn")); }
    for (const style of chain) {
      const margins = child(child(style, "tblPr"), "tblCellMar");
      for (const side of ["top", "right", "bottom", "left"] as const) {
        const margin = child(margins, side); if (!margin) continue;
        const value = Number(attr(margin, "w"));
        if (attr(margin, "type") === "nil") result[side] = 0;
        else if (Number.isFinite(value) && value >= 0) result[side] = value;
      }
    }
    return result;
  };
  const tableParagraphProperties = (p: Element): { properties: Properties; paragraph: ParagraphFormat } => {
    let table = p.parentElement;
    while (table && !(table.namespaceURI === W && table.localName === "tbl")) table = table.parentElement;
    if (!table) return {properties:{},paragraph:{}};
    const chain: Element[] = [], seen = new Set<string>();
    let id = attr(child(child(table,"tblPr"),"tblStyle")) || defaultTableStyle;
    while (id && !seen.has(id)) { seen.add(id); const style = tableStyles.get(id); if (!style) break; chain.unshift(style); id = attr(child(style,"basedOn")); }
    // Conditional table styles remain outside this unconditional cascade.
    return {properties:Object.assign({}, ...chain.map(style => properties(child(style,"pPr")))),paragraph:mergeParagraphFormats(...chain.map(style => paragraphFromXml(child(style,"pPr") || null)))};
  };
  const paragraphMeta = new Map<string,{ id:string; direct:ParagraphFormat; table:ParagraphFormat; baseText:Partial<StyleText> }>();
  const prefix = `EDTRimport${crypto.randomUUID().replace(/-/g, "")}`;
  const paragraphFormats = new Map<string, Properties>();
  const paragraphBaseText = new Map<string, Partial<StyleText>>();
  const runFormats = new Map<string, RunFormat>();
  const columnBreakProperties = new Map<string, Element | null>();
  const columnBreakFormats = new Map<string, RunFormat>();
  const columnBreakLinks = new Map<string, string>();
  const formatIds = new Map<string, string>();
  const styleMap: string[] = [];
  const paths = [
    ...new Set([
      mainPath,
      relatedPath("footnotes"),
      relatedPath("endnotes"),
      relatedPath("comments"),
    ]),
  ];
  for (const path of paths) {
    const doc = path === mainPath ? mainDocument : await read(path);
    if (!doc) continue;
    if (path === mainPath) {
      let breakId = 0;
      for (const run of wordElements(doc, "r")) {
        if (!Array.from(run.children).some(c => c.localName === "br" && ["page", "column"].includes(attr(c, "type") || ""))) continue;
        const fragment = doc.createDocumentFragment();
        const rPr = child(run, "rPr");
        let segment = doc.createElementNS(W, "w:r");
        if (rPr) segment.appendChild(rPr.cloneNode(true));
        for (const item of Array.from(run.children)) {
          if (item === rPr) continue;
          if (item.localName === "br" && ["page", "column"].includes(attr(item, "type") || "")) {
            if (segment.children.length > (rPr ? 1 : 0)) fragment.appendChild(segment);
            const marker = doc.createElementNS(W, "w:bookmarkStart");
            const markerName = `${prefix}${attr(item, "type") === "column" ? "c" : "b"}${breakId}`;
            marker.setAttributeNS(W, "w:name", markerName);
            if (attr(item, "type") === "column") {
              columnBreakProperties.set(markerName, rPr ? rPr.cloneNode(true) as Element : null);
              const hyperlink = run.parentElement?.namespaceURI === W && run.parentElement.localName === "hyperlink" ? run.parentElement : null;
              const relationshipId = hyperlink?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
              const relation = Array.from(relations?.getElementsByTagNameNS("*", "Relationship") || []).find(el => el.getAttribute("Id") === relationshipId && el.getAttribute("Type")?.endsWith("/hyperlink") && el.getAttribute("TargetMode") === "External");
              const target = relation?.getAttribute("Target") || (attr(hyperlink || undefined, "anchor") ? `#${attr(hyperlink || undefined, "anchor")}` : "");
              if (/^(?:https?:|mailto:|tel:|#|\/|\.{1,2}\/|\?)/i.test(target)) columnBreakLinks.set(markerName, target);
            }
            marker.setAttributeNS(W, "w:id", String(1000000 + breakId++));
            const end = doc.createElementNS(W, "w:bookmarkEnd");
            end.setAttributeNS(W, "w:id", marker.getAttributeNS(W, "id")!);
            fragment.append(marker, end);
            segment = doc.createElementNS(W, "w:r");
            if (rPr) segment.appendChild(rPr.cloneNode(true));
          } else segment.appendChild(item.cloneNode(true));
        }
        if (segment.children.length > (rPr ? 1 : 0)) fragment.appendChild(segment);
        run.replaceWith(fragment);
      }
    }
    for (const p of wordElements(doc, "p")) {
      let pPr = child(p, "pPr");
      const paragraphStyle = attr(child(pPr,"pStyle")) ?? defaultParagraph ?? "Normal";
      const list = listPosition(p, path, paragraphStyle);
      const directParagraph = paragraphFromXml(pPr || null);
      const inherited = resolve(definitions.has(paragraphStyle) ? paragraphStyle : defaultParagraph);
      const tableContext = tableParagraphProperties(p);
      const paragraphProps = {
        ...defaultPara,
        ...tableContext.properties,
        ...inherited.paragraph,
        ...properties(pPr),
      };
      // Materialize effective paragraph geometry, including style/default values.
      // Word's implicit spacing is zero before/after and single line, whereas
      // the editor's generic HTML defaults intentionally have larger gaps.
      if (!pPr) { pPr = doc.createElementNS(W, "w:pPr"); p.insertBefore(pPr, p.firstChild); }
      for (const property of ["spacing", "ind"]) {
        const attrs = Object.entries(paragraphProps).filter(([key]) => key.startsWith(`${property}.`));
        if (!attrs.length && property !== "spacing") continue;
        let el = child(pPr, property);
        if (!el) { el = doc.createElementNS(W, `w:${property}`); pPr.appendChild(el); }
        if (property === "spacing") for (const [key, value] of [["before", "0"], ["after", "0"], ["line", "240"], ["lineRule", "auto"]]) if (!el.hasAttributeNS(W, key)) el.setAttributeNS(W, `w:${key}`, value);
        for (const [key, value] of attrs) el.setAttributeNS(W, `w:${key.slice(property.length + 1)}`, value);
      }
      const baseRun = mergeStyle(defaultRun, inherited.run);
      const markFormat = runFormat(mergeProperties(baseRun, properties(child(pPr, "rPr")))), baseText: Partial<StyleText> = {};
      if (markFormat.css["font-family"]) baseText.family = markFormat.css["font-family"];
      if (markFormat.css["font-size"]) baseText.size = Number.parseFloat(markFormat.css["font-size"]);
      for (const marker of wordElements(p, "bookmarkStart")) {
        const markerName = attr(marker, "name") || "";
        if (!columnBreakProperties.has(markerName)) continue;
        const rPr = columnBreakProperties.get(markerName);
        const inheritedRun = resolve(attr(child(rPr || undefined, "rStyle"))).run;
        columnBreakFormats.set(markerName, runFormat(mergeProperties(mergeStyle(baseRun, inheritedRun), properties(rPr || undefined))));
      }
      const id = `${prefix}p${paragraphFormats.size}`;
      paragraphFormats.set(id, paragraphFormat(paragraphProps, baseRun));
      if (Object.keys(baseText).length) paragraphBaseText.set(id, baseText);
      if (list) listPositions.set(id, list);
      if (Object.hasOwn(importedStyles,paragraphStyle) || (defaultParagraph && Object.hasOwn(importedStyles,defaultParagraph))) paragraphMeta.set(id,{ id:paragraphStyle,direct:directParagraph,table:tableContext.paragraph,baseText });
      sourceParagraphs.set(id, p);
      const bookmark = doc.createElementNS(W, "w:bookmarkStart");
      bookmark.setAttributeNS(W, "w:name", id);
      bookmark.setAttributeNS(W, "w:id", String(paragraphFormats.size));
      const end = doc.createElementNS(W, "w:bookmarkEnd");
      end.setAttributeNS(W, "w:id", String(paragraphFormats.size));
      p.insertBefore(bookmark, pPr ? pPr.nextSibling : p.firstChild);
      p.insertBefore(end, bookmark.nextSibling);
      for (const run of wordElements(p, "r").filter(
        (r) => nearestParagraph(r) === p,
      )) {
        let rPr = child(run, "rPr");
        const inheritedRun = resolve(attr(child(rPr, "rStyle"))).run;
        const format = runFormat(
          mergeProperties(mergeStyle(baseRun, inheritedRun), properties(rPr)),
        );
        const extent = run.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing", "extent")[0];
        const imageWidth = Number(extent?.getAttribute("cx")) / 9525, imageHeight = Number(extent?.getAttribute("cy")) / 9525;
        if (imageWidth > 0 && imageHeight > 0) {
          const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
          const anchor = run.getElementsByTagNameNS(WP, "anchor")[0];
          const positionH = anchor?.getElementsByTagNameNS(WP, "positionH")[0];
          const positionV = anchor?.getElementsByTagNameNS(WP, "positionV")[0];
          const offsetH = positionH?.getElementsByTagNameNS(WP, "posOffset")[0]?.textContent;
          const offsetV = positionV?.getElementsByTagNameNS(WP, "posOffset")[0]?.textContent;
          const fixed = positionH?.getAttribute("relativeFrom") === "page" && positionV?.getAttribute("relativeFrom") === "page" && offsetH != null && offsetV != null && !!anchor?.getElementsByTagNameNS(WP, "wrapNone")[0];
          const horizontal = positionH?.getElementsByTagNameNS(WP, "align")[0]?.textContent;
          const align = fixed ? "" : horizontal || (["center", "right"].includes(paragraphProps.jc) ? paragraphProps.jc : "left");
          const square = anchor?.getElementsByTagNameNS(WP, "wrapSquare")[0];
          const wrapped = square || anchor?.getElementsByTagNameNS(WP, "wrapTight")[0] || anchor?.getElementsByTagNameNS(WP, "wrapThrough")[0];
          const wrap = !anchor ? "inline" : wrapped ? (align === "right" || wrapped.getAttribute("wrapText") === "left" ? "wrapRight" : "wrapLeft") : "topBottom";
          const distances = ["distT", "distB", "distL", "distR"].map(key => Number(wrapped?.getAttribute(key) || anchor?.getAttribute(key) || 0) / 9525);
          const transform = run.getElementsByTagNameNS(A, "xfrm")[0];
          format.image = { position: fixed ? "page" : "flow", textPlane: ["1", "true"].includes(anchor?.getAttribute("behindDoc") || "") ? "behind" : "front", x: fixed ? Number(offsetH) / 9525 : 0, y: fixed ? Number(offsetV) / 9525 : 0, layer: Math.max(0, (Number(anchor?.getAttribute("relativeHeight")) || 0) - 1), width: imageWidth, ratio: imageWidth / imageHeight, align, wrap, distance: Math.max(...distances),
            rotate: Number(transform?.getAttribute("rot") || 0) / 60000, flipX: ["1", "true"].includes(transform?.getAttribute("flipH") || ""), flipY: ["1", "true"].includes(transform?.getAttribute("flipV") || "") };
        }
        const key = JSON.stringify(format);
        let className = formatIds.get(key);
        if (!className) {
          className = `${prefix}r${formatIds.size}`;
          formatIds.set(key, className);
          runFormats.set(className, format);
          styleMap.push(`r.${className} => span.${className}`);
          const definition = styleXml.createElementNS(W, "w:style");
          definition.setAttributeNS(W, "w:type", "character");
          definition.setAttributeNS(W, "w:styleId", className);
          styleXml.documentElement.appendChild(definition);
        }
        if (!rPr) {
          rPr = doc.createElementNS(W, "w:rPr");
          run.insertBefore(rPr, run.firstChild);
        }
        let rStyle = child(rPr, "rStyle");
        if (!rStyle) {
          rStyle = doc.createElementNS(W, "w:rStyle");
          rPr.insertBefore(rStyle, rPr.firstChild);
        }
        rStyle.setAttributeNS(W, "w:val", className);
      }
    }
    zip.file(path, new XMLSerializer().serializeToString(doc));
  }
  zip.file(stylesPath, new XMLSerializer().serializeToString(styleXml));
  return {
    arrayBuffer: await zip.generateAsync({ type: "arraybuffer" }),
    styleMap,
    restore(html: string): string {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const restoredLists = new Map<Element, string>();
      for (const marker of Array.from(
        doc.querySelectorAll<HTMLAnchorElement>(`a[id^="${prefix}p"]`),
      )) {
        const css = paragraphFormats.get(marker.id);
        let block = marker.closest<HTMLElement>("p,h1,h2,h3,h4,h5,h6");
        if (!block) {
          // Mammoth emits list paragraphs directly in <li>; create a paragraph
          // so ProseMirror can retain alignment instead of dropping the li style.
          const parent = marker.parentElement;
          if (parent) {
            block = doc.createElement("p");
            parent.insertBefore(block, marker);
            let sibling: ChildNode | null = marker;
            while (
              sibling &&
              !(
                sibling instanceof Element &&
                /^(UL|OL|P|H[1-6]|TABLE)$/.test(sibling.tagName)
              )
            ) {
              const next: ChildNode | null = sibling.nextSibling;
              block.appendChild(sibling);
              sibling = next;
            }
          }
        }
        if (block && css) setStyles(block, css);
        const list = listPositions.get(marker.id);
        if (block && list) restoreListPosition(block, list, restoredLists);
        const original = sourceParagraphs.get(marker.id);
        if (block && original) {
          restoreLayoutProperties(original, block, preservation.sectionXml, tableStyleMargins, {styles:styleXml,compatibilityMode});
          const sectionId = nativeSectionIds?.boundaries.get(original);
          if (sectionId) block.setAttribute("data-edtr-section-end", sectionId);
        }
        const meta = paragraphMeta.get(marker.id);
        if (block && meta) {
          const resolved = resolveStyle(importedStyles,Object.hasOwn(importedStyles,meta.id) ? meta.id : defaultParagraph!,new Set(),meta.table);
          block.setAttribute("data-edtr-style",meta.id);
          block.setAttribute("data-edtr-style-text",JSON.stringify({ ...resolved.text, ...meta.baseText }));
          block.setAttribute("data-edtr-style-paragraph",JSON.stringify(resolved.paragraph));
          if (Object.keys(meta.table).length) block.setAttribute("data-edtr-table-style-paragraph",JSON.stringify(meta.table));
          block.setAttribute("data-edtr-paragraph",JSON.stringify(meta.direct));
        } else if (block && paragraphBaseText.has(marker.id)) {
          block.setAttribute("data-edtr-style-text",JSON.stringify(paragraphBaseText.get(marker.id)));
        }
        marker.remove();
      }
      for (const span of Array.from(
        doc.querySelectorAll<HTMLSpanElement>(`span[class^="${prefix}r"]`),
      )) {
        const format = runFormats.get(span.className);
        if (!format) continue;
        span.removeAttribute("class");
        setStyles(span, format.css);
        if (format.image) for (const image of Array.from(span.querySelectorAll("img"))) {
          image.setAttribute("data-width", `${format.image.width}px`); image.style.width = `${format.image.width}px`;
          image.setAttribute("data-aspect-ratio", String(format.image.ratio)); image.setAttribute("data-align", format.image.align);
          image.setAttribute("data-position", format.image.position); image.setAttribute("data-x", String(format.image.x)); image.setAttribute("data-y", String(format.image.y)); image.setAttribute("data-layer", String(format.image.layer));
          image.setAttribute("data-text-plane", format.image.textPlane);
          image.setAttribute("data-wrap", format.image.wrap); image.setAttribute("data-distance", String(format.image.distance));
          image.setAttribute("data-rotate", String(format.image.rotate)); image.setAttribute("data-flip-x", String(format.image.flipX)); image.setAttribute("data-flip-y", String(format.image.flipY));
        }
        for (const [tag, apply] of [
          ["strong", format.bold],
          ["em", format.italic],
          ["u", format.underline],
          ["s", format.strike],
          ["sup", format.vertical === "superscript"],
          ["sub", format.vertical === "subscript"],
        ] as const) {
          if (!apply) continue;
          const wrapper = doc.createElement(tag);
          wrapper.append(...Array.from(span.childNodes));
          span.appendChild(wrapper);
        }
      }
      for (const marker of Array.from(doc.querySelectorAll<HTMLAnchorElement>(`a[id^="${prefix}c"]`))) {
        const br = doc.createElement("br"); br.setAttribute("data-edtr-column-break", "true");
        const format = columnBreakFormats.get(marker.id);
        if (!format) { marker.replaceWith(br); continue; }
        const span = doc.createElement("span"); setStyles(span, format.css); span.appendChild(br);
        for (const [tag, apply] of [["strong", format.bold], ["em", format.italic], ["u", format.underline], ["s", format.strike], ["sup", format.vertical === "superscript"], ["sub", format.vertical === "subscript"]] as const) {
          if (apply) { const wrapper = doc.createElement(tag); wrapper.append(...Array.from(span.childNodes)); span.appendChild(wrapper); }
        }
        const target = columnBreakLinks.get(marker.id);
        if (target && !marker.closest("a[href]")) { const link = doc.createElement("a"); link.setAttribute("href", target); link.appendChild(span); marker.replaceWith(link); }
        else marker.replaceWith(span);
      }
      for (const marker of Array.from(doc.querySelectorAll<HTMLAnchorElement>(`a[id^="${prefix}b"]`))) {
        const block = marker.closest("p,h1,h2,h3,h4,h5,h6");
        const separator = doc.createElement("hr"); separator.setAttribute("data-page-break", "true");
        if (block) {
          const range = doc.createRange(); range.setStartAfter(marker); range.setEnd(block, block.childNodes.length);
          const after = block.cloneNode(false) as HTMLElement; after.appendChild(range.extractContents());
          // Section properties end the original paragraph; a break-before flag
          // belongs only to its first fragment.
          for (const [element, property] of [[block, "sectPr"], [after, "pageBreakBefore"]] as const) {
            const raw = element.getAttribute("data-docx-properties");
            if (raw) { const props = xml(raw); wordElements(props, property).forEach(e => e.remove()); element.setAttribute("data-docx-properties", new XMLSerializer().serializeToString(props.documentElement)); }
          }
          block.after(separator, after); marker.remove();
          const empty = (el: Element) => !el.textContent?.trim() && !el.querySelector("img,br");
          if (empty(block)) block.remove(); if (empty(after)) after.remove();
        } else marker.replaceWith(separator);
      }
      // Mammoth retains Word run tabs as U+0009. Preserve their structural
      // identity when ProseMirror parses the restored, styled HTML.
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT), tabTexts: Text[] = [];
      while (walker.nextNode()) {
        const text = walker.currentNode as Text;
        if (text.data.includes("\t") && text.parentElement?.closest("p,h1,h2,h3,h4,h5,h6,li,td,th")) tabTexts.push(text);
      }
      for (const text of tabTexts) {
        const parts = text.data.split("\t"), fragment = doc.createDocumentFragment();
        parts.forEach((part, index) => {
          if (index) { const tab = doc.createElement("span"); tab.setAttribute("data-edtr-tab", "true"); tab.textContent = "\t"; fragment.appendChild(tab); }
          if (part) fragment.appendChild(doc.createTextNode(part));
        });
        text.replaceWith(fragment);
      }
      const result = wrapDocumentHtml(doc.body.innerHTML, preservation.layout);
      if (!nativeSectionIds) return result;
      const envelope = new DOMParser().parseFromString(result, "text/html");
      const root = envelope.body.firstElementChild;
      if (!root) return result;
      root.setAttribute("data-edtr-docx-final-section-id", nativeSectionIds.finalId);
      return envelope.body.innerHTML;
    },
  };
}
