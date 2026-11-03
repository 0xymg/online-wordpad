import { Selection, TextSelection, type EditorState, type Transaction } from "prosemirror-state";
import { closeHistory } from "prosemirror-history";
import { documentSections, type DocumentSection } from "./document-sections";
import { allocateDocumentIdentity } from "./document-identity";
import { getDocumentModel, migrateDocumentNode, projectDocumentModel, sectionRecordXml, validSectionPage,
  inheritRemovedSection,
  type DocumentModel, type SectionPage, type SectionRecordV1 } from "./document-model";

export class SectionCommandError extends Error {
  constructor(public code: "unsupported-cursor" | "invalid-geometry" | "missing-section" | "no-boundary" | "invalid-selection" | "unsupported-model", message: string) { super(message); this.name = "SectionCommandError"; }
}
export function activeDocumentSection(state: EditorState): DocumentSection & { index: number } {
  const sections = documentSections(state.doc), position = state.selection.from;
  const index = Math.max(0, sections.findIndex((section, i) => position >= section.from && (position < section.to || i === sections.length - 1)));
  return { ...sections[index], index };
}
function command(state: EditorState): { tr: Transaction; model: DocumentModel } {
  let doc;
  try { doc = migrateDocumentNode(state.doc); } catch { throw new SectionCommandError("unsupported-model", "The document model cannot be edited safely"); }
  const model = getDocumentModel(doc)!;
  const tr = closeHistory(state.tr).setMeta("edtr-section-command", true);
  if (doc !== state.doc) {
    doc.forEach((node, pos) => { if (JSON.stringify(node.attrs) !== JSON.stringify(state.doc.nodeAt(pos)?.attrs)) tr.setNodeMarkup(pos, undefined, node.attrs); });
    tr.setDocAttribute("documentModel", model);
    tr.setSelection(Selection.fromJSON(tr.doc, state.selection.toJSON()));
  }
  return { tr, model };
}
function newFollowingSection(previous: SectionRecordV1, start: "nextPage" | "continuous"): SectionRecordV1 {
  const raw = new DOMParser().parseFromString(sectionRecordXml(previous), "application/xml");
  for (const el of Array.from(raw.documentElement.children)) if (["headerReference", "footerReference"].includes(el.localName)) el.remove();
  const running: SectionRecordV1["running"] = {};
  for (const variant of ["default", "first", "even"]) for (const kind of ["header", "footer"] as const) {
    const prior = previous.running[`${variant}:${kind}`];
    running[`${variant}:${kind}`] = { html: "<p></p>", linked: true, distance: prior?.distance ?? (Number(raw.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "pgMar")[0]?.getAttributeNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", kind)) || 720), height: 0 };
  }
  return { ...previous, page: { ...previous.page, margins: { ...previous.page.margins } }, start,
    numbering: { ...(previous.numbering.format ? { format: previous.numbering.format } : {}) }, rawProperties: new XMLSerializer().serializeToString(raw.documentElement), running };
}
/** Split a top-level paragraph/heading. A nonempty/nested selection is rejected intact. */
export function insertDocumentSection(state: EditorState, start: "nextPage" | "continuous"): Transaction {
  if (!state.selection.empty) throw new SectionCommandError("invalid-selection", "Place the cursor without selecting text");
  const $pos = state.selection.$from;
  if ($pos.depth !== 1 || !["paragraph", "heading"].includes($pos.parent.type.name)) throw new SectionCommandError("unsupported-cursor", "Section breaks currently require a top-level paragraph or heading");
  if (start !== "nextPage" && start !== "continuous") throw new SectionCommandError("unsupported-cursor", "Unsupported section start");
  const { tr, model } = command(state);
  const sections = documentSections(tr.doc), index = activeDocumentSection({ doc: tr.doc, selection: tr.selection } as EditorState).index;
  const currentId = sections[index].id, newId = allocateDocumentIdentity("section", new Set(Object.keys(model.sections)), () => crypto.randomUUID());
  const leftPos = $pos.before(1); tr.split(state.selection.from);
  // The old section's endpoint becomes the new right section's endpoint.
  tr.doc.forEach((node, pos) => { if (node.attrs.sectionEndId === currentId) tr.setNodeMarkup(pos, undefined, { ...node.attrs, sectionEndId: newId }); });
  const left = tr.doc.nodeAt(leftPos)!; tr.setNodeMarkup(leftPos, undefined, { ...left.attrs, sectionEndId: currentId });
  const next: DocumentModel = { ...model, sections: { ...model.sections, [newId]: newFollowingSection(model.sections[currentId], start) },
    finalSectionId: model.finalSectionId === currentId ? newId : model.finalSectionId };
  projectDocumentModel(tr, next);
  tr.setSelection(TextSelection.create(tr.doc, leftPos + tr.doc.nodeAt(leftPos)!.nodeSize + 1));
  return tr.scrollIntoView();
}
/** sectionId identifies the section whose END boundary is removed. */
export function removeDocumentSectionBoundary(state: EditorState, sectionId: string, policy: "keepBefore" | "keepAfter"): Transaction {
  const { tr, model } = command(state), sections = documentSections(tr.doc), index = sections.findIndex(section => section.id === sectionId);
  if (index < 0) throw new SectionCommandError("missing-section", "The section no longer exists");
  if (index === sections.length - 1) throw new SectionCommandError("no-boundary", "The final section has no following boundary");
  if (policy !== "keepBefore" && policy !== "keepAfter") throw new SectionCommandError("unsupported-model", "Choose the section formatting to retain");
  const followingId = sections[index + 1].id, keepId = policy === "keepBefore" ? sectionId : followingId, removeId = policy === "keepBefore" ? followingId : sectionId;
  const records = { ...model.sections }; delete records[removeId];
  // Removing preceding content must not make the surviving independent/linked
  // header accidentally resolve against a different index. Keep-after retains
  // effective preceding headers for slots that inherited through the deleted ID.
  if (policy === "keepAfter") {
    records[followingId] = inheritRemovedSection(model.sections[sectionId], records[followingId]);
  }
  tr.doc.forEach((node, pos) => {
    if (node.attrs.sectionEndId === sectionId) tr.setNodeMarkup(pos, undefined, { ...node.attrs, sectionEndId: null });
    else if (node.attrs.sectionEndId === followingId && keepId === sectionId) tr.setNodeMarkup(pos, undefined, { ...node.attrs, sectionEndId: keepId });
  });
  const next: DocumentModel = { ...model, sections: records, finalSectionId: model.finalSectionId === followingId ? keepId as DocumentModel["finalSectionId"] : model.finalSectionId };
  return projectDocumentModel(tr, next).scrollIntoView();
}
export function setSectionGeometry(state: EditorState, patch: Partial<SectionPage>, scope: "section" | "all", sectionId?: string): Transaction {
  const { tr, model } = command(state), currentId = sectionId || activeDocumentSection({ doc: tr.doc, selection: tr.selection } as EditorState).id;
  if (!Object.hasOwn(model.sections, currentId)) throw new SectionCommandError("missing-section", "The section no longer exists");
  if (scope !== "section" && scope !== "all") throw new SectionCommandError("unsupported-model", "Unsupported section scope");
  const sections = { ...model.sections };
  for (const [id, record] of Object.entries(sections)) if (scope === "all" || id === currentId) {
    const page = { ...record.page, ...patch, margins: { ...(patch.margins || record.page.margins) } };
    if (!validSectionPage(page)) throw new SectionCommandError("invalid-geometry", "Page dimensions and margins must leave at least 720 twips of content");
    sections[id] = { ...record, page };
  }
  return projectDocumentModel(tr, { ...model, sections });
}
