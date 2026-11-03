"use client";
import { useMemo, useState } from "react";
import type { EditorView } from "prosemirror-view";
import { applyTabChanges, readTabStops, type TabOperation, type TabStopSnapshot } from "@/lib/tab-commands";
import type { TabStop } from "@/lib/tab-stops";
import { tabLabels } from "@/lib/tab-i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLocale } from "./I18nProvider";

const cm = (n:number) => (n * 2.54 / 1440).toFixed(2);
const parseCm = (text:string, original?:number) => original !== undefined && text === cm(original) ? original : text.trim() ? Math.round(Number(text) * 1440 / 2.54) : NaN;
export type TabsDraft = { snapshot:TabStopSnapshot; preview:(operations:TabOperation[])=>TabStopSnapshot; onApply:(operations:TabOperation[])=>void };
export default function TabsDialog({view,onClose,styleId,draft,allowDocumentSettings=true}:{view:EditorView;onClose:()=>void;styleId?:string;draft?:TabsDraft;allowDocumentSettings?:boolean}) {
 const {locale}=useLocale(),t=tabLabels(locale);
 const [initial]=useState(()=>({state:view.state,snapshot:draft?.snapshot||readTabStops(view.state,styleId?{kind:"style",styleId}:{kind:"selection"})}));
 const [operations,setOperations]=useState<TabOperation[]>([]),[selected,setSelected]=useState<number|null>(null);
 const [position,setPosition]=useState(""),[alignment,setAlignment]=useState<Exclude<TabStop["alignment"],"clear">>("left"),[leader,setLeader]=useState<TabStop["leader"]>("none");
 const [interval,setInterval]=useState(cm(initial.snapshot.defaultTabStop)),[separator,setSeparator]=useState(initial.snapshot.decimalSeparator),[error,setError]=useState("");
 const snapshot=useMemo(()=>{
  if(!operations.length)return initial.snapshot;
  if(draft)return draft.preview(operations);
  try{return readTabStops(initial.state.apply(applyTabChanges(initial.state,{operations},styleId?{kind:"style",styleId}:{kind:"selection"})),styleId?{kind:"style",styleId}:{kind:"selection"});}
  catch{return initial.snapshot;}
 },[initial,operations,draft,styleId]);
 const field="h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
 const labels={left:t.left,center:t.center,right:t.right,decimal:t.decimal,clear:t.cleared},leaders={none:t.none,dot:t.dot,dash:t.dash};
 const readOnly=!draft&&(view.isDestroyed||!view.editable);
 const canDocumentSettings=!draft&&allowDocumentSettings;
 const changed=operations.length>0||(canDocumentSettings&&(interval!==cm(initial.snapshot.defaultTabStop)||separator!==initial.snapshot.decimalSeparator));
 function addOperation(operation:TabOperation){setOperations(previous=>[...previous,operation]);setError("");}
 function setStop(){const value=parseCm(position,selected??undefined);if(!Number.isFinite(value)||value< -31680||value>31680){setError(t.invalid);return;}addOperation({type:"upsert",stop:{position:value,alignment,leader}});setSelected(value);setPosition(cm(value));}
 function apply(){
  if(!draft&&!view.editable){setError(t.readOnly);return;}
  if(view.isDestroyed||view.state.doc!==initial.state.doc){setError(t.changed);return;}
  const defaultTabStop=parseCm(interval,initial.snapshot.defaultTabStop);if(canDocumentSettings&&(!Number.isFinite(defaultTabStop)||defaultTabStop<=0||defaultTabStop>31680)){setError(t.invalid);return;}
  try{if(draft)draft.onApply(operations);else{const documentSettings=canDocumentSettings&&(defaultTabStop!==initial.snapshot.defaultTabStop||separator!==initial.snapshot.decimalSeparator)?{defaultTabStop,decimalSeparator:separator}:undefined;const tr=applyTabChanges(initial.state,{operations,documentSettings},styleId?{kind:"style",styleId}:{kind:"selection"});if(tr.docChanged)view.dispatch(tr);}onClose();if(!draft)view.focus();}
  catch{setError(t.failed);}
 }
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" onCloseAutoFocus={e=>{if(!draft){e.preventDefault();if(!view.isDestroyed)view.focus();}}}>
  <form onSubmit={e=>{e.preventDefault();e.stopPropagation();apply();}} onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&["s","o","p"].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation();}}}>
   <DialogHeader><DialogTitle>{t.title}</DialogTitle><DialogDescription>{t.description}</DialogDescription></DialogHeader>
   {readOnly&&<p role="status" className="mt-3 text-sm text-muted-foreground">{t.readOnly}</p>}
   <fieldset disabled={readOnly} className="min-w-0">
   <p className="mt-3 text-sm text-muted-foreground">{styleId?t.style:t.selection}{!styleId&&` (${initial.snapshot.paragraphCount})`}</p>
   {snapshot.mixed&&<p role="status" className="mt-2 rounded border border-border p-2 text-sm">{t.mixed}</p>}
   <div className="mt-3 max-h-44 overflow-y-auto rounded-md border border-border p-1" aria-label={t.title}>
    {!snapshot.rows.length&&<p className="p-3 text-sm text-muted-foreground">{t.empty}</p>}
    {snapshot.rows.map(row=><button type="button" key={row.position} aria-pressed={selected===row.position} className="flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-start text-sm hover:bg-accent aria-pressed:bg-accent" onClick={()=>{setSelected(row.position);setPosition(cm(row.position));if(row.stop&&row.stop.alignment!=="clear"){setAlignment(row.stop.alignment);setLeader(row.stop.leader);}setError("");}}><span dir="ltr">{cm(row.position)} cm</span><span>{row.mixed?t.mixedValue:row.stop?labels[row.stop.alignment]:t.mixedValue}</span><span className="text-xs text-muted-foreground">{row.source==="mixed"?t.mixedValue:row.source==="inherited"?t.inherited:t.direct}</span></button>)}
   </div>
   <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
    <label className="space-y-1 text-sm">{t.position}<input aria-label={t.position} type="number" min="-55.88" max="55.88" step="0.01" className={field} value={position} onChange={e=>setPosition(e.target.value)}/></label>
    <label className="space-y-1 text-sm">{t.alignment}<select aria-label={t.alignment} className={field} value={alignment} onChange={e=>setAlignment(e.target.value as typeof alignment)}>{(["left","center","right","decimal"] as const).map(value=><option key={value} value={value}>{labels[value]}</option>)}</select></label>
    <label className="space-y-1 text-sm">{t.leader}<select aria-label={t.leader} className={field} value={leader} onChange={e=>setLeader(e.target.value as typeof leader)}>{(["none","dot","dash"] as const).map(value=><option key={value} value={value}>{leaders[value]}</option>)}</select></label>
   </div>
   <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={setStop}>{t.set}</Button><Button type="button" variant="outline" disabled={selected===null} onClick={()=>{if(selected!==null)addOperation({type:"remove",position:selected});}}>{t.remove}</Button><Button type="button" variant="outline" onClick={()=>{addOperation({type:"clear"});setSelected(null);}}>{t.clear}</Button><Button type="button" variant="outline" onClick={()=>{addOperation({type:"reset"});setSelected(null);}}>{t.reset}</Button></div>
   <p className="mt-2 text-xs text-muted-foreground">{t.inheritedHelp}</p>
   {initial.snapshot.unsupportedCount>0&&<p role="status" className="mt-3 text-sm text-muted-foreground">{t.unsupported}</p>}
   {canDocumentSettings&&<fieldset className="my-5 border-t border-border pt-3"><legend className="px-1 text-sm font-medium">{t.documentSettings}</legend><div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-sm">{t.defaultInterval}<input aria-label={t.defaultInterval} type="number" min="0.01" max="55.88" step="0.01" className={field} value={interval} onChange={e=>setInterval(e.target.value)}/></label><label className="space-y-1 text-sm">{t.separator}<select aria-label={t.separator} className={field} value={separator} onChange={e=>setSeparator(e.target.value as typeof separator)}><option value=".">{t.dotSeparator}</option><option value=",">{t.commaSeparator}</option><option value="٫">{t.arabicSeparator}</option></select></label></div><p className="mt-2 text-xs text-muted-foreground">{t.settingsHint}</p></fieldset>}
   </fieldset>
   {error&&<p role="alert" className="my-3 text-sm text-destructive">{error}</p>}
   <DialogFooter className="mt-4"><Button type="button" variant="outline" onClick={onClose}>{t.cancel}</Button><Button type="submit" disabled={!changed||readOnly}>{t.apply}</Button></DialogFooter>
  </form>
 </DialogContent></Dialog>;
}
