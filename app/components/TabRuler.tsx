"use client";
import { useEffect, useRef, useState } from "react";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { applyTabChanges, readTabStops, type TabOperation } from "@/lib/tab-commands";
import type { TabStop } from "@/lib/tab-stops";
import { tabContentGeometry } from "@/lib/tab-layout";
import { tabLabels } from "@/lib/tab-i18n";
import { useLocale } from "./I18nProvider";
type Geometry=NonNullable<ReturnType<typeof tabContentGeometry>>;
type Drag={state:EditorState;stop:TabStop;oldPosition:number|null;pointerId:number;position:number;remove:boolean;capture:HTMLElement};
const symbols={left:"└",center:"┴",right:"┘",decimal:"⊥"};
function paragraphPosition(state:EditorState):number|null{const {$head}=state.selection;for(let depth=$head.depth;depth>0;depth--)if(["paragraph","heading"].includes($head.node(depth).type.name))return $head.before(depth);return null;}
export default function TabRuler({view,tick,onOpenDialog}:{view:EditorView|null;tick:number;onOpenDialog:()=>void}){
 const {locale}=useLocale(),t=tabLabels(locale),track=useRef<HTMLDivElement>(null),drag=useRef<Drag|null>(null);
 const [geometry,setGeometry]=useState<Geometry|null>(null),[left,setLeft]=useState(0),[trackWidth,setTrackWidth]=useState(0),[preview,setPreview]=useState<{position:number;oldPosition:number|null;stop:TabStop;remove:boolean}|null>(null);
 const [alignment,setAlignment]=useState<Exclude<TabStop["alignment"],"clear">>("left"),[error,setError]=useState("");
 const readOnly=!view||view.isDestroyed||!view.editable;
 const snapshot=view&&!view.isDestroyed?readTabStops(view.state):null;
 const labels={left:t.left,center:t.center,right:t.right,decimal:t.decimal};
 useEffect(()=>{
  if(!view)return;let frame=0;
  const measure=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(view.isDestroyed||!track.current)return;const current=drag.current;if(current&&(!view.editable||view.state.doc!==current.state.doc||!view.state.selection.eq(current.state.selection))){drag.current=null;if(current.capture.hasPointerCapture(current.pointerId))current.capture.releasePointerCapture(current.pointerId);setPreview(null);}const pos=paragraphPosition(view.state),rect=track.current.getBoundingClientRect();setGeometry(pos===null?null:tabContentGeometry(view,pos));setLeft(rect.left);setTrackWidth(rect.width);});};
  measure();window.addEventListener("resize",measure);window.addEventListener("scroll",measure,true);const observer=new ResizeObserver(measure);if(track.current)observer.observe(track.current);observer.observe(view.dom);document.fonts?.addEventListener("loadingdone",measure);
  return()=>{cancelAnimationFrame(frame);window.removeEventListener("resize",measure);window.removeEventListener("scroll",measure,true);observer.disconnect();document.fonts?.removeEventListener("loadingdone",measure);};
 },[view,tick]);
 useEffect(()=>{
  if(!view)return;
  const cancel=()=>{const current=drag.current;drag.current=null;if(current?.capture.hasPointerCapture(current.pointerId))current.capture.releasePointerCapture(current.pointerId);setPreview(null);};
  const move=(e:PointerEvent)=>{const current=drag.current;if(!current||current.pointerId!==e.pointerId)return;if(view.isDestroyed||!view.editable||view.state.doc!==current.state.doc||!view.state.selection.eq(current.state.selection)){cancel();return;}const pos=paragraphPosition(current.state),g=pos===null?null:tabContentGeometry(view,pos),rect=track.current?.getBoundingClientRect();if(!g||!rect){cancel();return;}const sign=g.direction==="rtl"?-1:1;current.position=Math.max(0,Math.min(Math.floor(g.availableWidthTwips),Math.round((e.clientX-g.originClientX)*sign/g.cssPixelsPerTwip)));current.remove=e.clientY<rect.top-18||e.clientY>rect.bottom+18;setPreview({position:current.position,oldPosition:current.oldPosition,stop:current.stop,remove:current.remove});e.preventDefault();};
  const up=(e:PointerEvent)=>{const current=drag.current;if(!current||current.pointerId!==e.pointerId)return;move(e);if(!drag.current)return;const operations:TabOperation[]=[];if(current.oldPosition!==null&&(current.remove||current.position!==current.oldPosition))operations.push({type:"remove",position:current.oldPosition});if(!current.remove&&(current.oldPosition===null||current.position!==current.oldPosition))operations.push({type:"upsert",stop:{...current.stop,position:current.position}});cancel();if(!operations.length)return;try{if(view.isDestroyed||!view.editable||view.state.doc!==current.state.doc||!view.state.selection.eq(current.state.selection))return;const tr=applyTabChanges(current.state,{operations});if(tr.docChanged)view.dispatch(tr);view.focus();setError("");}catch{setError(t.failed);}};
  const key=(e:KeyboardEvent)=>{if(e.key==="Escape"&&drag.current){e.preventDefault();e.stopPropagation();cancel();}};
  const pointerCancel=(e:PointerEvent)=>{if(drag.current?.pointerId===e.pointerId)cancel();};
  window.addEventListener("pointermove",move,{passive:false});window.addEventListener("pointerup",up);window.addEventListener("pointercancel",pointerCancel);window.addEventListener("keydown",key,true);
  return()=>{cancel();window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);window.removeEventListener("pointercancel",pointerCancel);window.removeEventListener("keydown",key,true);};
 },[view,t.failed]);
 function start(e:React.PointerEvent<HTMLElement>,stop?:TabStop){
  if(!view||view.isDestroyed||!view.editable||!geometry||!e.isPrimary||e.button!==0)return;e.preventDefault();e.stopPropagation();const pos=paragraphPosition(view.state),g=pos===null?null:tabContentGeometry(view,pos);if(!g)return;
  const position=stop?.position??Math.max(0,Math.min(Math.floor(g.availableWidthTwips),Math.round((e.clientX-g.originClientX)*(g.direction==="rtl"?-1:1)/g.cssPixelsPerTwip)));
  e.currentTarget.setPointerCapture(e.pointerId);drag.current={state:view.state,stop:stop||{position,alignment,leader:"none"},oldPosition:stop?.position??null,pointerId:e.pointerId,position,remove:false,capture:e.currentTarget};setPreview({position,oldPosition:stop?.position??null,stop:stop||{position,alignment,leader:"none"},remove:false});setError("");
 }
 function keyboard(e:React.KeyboardEvent<HTMLButtonElement>,stop:TabStop){
  if(!view||view.isDestroyed||!view.editable||!geometry)return;let operations:TabOperation[]=[],nextPosition:number|null=null;
  if(e.key==="Delete"||e.key==="Backspace")operations=[{type:"remove",position:stop.position}];
  else if(e.key==="ArrowLeft"||e.key==="ArrowRight"){const direction=(e.key==="ArrowRight"?1:-1)*(geometry.direction==="rtl"?-1:1),position=Math.max(0,Math.min(Math.floor(geometry.availableWidthTwips),stop.position+direction*(e.shiftKey?144:20)));if(position===stop.position)return;nextPosition=position;operations=[{type:"remove",position:stop.position},{type:"upsert",stop:{...stop,position}}];}
  else if(e.key==="Enter"){e.preventDefault();onOpenDialog();return;}else return;
  e.preventDefault();e.stopPropagation();try{const tr=applyTabChanges(view.state,{operations});if(tr.docChanged)view.dispatch(tr);if(nextPosition!==null)requestAnimationFrame(()=>track.current?.querySelector<HTMLButtonElement>(`[data-tab-position="${nextPosition}"]`)?.focus({preventScroll:true}));setError("");}catch{setError(t.failed);}
 }
 const x=(position:number)=>geometry?geometry.originClientX-left+(geometry.direction==="rtl"?-1:1)*position*geometry.cssPixelsPerTwip:0;
 const stops=(snapshot?.stops||[]).filter(stop=>stop.alignment!=="clear");
 return <div className="border-b border-border bg-card" aria-label={t.ruler}>
  <div className="flex items-center gap-2 px-2 py-1 text-xs"><label className="flex items-center gap-2"><span className="sr-only">{t.addType}</span><select aria-label={t.addType} value={alignment} onChange={e=>setAlignment(e.target.value as typeof alignment)} className="h-7 max-w-40 rounded border border-input bg-background px-1" disabled={!geometry||readOnly}>{(["left","center","right","decimal"]as const).map(key=><option value={key} key={key}>{symbols[key]} {labels[key]}</option>)}</select></label><button type="button" disabled={readOnly} onClick={onOpenDialog} className="rounded px-2 py-1 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">{t.openDialog}</button><span className="hidden truncate text-muted-foreground lg:block">{geometry?t.rulerHint:t.unavailable}</span>{snapshot?.mixed&&<span className="text-muted-foreground">{t.mixedValue}</span>}</div>
  <div ref={track} data-tab-ruler-track className="relative h-8 touch-none overflow-hidden border-t border-border/50" onPointerDown={e=>{if(e.target===e.currentTarget)start(e);}} title={t.rulerHint}>
   {geometry&&Array.from({length:Math.ceil(geometry.availableWidthTwips*2.54/1440)+1},(_,i)=>{const position=i*1440/2.54,px=x(position);return px>=0&&px<=trackWidth?<span aria-hidden="true" key={i} className="pointer-events-none absolute top-0 h-2 border-s border-border text-[9px] text-muted-foreground" style={{left:px}}><span className="relative top-2 px-1">{i}</span></span>:null;})}
   {geometry&&stops.map(stop=>{const value=stop.alignment as keyof typeof symbols,hidden=preview?.oldPosition===stop.position;return <button type="button" key={`${stop.position}-${stop.alignment}`} data-tab-position={stop.position} disabled={readOnly} aria-label={`${labels[value]} ${(stop.position*2.54/1440).toFixed(2)} cm`} title={`${labels[value]} ${(stop.position*2.54/1440).toFixed(2)} cm`} className="absolute top-0 z-10 flex h-8 w-6 -translate-x-1/2 touch-none items-center justify-center text-lg font-bold text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring" style={{left:x(stop.position),visibility:hidden?"hidden":"visible"}} onPointerDown={e=>start(e,stop)} onKeyDown={e=>keyboard(e,stop)} onDoubleClick={onOpenDialog}>{symbols[value]}</button>;})}
   {geometry&&preview&&<span aria-hidden="true" className="pointer-events-none absolute top-0 z-20 flex h-8 w-6 -translate-x-1/2 items-center justify-center text-lg font-bold text-primary" style={{left:x(preview.position),opacity:preview.remove?.35:1}}>{symbols[preview.stop.alignment as keyof typeof symbols]}</span>}
  </div>
  {error&&<p role="alert" className="px-2 text-xs text-destructive">{error}</p>}
 </div>;
}
