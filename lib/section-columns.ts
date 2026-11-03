/** Section column settings in twips. Preserved native settings remain in rawProperties. */
export type SectionColumns =
  | { kind: "equal"; count: 1 | 2 | 3; space: number; separator: boolean }
  | { kind: "preserved"; reason: "unequal" | "unsupported-count" | "invalid-native" };
export type SectionFlowDirection = "ltr" | "rtl" | "preserved";
export type ColumnPage = { width: number; margins: { left: number; right: number } };
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XMLNS = "http://www.w3.org/2000/xmlns/";
/** Conversion cannot choose between contradictory extension values. */
export class SectionColumnExtensionConflict extends Error {
  readonly code = "unsupported-model";
  constructor() { super("Conflicting native section extensions cannot be converted safely"); this.name = "SectionColumnExtensionConflict"; }
}
function sectionChildren(section: Element, name: string): Element[] {
  return Array.from(section.children).filter(element => element.namespaceURI === W && element.localName === name);
}
function isManagedAttribute(attribute: Attr, names: ReadonlySet<string>): boolean {
  return attribute.namespaceURI === XMLNS || attribute.namespaceURI === W && names.has(attribute.localName);
}
/** Check both properties before touching either, so failures cannot partly modify the source. */
function validateExtensions(elements: readonly Element[], managed: ReadonlySet<string>) {
  const values = new Map<string, string>();
  for (const element of elements) for (const attribute of Array.from(element.attributes)) {
    if (attribute.namespaceURI === XMLNS) {
      // Namespace prefixes can also occur inside extension attribute values.
      // Renaming a conflicting prefix would silently change those meanings.
      const prefix = attribute.localName === "xmlns" ? null : attribute.localName;
      const existing = elements[0].lookupNamespaceURI(prefix);
      const key = `xmlns\u0000${prefix || ""}`, previous = values.get(key);
      if ((existing !== null && existing !== attribute.value) || (previous !== undefined && previous !== attribute.value)) throw new SectionColumnExtensionConflict();
      values.set(key, attribute.value);
      continue;
    }
    if (isManagedAttribute(attribute, managed)) continue;
    const key = `${attribute.namespaceURI || ""}\u0000${attribute.localName}`, previous = values.get(key);
    if (previous !== undefined && previous !== attribute.value) throw new SectionColumnExtensionConflict();
    values.set(key, attribute.value);
  }
}
const columnManaged = new Set(["num", "space", "sep", "equalWidth"]), directionManaged = new Set(["val"]);
function validateSectionExtensions(section: Element, columns: SectionColumns, direction: SectionFlowDirection) {
  if (columns.kind === "equal") validateExtensions(sectionChildren(section, "cols"), columnManaged);
  if (direction !== "preserved") validateExtensions(sectionChildren(section, "bidi"), directionManaged);
}
/** Command preflight against the untouched native section source. */
export function validateSectionColumnExtensions(raw: string | undefined, columns: SectionColumns, direction: SectionFlowDirection): void {
  if (!raw) return;
  const xml = new DOMParser().parseFromString(raw, "application/xml"), root = xml.documentElement;
  if (xml.getElementsByTagName("parsererror").length || root.namespaceURI !== W || root.localName !== "sectPr") throw new SectionColumnExtensionConflict();
  validateSectionExtensions(root, columns, direction);
}
/** Move extension attributes and children before removing redundant managed elements. */
function coalesceExtensions(elements: readonly Element[], managed: ReadonlySet<string>, dropColumnChildren: boolean): Element {
  const [first, ...duplicates] = elements;
  for (const duplicate of duplicates) {
    for (const attribute of Array.from(duplicate.attributes)) {
      if (attribute.namespaceURI === XMLNS) {
        const prefix = attribute.localName === "xmlns" ? null : attribute.localName;
        if (first.lookupNamespaceURI(prefix) === null) first.setAttributeNS(XMLNS, attribute.name, attribute.value);
        continue;
      }
      if (isManagedAttribute(attribute, managed) || first.hasAttributeNS(attribute.namespaceURI, attribute.localName)) continue;
      if (attribute.namespaceURI) first.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
      else first.setAttribute(attribute.name, attribute.value);
    }
    for (const child of Array.from(duplicate.childNodes)) {
      if (dropColumnChildren && child.nodeType === 1 && (child as Element).namespaceURI === W && (child as Element).localName === "col") continue;
      first.appendChild(child);
    }
    duplicate.remove();
  }
  return first;
}
const attr = (element: Element, name: string) => element.getAttributeNS(W, name);
const bool = (value: string | null, absent: boolean): boolean | null => value === null ? absent : ["1", "true", "on"].includes(value) ? true : ["0", "false", "off"].includes(value) ? false : null;
export function validSectionColumns(value: SectionColumns, page: ColumnPage): boolean {
  if (!value || typeof value !== "object") return false;
  if (value.kind === "preserved") return ["unequal", "unsupported-count", "invalid-native"].includes(value.reason);
  return value.kind === "equal" && [1, 2, 3].includes(value.count) && Number.isSafeInteger(value.space) && value.space >= 0 && typeof value.separator === "boolean"
    && (page.width - page.margins.left - page.margins.right - (value.count - 1) * value.space) / value.count >= 720;
}
export function parseSectionColumns(raw: string | undefined, page: ColumnPage): { columns: SectionColumns; flowDirection: SectionFlowDirection } {
  const fallback: SectionColumns = { kind: "equal", count: 1, space: 720, separator: false };
  if (!raw) return { columns: fallback, flowDirection: "ltr" };
  const doc = new DOMParser().parseFromString(raw, "application/xml");
  const root = doc.documentElement.localName === "sectPr" ? doc.documentElement : doc.getElementsByTagNameNS(W, "sectPr")[0];
  if (!root || doc.getElementsByTagName("parsererror").length) return { columns: { kind: "preserved", reason: "invalid-native" }, flowDirection: "preserved" };
  const children = Array.from(root.children).filter(el => el.namespaceURI === W);
  const cols = children.filter(el => el.localName === "cols"), bidi = children.filter(el => el.localName === "bidi");
  const b = bidi.length > 1 ? null : bidi.length ? bool(attr(bidi[0], "val"), true) : false;
  const flowDirection = b === null ? "preserved" : b ? "rtl" : "ltr";
  if (!cols.length) return { columns: fallback, flowDirection };
  if (cols.length !== 1) return { columns: { kind: "preserved", reason: "invalid-native" }, flowDirection };
  const el = cols[0], num = attr(el, "num"), gap = attr(el, "space"), equal = bool(attr(el, "equalWidth"), true), separator = bool(attr(el, "sep"), false);
  const integer = (s: string | null, defaultValue: number) => s === null ? defaultValue : /^\d+$/.test(s) ? Number(s) : NaN;
  const count = integer(num, 1), space = integer(gap, 720);
  let columns: SectionColumns;
  if (equal === null || separator === null || !Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(space) || space < 0) columns = { kind: "preserved", reason: "invalid-native" };
  else if (!equal || Array.from(el.children).some(child => child.namespaceURI === W && child.localName === "col")) columns = { kind: "preserved", reason: "unequal" };
  else if (![1, 2, 3].includes(count)) columns = { kind: "preserved", reason: "unsupported-count" };
  else { const candidate: SectionColumns = { kind: "equal", count: count as 1 | 2 | 3, space, separator }; columns = validSectionColumns(candidate, page) ? candidate : { kind: "preserved", reason: "invalid-native" }; }
  return { columns, flowDirection };
}
export function writeSectionColumns(section: Element, columns: SectionColumns, direction: SectionFlowDirection): void {
  const doc = section.ownerDocument;
  const cols = sectionChildren(section, "cols"), bidi = sectionChildren(section, "bidi");
  validateSectionExtensions(section, columns, direction);
  if (columns.kind === "equal") {
    let el = cols.length ? coalesceExtensions(cols, columnManaged, true) : undefined;
    if (!el) { el = doc.createElementNS(W, "w:cols"); section.appendChild(el); }
    for (const child of Array.from(el.children)) if (child.namespaceURI === W && child.localName === "col") child.remove();
    for (const [key, value] of Object.entries({ num: columns.count, space: columns.space, sep: columns.separator ? 1 : 0, equalWidth: 1 })) el.setAttributeNS(W, `w:${key}`, String(value));
  }
  if (direction !== "preserved") {
    let el = bidi.length ? coalesceExtensions(bidi, directionManaged, false) : undefined;
    if (!el && direction === "rtl") { el = doc.createElementNS(W, "w:bidi"); section.appendChild(el); }
    if (el) {
      el.setAttributeNS(W, "w:val", direction === "rtl" ? "1" : "0");
    }
  }
}
