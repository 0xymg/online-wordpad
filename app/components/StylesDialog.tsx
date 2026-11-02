"use client";
import { useState } from "react";
import type { EditorView } from "prosemirror-view";
import { documentStyles,resolveStyle,saveDocumentStyle,applyDocumentStyle,removeDocumentStyle,selectedParagraphs,textFormat,BUILTIN_STYLES } from "@/lib/document-styles";
import { effectiveParagraph,type DocumentStyle,type ParagraphFormat,type StyleText } from "@/lib/paragraph-format";
import { DEFAULT_DOCUMENT_FONT_CSS, primaryDocumentFont } from "@/lib/document-font";
import { ensureEditorFont } from "@/lib/editor-fonts";
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "./I18nProvider";
import ParagraphFields from "./ParagraphFields";
const FAMILIES=[DEFAULT_DOCUMENT_FONT_CSS,"Arial, sans-serif","'Times New Roman', serif","'Courier New', monospace","Georgia, serif","Verdana, sans-serif","'Inter', sans-serif","'Roboto', sans-serif","'Open Sans', sans-serif"];
export default function StylesDialog({view,onClose}:{view:EditorView;onClose:()=>void}){
 const t=useT(),s=t.styles;
 const [styles,setStyles]=useState(()=>documentStyles(view.state.doc.attrs.layout));
 const [id,setId]=useState(()=>view.state.selection.$from.parent.attrs.styleId||"Normal");
 const [draft,setDraft]=useState<DocumentStyle>(()=>styles[id]||styles.Normal),[creating,setCreating]=useState(false),[error,setError]=useState("");
 const current=resolveStyle({...styles,[id]:draft},id),field="h-9 w-full border border-input bg-background px-2 text-sm";
 const knownFamily=FAMILIES.find(f=>primaryDocumentFont(f).toLowerCase()===primaryDocumentFont(current.text.family).toLowerCase());
 const text=(patch:Partial<StyleText>)=>setDraft(v=>({...v,text:{...v.text,...patch}}));
 const paragraph=(patch:ParagraphFormat)=>setDraft(v=>({...v,paragraph:{...v.paragraph,...patch}}));
 const select=(key:string)=>{setId(key);setDraft(styles[key]);setCreating(false);setError("");};
 function create(){const next=`edtrStyle${crypto.randomUUID().replaceAll("-","")}`;const node=selectedParagraphs(view.state)[0]?.node,base=node?.attrs.styleId||"Normal",resolved=resolveStyle(styles,base),p=node?effectiveParagraph(node):{},actual=textFormat(view.state.storedMarks||view.state.selection.$from.marks());
  const changedParagraph=Object.fromEntries(Object.entries(p).filter(([key,value])=>value!==resolved.paragraph[key as keyof ParagraphFormat]));
  const changedText=Object.fromEntries(Object.entries(actual).filter(([key,value])=>value!==resolved.text[key as keyof StyleText]));
  setId(next);setDraft({name:"",basedOn:base,paragraph:changedParagraph,text:changedText});setCreating(true);setError("");
 }
 function save(){
  if(!draft.name.trim()){setError(s.nameRequired);return;}
  if(Object.entries(styles).some(([key,value])=>key!==id&&value.name.toLowerCase()===draft.name.trim().toLowerCase())){setError(s.duplicate);return;}
  let parent=draft.basedOn;const seen=new Set([id]);while(parent){if(seen.has(parent)){setError(s.cycle);return;}seen.add(parent);parent=styles[parent]?.basedOn;}
  ensureEditorFont(current.text.family);
  view.dispatch(saveDocumentStyle(view.state,id,{...draft,name:draft.name.trim()},creating));onClose();view.focus();
 }
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl" onCloseAutoFocus={e=>{e.preventDefault();view.focus();}}>
  <form onSubmit={e=>{e.preventDefault();save();}} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&["s","o","p"].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation();}}}>
   <DialogHeader><DialogTitle>{s.title}</DialogTitle><DialogDescription>{s.description}</DialogDescription></DialogHeader>
   <div className="my-4 flex gap-2"><select aria-label={s.choose} className={field} value={creating?"":id} onChange={e=>select(e.target.value)}><option value="" disabled>{s.newStyle}</option>{Object.entries(styles).map(([key,style])=><option key={key} value={key}>{style.name}</option>)}</select><Button type="button" variant="outline" onClick={create}>{s.newStyle}</Button></div>
   <div className="grid gap-6 sm:grid-cols-2">
    <div className="space-y-3">
     <label className="block space-y-1 text-sm">{s.name}<input aria-label={s.name} required maxLength={80} className={field} value={draft.name} onChange={e=>setDraft(v=>({...v,name:e.target.value}))}/></label>
     <label className="block space-y-1 text-sm">{s.basedOn}<select aria-label={s.basedOn} className={field} value={draft.basedOn||""} onChange={e=>setDraft(v=>({...v,basedOn:e.target.value||undefined}))}><option value="">{s.none}</option>{Object.entries(styles).filter(([key])=>key!==id).map(([key,style])=><option value={key} key={key}>{style.name}</option>)}</select></label>
     <label className="block space-y-1 text-sm">{s.level}<select aria-label={s.level} className={field} value={current.level||0} onChange={e=>setDraft(v=>({...v,level:Number(e.target.value)}))}><option value={0}>{s.body}</option>{[1,2,3,4,5,6].map(level=><option value={level} key={level}>{t.toolbar.heading(level)}</option>)}</select></label>
     <label className="block space-y-1 text-sm">{t.toolbar.fontFamily}<select aria-label={t.toolbar.fontFamily} className={field} value={knownFamily||current.text.family} onChange={e=>text({family:e.target.value})}>{!knownFamily&&<option value={current.text.family}>{primaryDocumentFont(current.text.family)}</option>}{FAMILIES.map(f=><option value={f} key={f}>{primaryDocumentFont(f)}</option>)}</select></label>
     <div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-sm">{t.toolbar.fontSize}<input aria-label={t.toolbar.fontSize} className={field} type="number" min={6} max={1638} step={0.5} value={current.text.size} onChange={e=>text({size:Number(e.target.value)})}/></label><label className="space-y-1 text-sm">{t.format.textColor}<input aria-label={t.format.textColor} className={field} type="color" value={current.text.color} onChange={e=>text({color:e.target.value})}/></label></div>
     <div className="flex flex-wrap gap-3 text-xs">{([['bold',t.format.bold],['italic',t.format.italic],['underline',t.format.underline]]as const).map(([key,label])=><label className="flex items-center gap-2" key={key}><input type="checkbox" aria-label={label} checked={current.text[key]} onChange={e=>text({[key]:e.target.checked})}/>{label}</label>)}</div>
     <div className="overflow-hidden border border-border p-4" aria-label={s.preview}><p style={{fontFamily:current.text.family,fontSize:Math.min(current.text.size,32),fontWeight:current.text.bold?700:400,fontStyle:current.text.italic?'italic':'normal',textDecoration:current.text.underline?'underline':'none',color:current.text.color,textAlign:current.paragraph.alignment,lineHeight:1.4}}>{draft.name||s.preview}</p><p className="mt-3 text-xs text-muted-foreground">{s.previewHint}</p></div>
    </div>
    <ParagraphFields values={current.paragraph} onChange={paragraph}/>
   </div>
   {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
   <DialogFooter className="mt-5 flex-wrap"><Button type="button" variant="outline" onClick={onClose}>{t.paragraph.cancel}</Button>{!creating&&<Button type="button" variant="outline" disabled={Object.hasOwn(BUILTIN_STYLES,id)} onClick={()=>{view.dispatch(removeDocumentStyle(view.state,id));const next=documentStyles(view.state.doc.attrs.layout);setStyles(next);setId('Normal');setDraft(next.Normal);setCreating(false);}}>{s.delete}</Button>}{!creating&&<Button type="button" variant="outline" onClick={()=>{ensureEditorFont(current.text.family);view.dispatch(applyDocumentStyle(view.state,id));onClose();view.focus();}}>{s.apply}</Button>}<Button type="submit">{creating?s.createApply:s.save}</Button></DialogFooter>
  </form>
 </DialogContent></Dialog>;
}
