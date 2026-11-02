import { Plugin, type Command } from "prosemirror-state";
import { splitBlockAs } from "prosemirror-commands";
import { documentStyles,resolveStyle } from "./document-styles";
export function paragraphStylePlugin(){return new Plugin({appendTransaction(_transactions,_old,state){
 const parent=state.selection.$from.parent;
 if(!state.selection.empty||parent.content.size||!parent.attrs.styleId||state.storedMarks!==null)return null;
 const text=parent.attrs.styleText||resolveStyle(documentStyles(state.doc.attrs.layout),parent.attrs.styleId).text,m=state.schema.marks;
 const marks=[m.fontFamily.create({family:text.family}),m.fontSize.create({size:`${text.size}pt`}),m.textColor.create({color:text.color})];
 if(text.bold)marks.push(m.strong.create());if(text.italic)marks.push(m.em.create());if(text.underline)marks.push(m.underline.create());
 return state.tr.setStoredMarks(marks).setMeta("addToHistory",false);
}});}
export const splitStyledParagraph:Command=(state,dispatch)=>{
 const parent=state.selection.$from.parent;
 if(!parent.attrs.styleId||!["paragraph","heading"].includes(parent.type.name))return false;
 return splitBlockAs((node,atEnd)=>{
  if(node.type.name==="heading"&&atEnd){const style=resolveStyle(documentStyles(state.doc.attrs.layout),"Normal");return {type:state.schema.nodes.paragraph,attrs:{styleId:"Normal",styleText:style.text,styleParagraph:style.paragraph}};}
  return {type:node.type,attrs:{...node.attrs,docxProperties:null}};
 })(state,dispatch);
};
