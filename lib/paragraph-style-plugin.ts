import { Plugin, type Command } from "prosemirror-state";
import { splitBlockAs } from "prosemirror-commands";
import { documentStyles,resolveStyle } from "./document-styles";
import { effectiveParagraph, lineMetricFamily } from "./paragraph-format";
export function paragraphStylePlugin(){return new Plugin({appendTransaction(transactions,_old,state){
 let tr=state.tr;
 // ProseMirror reuses the paragraph DOM when only child marks change. Change
 // an internal attribute when the font profile changes so its CSS is redrawn.
 if(transactions.some(transaction=>transaction.docChanged)){
  state.doc.descendants((node,pos)=>{
   if(!["paragraph","heading"].includes(node.type.name))return;
   const format=effectiveParagraph(node);
   if(format.lineMode!=="multiple"||format.lineBasis!=="font")return;
   const family=lineMetricFamily(node);
   if(node.attrs.lineMetricFamily!==family)tr.setNodeMarkup(pos,undefined,{...node.attrs,lineMetricFamily:family});
  });
 }
 const parent=state.selection.$from.parent;
 if(!state.selection.empty||parent.content.size||!parent.attrs.styleId||state.storedMarks!==null){
  if(!tr.docChanged)return null;
  if(state.storedMarks!==null)tr=tr.setStoredMarks(state.storedMarks);
  return tr.setMeta("addToHistory",false);
 }
 const text=parent.attrs.styleText||resolveStyle(documentStyles(state.doc.attrs.layout),parent.attrs.styleId).text,m=state.schema.marks;
 const marks=[m.fontFamily.create({family:text.family}),m.fontSize.create({size:`${text.size}pt`}),m.textColor.create({color:text.color})];
 if(text.bold)marks.push(m.strong.create());if(text.italic)marks.push(m.em.create());if(text.underline)marks.push(m.underline.create());
 return tr.setStoredMarks(marks).setMeta("addToHistory",false);
}});}
export const splitStyledParagraph:Command=(state,dispatch)=>{
 const parent=state.selection.$from.parent;
 if(!parent.attrs.styleId||!["paragraph","heading"].includes(parent.type.name))return false;
 return splitBlockAs((node,atEnd)=>{
  if(node.type.name==="heading"&&atEnd){const style=resolveStyle(documentStyles(state.doc.attrs.layout),"Normal");return {type:state.schema.nodes.paragraph,attrs:{styleId:"Normal",styleText:style.text,styleParagraph:style.paragraph}};}
  return {type:node.type,attrs:{...node.attrs,docxProperties:null}};
 })(state,dispatch);
};
