import React, { useState } from 'react';
import { ProposalConsumptionReview } from './ProposalConsumptionReview';
import { ProposalCommercialReview } from './ProposalCommercialReview';
import type { AIProposalContext } from '../../../../../shared/aiProposal';
import type { FinancialSummaryResult } from '../../../../types';
import { Plus, Trash2 } from 'lucide-react';
import type { ExtractedInvoiceData } from '../../../../types/aiInvoice';
import type { SolarEquipmentItem } from '../../../../types/equipment';
import type { GlobalTariffMatrix } from '../../../../types/tariffs';
import { RD_PROVINCES } from '../../../../data/rdProvinces';
import { getTariffSource, resolveAITariffSelection, tariffSourceFieldLabel } from '../../../../utils/aiTariffContext';

interface Props {
  draft: ExtractedInvoiceData;
  catalog: SolarEquipmentItem[];
  matrix: GlobalTariffMatrix;
  context: AIProposalContext;
  production:number[]|null;
  preview: {financial:FinancialSummaryResult} | null;
  update: (updates: Partial<ExtractedInvoiceData>) => void;
}
export function ProposalDraftReview({draft,catalog,matrix,context,preview,production,update}:Props) {
  const [tab,setTab]=useState('consumption');
  const tariff = resolveAITariffSelection(matrix,draft.distributor,draft.tariffCode);
  const source = tariff ? getTariffSource(matrix,tariff) : null;
  const setRate = (value:string) => {
    const dop = value === '' ? undefined : Number(value);
    update({energyRateSource:dop===undefined?"reference":"manual",energyCostPerKWhDOP:dop,energyCostPerKWhUSD:dop===undefined ? undefined : dop/(draft.dopExchangeRate || 60.5)});
  };
  const groups = [
    {key:'panels' as const,type:'panel' as const,label:'Paneles',unit:'W',value:(e:SolarEquipmentItem)=>e.powerW},
    {key:'inverters' as const,type:'inverter' as const,label:'Inversores',unit:'kW AC',value:(e:SolarEquipmentItem)=>e.powerKW},
    {key:'batteries' as const,type:'battery' as const,label:'Baterías',unit:'kWh',value:(e:SolarEquipmentItem)=>e.capacityKWh},
  ];
  return <div className="proposal-review">
    <div className="proposal-review-tabs" role="tablist" aria-label="Secciones del borrador">{[['consumption','Consumo y diseño'],['equipment','Equipos'],['commercial','Cotización'],['client','Cliente y tarifa']].map(([key,label])=><button type="button" key={key} role="tab" tabIndex={tab===key?0:-1} onKeyDown={e=>{const keys=['consumption','equipment','commercial','client'];let index=keys.indexOf(tab);if(e.key==='ArrowRight')index=(index+1)%4;else if(e.key==='ArrowLeft')index=(index+3)%4;else if(e.key==='Home')index=0;else if(e.key==='End')index=3;else return;e.preventDefault();setTab(keys[index]);document.getElementById(`proposal-label-${keys[index]}`)?.focus();}} aria-selected={tab===key} aria-controls={`proposal-tab-${key}`} id={`proposal-label-${key}`} onClick={()=>setTab(key)}>{label}</button>)}</div>
    {!!draft.unresolvedRequests?.length && <section className="proposal-unresolved"><h3>Solicitudes pendientes</h3><ul>{draft.unresolvedRequests.map((request,i)=><li key={i}>{request}</li>)}</ul><p className="proposal-note">Corrige el borrador o pide una alternativa al asistente. Marca como resuelto únicamente cuando hayas seleccionado una solución.</p><button type="button" onClick={()=>update({unresolvedRequests:[]})}>Confirmar que resolví estas solicitudes</button></section>}
    <div role="tabpanel" id="proposal-tab-client" aria-labelledby="proposal-label-client" hidden={tab!=='client'}><section>
      <h3>Cliente y suministro</h3>
      <div className="proposal-fields">
        <label className="wide">Nombre del cliente<input value={draft.clientName} onChange={e=>update({clientName:e.target.value})}/></label>
        <label className="wide">Dirección<input value={draft.address || ''} onChange={e=>update({address:e.target.value})}/></label>
        <label>Provincia<select value={draft.province || ''} onChange={e=>update({province:e.target.value})}><option value="">Selecciona provincia</option>{RD_PROVINCES.map(p=><option key={p.name}>{p.name}</option>)}</select></label>
        <label>NIC / contrato<input value={draft.nic || ''} onChange={e=>update({nic:e.target.value})}/></label>
        <label>Distribuidora<select value={draft.distributor || ''} onChange={e=>update({distributor:e.target.value as ExtractedInvoiceData['distributor'],tariffCode:'',energyCostPerKWhDOP:undefined,energyCostPerKWhUSD:undefined})}><option value="">Selecciona distribuidora</option>{Object.keys(matrix.schedules).map(d=><option key={d}>{d}</option>)}</select></label>
        <label>Tarifa<select value={draft.tariffCode || ''} onChange={e=>update({tariffCode:e.target.value})}><option value="">Selecciona tarifa</option>{Object.values(matrix.schedules[draft.distributor]?.tariffs || {}).map(t=><option key={t.code} value={t.code}>{t.code} · {t.name}</option>)}</select></label>
        <label>Tarifa de energía (RD$/kWh)<input type="number" min="0" step="0.0001" value={draft.energyCostPerKWhDOP ?? ''} onChange={e=>setRate(e.target.value)}/></label>
        <label>Cambio (RD$ por USD)<input type="number" min="1" step="0.01" value={draft.dopExchangeRate || 60.5} onChange={e=>{const rate=Number(e.target.value);if(rate>0)update({dopExchangeRate:rate,energyCostPerKWhUSD:draft.energyCostPerKWhDOP===undefined?undefined:draft.energyCostPerKWhDOP/rate});}}/></label>
      </div>
      {source && <p className="proposal-note">Referencia de catálogo: {source.resolutionCode} · desde {source.effectiveDate}. Confirma que corresponde al período de la factura. Los cargos fijos y de demanda no son tarifa de energía.</p>}
    {source?.fieldSources && <p className="proposal-note">Procedencia por campo: {Object.entries(source.fieldSources).map(([field,s])=>`${tariffSourceFieldLabel(field)}: ${s.resolutionCode}`).join(' · ')}</p>}
    </section>
    </div><div role="tabpanel" id="proposal-tab-consumption" aria-labelledby="proposal-label-consumption" hidden={tab!=='consumption'}><ProposalConsumptionReview draft={draft} context={context} production={production} update={update}/></div>
    <div role="tabpanel" id="proposal-tab-equipment" aria-labelledby="proposal-label-equipment" hidden={tab!=='equipment'}>
    <section>
      <h3>Equipos del catálogo</h3>
      <p className="proposal-note">Puedes combinar modelos. Las especificaciones vienen del inventario. Puedes cambiar el modelo o su costo para esta cotización; la IA no crea equipos.</p>
      {groups.map(group => {
        const rows = draft[group.key] || [];
        const options = catalog.filter(e=>e.type===group.type);
        const change = (index:number,id:string,count:number) => {
          const next = rows.map((row,i)=>i===index?{...row,id,count,...(row.id!==id ? {requestedModel:undefined,requestedPowerW:undefined,requestedPowerKW:undefined,requestedCapacityKWh:undefined,unitPriceUSD:undefined,priceSource:'supplier' as const}: {})}:row);
          update({[group.key]:next,...(group.type==='battery'?{hasBattery:next.length>0}:{})});
        };
        return <div className="proposal-equipment-group" key={group.key}>
          <div className="proposal-group-heading"><h4>{group.label}</h4><button type="button" disabled={!options.some(e=>!rows.some(row=>row.id===e.id))} onClick={()=>{
            // Add an explicit, visible review row; no automatic selection during extraction.
            const item=options.find(e=>!rows.some(row=>row.id===e.id)); if(!item)return;
            update({[group.key]:[...rows,{id:item.id,count:1}],...(group.type==='battery'?{hasBattery:true}:{})});
          }}><Plus size={15}/>Añadir modelo</button></div>
          {rows.length === 0 && <p className="proposal-note">{group.type==='battery'?'Sin almacenamiento':'Sin modelo seleccionado'}</p>}
          {rows.map((row,i)=><div className="proposal-equipment-row" key={`${group.key}-${i}`}>
            <label>Modelo<select value={row.id} onChange={e=>change(i,e.target.value,row.count)}>{!options.some(e=>e.id===row.id)&&<option value={row.id}>Modelo no disponible</option>}{options.map(e=><option key={e.id} value={e.id}>{e.displayName || e.modelSeries} · {group.value(e)} {group.unit}</option>)}</select></label>
            <label>Unidades<input type="number" min="1" max="100000" step="1" value={row.count} onChange={e=>change(i,row.id,Number(e.target.value))}/></label>
            <button type="button" className="proposal-icon-button" aria-label={`Quitar ${row.brandModel || group.label}`} onClick={()=>{const next=rows.filter((_,j)=>i!==j);update({[group.key]:next,...(group.type==='battery'?{hasBattery:next.length>0}:{})});}}><Trash2 size={17}/></button>
            {row.requestedModel && <p className="proposal-note">Modelo solicitado: {row.requestedModel} <button type="button" onClick={()=>update({[group.key]:rows.map((item,j)=>j===i?{...item,requestedModel:undefined}:item)})}>Confirmar el modelo seleccionado</button></p>}<label className="proposal-row-price">Costo unitario (USD) · {row.priceSource==='manual'?'particular de esta cotización':'proveedor del inventario'}<input type="number" min="0" step="0.01" value={row.unitPriceUSD ?? ''} onChange={e=>update({[group.key]:rows.map((r,j)=>j===i?{...r,unitPriceUSD:e.target.value===''?undefined:Number(e.target.value),priceSource:'manual'}:r)})}/><button type="button" onClick={()=>update({[group.key]:rows.map((r,j)=>j===i?{...r,unitPriceUSD:undefined,priceSource:'supplier'}:r)})}>Usar oferta del inventario</button></label><p className="proposal-row-price">{row.unitPriceUSD === undefined ? 'Sin precio de proveedor · revisar cotización' : `${row.unitPriceUSD.toLocaleString('es-DO',{style:'currency',currency:'USD'})} / unidad`}</p>
          </div>)}
        </div>;
      })}
      <dl className="proposal-totals"><div><dt>Potencia DC</dt><dd>{(draft.recommendedCapacityKWp || 0).toFixed(2)} kWp</dd></div><div><dt>Módulos</dt><dd>{draft.recommendedPanelCount || 0}</dd></div></dl>
    </section>
    <section><h3>Notas técnicas</h3><label>Condiciones de instalación<textarea value={draft.specialTechnicalNotes || draft.aiNotes || ""} onChange={e=>update({specialTechnicalNotes:e.target.value,aiNotes:undefined})}/></label></section>
    </div><div role="tabpanel" id="proposal-tab-commercial" aria-labelledby="proposal-label-commercial" hidden={tab!=='commercial'}><ProposalCommercialReview draft={draft} financial={preview?.financial} update={update}/></div>
    {(draft.specialTechnicalNotes || draft.aiNotes) && <section><h3>Notas del borrador</h3><p>{draft.specialTechnicalNotes || draft.aiNotes}</p></section>}
  </div>;
}
