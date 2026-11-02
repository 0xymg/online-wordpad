/** Public PDF API. Every export uses the editor's browser page renderer. */
import type { Node as PMNode } from "prosemirror-model";
export type PdfExportOptions = {
 title:string;
 orientation:"portrait"|"landscape";
 marginCm:number;
 headerFooter:boolean;
 pageNumbers?:"off"|"bottom"|"top";
 pageNumberFormat?:"plain"|"of";
};
export async function docToPdfBlob(doc:PMNode,opts:PdfExportOptions):Promise<Blob>{
 const {docToScreenPdfBlob}=await import('./pdf-snapshot');
 return docToScreenPdfBlob(doc,opts);
}
