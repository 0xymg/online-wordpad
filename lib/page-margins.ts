import type { EditorState,Transaction } from "prosemirror-state";
import { defaultDocumentLayout,type DocumentLayout } from "./document-layout";
import type { Node as PMNode } from "prosemirror-model";
import { sectionGeometry,documentSections } from "./document-sections";
export type PageMargins=DocumentLayout["margins"];
export const MARGIN_PRESETS=[
 {id:"narrow",margins:{top:720,bottom:720,left:720,right:720}},
 {id:"moderate",margins:{top:1440,bottom:1440,left:1080,right:1080}},
 {id:"normal",margins:{top:1440,bottom:1440,left:1440,right:1440}},
 {id:"wide",margins:{top:1440,bottom:1440,left:2880,right:2880}},
]as const;
export function marginPreset(margins:PageMargins){return MARGIN_PRESETS.find(p=>Object.entries(margins).every(([key,value])=>Math.abs(p.margins[key as keyof PageMargins]-value)<1))?.id;}
export function activeSection(state:EditorState):number {const sections=documentSections(state.doc),position=state.selection.from;return Math.max(0,sections.findIndex((s,index)=>position>=s.from&&(position<s.to||index===sections.length-1)));}
export function requestedMargins(doc:PMNode,index:number):PageMargins {
 const layout:DocumentLayout=doc.attrs.layout||defaultDocumentLayout();
 if(layout.sectionMargins?.[index])return {...layout.sectionMargins[index]};
 if(layout.overrides?.margins)return {...layout.margins};
 const raw:string[]=[];doc.forEach(node=>{if(String(node.attrs.docxProperties||"").includes("sectPr"))raw.push(node.attrs.docxProperties);});raw.push(layout.section||"");
 return {...sectionGeometry(raw[index],layout).margins};
}
export function setPageMargins(state:EditorState,margins:PageMargins,scope:"section"|"all"):Transaction{
 const layout:DocumentLayout=state.doc.attrs.layout||defaultDocumentLayout();
 const section=activeSection(state);
 const targets=documentSections(state.doc).filter((_,index)=>scope==='all'||index===section);
 if(targets.some(({geometry:g})=>margins.left+margins.right>g.width-720||margins.top+margins.bottom>g.height-720))throw new Error("Invalid page margins");
 return state.tr.setDocAttribute("layout",scope==="all"?{...layout,margins:{...margins},sectionMargins:undefined,overrides:{...layout.overrides,margins:true}}:{...layout,sectionMargins:{...layout.sectionMargins,[section]:{...margins}}});
}
