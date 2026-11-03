import type { EditorState,Transaction } from "prosemirror-state";
import { defaultDocumentLayout,type DocumentLayout } from "./document-layout";
import type { Node as PMNode } from "prosemirror-model";
import { sectionGeometry,documentSections } from "./document-sections";
import { getDocumentModel } from "./document-model";
import { setSectionGeometry } from "./section-commands";
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
 const model=getDocumentModel(doc),section=model?documentSections(doc)[index]:null;
 if(model&&section)return {...model.sections[section.id].page.margins};
 const layout:DocumentLayout=doc.attrs.layout||defaultDocumentLayout();
 if(layout.sectionMargins?.[index])return {...layout.sectionMargins[index]};
 if(layout.overrides?.margins)return {...layout.margins};
 const raw:string[]=[];doc.forEach(node=>{if(String(node.attrs.docxProperties||"").includes("sectPr"))raw.push(node.attrs.docxProperties);});raw.push(layout.section||"");
 return {...sectionGeometry(raw[index],layout).margins};
}
export function setPageMargins(state:EditorState,margins:PageMargins,scope:"section"|"all"):Transaction{
 return setSectionGeometry(state,{margins:{...margins}},scope);
}
