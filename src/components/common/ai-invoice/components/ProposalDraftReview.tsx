import React, { useState } from 'react';
import { ProposalConsumptionReview } from './ProposalConsumptionReview';
import { ProposalCommercialReview } from './ProposalCommercialReview';
import { ProposalDocumentTextsReview } from './ProposalDocumentTextsReview';
import type { AIProposalContext, AIProposalIssue } from '../../../../../shared/aiProposal';
import { resolveAssumption } from '../../../../../shared/assumptions';
import type { FinancialSummaryResult, UtilityRates } from '../../../../types';
import { blockValuationNote } from '../../../simulator/params/sections/rates/tariffPresentation';
import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, PackageOpen, Plus, Trash2 } from 'lucide-react';
import type { ExtractedInvoiceData } from '../../../../types/aiInvoice';
import type { SolarEquipmentItem } from '../../../../types/equipment';
import type { GlobalTariffMatrix } from '../../../../types/tariffs';
import { RD_PROVINCES } from '../../../../data/rdProvinces';
import { getTariffSource, resolveAITariffSelection, tariffSourceFieldLabel } from '../../../../utils/aiTariffContext';
import { buildIssueModel, confirmRequestedRow, focusReviewAnchor, requestedRowAlert, issueModelFromViews, issuesAt, REVIEW_TABS, reviewAnchor, rowControlFor, worstTier, type IssueTarget, type ReviewIssueModel, type ReviewIssueView, type ReviewTab } from '../reviewIssues';
import { Field, IssueNotes } from './ReviewFlags';
import type { PreviewEquipment } from '../commercialRows';

interface Props {
  draft: ExtractedInvoiceData;
  catalog: SolarEquipmentItem[];
  matrix: GlobalTariffMatrix;
  context: AIProposalContext;
  production:number[]|null;
  preview: {financial:FinancialSummaryResult;project?:{specs:unknown;rates?:UtilityRates;monthlyConsumption?:number[]}} | null;
  update: (updates: Partial<ExtractedInvoiceData>) => void;
  /** Avisos vigentes del borrador (validación + conciliación); sólo se presentan. */
  issues?: readonly AIProposalIssue[];
  /** Avisos ya clasificados por el contenedor (evita derivarlos dos veces); tiene prioridad sobre `issues`. */
  issueViews?: readonly ReviewIssueView[];
  /** Modelo de avisos del contenedor (el mismo del chat y del pie); tiene prioridad sobre `issueViews` e `issues`. */
  issueModel?: ReviewIssueModel;
  /** Pestaña controlada desde el contenedor para que el chat pueda llevar a un campo. */
  tab?: ReviewTab;
  onTabChange?: (tab: ReviewTab) => void;
}
const usd=(n:number)=>n.toLocaleString('es-DO',{style:'currency',currency:'USD'});
const plural=(n:number,one:string,many:string)=>`${n.toLocaleString('es-DO')} ${n===1?one:many}`;

export function ProposalDraftReview({draft,catalog,matrix,context,preview,production,update,issues=[],issueViews,issueModel,tab:controlledTab,onTabChange}:Props) {
  const [ownTab,setOwnTab]=useState<ReviewTab>('consumption');
  const tab=controlledTab ?? ownTab;
  const setTab=(next:ReviewTab)=>{setOwnTab(next);onTabChange?.(next);};
  const model=issueModel ?? (issueViews ? issueModelFromViews(issueViews) : buildIssueModel(issues,draft));
  const {views,byTab:pending,firstPending}=model;
  const {blocking,pending:toReview}=model.counts;
  const at=(anchor:string)=>issuesAt(views,anchor);
  const go=(target:IssueTarget)=>{if(target.tab)setTab(target.tab);requestAnimationFrame(()=>focusReviewAnchor(target.anchor));};
  const tariff = resolveAITariffSelection(matrix,draft.distributor,draft.tariffCode);
  const source = tariff ? getTariffSource(matrix,tariff) : null;
  // Con facturación por bloques (la misma decisión del motor sobre la propuesta de la vista previa) se explica cómo se valora.
  const blockNote = preview?.project?.rates ? blockValuationNote(preview.project.rates,preview.project.monthlyConsumption ?? draft.monthlyConsumptionKWh) : null;
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
      <div className="proposal-summary-item proposal-summary-price"><span>Total a pagar{incompletePrices&&contract!==undefined?' · provisional':''}</span><strong data-missing={contract===undefined || undefined}>{contract===undefined?'—':usd(contract)}</strong><small>{contract===undefined?'Al resolver precios y bloqueos':incompletePrices?'Faltan costos de equipos':'Motor financiero'}</small></div>
    </div>
    {/* Franja pegajosa única: pestañas en una fila + total + pendientes, para no perder el estado al bajar. */}
    <div className="proposal-review-band">
      <div className="proposal-review-tabs" role="tablist" aria-label="Secciones del borrador">{REVIEW_TABS.map(({key,label,short})=>{
        const count=pending[key];
        const tier=model.tabTier[key];
        const Icon=tier==='blocking'?AlertOctagon:AlertTriangle;
        return <button type="button" key={key} role="tab" tabIndex={tab===key?0:-1} onKeyDown={e=>{const keys=REVIEW_TABS.map(t=>t.key);let index=keys.indexOf(tab);if(e.key==='ArrowRight')index=(index+1)%4;else if(e.key==='ArrowLeft')index=(index+3)%4;else if(e.key==='Home')index=0;else if(e.key==='End')index=3;else return;e.preventDefault();setTab(keys[index]);document.getElementById(`proposal-label-${keys[index]}`)?.focus();}} aria-selected={tab===key} aria-controls={`proposal-tab-${key}`} id={`proposal-label-${key}`} onClick={()=>setTab(key)}>
          <span className="proposal-tab-long">{label}</span><span className="proposal-tab-short" aria-hidden="true">{short}</span>
          {count>0?<><span className="proposal-count" data-tier={tier} aria-hidden><Icon size={11} strokeWidth={2.5}/>{count>9?'9+':count}</span><span className="sr-only"> ({count} pendientes)</span></>
            :<><CheckCircle2 size={14} className="proposal-tab-ok" aria-hidden/><span className="sr-only"> (sin pendientes)</span></>}
        </button>;
      })}</div>
      <div className="proposal-band-meta">
        <span className="proposal-band-total" data-missing={contract===undefined || undefined}><small>Total</small><strong>{contract===undefined?'—':usd(contract)}</strong></span>
        <button type="button" className="proposal-band-status" data-tier={blocking?'blocking':toReview?'confirm':'ok'} disabled={!firstPending} onClick={()=>firstPending&&go(firstPending)}>
          {blocking?<AlertOctagon size={15} aria-hidden/>:toReview?<AlertTriangle size={15} aria-hidden/>:<CheckCircle2 size={15} aria-hidden/>}
          <span>{toReview?<>{toReview}<span className="proposal-band-word"> por revisar</span></>:'Sin pendientes'}</span>{firstPending&&<ArrowRight size={14} aria-hidden/>}
          {blocking>0&&<span className="sr-only"> · {plural(blocking,'bloquea','bloquean')} la creación</span>}
        </button>
      </div>
    </div>
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
      {blockNote ? <p className="proposal-note">{blockNote}</p>
      : source && <p className="proposal-note">Referencia de catálogo: {source.resolutionCode} · desde {source.effectiveDate}. Confirma que corresponde al período de la factura. Los cargos fijos y de demanda no son tarifa de energía.</p>}
    {source?.fieldSources && <p className="proposal-note">Procedencia por campo: {Object.entries(source.fieldSources).map(([field,s])=>`${tariffSourceFieldLabel(field)}: ${s.resolutionCode}`).join(' · ')}</p>}
    </section>
    </div><div role="tabpanel" id="proposal-tab-consumption" aria-labelledby="proposal-label-consumption" hidden={tab!=='consumption'}><ProposalConsumptionReview draft={draft} context={context} production={production} update={update} issues={views}/></div>
    <div role="tabpanel" id="proposal-tab-equipment" aria-labelledby="proposal-label-equipment" hidden={tab!=='equipment'}>
    <section id={reviewAnchor.field('equipment')} tabIndex={-1}>
      <h3 title="Puedes combinar modelos. Las especificaciones vienen del inventario; la IA no crea equipos.">Equipos del catálogo</h3>
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
            // Solo un aviso del emparejador pide confirmar; el del modelo y el de la potencia/capacidad se distinguen.
            const requested=requestedRowAlert(rowIssues);
            const asked=row as {requestedPowerW?:number;requestedPowerKW?:number;requestedCapacityKWh?:number};
            const requestedMagnitude=group.type==='panel'?asked.requestedPowerW:group.type==='inverter'?asked.requestedPowerKW:asked.requestedCapacityKWh;
            const rowTier=worstTier(rowIssues);
            const selected=options.find(e=>e.id===row.id);
            const notesId=rowIssues.length?`${anchor}-issues`:undefined;
            const invalid=(control:'model'|'count'|'price')=>rowIssues.some(v=>v.tier==='blocking'&&rowControlFor(v.code)===control)?true:undefined;
            const select=`${anchor}-model`;
            const requestedNotes=rowIssues.filter(v=>v!==requested.model&&v!==requested.magnitude);
            const requestedTitle=[requested.model&&(/_ambiguous$/.test(requested.model.code)?'lo solicitado coincide con más de un modelo':/_partial$/.test(requested.model.code)?'lo solicitado solo coincide en parte con el modelo':'la IA no pudo confirmar el modelo'),
              requested.magnitude&&`la ${group.type==='battery'?'capacidad':'potencia'} no coincide con la solicitada`].filter(Boolean).join(' y ');
            const total=row.unitPriceUSD!==undefined&&Number.isFinite(row.count)?row.unitPriceUSD*row.count:undefined;
            return <div className="proposal-equipment-row" key={`${group.key}-${i}`} id={anchor} tabIndex={-1} data-flag={rowTier}>
            <label className="proposal-eq-model">Modelo<select id={select} value={row.id} aria-describedby={notesId} aria-invalid={invalid('model')} onChange={e=>change(i,e.target.value,row.count)}>{!options.some(e=>e.id===row.id)&&<option value={row.id}>Modelo no disponible</option>}{options.map(e=><option key={e.id} value={e.id}>{e.displayName || e.modelSeries} · {group.value(e)} {group.unit}</option>)}</select></label>
            <label className="proposal-eq-count">Unidades<input type="number" min="1" max="100000" step="1" value={Number.isFinite(row.count)?row.count:''} aria-describedby={notesId} aria-invalid={invalid('count')} onChange={e=>change(i,row.id,Number(e.target.value))}/></label>
            <label className="proposal-eq-price">Costo unit. USD<input type="number" min="0" step="0.01" value={row.unitPriceUSD ?? ''} aria-describedby={notesId} aria-invalid={invalid('price')} onChange={e=>update({[group.key]:rows.map((r,j)=>j===i?{...r,unitPriceUSD:e.target.value===''?undefined:Number(e.target.value),priceSource:'manual'}:r)})}/></label>
            <div className="proposal-eq-total" data-missing={total===undefined || undefined}><span>Total</span><strong>{total===undefined?'—':usd(total)}</strong></div>
            <button type="button" className="proposal-icon-button" aria-label={`Quitar ${row.brandModel || group.label}`} onClick={()=>{const next=rows.filter((_,j)=>i!==j);update({[group.key]:next,...(group.type==='battery'?{hasBattery:next.length>0}:{})});}}><Trash2 size={16}/></button>
            <div className="proposal-eq-meta">
              <span className="proposal-origin" data-missing={row.unitPriceUSD===undefined || undefined}>{row.unitPriceUSD===undefined?<><AlertTriangle size={12} aria-hidden/>Falta costo</>:row.priceSource==='manual'?'Costo particular de esta cotización':'Oferta del inventario'}</span>
              {row.priceSource==='manual'&&<button type="button" className="proposal-tertiary" onClick={()=>update({[group.key]:rows.map((r,j)=>j===i?{...r,unitPriceUSD:undefined,priceSource:'supplier'}:r)})}><PackageOpen size={13} aria-hidden/>Usar oferta del inventario</button>}
            </div>
            {rowIssues.length>0 && <div className="proposal-row-alert" data-tier={rowTier} id={notesId}>
              {requestedTitle && <><p className="proposal-row-alert-title">{rowTier==='blocking'?<AlertOctagon size={14} aria-hidden/>:<AlertTriangle size={14} aria-hidden/>}<strong>{rowTier==='blocking'?'Bloquea:':'Confirmar:'}</strong> {requestedTitle}.</p>{[requested.model,requested.magnitude].filter(Boolean).map(v=><p className="proposal-note" key={v!.code}>{v!.message}</p>)}<dl className="proposal-compare"><div><dt>La IA pidió</dt><dd>{[requested.model&&row.requestedModel,requested.magnitude&&requestedMagnitude!==undefined&&`${requestedMagnitude} ${group.type==='panel'?'W':group.type==='inverter'?'kW':'kWh'}`].filter(Boolean).join(' · ') || row.requestedModel}</dd></div><div><dt>Seleccionado</dt><dd>{selected?.displayName || row.brandModel || 'Sin modelo'}</dd></div></dl>
                <div className="proposal-row-alert-actions"><button type="button" className="proposal-confirm" onClick={()=>update({[group.key]:rows.map((item,j)=>j===i?confirmRequestedRow(item,requested):item)})}>Confirmar este modelo</button><button type="button" className="proposal-tertiary" onClick={()=>document.getElementById(select)?.focus()}>Cambiar modelo</button></div></>}
              <IssueNotes issues={requestedNotes}/>
            </div>}
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
