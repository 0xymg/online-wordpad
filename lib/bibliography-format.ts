/** Local, deterministic citeproc snapshot adapter. No network or editor state access. */
import type { SourceRecord, SourceName, SourceDate, CitationAttrs, BibliographyConfiguration } from "./document-bibliography";
export type BibliographyRun = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; superscript?: boolean; subscript?: boolean; href?: string };
export type BibliographySnapshotInput = { sources: Record<string,SourceRecord>; orderedClusters: CitationAttrs[]; configuration: BibliographyConfiguration };
export type BibliographySnapshot = { clustersByFieldId: Record<string,BibliographyRun[]>; entries: BibliographyRun[][]; entrySourceIds: string[][]; entrySecondFields?: Array<{label:BibliographyRun[];body:BibliographyRun[]}>; paragraphLayout: { hangingIndent:boolean;secondFieldAlign:"flush"|"margin"|null;entrySpacing:number;lineSpacing:number;maxOffset:number }; diagnostics:string[]; fingerprint:string };
const escapeData = (s:string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const names = (ns:SourceName[]) => ns.map(n => "literal" in n ? {literal:escapeData(n.literal)} : {family:escapeData(n.family),...(n.given ? {given:escapeData(n.given)}:{}),...(n.suffix ? {suffix:escapeData(n.suffix)}:{}),...(n.particle ? {"non-dropping-particle":escapeData(n.particle)}:{})});
const date = (d:SourceDate) => ({"date-parts":[[d.year,...(d.month ? [d.month]:[]),...(d.day ? [d.day]:[])]]});
export function sourceToCsl(id:string,s:SourceRecord):Record<string,unknown> {
 const result:Record<string,unknown>={id,type:s.type,title:escapeData(s.title),author:names(s.authors)};
 if(s.editors)result.editor=names(s.editors); if(s.issued)result.issued=date(s.issued);if(s.accessed)result.accessed=date(s.accessed);
 for(const [from,to] of Object.entries({containerTitle:"container-title",publisher:"publisher",publisherPlace:"publisher-place",edition:"edition",volume:"volume",issue:"issue",pages:"page",DOI:"DOI",URL:"URL",language:"language"})) { const value=s[from as keyof SourceRecord];if(typeof value==="string")result[to]=escapeData(value); }
 return result;
}
function decode(s:string):string {return s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,e:string)=>{if(e[0]==="#"){const n=e[1].toLowerCase()==="x"?parseInt(e.slice(2),16):parseInt(e.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):"\ufffd";}return ({amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:"\u00a0"} as Record<string,string>)[e.toLowerCase()];});}
/** Parse only supported formatting; never expose processor HTML as executable markup. */
export function bibliographyHtmlToRuns(html:string):BibliographyRun[] {
 const runs:BibliographyRun[]=[],stack:Array<{tag:string;marks:Omit<BibliographyRun,"text">}>=[];
 const append=(text:string)=>{if(!text)return;const marks=Object.assign({},...stack.map(s=>s.marks));const previous=runs[runs.length-1];if(previous&&JSON.stringify({...previous,text:""})===JSON.stringify({...marks,text:""}))previous.text+=text;else runs.push({text,...marks});};
 for(const token of html.match(/<[^>]*>|[^<]+/g)||[]) {
  if(token[0]!=="<"){append(decode(decode(token)));continue;}
  const m=token.match(/^<\s*(\/?)\s*([\w-]+)/);if(!m)continue;const tag=m[2].toLowerCase();
  if(m[1]){const i=stack.map(s=>s.tag).lastIndexOf(tag);if(i>=0)stack.splice(i);continue;}
  if(tag==="br"){append("\n");continue;}
  if(tag==="div"&&/class=["']csl-right-inline["']/.test(token))append("\t");
  const marks:Omit<BibliographyRun,"text">={};if(["i","em"].includes(tag))marks.italic=true;if(["b","strong"].includes(tag))marks.bold=true;if(tag==="sup")marks.superscript=true;if(tag==="sub")marks.subscript=true;if(tag==="u")marks.underline=true;
  if(tag==="span"){if(/font-variant:\s*small-caps/i.test(token)){/* Small caps remains accessible text. */}if(/font-style:\s*italic/i.test(token))marks.italic=true;if(/font-weight:\s*bold/i.test(token))marks.bold=true;}
  if(tag==="a"){const href=token.match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1];if(href){const value=decode(decode(href));if(/^https?:\/\//i.test(value))marks.href=value;}}
  if(!/\/>$/.test(token))stack.push({tag,marks});
 }
 if(runs[0])runs[0].text=runs[0].text.replace(/^\s+/,"");if(runs.length)runs[runs.length-1].text=runs[runs.length-1].text.replace(/\s+$/,"");return runs.filter(r=>r.text);
}
function stable(value:unknown):string {if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;if(value&&typeof value==="object")return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stable((value as Record<string,unknown>)[k])}`).join(",")}}`;return JSON.stringify(value);}
export async function formatBibliographySnapshot(input:BibliographySnapshotInput):Promise<BibliographySnapshot> {
 // Capture before lazy import: callers may replace or edit their input while assets load.
 const snapshot=JSON.parse(JSON.stringify(input)) as BibliographySnapshotInput;
 const [{default:CSL},{default:assets}]=await Promise.all([import("citeproc"),import("./bibliography-assets/data.json")]);
 const ids=Object.keys(snapshot.sources).sort(), items=Object.fromEntries(ids.map(id=>[id,sourceToCsl(id,snapshot.sources[id])]));
 const localeAssets=assets as Record<string,string>;
 const engine=new CSL.Engine({retrieveLocale:(locale)=>localeAssets[`locales-${locale}.xml`]||localeAssets[`locales-${({en:"en-US",tr:"tr-TR",fr:"fr-FR",zh:"zh-CN",ar:"ar"} as Record<string,string>)[locale]}.xml`]||false,retrieveItem:(id)=>{if(!items[id])throw new Error(`Missing bibliography source: ${id}`);return items[id];}},assets[snapshot.configuration.style==="apa7"?"apa.csl":"ieee.csl"],snapshot.configuration.locale,true);
 engine.setOutputFormat("html");
 engine.opt.development_extensions.wrap_url_and_doi=true;
 const seen=new Set<string>(),cited=new Set(snapshot.orderedClusters.flatMap(c=>c.items.map(i=>i.sourceId)));
 if(snapshot.configuration.includeUncited)engine.updateUncitedItems(ids.filter(id=>!cited.has(id)));
 const clustersByFieldId:Record<string,BibliographyRun[]>={},pre:Array<[string,number]>=[];
 for(const cluster of snapshot.orderedClusters){if(seen.has(cluster.fieldId)||!cluster.items.length)throw new Error("Invalid citation cluster identity or empty cluster");seen.add(cluster.fieldId);
 const citation={citationID:cluster.fieldId,citationItems:cluster.items.map(i=>({id:i.sourceId,...(i.locator?{locator:i.locator,label:i.label||"page"}:{}),...(i.prefix?{prefix:escapeData(i.prefix)}:{}),...(i.suffix?{suffix:escapeData(i.suffix)}:{}),...(cluster.mode==="suppress-author"?{"suppress-author":true}:{})})),properties:{noteIndex:0}};
 const [,updates]=engine.processCitationCluster(citation,pre,[]);
 for(const [index,html,fieldId] of updates){const id=fieldId||[...pre.map(p=>p[0]),cluster.fieldId][index];if(!id)throw new Error("Unmapped citation processor update");clustersByFieldId[id]=bibliographyHtmlToRuns(html);}
 pre.push([cluster.fieldId,0]);
 }
 const bibliography=engine.makeBibliography();const params=bibliography?bibliography[0]:{};
 const entries=bibliography?bibliography[1].map(bibliographyHtmlToRuns):[];
 const entrySourceIds=(params.entry_ids||[]) as string[][];
 const entrySecondFields=params["second-field-align"]&&bibliography ? bibliography[1].map(html=>{const label=html.match(/<div class="csl-left-margin">([\s\S]*?)<\/div>/),body=html.match(/<div class="csl-right-inline">([\s\S]*?)<\/div>/);if(!label||!body)throw new Error("Unsupported aligned bibliography entry structure");return {label:bibliographyHtmlToRuns(label[1]),body:bibliographyHtmlToRuns(body[1])};}):undefined;
 const fingerprintBytes=new TextEncoder().encode(stable({snapshot,engine:"citeproc@2.4.63",styles:"8c15d2757ac6ce93c800682f4b9e53582e27e609",locales:"8bef426f89f38c0789223c50e53ec2197bc50bb3"}));
 const digest=await globalThis.crypto.subtle.digest("SHA-256",fingerprintBytes);
 const fingerprint=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
 return {clustersByFieldId,entries,entrySourceIds,...(entrySecondFields?{entrySecondFields}:{}),paragraphLayout:{hangingIndent:!!params.hangingindent,secondFieldAlign:params["second-field-align"]==="flush"?"flush":params["second-field-align"]==="margin"?"margin":null,entrySpacing:Number(params.entryspacing)||0,lineSpacing:Number(params.linespacing)||1,maxOffset:Number(params.maxoffset)||0},diagnostics:[],fingerprint};
}
