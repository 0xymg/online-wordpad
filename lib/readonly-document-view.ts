import { applyImageLayout } from "./image-layout";
/** The same ProseMirror page renderer for exporting documents not currently open. */
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { TableView } from "prosemirror-tables";
import { DOMSerializer,type Node as PMNode } from "prosemirror-model";
import { paginationPlugin } from "@/app/components/paginationPlugin";
import { createTabNodeView, tabLayoutPlugin } from "./tab-layout";
import { resolveColumnTabGeometry } from "./column-flow";
import { documentSections } from "./document-sections";
import { ensureEditorFont } from "./editor-fonts";
import { createReadonlyTextBoxView } from "./text-box";
import { getDocumentModel, migrateDocumentNode, projectDocumentModel } from "./document-model";
export function readonlyDocumentView(doc:PMNode){
 // Validate before creating DOM. A future model must not fall back to legacy
 // layout; valid canonical sections also project their headers/footers here.
 doc=migrateDocumentNode(doc);
 doc=projectDocumentModel(EditorState.create({doc}).tr,getDocumentModel(doc)!).doc;
 const sections=documentSections(doc),first=sections[0].geometry,width=Math.max(...sections.map(s=>s.geometry.width))/15;
 const host=document.createElement("div");host.className="editor-shell";host.style.cssText=`position:fixed;left:-100000px;top:0;width:${width+100}px;height:2000px;visibility:hidden;overflow:hidden;pointer-events:none`;
 const page=document.createElement("div");page.className="pm-page";
 page.style.cssText=`--page-w:${width}px;--page-h:${first.height/15}px;--page-margin-top:${first.margins.top/15}px;--page-margin-left:${first.margins.left/15}px;--page-margin-right:${first.margins.right/15}px;--page-margin-bottom:${first.margins.bottom/15}px`;
 host.appendChild(page);document.body.appendChild(host);
 doc.descendants(node=>{if(node.attrs.styleText?.family)ensureEditorFont(node.attrs.styleText.family);if(node.type.name==='text_box')ensureEditorFont(node.attrs.fontFamily);for(const mark of node.marks)if(mark.type.name==='fontFamily')ensureEditorFont(mark.attrs.family);});
 const layout=doc.attrs.layout;
 const view=new EditorView(page,{state:EditorState.create({doc,plugins:[paginationPlugin(()=>({pageHeightPx:first.height/15,marginPx:first.margins.top/15,bottomMarginPx:first.margins.bottom/15,pageNumbers:layout?.pageNumbers||"off",pageNumberFormat:layout?.pageNumberFormat||"plain",numberingStyle:layout?.numberingStyle})),tabLayoutPlugin({resolveTabGeometry:resolveColumnTabGeometry})]}),editable:()=>false,nodeViews:{
  table(node){const tableView=new TableView(node,25),wrap=document.createElement('div');wrap.className='pm-table-wrapper';const table=tableView.dom.querySelector('table');if(table){const style=document.createElement('div');style.style.cssText=node.attrs.layoutStyle||'';table.style.marginLeft=style.style.marginLeft;table.style.marginRight=style.style.marginRight;}wrap.appendChild(tableView.dom);return{dom:wrap,contentDOM:tableView.contentDOM,ignoreMutation:m=>tableView.ignoreMutation(m)};},
  image(node){const dom=document.createElement('span'),frame=document.createElement('span'),img=DOMSerializer.fromSchema(node.type.schema).serializeNode(node) as HTMLImageElement;dom.className='pm-image-wrapper';frame.className='pm-image-frame';frame.appendChild(img);dom.appendChild(frame);applyImageLayout(dom,img,node.attrs);return{dom,ignoreMutation:()=>true};},
  text_box: createReadonlyTextBoxView,
  tab: createTabNodeView,
 }});
 return{view,destroy(){view.destroy();host.remove();}};
}
