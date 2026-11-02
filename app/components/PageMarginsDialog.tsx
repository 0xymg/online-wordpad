"use client";
import { useState } from "react";
import type { EditorView } from "prosemirror-view";
import { activeSection,requestedMargins,MARGIN_PRESETS,marginPreset,setPageMargins,type PageMargins } from "@/lib/page-margins";
import { documentSections } from "@/lib/document-sections";
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "./I18nProvider";
export default function PageMarginsDialog({view,onClose}:{view:EditorView;onClose:()=>void}){
 const t=useT(),m=t.margins;
 const [original]=useState(view.state.doc),[sections]=useState(()=>documentSections(view.state.doc)),[section]=useState(()=>activeSection(view.state));
 const [margins,setMargins]=useState<PageMargins>(()=>requestedMargins(view.state.doc,section)),[scope,setScope]=useState<"section"|"all">(sections.length>1?"section":"all"),[error,setError]=useState("");
 const field="h-9 w-full border border-input bg-background px-2 text-sm",preset=marginPreset(margins),g=sections[section].geometry;
 function apply(){if(view.isDestroyed||view.state.doc!==original){setError(t.paragraph.changed);return;}
 const targets=scope==="all"?sections:[sections[section]];
 if(targets.some(({geometry:p})=>margins.left+margins.right>p.width-720||margins.top+margins.bottom>p.height-720)){setError(m.tooLarge);return;}
 view.dispatch(setPageMargins(view.state,margins,scope));onClose();view.focus();}
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="sm:max-w-xl" onCloseAutoFocus={e=>{e.preventDefault();view.focus();}}><form onSubmit={e=>{e.preventDefault();apply();}} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&["s","o","p"].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation();}}}>
  <DialogHeader><DialogTitle>{m.title}</DialogTitle><DialogDescription>{m.description}</DialogDescription></DialogHeader>
  <div className="my-5 grid gap-5 sm:grid-cols-[1fr_140px]">
   <div className="space-y-4"><label className="block space-y-1 text-sm">{m.preset}<select aria-label={m.preset} className={field} value={preset||"custom"} onChange={e=>{const p=MARGIN_PRESETS.find(p=>p.id===e.target.value);if(p)setMargins({...p.margins});}}><option value="custom">{m.custom}</option>{MARGIN_PRESETS.map(p=><option key={p.id} value={p.id}>{m[p.id]}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-3">{(["top","bottom","left","right"]as const).map(key=><label className="space-y-1 text-sm" key={key}>{m[key]}<input aria-label={m[key]} className={field} type="number" min={0} max={30} step={0.01} value={Math.round(margins[key]/1440*254)/100} onChange={e=>setMargins(v=>({...v,[key]:Math.round(Number(e.target.value)/2.54*1440)}))}/></label>)}</div>
    <label className="block space-y-1 text-sm">{m.applyTo}<select aria-label={m.applyTo} className={field} value={scope} onChange={e=>setScope(e.target.value as "section"|"all")}><option value="all">{m.whole}</option><option value="section">{m.section} {section+1}</option></select></label>
   </div>
   <div className="self-center"><div aria-label={m.preview} className="mx-auto border border-border bg-muted" style={{width:140,height:140*g.height/g.width,padding:`${140*margins.top/g.width}px ${140*margins.right/g.width}px ${140*margins.bottom/g.width}px ${140*margins.left/g.width}px`}}><div className="h-full border border-border bg-background p-1.5">{[0,1,2,3,4].map(i=><div key={i} className="mb-2 h-px bg-muted-foreground/40"/>)}</div></div><p className="mt-2 text-center text-xs text-muted-foreground">{m.preview}</p></div>
  </div>
  {error&&<p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
  <DialogFooter><Button type="button" variant="outline" onClick={onClose}>{t.paragraph.cancel}</Button><Button type="submit">{t.paragraph.apply}</Button></DialogFooter>
 </form></DialogContent></Dialog>;
}
