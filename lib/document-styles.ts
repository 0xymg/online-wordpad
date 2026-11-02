import type { Node as PMNode, Mark } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";
import { defaultDocumentLayout, type DocumentLayout } from "./document-layout";
import { cleanParagraph, cleanStyleText, DEFAULT_PARAGRAPH, DEFAULT_STYLE_TEXT, effectiveParagraph, type DocumentStyle, type DocumentStyles, type ParagraphFormat, type StyleText } from "./paragraph-format";
export const BUILTIN_STYLES: DocumentStyles = {
  Normal: { name: "Normal", paragraph: { ...DEFAULT_PARAGRAPH }, text: { ...DEFAULT_STYLE_TEXT } },
  Heading1: { name: "Heading 1", basedOn: "Normal", level: 1, paragraph: { before: 240, after: 120, keepNext: true }, text: { size: 24, bold: true } },
  Heading2: { name: "Heading 2", basedOn: "Normal", level: 2, paragraph: { before: 180, after: 100, keepNext: true }, text: { size: 18, bold: true } },
  Heading3: { name: "Heading 3", basedOn: "Normal", level: 3, paragraph: { before: 120, after: 80, keepNext: true }, text: { size: 14, bold: true } },
  Heading4: { name:"Heading 4",basedOn:"Normal",level:4,paragraph:{before:120,after:60,keepNext:true},text:{size:12,bold:true}},
  Heading5: { name:"Heading 5",basedOn:"Normal",level:5,paragraph:{before:120,after:60,keepNext:true},text:{size:12,bold:true,italic:true}},
  Heading6: { name:"Heading 6",basedOn:"Normal",level:6,paragraph:{before:120,after:60,keepNext:true},text:{size:11,bold:true}},
};
const styleCache = new WeakMap<object,DocumentStyles>();
export function documentStyles(layout: DocumentLayout | null): DocumentStyles {
 if (!layout?.styles) return { ...BUILTIN_STYLES };
 const cached=styleCache.get(layout.styles); if(cached)return {...cached};
 const result={...BUILTIN_STYLES};
 for(const [id,value]of Object.entries(layout.styles)){
  if(!value||typeof value!=="object"||["__proto__","constructor","prototype"].includes(id))continue;
  result[id]={name:String(value.name||id).slice(0,80),basedOn:typeof value.basedOn==="string"?value.basedOn:undefined,level:typeof value.level==="number"?Math.max(0,Math.min(6,Math.round(value.level))):undefined,paragraph:cleanParagraph(value.paragraph),text:cleanStyleText(value.text)};
 }
 styleCache.set(layout.styles,result);return {...result};
}
export function resolveStyle(styles: DocumentStyles, id: string, seen = new Set<string>()): { paragraph: ParagraphFormat; text: StyleText; level?: number } {
  const style = Object.hasOwn(styles,id) ? styles[id] : undefined;
  if (!style || seen.has(id) || seen.size > 20) return { paragraph: { ...DEFAULT_PARAGRAPH }, text: { ...DEFAULT_STYLE_TEXT } };
  seen.add(id);
  const base = style.basedOn ? resolveStyle(styles,style.basedOn,seen) : { paragraph: {}, text: DEFAULT_STYLE_TEXT, level: undefined };
  return { paragraph: { ...base.paragraph,...cleanParagraph(style.paragraph) }, text: { ...base.text,...style.text }, level: style.level ?? base.level };
}
export function selectedParagraphs(state: EditorState): Array<{ node: PMNode; pos: number }> {
  const { from,to,empty,$from } = state.selection, result: Array<{ node: PMNode; pos: number }> = [];
  if (empty && ["paragraph","heading"].includes($from.parent.type.name)) return [{ node:$from.parent,pos:$from.before() }];
  state.doc.nodesBetween(from,to,(node,pos) => { if (["paragraph","heading"].includes(node.type.name)) result.push({node,pos}); });
  return result;
}
export function textFormat(marks: readonly Mark[]): StyleText {
  const result = { ...DEFAULT_STYLE_TEXT };
  for (const mark of marks) {
    if (mark.type.name === "fontFamily") result.family = mark.attrs.family;
    if (mark.type.name === "fontSize") result.size = Number.parseFloat(mark.attrs.size) || 12;
    if (mark.type.name === "textColor") { const color = String(mark.attrs.color), rgb = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i); result.color = rgb ? "#" + rgb.slice(1,4).map(n=>Number(n).toString(16).padStart(2,"0")).join("") : color; }
    if (mark.type.name === "strong") result.bold = true;
    if (mark.type.name === "em") result.italic = true;
    if (mark.type.name === "underline") result.underline = true;
  }
  return result;
}
function equal(a: unknown,b: unknown) { return typeof a === "string" && typeof b === "string" ? a.replace(/["'\s]/g,"").toLowerCase() === b.replace(/["'\s]/g,"").toLowerCase() : a === b; }
function restyleText(tr: Transaction, node: PMNode, pos: number, old: StyleText | null, next: StyleText) {
  const specs = { family:["fontFamily","family"],size:["fontSize","size"],bold:["strong",""],italic:["em",""],underline:["underline",""],color:["textColor","color"] } as const;
  node.descendants((child,relative) => {
    if (!child.isInline || !child.isText && child.type.name !== "doc_field") return;
    const actual = textFormat(child.marks), from = pos+1+relative,to = from+child.nodeSize;
    for (const key of Object.keys(specs) as Array<keyof StyleText>) {
      const [name,attr] = specs[key], type = tr.doc.type.schema.marks[name]; if (!type) continue;
      // Explicit applications reset font/size/colour; character emphasis remains.
      if (old ? !equal(actual[key],old[key]) : ["bold","italic","underline"].includes(key) && actual[key] === true && next[key] === false) continue;
      tr.removeMark(from,to,type);
      if (typeof next[key] === "boolean" ? next[key] : true) tr.addMark(from,to,type.create(attr ? { [attr]:key === "size" ? `${next.size}pt` : next[key] } : undefined));
    }
  });
}
function styledNode(tr: Transaction,node: PMNode,pos: number,id: string,styles: DocumentStyles,reset: boolean) {
  const resolved = resolveStyle(styles,id);
  restyleText(tr,node,pos,node.attrs.styleText || (reset ? null : DEFAULT_STYLE_TEXT),resolved.text);
  const type = resolved.level ? node.type.schema.nodes.heading : node.type.schema.nodes.paragraph;
  const point=tr.doc.resolve(pos), index=point.index();
  const target=point.parent.canReplaceWith(index,index+1,type)?type:node.type;
  tr.setNodeMarkup(pos,target,{ ...node.attrs,level:resolved.level || 1,styleId:id,styleText:resolved.text,styleParagraph:resolved.paragraph,...(reset ? { paragraphFormat:{},textAlign:null,indent:0,lineHeight:null } : {}) });
}
export function applyDocumentStyle(state: EditorState,id: string): Transaction {
  const styles = documentStyles(state.doc.attrs.layout),tr=state.tr;
  if (!Object.hasOwn(styles,id)) return tr;
  for (const {node,pos} of selectedParagraphs(state)) styledNode(tr,node,pos,id,styles,true);
  const layout = state.doc.attrs.layout || defaultDocumentLayout();
  tr.setDocAttribute("layout",{ ...layout,styles });
  return tr;
}
export function saveDocumentStyle(state: EditorState,id: string,definition: DocumentStyle,apply = false): Transaction {
  const styles = { ...documentStyles(state.doc.attrs.layout),[id]:definition },tr=state.tr;
  state.doc.descendants((node,pos)=>{ if (node.attrs.styleId && styles[node.attrs.styleId] && ["paragraph","heading"].includes(node.type.name)) styledNode(tr,node,pos,node.attrs.styleId,styles,false); });
  if (apply) for (const {node,pos} of selectedParagraphs(state)) styledNode(tr,node,pos,id,styles,true);
  tr.setDocAttribute("layout",{ ...(state.doc.attrs.layout || defaultDocumentLayout()),styles });
  return tr;
}
export function removeDocumentStyle(state: EditorState,id: string): Transaction {
  const styles = documentStyles(state.doc.attrs.layout),tr=state.tr;
  for (const [key,style] of Object.entries(styles)) if (style.basedOn === id) { const resolved=resolveStyle(styles,key); styles[key]={ name:style.name,...resolved }; }
  delete styles[id];
  state.doc.descendants((node,pos)=>{ if(node.attrs.styleId===id) tr.setNodeMarkup(pos,undefined,{ ...node.attrs,styleId:null,styleText:null,styleParagraph:{},paragraphFormat:effectiveParagraph(node) }); });
  tr.setDocAttribute("layout",{ ...(state.doc.attrs.layout || defaultDocumentLayout()),styles }); return tr;
}
export function formatParagraphs(state: EditorState,changes: ParagraphFormat): Transaction {
  const tr=state.tr;
  for (const {node,pos} of selectedParagraphs(state)) tr.setNodeMarkup(pos,undefined,{ ...node.attrs,paragraphFormat:{ ...node.attrs.paragraphFormat,...cleanParagraph(changes) } });
  return tr;
}
