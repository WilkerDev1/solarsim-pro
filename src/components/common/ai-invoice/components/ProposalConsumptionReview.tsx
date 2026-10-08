import { useState } from 'react';
import type { ExtractedInvoiceData } from '../../../../types/aiInvoice';
import type { AIProposalContext } from '../../../../../shared/aiProposal';
import { calculateRecommendedPanelCount } from '../../../../engine/solarEngine';
import { INVOICE_MONTH_NAMES } from '../types';
interface Props {draft:ExtractedInvoiceData;context:AIProposalContext;production:number[]|null;update:(patch:Partial<ExtractedInvoiceData>)=>void}
export function ProposalConsumptionReview({draft,context,production,update}:Props) {
  const [adjustable,setAdjustable]=useState(0);
  const [peakConfirm,setPeakConfirm]=useState(false);
  const observed=draft.observedMonthlyConsumptionKWh?.length===12?draft.observedMonthlyConsumptionKWh:Array.from({length:12},(_,i)=>draft.monthlyConsumptionKWh[i] ?? null);
  const complete=observed.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0);
  const annual=observed.reduce<number>((sum,n)=>sum+(n ?? 0),0);
  const peak=Math.max(...observed.map(n=>n ?? 0));
  const hasEnergy=production?.length===12;
  const max=Math.max(1,...observed.map(n=>n ?? 0),...(production || []));
  const panels=draft.panels || [];
  const chosen=panels[adjustable];
  const sizing=calculateRecommendedPanelCount(draft.province || context.province || '',complete?observed as number[]:Array(12).fill(0),chosen?.powerW || 620,draft.targetCoveragePct,context.systemLosses,context.customMonthlyHSP);
  const otherKWp=panels.reduce((sum,g,i)=>sum+(i===adjustable?0:g.powerW*g.count/1000),0);
  const remainingKWh=sizing.targetAnnualKWh-otherKWp*sizing.annualSpecificYieldKWhPerKWp;
  const suggested=chosen?.powerW && remainingKWh>0?Math.ceil(remainingKWh/(sizing.annualSpecificYieldKWhPerKWp*chosen.powerW/1000)):0;
  const generation=(production || []).reduce((sum,n)=>sum+n,0);
  return <>
    <section><h3>Consumo y generación mensual</h3><p className="proposal-note">{draft.consumptionSource==='estimated'?'Historial estimado':draft.consumptionSource==='context'?'Historial del proyecto':'Historial observado'} · enero a diciembre. Los huecos requieren completar el mes.</p>
      <div className="proposal-energy-summary"><div><span>Consumo anual{!complete?' conocido':''}</span><strong>{annual.toLocaleString('es-DO')} kWh</strong></div><div><span>Promedio mensual</span><strong>{complete?(annual/12).toLocaleString('es-DO',{maximumFractionDigits:0}):'Pendiente'} kWh</strong></div><div><span>Producción estimada</span><strong>{complete&&hasEnergy?generation.toLocaleString('es-DO',{maximumFractionDigits:0}):'Pendiente'} kWh/a</strong></div><div><span>Producción / consumo</span><strong>{complete&&hasEnergy&&annual>0?`${(generation/annual*100).toFixed(1)}%`:'Pendiente'}</strong></div></div>
      <div className="proposal-chart-legend"><span><i/>Consumo</span><span><i/>Generación estimada</span></div>
      <div className="proposal-month-chart" role="img" aria-label="Comparación mensual de consumo y generación; los valores se muestran en la tabla editable siguiente">{observed.map((n,i)=><div key={i} title={`${INVOICE_MONTH_NAMES[i]}: consumo ${n ?? 'pendiente'} kWh; producción ${production?.[i]?.toFixed(0) ?? 'pendiente'} kWh`}><div className="proposal-chart-bars"><span style={{height:`${(n ?? 0)/max*100}%`}}/>{complete&&hasEnergy&&<span style={{height:`${(production?.[i] || 0)/max*100}%`}}/>}{n===null&&<em>—</em>}</div><small>{INVOICE_MONTH_NAMES[i].slice(0,3)}</small></div>)}</div>
      <div className="proposal-months">{INVOICE_MONTH_NAMES.map((month,i)=><label key={month}>{month.slice(0,3)}<input aria-label={`Consumo ${month}`} type="number" min="0" step="1" value={observed[i] ?? ''} onChange={e=>{const next=[...observed];next[i]=e.target.value===''?null:Number(e.target.value);update({observedMonthlyConsumptionKWh:next,monthlyConsumptionKWh:next.every(n=>n!==null)?next as number[]:[],averageMonthlyKWh:undefined});}}/><small>{complete&&hasEnergy?`FV ${production?.[i]?.toFixed(0) || 0} kWh`:'FV pendiente'}</small></label>)}</div>
      {complete&&peak>0&&<div className="proposal-peak-action">{peakConfirm?<><p>Se sustituirán los doce meses por {peak} kWh. El historial pasará a estimado.</p><button type="button" onClick={()=>{update({monthlyConsumptionKWh:Array(12).fill(peak),observedMonthlyConsumptionKWh:Array(12).fill(peak),consumptionSource:'estimated'});setPeakConfirm(false);}}>Confirmar estimación con mes pico</button><button type="button" onClick={()=>setPeakConfirm(false)}>Cancelar</button></>:<button type="button" onClick={()=>setPeakConfirm(true)}>Usar mes pico ({peak} kWh) como estimación anual</button>}</div>}
    </section>
    <section><h3>Dimensionamiento revisable</h3><p className="proposal-note">La meta compara generación anual con consumo; no garantiza el mismo ahorro facturable. Cambiar la meta conserva cantidades hasta aplicar el cálculo.</p>
      <div className="proposal-fields"><label>Cobertura objetivo (%)<input type="number" min="1" max="300" value={draft.targetCoveragePct ?? 95} onChange={e=>update({targetCoveragePct:Number(e.target.value)})}/></label><label>Modelo a dimensionar<select value={adjustable} onChange={e=>setAdjustable(Number(e.target.value))}>{panels.map((g,i)=><option key={i} value={i}>{g.brandModel}</option>)}</select></label></div>
      <div className="proposal-sizing-result"><p>Objetivo: <strong>{(sizing.targetAnnualKWh/sizing.annualSpecificYieldKWhPerKWp).toFixed(2)} kWp</strong> · Instalado: <strong>{(draft.recommendedCapacityKWp || 0).toFixed(2)} kWp</strong></p>{remainingKWh<=0&&complete?<p>Los otros grupos ya cubren la meta. Revisa manualmente este grupo; no se eliminará automáticamente.</p>:<p>Cantidad sugerida para este modelo: <strong>{complete?suggested:'pendiente'}</strong>. Los demás grupos, inversores y baterías se conservan.</p>}<button type="button" disabled={!complete||annual<=0||!chosen||suggested<1||suggested>100000} onClick={()=>update({panels:panels.map((g,i)=>i===adjustable?{...g,count:suggested}:g)})}>Aplicar cantidad sugerida</button></div>
    </section>
  </>;
}
