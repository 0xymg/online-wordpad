"use client";
import type { ParagraphFormat } from "@/lib/paragraph-format";
import { useT } from "./I18nProvider";
export default function ParagraphFields({values,onChange}:{values:ParagraphFormat;onChange:(patch:ParagraphFormat)=>void}){
 const t=useT().paragraph,field="h-9 w-full border border-input bg-background px-2 text-sm";
 const number=(key:"left"|"right"|"firstLine"|"before"|"after",label:string,cm=false)=><label className="space-y-1 text-sm">{label}<input aria-label={label} className={field} type="number" min={key==="firstLine"?-10:0} max={cm?20:360} step={cm?0.01:0.5} placeholder={t.mixed} value={values[key]===undefined?"":Math.round(values[key]!*(cm?2.54/1440:1/20)*100)/100} onChange={e=>{if(e.target.value!=="")onChange({[key]:Math.round(Number(e.target.value)*(cm?1440/2.54:20))});}}/></label>;
 return <div className="space-y-4">
  <label className="block space-y-1 text-sm">{t.alignment}<select aria-label={t.alignment} className={field} value={values.alignment||""} onChange={e=>onChange({alignment:e.target.value as ParagraphFormat["alignment"]})}><option value="" disabled>{t.mixed}</option>{(["left","center","right","justify"]as const).map(key=><option value={key} key={key}>{t[key]}</option>)}</select></label>
  <div className="grid grid-cols-2 gap-3">{number("left",t.leftIndent,true)}{number("right",t.rightIndent,true)}{number("firstLine",t.firstLine,true)}<span className="self-end pb-2 text-xs text-muted-foreground">{t.hangingHint}</span>{number("before",t.before)}{number("after",t.after)}</div>
  <div className="grid grid-cols-2 gap-3">
   <label className="space-y-1 text-sm">{t.lineSpacing}<select aria-label={t.lineSpacing} className={field} value={values.lineMode||""} onChange={e=>onChange({lineMode:e.target.value as ParagraphFormat["lineMode"],lineValue:e.target.value==="multiple"?1.5:14})}><option value="" disabled>{t.mixed}</option>{(["multiple","exact","atLeast"]as const).map(key=><option key={key} value={key}>{t[key]}</option>)}</select></label>
   <label className="space-y-1 text-sm">{values.lineMode==="multiple"?t.multiplier:t.linePoints}<input aria-label={t.lineValue} disabled={!values.lineMode} className={field} type="number" min="0.5" max={values.lineMode==="multiple"?20:360} step={values.lineMode==="multiple"?0.05:0.5} placeholder={t.mixed} value={values.lineValue??""} onChange={e=>{if(e.target.value!=="")onChange({lineValue:Number(e.target.value)});}}/></label>
  </div>
  <fieldset className="grid grid-cols-1 gap-2 border-t border-border pt-4 sm:grid-cols-2"><legend className="mb-2 text-xs text-muted-foreground">{t.pagination}</legend>{(["keepNext","keepLines","pageBreakBefore","widowControl"]as const).map(key=><label className="flex items-center gap-2 text-xs" key={key}><input type="checkbox" aria-label={t[key]} ref={el=>{if(el)el.indeterminate=values[key]===undefined;}} checked={!!values[key]} onChange={e=>onChange({[key]:e.target.checked})}/>{t[key]}</label>)}</fieldset>
 </div>;
}
