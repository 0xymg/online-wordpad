/** Browser pages are the source of truth. No second PDF layout/pagination pass.
 * Page artwork is captured locally at print resolution; an invisible Unicode
 * text layer preserves search/copy without changing the rendered geometry.
 */
import { PDFDocument,type PDFFont,type PDFPage,PDFName,PDFString,PDFHexString,PDFNumber,PDFOperator,PDFOperatorNames,endMarkedContent,beginText,endText,setFontAndSize,setTextMatrix,setTextRenderingMode,TextRenderingMode,pushGraphicsState,popGraphicsState } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { toCanvas,getFontEmbedCSS } from "html-to-image";
import type { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { defaultDocumentLayout } from "./document-layout";
import { getDocumentModel } from "./document-model";
import { collectReferenceIndex } from "./document-references";
import { referencePageAtPos, type ReferencePage } from "./reference-layout";
import { preparePrintLayout } from "./print-layout";
import { printPageStyle } from "./print-style";
import type { PdfExportOptions } from "./pdf-export";
const fontBytes=new Map<string,Promise<ArrayBuffer>>();
function fontFile(css:CSSStyleDeclaration,text:string){
 if(/[\u0600-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u.test(text))return'NotoSansArabic.ttf';
 const family=css.fontFamily.toLowerCase(),base=/calibri|carlito/.test(family)?'Carlito':/courier|consolas|mono/.test(family)?'LiberationMono':/times|georgia|garamond|cambria|serif/.test(family)&&!family.includes('sans-serif')?'LiberationSerif':'LiberationSans';
 const bold=Number(css.fontWeight)>=600||css.fontWeight==='bold',italic=css.fontStyle!=='normal';
 return`${base}-${bold&&italic?'BoldItalic':bold?'Bold':italic?'Italic':'Regular'}.ttf`;
}
async function hiddenText(page:PDFPage,sheet:HTMLElement,fonts:Map<string,Promise<PDFFont>>){
 const doc=sheet.ownerDocument,win=doc.defaultView!,box=sheet.getBoundingClientRect(),walker=doc.createTreeWalker(sheet,NodeFilter.SHOW_TEXT),segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
 const inside=(r:DOMRect)=>r.width>.1&&r.height>.1&&r.bottom>box.top+.5&&r.top<box.bottom-.5&&r.right>box.left&&r.left<box.right;
 while(walker.nextNode()){
  const node=walker.currentNode as Text,value=node.textContent||'',parent=node.parentElement;if(!parent||!value.trim()||parent.closest('style,script'))continue;
  const css=win.getComputedStyle(parent);if(css.visibility==='hidden'||css.display==='none')continue;
  const range=doc.createRange();range.selectNodeContents(node);if(!Array.from(range.getClientRects()).some(inside))continue;
  // A mixed-direction text node can have visually distant runs. Latin uses its
  // own font; Arabic graphemes use their DOM positions and an ActualText span
  // so conforming PDF readers can copy the logical run as a unit.
  let line='',rect:DOMRect|null=null,arabic=false,parts:Array<{text:string;rect:DOMRect}>=[];
  const flush=async()=>{if(!line||!rect){line='';rect=null;return;}const file=fontFile(css,line);let font=fonts.get(file);
   if(!font){let bytes=fontBytes.get(file);if(!bytes){bytes=fetch(`${location.origin}/pdf-fonts/${file}`).then(r=>{if(!r.ok)throw new Error('PDF font unavailable');return r.arrayBuffer();});fontBytes.set(file,bytes);}font=bytes.then(data=>page.doc.embedFont(data,{subset:true}));fonts.set(file,font);}
   const embedded=await font,size=Number.parseFloat(css.fontSize)*.75;
   const draw=(text:string,r:DOMRect)=>page.drawText(text,{font:embedded,size,x:Math.max(0,(r.left-box.left)*.75),y:page.getHeight()-(r.bottom-box.top)*.75+size*.2,opacity:0});
   if(arabic){page.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence,[PDFName.of('Span'),`<< /ActualText ${PDFHexString.fromText(line)} >>`]));for(const part of parts)draw(part.text,part.rect);page.pushOperators(endMarkedContent());}
   else {
    // A PDF font can have different advances from the browser font. Position
    // each grapheme with TJ adjustments while keeping one searchable run.
    const items=page.doc.context.obj([]);for(let i=0;i<parts.length;i++){const current=parts[i],next=parts[i+1];items.push(embedded.encodeText(current.text));if(next){const advance=embedded.widthOfTextAtSize(current.text,size),target=(next.rect.left-current.rect.left)*.75;items.push(PDFNumber.of((advance-target)*1000/size));}}
    const fontKey=page.node.newFontDictionary(embedded.name,embedded.ref),x=Math.max(0,(parts[0].rect.left-box.left)*.75),y=page.getHeight()-(rect.bottom-box.top)*.75+size*.2;
    page.pushOperators(pushGraphicsState(),beginText(),setFontAndSize(fontKey,size),setTextRenderingMode(TextRenderingMode.Invisible),setTextMatrix(1,0,0,1,x,y),PDFOperator.of(PDFOperatorNames.ShowTextAdjusted,[items]),endText(),popGraphicsState());
   }
   line='';rect=null;parts=[];};
  for(const part of segmenter.segment(value)){
   range.setStart(node,part.index);range.setEnd(node,part.index+part.segment.length);const r=range.getBoundingClientRect();
   if(!inside(r)){await flush();continue;}
   const nextArabic=/[\u0600-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u.test(part.segment);
   if(rect&&(Math.abs(r.top-rect.top)>2||nextArabic!==arabic))await flush();
   arabic=nextArabic;
   line+=part.segment;
   parts.push({text:part.segment,rect:r});
   rect=rect?new win.DOMRect(Math.min(rect.left,r.left),Math.min(rect.top,r.top),Math.max(rect.right,r.right)-Math.min(rect.left,r.left),Math.max(rect.bottom,r.bottom)-Math.min(rect.top,r.top)):r;
  }
  await flush();
 }

}
/** Internal reference links are PDF GoTo actions, never website fragment URLs. */
function addPdfLinks(pdf: PDFDocument, sheets: HTMLElement[], targets: Map<string, ReferencePage>) {
 const pages = pdf.getPages();
 sheets.forEach((sheet, index) => {
  const page = pages[index], box = sheet.getBoundingClientRect();
  for (const element of sheet.querySelectorAll<HTMLElement>('a[href], [data-edtr-reference]')) {
   if (element.hasAttribute('data-edtr-reference') && element.closest('a[href]')) continue;
   let target: ReferencePage | undefined, uri: string | undefined;
   if (element.hasAttribute('data-edtr-reference')) {
    if (element.dataset.status !== 'ok') continue;
    target = targets.get(element.getAttribute('data-reference-target') || '');
    if (!target) continue;
   } else {
    const href = element.getAttribute('href') || '';
    if (href.startsWith('#')) {
     target = targets.get(href.slice('#edtr-target-'.length));
     if (!href.startsWith('#edtr-target-') || !target) continue;
    } else {
     try { const url = new URL(href, location.href); if (['http:', 'https:', 'mailto:'].includes(url.protocol)) uri = url.href; } catch { /* Ignore invalid links. */ }
     if (!uri) continue;
    }
   }
   for (const rect of element.getClientRects()) {
    const left = Math.max(rect.left, box.left), right = Math.min(rect.right, box.right);
    const top = Math.max(rect.top, box.top), bottom = Math.min(rect.bottom, box.bottom);
    if (right - left < .1 || bottom - top < .1) continue;
    const action = target ? { S: PDFName.of('GoTo'), D: [pages[target.pageIndex].ref, PDFName.of('XYZ'), target.x * .75, pages[target.pageIndex].getHeight() - target.y * .75, null] } : { S: PDFName.of('URI'), URI: PDFString.of(uri!) };
    const annotation = pdf.context.obj({ Type: PDFName.of('Annot'), Subtype: PDFName.of('Link'), Rect: [(left-box.left)*.75, page.getHeight()-(bottom-box.top)*.75, (right-box.left)*.75, page.getHeight()-(top-box.top)*.75], Border: [0,0,0], A: action });
    page.node.addAnnot(pdf.context.register(annotation));
   }
  }
 });
}
async function snapshotFrame(host:HTMLElement){
 const iframe=document.createElement('iframe');iframe.title='PDF document';iframe.setAttribute('aria-hidden','true');iframe.style.cssText='position:fixed;left:-100000px;top:0;width:1800px;height:2000px;visibility:hidden;pointer-events:none';document.body.appendChild(iframe);
 const doc=iframe.contentDocument!;
 const base=doc.createElement('base');base.href=location.origin+'/';doc.head.appendChild(base);
 const pending:Promise<void>[]=[];
 for(const source of document.querySelectorAll<HTMLStyleElement|HTMLLinkElement>('style,link[rel="stylesheet"]')){
  if(source.tagName==='LINK'){
   const link=doc.createElement('link');link.rel='stylesheet';link.href=(source as HTMLLinkElement).href;
   pending.push(new Promise<void>((resolve,reject)=>{link.onload=()=>resolve();link.onerror=()=>reject(new Error('PDF styles could not load'));}));doc.head.appendChild(link);
  }else{const style=doc.createElement('style');try{style.textContent=Array.from(source.sheet?.cssRules||[]).map(r=>r.cssText).join('\n')||source.textContent;}catch{style.textContent=source.textContent;}doc.head.appendChild(style);}
 }
 const style=doc.createElement('style');style.textContent=printPageStyle;doc.head.appendChild(style);doc.body.appendChild(doc.importNode(host,true));
 try{await Promise.all(pending);await doc.fonts.ready;await Promise.all(Array.from(doc.images).map(img=>img.decode().catch(()=>{})));return iframe;}catch(error){iframe.remove();throw error;}
}
export async function viewToPdfBlob(view:EditorView,opts:PdfExportOptions):Promise<Blob>{
 getDocumentModel(view.state.doc);
 const host=document.createElement('div');host.className='edtr-print-root';
 await preparePrintLayout(view,host,opts.headerFooter?{title:opts.title,date:new Date().toLocaleDateString()}:undefined);
 const index = collectReferenceIndex(view.state.doc), targets = new Map<string, ReferencePage>();
 for (const target of index.targets) if (index.byId.get(target.id)?.length === 1) targets.set(target.id, referencePageAtPos(view, target.pos));
 // html-to-image discovers fonts using instanceof HTMLElement. Its font scan
 // cannot descend into another window's elements, so collect from a main-window
 // clone before capturing the isolated, light-mode page artwork.
 const fontSource=document.createElement('div');fontSource.style.cssText='position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';fontSource.appendChild(host);document.body.appendChild(fontSource);
 let css:string;
 try{await document.fonts.ready;css=await getFontEmbedCSS(host);}finally{fontSource.remove();}
 const frame=await snapshotFrame(host);
 try{
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);pdf.setTitle(opts.title);pdf.setCreator('EDTRDocs');
  const fonts=new Map<string,Promise<PDFFont>>(),sheets=Array.from(frame.contentDocument!.querySelectorAll<HTMLElement>('.edtr-print-sheet'));
  for(const sheet of sheets){
   const width=Number(sheet.dataset.pageWidth)/20,height=Number(sheet.dataset.pageHeight)/20,page=pdf.addPage([width,height]);
   // html-to-image rounds every computed font down by almost one CSS pixel.
   // Restore exact sizes with embedded rules, including fractional Word points.
   const sizes=new Set<string>();
   for(const element of [sheet,...sheet.querySelectorAll<HTMLElement>('*')]){
    const size=frame.contentWindow!.getComputedStyle(element).fontSize;
    if(/^\d+(\.\d+)?px$/.test(size)){sizes.add(size);element.setAttribute('data-edtr-pdf-font-size',size);}
   }
   const exactSizes=Array.from(sizes,size=>`[data-edtr-pdf-font-size="${size}"]{font-size:${size}!important}`).join('\n');
   const canvas=await toCanvas(sheet,{width:width/0.75,height:height/0.75,pixelRatio:3,backgroundColor:'#fff',fontEmbedCSS:css+'\n'+exactSizes,skipAutoScale:true});
   const image=await pdf.embedPng(canvas.toDataURL('image/png'));page.drawImage(image,{x:0,y:0,width,height});canvas.width=0;canvas.height=0;
   await hiddenText(page,sheet,fonts);
  }
  addPdfLinks(pdf, sheets, targets);
  const bytes=await pdf.save();return new Blob([new Uint8Array(bytes).buffer],{type:'application/pdf'});
 }finally{frame.remove();}
}
export async function docToScreenPdfBlob(doc:PMNode,opts:PdfExportOptions,active?:EditorView){
 getDocumentModel(doc);
 if(active&&active.state.doc===doc)return viewToPdfBlob(active,opts);
 if(!doc.attrs.layout){const layout=defaultDocumentLayout();const margin=Math.round(opts.marginCm/2.54*1440);layout.margins={top:margin,bottom:margin,left:margin,right:margin};if(opts.orientation==='landscape')[layout.width,layout.height]=[layout.height,layout.width];layout.pageNumbers=opts.pageNumbers||'off';layout.pageNumberFormat=opts.pageNumberFormat||'plain';layout.overrides={pageNumbers:true};doc=doc.type.create({...doc.attrs,layout},doc.content);}
 const {readonlyDocumentView}=await import('./readonly-document-view');const renderer=readonlyDocumentView(doc);
 try{return await viewToPdfBlob(renderer.view,opts);}finally{renderer.destroy();}
}
