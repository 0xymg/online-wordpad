"use client";
import { useState } from "react";
import type { EditorView } from "prosemirror-view";
import { DEFAULT_PARAGRAPH,effectiveParagraph,type ParagraphFormat } from "@/lib/paragraph-format";
import { alignParagraphImages } from "@/lib/editor-commands";
import { selectedParagraphs,formatParagraphs } from "@/lib/document-styles";
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "./I18nProvider";
import ParagraphFields from "./ParagraphFields";
export default function ParagraphDialog({view,onClose}:{view:EditorView;onClose:()=>void}){
 const t=useT().paragraph;
 const [original]=useState(view.state.doc);
 const [values,setValues]=useState<ParagraphFormat>(()=>{const items=selectedParagraphs(view.state).map(({node})=>({...DEFAULT_PARAGRAPH,...effectiveParagraph(node)}));const shared:Record<string,unknown>={...items[0]};for(const key of Object.keys(shared))if(items.some(item=>item[key as keyof ParagraphFormat]!==shared[key]))delete shared[key];return shared as ParagraphFormat;});
 const [changes,setChanges]=useState<ParagraphFormat>({}),[error,setError]=useState("");
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" onCloseAutoFocus={e=>{e.preventDefault();view.focus();}}>
  <form onSubmit={e=>{e.preventDefault();if(view.isDestroyed||view.state.doc!==original){setError(t.changed);return;}const tr=formatParagraphs(view.state,changes);if(changes.alignment&&changes.alignment!=="justify")for(const {pos} of selectedParagraphs(view.state))alignParagraphImages(tr,pos,changes.alignment);if(tr.docChanged)view.dispatch(tr);onClose();view.focus();}} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&["s","o","p"].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation();}}}>
   <DialogHeader><DialogTitle>{t.title}</DialogTitle><DialogDescription>{t.description}</DialogDescription></DialogHeader>
   <div className="my-5"><ParagraphFields values={values} onChange={patch=>{setValues(v=>({...v,...patch}));setChanges(v=>({...v,...patch}));}}/></div>
   {error&&<p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
   <DialogFooter><Button type="button" variant="outline" onClick={onClose}>{t.cancel}</Button><Button type="submit" disabled={!Object.keys(changes).length}>{t.apply}</Button></DialogFooter>
  </form>
 </DialogContent></Dialog>;
}
