import type { CustomQuotationItem, CustomQuotationDiscount } from '../src/types';
export interface AIProposalCommercial {
  pricingMode?: 'cost_matrix' | 'direct_watt';
  markupPct?: number;
  marginOnSalePct?: number;
  installationUnitPriceUSD?: number;
  installationTotalUSD?: number;
  directPriceSurplusTarget?: 'margin' | 'labor';
  pricePerWattUSD?: number;
  customItems?: CustomQuotationItem[];
  customDiscounts?: CustomQuotationDiscount[];
}
export const COMMERCIAL_SCHEMA = {type:'OBJECT',description:'Condiciones comerciales completas. Los requisitos actuales prevalecen sobre context.commercial y currentDraft. Devuelve los valores explícitos de utilidad, mano de obra, extras y descuentos; nunca omitas cambios solicitados.',properties:{
  pricingMode:{type:'STRING',enum:['cost_matrix','direct_watt']},markupPct:{type:'NUMBER',nullable:true,description:'Recargo sobre costo solicitado; 40 significa40%. null cuando se utiliza margen sobre venta.'},marginOnSalePct:{type:'NUMBER',nullable:true,description:'Margen sobre venta solicitado. null cuando se utiliza recargo sobre costo.'},installationUnitPriceUSD:{type:'NUMBER',nullable:true,description:'Mano de obra USD/kWp. null si se pide un importe total.'},installationTotalUSD:{type:'NUMBER',nullable:true,description:'Mano de obra total USD del proyecto, por ejemplo500. null si se usa USD/kWp.'},directPriceSurplusTarget:{type:'STRING',enum:['margin','labor']},pricePerWattUSD:{type:'NUMBER'},
  customItems:{type:'ARRAY',items:{type:'OBJECT',properties:{id:{type:'STRING'},description:{type:'STRING'},quantity:{type:'NUMBER'},unit:{type:'STRING'},unitPriceUSD:{type:'NUMBER'},exonerateITBIS:{type:'BOOLEAN'},applyMargin:{type:'BOOLEAN'}},required:['description','quantity','unitPriceUSD','exonerateITBIS','applyMargin']}},
  customDiscounts:{type:'ARRAY',items:{type:'OBJECT',properties:{id:{type:'STRING'},description:{type:'STRING'},type:{type:'STRING',enum:['fixed','percentage']},value:{type:'NUMBER'},target:{type:'STRING',enum:['general','equipment']}},required:['description','type','value','target']}},
},required:['markupPct','marginOnSalePct','installationUnitPriceUSD','installationTotalUSD','customItems','customDiscounts']};
/** Omission retains context, explicit [] clears lists; invalid financial data blocks application. */
export function normalizeCommercial(raw: any, base: AIProposalCommercial | undefined, issue:(code:string,message:string)=>void): AIProposalCommercial {
  raw=raw && typeof raw==='object'&&!Array.isArray(raw)?Object.fromEntries(Object.entries(raw).filter(([,v])=>v!==null)):{};
  const value={...base,...raw};
  if(raw?.marginOnSalePct!==undefined && raw?.markupPct===undefined)value.markupPct=undefined;
  if(raw?.markupPct!==undefined && raw?.marginOnSalePct===undefined)value.marginOnSalePct=undefined;
  if(raw?.installationTotalUSD!==undefined && raw?.installationUnitPriceUSD===undefined)value.installationUnitPriceUSD=undefined;
  if(raw?.installationUnitPriceUSD!==undefined && raw?.installationTotalUSD===undefined)value.installationTotalUSD=undefined;
  const out:AIProposalCommercial={};
  if(value.directPriceSurplusTarget!==undefined){if(['margin','labor'].includes(value.directPriceSurplusTarget))out.directPriceSurplusTarget=value.directPriceSurplusTarget;else {out.directPriceSurplusTarget=value.directPriceSurplusTarget;issue('invalid_surplus','Selecciona el destino del excedente de precio directo.');}}
  if(value.pricingMode!==undefined) {if(['cost_matrix','direct_watt'].includes(value.pricingMode))out.pricingMode=value.pricingMode;else {out.pricingMode=value.pricingMode;issue('invalid_pricing_mode','Selecciona una modalidad de precio válida.');}}
  for(const key of ['markupPct','marginOnSalePct','installationUnitPriceUSD','installationTotalUSD','pricePerWattUSD'] as const){
    if(value[key]===undefined)continue;
    out[key]=value[key]; // Retain invalid edit values so repeated validation cannot silently clear the error.
    if(typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<0||(key==='marginOnSalePct'&&value[key]>=100)||(key==='markupPct'&&value[key]>1000))issue(`invalid_${key}`,`Revisa ${key}: requiere un valor válido y no negativo.`);
  }
  if(out.pricingMode==='direct_watt' && !(typeof out.pricePerWattUSD==='number' && Number.isFinite(out.pricePerWattUSD) && out.pricePerWattUSD>0))issue('invalid_direct_price','El precio directo de venta debe ser mayor que cero.');
  if(out.installationUnitPriceUSD!==undefined&&out.installationTotalUSD!==undefined)issue('ambiguous_labor','Usa costo total o USD/kWp para mano de obra, no ambos.');
  if(out.markupPct!==undefined&&out.marginOnSalePct!==undefined)issue('ambiguous_margin','Usa recargo sobre costo o margen sobre venta, no ambos.');
  for(const key of ['customItems','customDiscounts'] as const){
    if(value[key]===undefined)continue;
    if(!Array.isArray(value[key])||value[key].length>100){(out as any)[key]=value[key];issue(`invalid_${key}`,'Revisa la lista comercial (máximo 100 filas).');continue;}
    const ids=new Set<string>();
    (out as any)[key]=value[key].map((row:any,i:number)=>{
      const id=typeof row?.id==='string'&&row.id.trim()?row.id:`ai-${key}-${i}`;
      if(ids.has(id))issue(`duplicate_${key}`,'Hay filas comerciales con identificadores repetidos.'); ids.add(id);
      if(typeof row?.description!=='string'||!row.description.trim())issue(`invalid_${key}_description`,'Cada fila comercial necesita una descripción.');
      const n=(v:any)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
      if(key==='customItems'){
        if(!n(row?.quantity)||row.quantity<=0||!n(row?.unitPriceUSD)||typeof row?.exonerateITBIS!=='boolean'||typeof row?.applyMargin!=='boolean')issue('invalid_extra','Completa cantidad, costo y tratamiento de margen/ITBIS del extra.');
        return {id,description:row?.description,quantity:row?.quantity,unit:row?.unit||'UD',unitPriceUSD:row?.unitPriceUSD,exonerateITBIS:row?.exonerateITBIS,applyMargin:row?.applyMargin};
      }
      if(!['fixed','percentage'].includes(row?.type)||!n(row?.value)||(row.type==='percentage'&&row.value>100)||!['general','equipment'].includes(row?.target))issue('invalid_discount','Revisa importe, tipo y destino del descuento.');
      return {id,description:row?.description,type:row?.type,value:row?.value,target:row?.target};
    });
  }
  return out;
}
export function commercialMarkup(value: AIProposalCommercial):number|undefined {
  return value.marginOnSalePct!==undefined ? 100/(100-value.marginOnSalePct)-1 : value.markupPct!==undefined ? value.markupPct/100 : undefined;
}
