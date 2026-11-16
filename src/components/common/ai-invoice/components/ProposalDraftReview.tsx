import React, { useState } from 'react';
import { ProposalConsumptionReview } from './ProposalConsumptionReview';
import { ProposalCommercialReview } from './ProposalCommercialReview';
import { ProposalDocumentTextsReview } from './ProposalDocumentTextsReview';
import type { AIProposalContext, AIProposalIssue } from '../../../../../shared/aiProposal';
import { resolveAssumption } from '../../../../../shared/assumptions';
import type { FinancialSummaryResult } from '../../../../types';
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import type { ExtractedInvoiceData } from '../../../../types/aiInvoice';
import type { SolarEquipmentItem } from '../../../../types/equipment';
import type { GlobalTariffMatrix } from '../../../../types/tariffs';
import { RD_PROVINCES } from '../../../../data/rdProvinces';
import { getTariffSource, resolveAITariffSelection, tariffSourceFieldLabel } from '../../../../utils/aiTariffContext';
import { describeIssues, firstPendingTarget, focusReviewAnchor, issuesAt, pendingByTab, REVIEW_TABS, reviewAnchor, rowControlFor, worstTier, type IssueTarget, type ReviewIssueView, type ReviewTab } from '../reviewIssues';
import { Field, IssueNotes } from './ReviewFlags';
import type { PreviewEquipment } from '../commercialRows';

interface Props {
  draft: ExtractedInvoiceData;
  catalog: SolarEquipmentItem[];
  matrix: GlobalTariffMatrix;
  context: AIProposalContext;
  production:number[]|null;
  preview: {financial:FinancialSummaryResult;project?:{specs:unknown}} | null;
  update: (updates: Partial<ExtractedInvoiceData>) => void;
  /** Avisos vigentes del borrador (validación + conciliación); sólo se presentan. */
  issues?: readonly AIProposalIssue[];
  /** Avisos ya clasificados por el contenedor (evita derivarlos dos veces); tiene prioridad sobre `issues`. */
  issueViews?: readonly ReviewIssueView[];
  /** Pestaña controlada desde el contenedor para que el chat pueda llevar a un campo. */
  tab?: ReviewTab;
  onTabChange?: (tab: ReviewTab) => void;
}
const usd=(n:number)=>n.toLocaleString('es-DO',{style:'currency',currency:'USD'});
const plural=(n:number,one:string,many:string)=>`${n.toLocaleString('es-DO')} ${n===1?one:many}`;

export function ProposalDraftReview({draft,catalog,matrix,context,preview,production,update,issues=[],issueViews,tab:controlledTab,onTabChange}:Props) {
  const [ownTab,setOwnTab]=useState<ReviewTab>('consumption');
  const tab=controlledTab ?? ownTab;
  const setTab=(next:ReviewTab)=>{setOwnTab(next);onTabChange?.(next);};
  const views=issueViews ?? describeIssues(issues,draft);
  const pending=pendingByTab(views);
  const blocking=views.filter(v=>v.tier==='blocking').length;
  const toReview=views.filter(v=>v.tier!=='info').length;
  const at=(anchor:string)=>issuesAt(views,anchor);
  const go=(target:IssueTarget)=>{if(target.tab)setTab(target.tab);requestAnimationFrame(()=>focusReviewAnchor(target.anchor));};
  const firstPending=firstPendingTarget(views);
  const tariff = resolveAITariffSelection(matrix,draft.distributor,draft.tariffCode);
  const source = tariff ? getTariffSource(matrix,tariff) : null;
  const setRate = (value:string) => {
    const dop = value === '' ? undefined : Number(value);
    update({energyRateSource:dop===undefined?"reference":"manual",energyCostPerKWhDOP:dop,energyCostPerKWhUSD:dop===undefined ? undefined : dop/resolveAssumption('dopExchangeRate', draft.dopExchangeRate)});
  };
  const groups = [
    {key:'panels' as const,type:'panel' as const,label:'Paneles',unit:'W',value:(e:SolarEquipmentItem)=>e.powerW},
    {key:'inverters' as const,type:'inverter' as const,label:'Inversores',unit:'kW AC',value:(e:SolarEquipmentItem)=>e.powerKW},
    {key:'batteries' as const,type:'battery' as const,label:'Baterías',unit:'kWh',value:(e:SolarEquipmentItem)=>e.capacityKWh},
  ];
  const units=(key:'panels'|'inverters'|'batteries')=>(draft[key] || []).reduce((sum,row)=>sum+(Number.isFinite(row.count)?row.count:0),0);
  const incompletePrices=[...(draft.panels || []),...(draft.inverters || []),...(draft.batteries || [])].some(g=>g.unitPriceUSD===undefined);
  const contract=preview?.financial.contractPriceUSD;
  return <div className="proposal-review">
    <div className="proposal-summary" aria-label="Resumen del borrador">
      <div className="proposal-summary-item"><span>Cliente</span><strong data-missing={!draft.clientName || undefined}>{draft.clientName || 'Sin nombre'}</strong><small>{[draft.province,draft.distributor&&`${draft.distributor}${draft.tariffCode?` · ${draft.tariffCode}`:''}`].filter(Boolean).join(' · ') || 'Ubicación y tarifa pendientes'}</small></div>
      <div className="proposal-summary-item"><span>Potencia DC</span><strong>{(draft.recommendedCapacityKWp || 0).toLocaleString('es-DO',{minimumFractionDigits:2,maximumFractionDigits:2})} kWp</strong><small>{plural(draft.recommendedPanelCount || units('panels'),'módulo','módulos')}</small></div>
      <div className="proposal-summary-item"><span>Equipos</span><strong>{plural(units('inverters'),'inversor','inversores')}</strong><small>{units('batteries')?plural(units('batteries'),'batería','baterías'):'Sin almacenamiento'}</small></div>
      <div className="proposal-summary-item proposal-summary-price"><span>Total a pagar{incompletePrices&&contract!==undefined?' · provisional':''}</span><strong data-missing={contract===undefined || undefined}>{contract===undefined?'Pendiente':usd(contract)}</strong><small>{contract===undefined?'Se calcula al resolver precios y bloqueos':incompletePrices?'Faltan costos de equipos':'Calculado con el motor financiero'}</small></div>
      <button type="button" className="proposal-summary-status" data-tier={blocking?'blocking':toReview?'confirm':'ok'} disabled={!firstPending} onClick={()=>firstPending&&go(firstPending)}>
        {toReview?<AlertTriangle size={18} aria-hidden/>:<CheckCircle2 size={18} aria-hidden/>}
        <span><strong>{toReview?`${toReview} por revisar`:'Sin pendientes'}</strong><small>{blocking?`${plural(blocking,'bloquea','bloquean')} la creación`:toReview?'Confirma antes de crear':'Revisa y confirma abajo'}</small></span>
      </button>
    </div>
    <div className="proposal-review-tabs" role="tablist" aria-label="Secciones del borrador">{REVIEW_TABS.map(({key,label})=>{
      const count=pending[key];
      const tier=worstTier(views.filter(v=>v.tier!=='info'&&v.target?.tab===key));
      return <button type="button" key={key} role="tab" tabIndex={tab===key?0:-1} onKeyDown={e=>{const keys=REVIEW_TABS.map(t=>t.key);let index=keys.indexOf(tab);if(e.key==='ArrowRight')index=(index+1)%4;else if(e.key==='ArrowLeft')index=(index+3)%4;else if(e.key==='Home')index=0;else if(e.key==='End')index=3;else return;e.preventDefault();setTab(keys[index]);document.getElementById(`proposal-label-${keys[index]}`)?.focus();}} aria-selected={tab===key} aria-controls={`proposal-tab-${key}`} id={`proposal-label-${key}`} onClick={()=>setTab(key)}>
        {label}{count>0&&<><span className="proposal-count" data-tier={tier} aria-hidden>{count}</span><span className="sr-only"> ({count} pendientes)</span></>}
      </button>;
    })}</div>
    {!!draft.unresolvedRequests?.length && <section className="proposal-unresolved" id={reviewAnchor.unresolved} tabIndex={-1}><h3>Solicitudes pendientes</h3><ul>{draft.unresolvedRequests.map((request,i)=><li key={i}>{request}</li>)}</ul><p className="proposal-note">Corrige el borrador o pide una alternativa al asistente. Marca como resuelto únicamente cuando hayas seleccionado una solución.</p><button type="button" className="proposal-confirm" onClick={()=>update({unresolvedRequests:[]})}>Confirmar que resolví estas solicitudes</button></section>}
    <ProposalDocumentTextsReview draft={draft} update={update} issues={at(reviewAnchor.documentTexts)}/>
    <div role="tabpanel" id="proposal-tab-client" aria-labelledby="proposal-label-client" hidden={tab!=='client'}><section>
      <h3>Cliente y suministro</h3>
      <div className="proposal-fields">
        <Field wide anchor={reviewAnchor.field('clientName')} label="Nombre del cliente" issues={at(reviewAnchor.field('clientName'))}><input value={draft.clientName} onChange={e=>update({clientName:e.target.value})}/></Field>
        <label className="wide">Dirección<input value={draft.address || ''} onChange={e=>update({address:e.target.value})}/></label>
        <label>Provincia<select value={draft.province || ''} onChange={e=>update({province:e.target.value})}><option value="">Selecciona provincia</option>{RD_PROVINCES.map(p=><option key={p.name}>{p.name}</option>)}</select></label>
        <label>NIC / contrato<input value={draft.nic || ''} onChange={e=>update({nic:e.target.value})}/></label>
        <Field anchor={reviewAnchor.field('distributor')} label="Distribuidora" issues={at(reviewAnchor.field('distributor'))}><select value={draft.distributor || ''} onChange={e=>update({distributor:e.target.value as ExtractedInvoiceData['distributor'],tariffCode:'',energyCostPerKWhDOP:undefined,energyCostPerKWhUSD:undefined,energyRateSource:'reference'})}><option value="">Selecciona distribuidora</option>{Object.keys(matrix.schedules).map(d=><option key={d}>{d}</option>)}</select></Field>
        <Field anchor={reviewAnchor.field('tariffCode')} label="Tarifa" issues={at(reviewAnchor.field('tariffCode'))}><select value={draft.tariffCode || ''} onChange={e=>update({tariffCode:e.target.value,energyCostPerKWhDOP:undefined,energyCostPerKWhUSD:undefined,energyRateSource:'reference'})}><option value="">Selecciona tarifa</option>{Object.values(matrix.schedules[draft.distributor]?.tariffs || {}).map(t=><option key={t.code} value={t.code}>{t.code} · {t.name}</option>)}</select></Field>
        <Field anchor={reviewAnchor.field('energyRate')} label="Tarifa de energía (RD$/kWh)" issues={at(reviewAnchor.field('energyRate'))}><input type="number" min="0" step="0.0001" value={draft.energyCostPerKWhDOP ?? ''} onChange={e=>setRate(e.target.value)}/></Field>
        <Field anchor={reviewAnchor.field('exchange')} label="Cambio (RD$ por USD)" issues={at(reviewAnchor.field('exchange'))}><input type="number" min="1" step="0.01" value={resolveAssumption('dopExchangeRate', draft.dopExchangeRate)} onChange={e=>{const rate=Number(e.target.value);if(rate>0)update({dopExchangeRate:rate,energyCostPerKWhUSD:draft.energyCostPerKWhDOP===undefined?undefined:draft.energyCostPerKWhDOP/rate});}}/></Field>
      </div>
      {source && <p className="proposal-note">Referencia de catálogo: {source.resolutionCode} · desde {source.effectiveDate}. Confirma que corresponde al período de la factura. Los cargos fijos y de demanda no son tarifa de energía.</p>}
    {source?.fieldSources && <p className="proposal-note">Procedencia por campo: {Object.entries(source.fieldSources).map(([field,s])=>`${tariffSourceFieldLabel(field)}: ${s.resolutionCode}`).join(' · ')}</p>}
    </section>
    </div><div role="tabpanel" id="proposal-tab-consumption" aria-labelledby="proposal-label-consumption" hidden={tab!=='consumption'}><ProposalConsumptionReview draft={draft} context={context} production={production} update={update} issues={views}/></div>
    <div role="tabpanel" id="proposal-tab-equipment" aria-labelledby="proposal-label-equipment" hidden={tab!=='equipment'}>
    <section id={reviewAnchor.field('equipment')} tabIndex={-1}>
      <h3>Equipos del catálogo</h3>
      <p className="proposal-note">Puedes combinar modelos. Las especificaciones vienen del inventario. Puedes cambiar el modelo o su costo para esta cotización; la IA no crea equipos.</p>
      <IssueNotes issues={at(reviewAnchor.field('equipment'))}/>
      {groups.map(group => {
        const rows = draft[group.key] || [];
        const options = catalog.filter(e=>e.type===group.type);
        const change = (index:number,id:string,count:number) => {
          const next = rows.map((row,i)=>i===index?{...row,id,count,...(row.id!==id ? {requestedModel:undefined,requestedPowerW:undefined,requestedPowerKW:undefined,requestedCapacityKWh:undefined,unitPriceUSD:undefined,priceSource:'supplier' as const}: {})}:row);
          update({[group.key]:next,...(group.type==='battery'?{hasBattery:next.length>0}:{})});
        };
        const groupIssues=at(reviewAnchor.group(group.key));
        return <div className="proposal-equipment-group" key={group.key} id={reviewAnchor.group(group.key)} tabIndex={-1} data-flag={worstTier(groupIssues)}>
          <div className="proposal-group-heading"><h4>{group.label}<span className="proposal-group-count">{rows.length?plural(rows.reduce((s,r)=>s+(r.count||0),0),'unidad','unidades'):''}</span></h4><button type="button" className="proposal-ghost" disabled={!options.some(e=>!rows.some(row=>row.id===e.id))} onClick={()=>{
            // Add an explicit, visible review row; no automatic selection during extraction.
            const item=options.find(e=>!rows.some(row=>row.id===e.id)); if(!item)return;
            update({[group.key]:[...rows,{id:item.id,count:1}],...(group.type==='battery'?{hasBattery:true}:{})});
          }}><Plus size={15}/>Añadir modelo</button></div>
          <IssueNotes issues={groupIssues}/>
          {rows.length === 0 && <p className="proposal-note proposal-empty-row">{group.type==='battery'?'Sin almacenamiento':'Sin modelo seleccionado'}</p>}
          {rows.map((row,i)=>{
            const anchor=reviewAnchor.row(group.key,i);
            const rowIssues=at(anchor);
            const rowTier=worstTier(rowIssues) ?? (row.requestedModel?'confirm':undefined);
            const selected=options.find(e=>e.id===row.id);
            const notesId=rowIssues.length?`${anchor}-issues`:undefined;
            const invalid=(control:'model'|'count'|'price')=>rowIssues.some(v=>v.tier==='blocking'&&rowControlFor(v.code)===control)?true:undefined;
            return <div className="proposal-equipment-row" key={`${group.key}-${i}`} id={anchor} tabIndex={-1} data-flag={rowTier}>
            <label>Modelo<select value={row.id} aria-describedby={notesId} aria-invalid={invalid('model')} onChange={e=>change(i,e.target.value,row.count)}>{!options.some(e=>e.id===row.id)&&<option value={row.id}>Modelo no disponible</option>}{options.map(e=><option key={e.id} value={e.id}>{e.displayName || e.modelSeries} · {group.value(e)} {group.unit}</option>)}</select></label>
            <label>Unidades<input type="number" min="1" max="100000" step="1" value={Number.isFinite(row.count)?row.count:''} aria-describedby={notesId} aria-invalid={invalid('count')} onChange={e=>change(i,row.id,Number(e.target.value))}/></label>
            <button type="button" className="proposal-icon-button" aria-label={`Quitar ${row.brandModel || group.label}`} onClick={()=>{const next=rows.filter((_,j)=>i!==j);update({[group.key]:next,...(group.type==='battery'?{hasBattery:next.length>0}:{})});}}><Trash2 size={17}/></button>
            {(row.requestedModel || rowIssues.length>0) && <div className="proposal-row-alert" data-tier={rowTier}>
              <IssueNotes issues={rowIssues} id={notesId}/>
              {row.requestedModel && <div className="proposal-row-alert-body"><p>La IA no pudo confirmar el modelo. Solicitado: <strong>{row.requestedModel}</strong> · En el borrador: <strong>{selected?.displayName || row.brandModel || 'sin modelo'}</strong>.</p><button type="button" className="proposal-confirm" onClick={()=>update({[group.key]:rows.map((item,j)=>j===i?{...item,requestedModel:undefined}:item)})}>Confirmar el modelo seleccionado</button></div>}
            </div>}
            <div className="proposal-row-price"><label>Costo unitario (USD) · {row.priceSource==='manual'?'particular de esta cotización':'proveedor del inventario'}<input type="number" min="0" step="0.01" value={row.unitPriceUSD ?? ''} aria-describedby={notesId} aria-invalid={invalid('price')} onChange={e=>update({[group.key]:rows.map((r,j)=>j===i?{...r,unitPriceUSD:e.target.value===''?undefined:Number(e.target.value),priceSource:'manual'}:r)})}/></label><button type="button" className="proposal-ghost" onClick={()=>update({[group.key]:rows.map((r,j)=>j===i?{...r,unitPriceUSD:undefined,priceSource:'supplier'}:r)})}>Usar oferta del inventario</button></div>
            <p className="proposal-row-total" data-missing={row.unitPriceUSD === undefined || undefined}>{row.unitPriceUSD === undefined ? <><AlertTriangle size={14} aria-hidden/>Sin precio de proveedor · revisar cotización</> : <><span>{usd(row.unitPriceUSD)} / unidad</span><strong>{usd(row.unitPriceUSD*(row.count||0))}</strong></>}</p>
          </div>;})}
        </div>;
      })}
      <dl className="proposal-totals"><div><dt>Potencia DC</dt><dd>{(draft.recommendedCapacityKWp || 0).toFixed(2)} kWp</dd></div><div><dt>Módulos</dt><dd>{draft.recommendedPanelCount || 0}</dd></div></dl>
    </section>
    <section><h3>Notas técnicas</h3><label>Condiciones de instalación<textarea value={draft.specialTechnicalNotes || draft.aiNotes || ""} onChange={e=>update({specialTechnicalNotes:e.target.value,aiNotes:undefined})}/></label></section>
    </div><div role="tabpanel" id="proposal-tab-commercial" aria-labelledby="proposal-label-commercial" hidden={tab!=='commercial'}><ProposalCommercialReview draft={draft} financial={preview?.financial} equipment={preview?.project?.specs as PreviewEquipment | undefined} update={update} issues={views}/></div>
    {(draft.specialTechnicalNotes || draft.aiNotes) && <section className="proposal-draft-notes"><h3>Notas del borrador</h3><p>{draft.specialTechnicalNotes || draft.aiNotes}</p></section>}
  </div>;
}
