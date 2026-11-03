/** Async local bibliography formatting, guarded against stale documents and IME. */
import { markReferenceDerivedDocument } from "./reference-layout";
import { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { collectCitationIndex, projectBibliography, unprojectBibliography } from "./document-bibliography";
import { projectEndnotes, unprojectEndnotes } from "./document-notes";
import { getDocumentModel, projectDocumentModel } from "./document-model";
import type { BibliographySnapshot, BibliographySnapshotInput } from "./bibliography-format";
const pending = new WeakMap<EditorView, Promise<void>>();
const completed = new WeakMap<EditorView, {key:string;snapshot:BibliographySnapshot;doc:EditorView["state"]["doc"]}>();
export const BIBLIOGRAPHY_LAYOUT_STATUS_EVENT = "edtr-bibliography-layout-status";
const generations = new WeakMap<EditorView, object>();
function inputFor(view: EditorView): BibliographySnapshotInput | null {
 const model = getDocumentModel(view.state.doc); if (!model) return null;
 const index = collectCitationIndex(view.state.doc);
 if (index.diagnostics.length) throw new Error(index.diagnostics[0].message);
 if (!index.citations.length && !index.markers.length) return null;
 return {sources:model.sources,configuration:model.bibliography,orderedClusters:index.citations.map(c=>({fieldId:c.fieldId,items:c.attrs.items,mode:c.attrs.mode}))};
}
function report(view:EditorView,error:unknown) {if(error)view.dom.dataset.bibliographyLayoutError=error instanceof Error?error.message:String(error);else delete view.dom.dataset.bibliographyLayoutError;view.dom.dispatchEvent(new CustomEvent(BIBLIOGRAPHY_LAYOUT_STATUS_EVENT,{bubbles:true,detail:{error:error ? (error instanceof Error?error.message:String(error)):null}}));}
async function waitForComposition(view:EditorView):Promise<void> {
 if (!view.composing) return;
 await new Promise<void>((resolve,reject)=>{
  const started=Date.now();const finish=()=>{clearInterval(timer);view.dom.removeEventListener("compositionend",finish);resolve();};
  const timer=setInterval(()=>{if(view.isDestroyed||Date.now()-started>30000){clearInterval(timer);view.dom.removeEventListener("compositionend",finish);reject(new Error("Bibliography composition did not finish"));}else if(!view.composing)finish();},100);
  view.dom.addEventListener("compositionend",finish,{once:true});
 });
}
/** Measure the widest actual IEEE label in the marker's current font. CSS pixels
 * convert to twips at 15 per pixel; half an em gives the label room to breathe. */
function secondFieldOffsetTwips(view: EditorView, snapshot: BibliographySnapshot): number | undefined {
 const entries = snapshot.entrySecondFields; if (!entries?.length) return undefined;
 const marker = collectCitationIndex(view.state.doc).markers[0], element = marker ? view.nodeDOM(marker.pos) : view.dom;
 if (!(element instanceof HTMLElement)) return undefined;
 const style = getComputedStyle(element), canvas = element.ownerDocument.createElement("canvas"), context = canvas.getContext("2d"); if (!context) return undefined;
 context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
 const width = Math.max(...entries.map(entry => context.measureText(entry.label.map(run => run.text).join("")).width));
 const fontSize = Number.parseFloat(style.fontSize) || 16;
 return Number.isFinite(width) ? Math.ceil((width + fontSize * 0.5) * 15) : undefined;
}
/** Export barrier: only applies results to the exact captured immutable document. */
export async function flushBibliographyLayout(view:EditorView):Promise<void> {
 const existing=pending.get(view);if(existing)return existing;
 const generation=generations.get(view);
 const operation=(async()=>{
  await waitForComposition(view);
  if(view.isDestroyed)throw new Error("Bibliography view was destroyed");
  if(generations.get(view)!==generation)throw new Error("Bibliography view was reconfigured");
  const doc=view.state.doc,input=inputFor(view);if(!input){completed.delete(view);report(view,null);return;}
  const key=JSON.stringify(input),cached=completed.get(view);if(cached?.key===key&&cached.doc===doc){report(view,null);return;}
  const snapshot=cached?.key===key?cached.snapshot:await (await import("./bibliography-format")).formatBibliographySnapshot(input);
  if(view.isDestroyed)throw new Error("Bibliography view was destroyed");
  if(generations.get(view)!==generation)throw new Error("Bibliography view was reconfigured");
  if(view.state.doc!==doc||view.composing)throw new Error("Document changed while formatting bibliography");
  const tr=view.state.tr;
  unprojectBibliography(tr);unprojectEndnotes(tr);projectBibliography(tr,snapshot,{secondFieldOffsetTwips:secondFieldOffsetTwips(view,snapshot)});projectEndnotes(tr);
  const model=getDocumentModel(tr.doc);if(model)projectDocumentModel(tr,model);
  if(tr.docChanged&&!tr.doc.eq(view.state.doc)){markReferenceDerivedDocument(tr.doc);view.dispatch(tr.setMeta("addToHistory",false).setMeta("bibliographyLayout",true));}
  if(generations.get(view)!==generation)throw new Error("Bibliography view was reconfigured");
  completed.set(view,{key,snapshot,doc:view.state.doc});
  report(view,null);
 })();
 pending.set(view,operation);
 try{await operation;}catch(error){if(!view.isDestroyed&&generations.get(view)===generation)report(view,error);throw error;}finally{if(pending.get(view)===operation)pending.delete(view);}
}
/** One pending formatter per view; subsequent user changes trigger a fresh snapshot. */
export function bibliographyLayoutPlugin():Plugin {
 return new Plugin({view(view){generations.set(view,{});let timer:ReturnType<typeof setTimeout>|undefined,disposed=false;
  const schedule=()=>{if(disposed||timer)return;timer=setTimeout(()=>{timer=undefined;if(disposed)return;const before=view.state.doc;let retry=false;void flushBibliographyLayout(view).catch(error=>{retry=error instanceof Error&&["Bibliography view was reconfigured","Document changed while formatting bibliography"].includes(error.message);}).finally(()=>{if(!disposed&&(retry||view.state.doc!==before))schedule();});},0);};
  schedule();return {update(updated,previous){if(updated.state.doc!==previous.doc)schedule();},destroy(){disposed=true;generations.set(view,{});if(timer)clearTimeout(timer);}};
 }});
}
