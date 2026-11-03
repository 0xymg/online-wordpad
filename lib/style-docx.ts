/** Native OOXML paragraph style definitions, so Word can keep editing them. */
import JSZip from "jszip";
import type { Node as PMNode } from "prosemirror-model";
import { documentStyles } from "./document-styles";
import { paragraphXml } from "./paragraph-format";
import { primaryDocumentFont } from "./document-font";
const W="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export async function exportDocumentStyles(blob: Blob,doc: PMNode): Promise<Blob> {
  const zip=await JSZip.loadAsync(await blob.arrayBuffer());
  const xml=new DOMParser().parseFromString(await zip.file("word/styles.xml")!.async("string"),"application/xml");
  const make=(name:string,value?:string|number)=>{const e=xml.createElementNS(W,`w:${name}`);if(value!==undefined)e.setAttributeNS(W,"w:val",String(value));return e;};
  for(const [id,style] of Object.entries(documentStyles(doc.attrs.layout))){
    for(const old of Array.from(xml.documentElement.children))if(old.localName==="style"&&old.getAttributeNS(W,"styleId")===id)old.remove();
    const el=make("style");el.setAttributeNS(W,"w:type","paragraph");el.setAttributeNS(W,"w:styleId",id);if(id==="Normal")el.setAttributeNS(W,"w:default","1");
    el.appendChild(make("name",style.name));if(style.basedOn)el.appendChild(make("basedOn",style.basedOn));el.appendChild(make("qFormat"));
    const node=doc.type.schema.nodes.paragraph.create({paragraphFormat:style.paragraph, docxProperties:(style as typeof style & {rawParagraphProperties?: string}).rawParagraphProperties || null});
    const p=new DOMParser().parseFromString(paragraphXml(node),"application/xml").documentElement;
    if(style.level!==undefined)p.appendChild(make("outlineLvl",style.level?style.level-1:9));el.appendChild(p);
    const r=make("rPr"),text=style.text;
    if(text.family){const fonts=make("rFonts");for(const key of ["ascii","hAnsi","cs","eastAsia"])fonts.setAttributeNS(W,`w:${key}`,primaryDocumentFont(text.family));r.appendChild(fonts);}
    for(const [key,tag] of [["bold","b"],["italic","i"]]as const)if(text[key]!==undefined)r.appendChild(make(tag,text[key]?"1":"0"));
    if(text.color)r.appendChild(make("color",text.color.replace(/^#/,"")));
    if(text.size){r.appendChild(make("sz",Math.round(text.size*2)));r.appendChild(make("szCs",Math.round(text.size*2)));}
    if(text.underline!==undefined)r.appendChild(make("u",text.underline?"single":"none"));
    el.appendChild(r);xml.documentElement.appendChild(el);
  }
  zip.file("word/styles.xml",new XMLSerializer().serializeToString(xml));
  return zip.generateAsync({type:"blob",compression:"DEFLATE",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
}
