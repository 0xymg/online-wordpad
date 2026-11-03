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
  const styles=documentStyles(doc.attrs.layout);
  // Native document defaults stay below table and paragraph style declarations.
  // Serializing them into Normal would incorrectly override table-style spacing.
  const defaults=Object.values(styles).find(style=>style.paragraphDefaults)?.paragraphDefaults;
  if(defaults){
    let root=Array.from(xml.documentElement.children).find(el=>el.localName==="docDefaults");
    if(!root){root=make("docDefaults");xml.documentElement.insertBefore(root,xml.documentElement.firstChild);}
    let paragraph=Array.from(root.children).find(el=>el.localName==="pPrDefault");
    if(!paragraph){paragraph=make("pPrDefault");root.appendChild(paragraph);}
    const old=Array.from(paragraph.children).find(el=>el.localName==="pPr");
    const node=doc.type.schema.nodes.paragraph.create({paragraphFormat:defaults,docxProperties:old?new XMLSerializer().serializeToString(old):null});
    const properties=new DOMParser().parseFromString(paragraphXml(node),"application/xml").documentElement;
    if(old)old.replaceWith(properties);else paragraph.appendChild(properties);
  }
  for(const [id,style] of Object.entries(styles)){
    for(const old of Array.from(xml.documentElement.children))if(old.localName==="style"&&old.getAttributeNS(W,"styleId")===id)old.remove();
    const el=make("style");el.setAttributeNS(W,"w:type","paragraph");el.setAttributeNS(W,"w:styleId",id);if(id==="Normal")el.setAttributeNS(W,"w:default","1");
    el.appendChild(make("name",style.name));if(style.basedOn)el.appendChild(make("basedOn",style.basedOn));el.appendChild(make("qFormat"));
    const node=doc.type.schema.nodes.paragraph.create({paragraphFormat:style.paragraph, docxProperties:(style as typeof style & {rawParagraphProperties?: string}).rawParagraphProperties || null});
    const p=new DOMParser().parseFromString(paragraphXml(node),"application/xml").documentElement;
    if(style.level!==undefined){
      // Imported raw pPr may already contain the managed outline level.
      // WordprocessingML permits only one; replace it rather than append.
      for(const old of Array.from(p.children))if(old.namespaceURI===W&&old.localName==="outlineLvl")old.remove();
      p.appendChild(make("outlineLvl",style.level?style.level-1:9));
    }
    el.appendChild(p);
    const r=make("rPr"),text=style.text;
    if(text.family){const fonts=make("rFonts");for(const key of ["ascii","hAnsi","cs","eastAsia"])fonts.setAttributeNS(W,`w:${key}`,primaryDocumentFont(text.family));r.appendChild(fonts);}
    for(const [key,tag] of [["bold","b"],["italic","i"]]as const)if(text[key]!==undefined)r.appendChild(make(tag,text[key]?"1":"0"));
    if(text.color)r.appendChild(make("color",text.color.replace(/^#/,"")));
    if(text.size){r.appendChild(make("sz",Math.round(text.size*2)));r.appendChild(make("szCs",Math.round(text.size*2)));}
    if(text.underline!==undefined)r.appendChild(make("u",text.underline?"single":"none"));
    el.appendChild(r);xml.documentElement.appendChild(el);
  }
  // Source styles are retained under separate IDs for preserved native parts.
  // Word treats duplicate display names as competing styles and may rename a
  // real Heading 1 to "heading 10", losing its built-in heading semantics.
  const allStyles=Array.from(xml.documentElement.children).filter(el=>el.namespaceURI===W&&el.localName==="style");
  const nameOf=(el:Element)=>Array.from(el.children).find(child=>child.namespaceURI===W&&child.localName==="name");
  const used=new Set(allStyles.filter(el=>!String(el.getAttributeNS(W,"styleId")||"").startsWith("EDTRSource_")).map(el=>nameOf(el)?.getAttributeNS(W,"val")?.toLowerCase()).filter((name):name is string=>!!name));
  for(const el of allStyles){
    const id=el.getAttributeNS(W,"styleId")||"";if(!id.startsWith("EDTRSource_"))continue;
    const name=nameOf(el),value=name?.getAttributeNS(W,"val");if(!name||!value)continue;
    if(!used.has(value.toLowerCase())){used.add(value.toLowerCase());continue;}
    let candidate=`${value} (EDTR preserved)`;for(let n=2;used.has(candidate.toLowerCase());n++)candidate=`${value} (EDTR preserved ${n})`;
    name.setAttributeNS(W,"w:val",candidate);used.add(candidate.toLowerCase());
  }
  zip.file("word/styles.xml",new XMLSerializer().serializeToString(xml));
  return zip.generateAsync({type:"blob",compression:"DEFLATE",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
}
