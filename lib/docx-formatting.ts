/** Preserve Word formatting around Mammoth's semantic conversion.
 * Temporary run styles and bookmarks provide identity through conversion, including
 * repeated text, lists, tables and notes. Never match paragraphs by text or order.
 * This module is reached only through the lazy DOCX import path.
 */
import JSZip from "jszip";
import { paragraphFromXml, type ParagraphFormat, type DocumentStyles, type StyleText } from "./paragraph-format";
import { resolveStyle } from "./document-styles";
import { captureLayout, restoreLayoutProperties } from "./docx-preservation";
import { wrapDocumentHtml } from "./document-layout";
import { DEFAULT_DOCUMENT_FONT_CSS } from "./document-font";

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
  image?: { position: string; x: number; y: number; layer: number; width: number; ratio: number; align: string; wrap: string; distance: number; rotate: number; flipX: boolean; flipY: boolean };
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
  const [stylesDoc, theme] = await Promise.all([
    read(stylesPath),
    read(relatedPath("theme", `${base}theme/theme1.xml`)),
  ]);
  const styleXml = stylesDoc ?? xml(`<w:styles xmlns:w="${W}"/>`);
  const mainDocument = await read(mainPath);
  if (!mainDocument) throw new Error("DOCX document part is missing");
  const preservation = await captureLayout(zip, mainPath, mainDocument, styleXml);
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
  function paragraphFormat(props: Properties): Properties {
    const css: Properties = { "margin-top": "0pt", "margin-bottom": "0pt", "line-height": "normal" };
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
    // The editor supports a unitless spacing multiple; exact/minimum Word line
    // heights and page geometry need separate editor schema support.
    const line = Number(props["spacing.line"]);
    if (
      line > 0 &&
      (!props["spacing.lineRule"] || props["spacing.lineRule"] === "auto")
    )
      css["line-height"] = String(line / 240);
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
    if (!definition.basedOn) {
      const global = child(child(defaults,"pPrDefault"),"pPr");
      Object.assign(paragraph,{ before:0,after:0,lineMode:"multiple",lineValue:1,...paragraphFromXml(global || null),...paragraph });
    }
    const level = Number(attr(child(pPr,"outlineLvl")));
    importedStyles[id] = { name:attr(child(el,"name")) || id,basedOn:definition.basedOn,...(Number.isFinite(level) && attr(child(pPr,"outlineLvl")) !== undefined && (level < 6 || level === 9) ? {level:level===9?0:level+1}:{}),paragraph,text };
  }
  preservation.layout.styles = importedStyles;
  const paragraphMeta = new Map<string,{ id:string; direct:ParagraphFormat }>();
  const prefix = `EDTRimport${crypto.randomUUID().replace(/-/g, "")}`;
  const paragraphFormats = new Map<string, Properties>();
  const runFormats = new Map<string, RunFormat>();
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
        if (!Array.from(run.children).some(c => c.localName === "br" && attr(c, "type") === "page")) continue;
        const fragment = doc.createDocumentFragment();
        const rPr = child(run, "rPr");
        let segment = doc.createElementNS(W, "w:r");
        if (rPr) segment.appendChild(rPr.cloneNode(true));
        for (const item of Array.from(run.children)) {
          if (item === rPr) continue;
          if (item.localName === "br" && attr(item, "type") === "page") {
            if (segment.children.length > (rPr ? 1 : 0)) fragment.appendChild(segment);
            const marker = doc.createElementNS(W, "w:bookmarkStart");
            marker.setAttributeNS(W, "w:name", `${prefix}b${breakId}`);
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
      const directParagraph = paragraphFromXml(pPr || null);
      const inherited = resolve(paragraphStyle);
      const paragraphProps = {
        ...defaultPara,
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
      const id = `${prefix}p${paragraphFormats.size}`;
      paragraphFormats.set(id, paragraphFormat(paragraphProps));
      if (importedStyles[paragraphStyle]) paragraphMeta.set(id,{ id:paragraphStyle,direct:directParagraph });
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
          const fixed = positionH?.getAttribute("relativeFrom") === "page" && positionV?.getAttribute("relativeFrom") === "page" && offsetH != null && offsetV != null && !!anchor?.getElementsByTagNameNS(WP, "wrapNone")[0] && !["1", "true"].includes(anchor?.getAttribute("behindDoc") || "");
          const horizontal = positionH?.getElementsByTagNameNS(WP, "align")[0]?.textContent;
          const align = fixed ? "" : horizontal || (["center", "right"].includes(paragraphProps.jc) ? paragraphProps.jc : "left");
          const square = anchor?.getElementsByTagNameNS(WP, "wrapSquare")[0];
          const wrapped = square || anchor?.getElementsByTagNameNS(WP, "wrapTight")[0] || anchor?.getElementsByTagNameNS(WP, "wrapThrough")[0];
          const wrap = !anchor ? "inline" : wrapped ? (align === "right" || wrapped.getAttribute("wrapText") === "left" ? "wrapRight" : "wrapLeft") : "topBottom";
          const distances = ["distT", "distB", "distL", "distR"].map(key => Number(wrapped?.getAttribute(key) || anchor?.getAttribute(key) || 0) / 9525);
          const transform = run.getElementsByTagNameNS(A, "xfrm")[0];
          format.image = { position: fixed ? "page" : "flow", x: fixed ? Number(offsetH) / 9525 : 0, y: fixed ? Number(offsetV) / 9525 : 0, layer: Number(anchor?.getAttribute("relativeHeight")) || 0, width: imageWidth, ratio: imageWidth / imageHeight, align, wrap, distance: Math.max(...distances),
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
        const original = sourceParagraphs.get(marker.id);
        if (block && original) restoreLayoutProperties(original, block, preservation.sectionXml);
        const meta = paragraphMeta.get(marker.id);
        if (block && meta) {
          const resolved = resolveStyle(importedStyles,meta.id);
          block.setAttribute("data-edtr-style",meta.id);
          block.setAttribute("data-edtr-style-text",JSON.stringify(resolved.text));
          block.setAttribute("data-edtr-style-paragraph",JSON.stringify(resolved.paragraph));
          block.setAttribute("data-edtr-paragraph",JSON.stringify(meta.direct));
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
      return wrapDocumentHtml(doc.body.innerHTML, preservation.layout);
    },
  };
}
