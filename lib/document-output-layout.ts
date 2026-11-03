/** All outputs settle canonical notes, references and physical pages together. */
import type { EditorView } from "prosemirror-view";
import { projectEndnotes, refreshNoteLabels, collectNoteIndex } from "./document-notes";
import { getDocumentModel, projectDocumentModel } from "./document-model";
import { flushReferenceLayout } from "./reference-layout";
import { flushDocumentLayout } from "@/app/components/paginationPlugin";

export async function flushDocumentOutputLayout(view: EditorView): Promise<void> {
  if (view.isDestroyed || !view.dom.isConnected) throw new Error("Document view is detached");
  // Reuse the composition wait and stale-document guard of the reference pass.
  if (view.composing) await flushReferenceLayout(view);
  const model = getDocumentModel(view.state.doc);
  if (model) {
    const tr = refreshNoteLabels(projectEndnotes(view.state.tr));
    projectDocumentModel(tr, getDocumentModel(tr.doc)!);
    if (tr.docChanged && !tr.doc.eq(view.state.doc)) view.dispatch(tr.setMeta("addToHistory", false));
  }
  await flushReferenceLayout(view);
  const snapshot = view.state.doc;
  await flushDocumentLayout(view);
  if (view.isDestroyed || view.state.doc !== snapshot) throw new Error("Document changed while preparing output");
  if (collectNoteIndex(snapshot).notes.some(note => note.kind === "footnote")) {
    const { footnoteLayoutComplete } = await import("./note-single-layout");
    if (view.state.doc !== snapshot || !footnoteLayoutComplete(view)) throw new Error("Page footnote output is not ready");
  }
}
