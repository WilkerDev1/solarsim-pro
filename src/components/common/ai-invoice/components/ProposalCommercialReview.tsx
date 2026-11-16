import type { ExtractedInvoiceData } from '../../../../types/aiInvoice';
import type { FinancialSummaryResult } from '../../../../types';
import type { AIProposalCommercial } from '../../../../../shared/aiProposalCommercial';
import { isItemHiddenInQuotation } from '../../../../../shared/quotationItems';
import { appliesItemMargin, isItemItbisExonerated } from '../../../../../shared/financialRules';
import { Plus, Trash2 } from 'lucide-react';
import { issuesAt, reviewAnchor, worstTier, type ReviewIssueView } from '../reviewIssues';
import { IssueNotes } from './ReviewFlags';
import { equipmentCostRows, type PreviewEquipment } from '../commercialRows';
interface Props{draft:ExtractedInvoiceData;financial?:FinancialSummaryResult;update:(patch:Partial<ExtractedInvoiceData>)=>void;issues?:readonly ReviewIssueView[];equipment?:PreviewEquipment}
/** Celda sin dato: un guion discreto; la señal de la fila va una sola vez junto al nombre. */
const Pending=()=> <span className="proposal-dash"><span aria-hidden="true">—</span><span className="sr-only">Pendiente</span></span>;
export function ProposalCommercialReview({draft,financial,update,issues=[],equipment}:Props){
  const c=draft.commercial || {};
  const items=Array.isArray(c.customItems)?c.customItems:[];
  const discounts=Array.isArray(c.customDiscounts)?c.customDiscounts:[];
  const change=(patch:Partial<AIProposalCommercial>)=>update({commercial:{...c,...patch},targetMarginPct:undefined});
  const usd=(n:number)=>n.toLocaleString('es-DO',{style:'currency',currency:'USD'});
  const incomplete=[...(draft.panels || []),...(draft.inverters || []),...(draft.batteries || [])].some(g=>g.unitPriceUSD===undefined);
  const rows=equipmentCostRows(draft,financial,equipment);
  const equipmentTotal=rows.reduce((sum,r)=>sum+(r.totalUSD ?? 0),0);
  const itbisTotal=rows.length&&rows.every(r=>r.totalUSD===undefined||r.itbisUSD!==undefined)?rows.reduce((sum,r)=>sum+(r.itbisUSD ?? 0),0):undefined;
  const section=(part:Parameters<typeof reviewAnchor.commercial>[0])=>{const list=issuesAt(issues,reviewAnchor.commercial(part));return {id:reviewAnchor.commercial(part),tabIndex:-1,'data-flag':worstTier(list),list};};
  const conditions=section('conditions'),extras=section('extras'),discountsAnchor=section('discounts'),reconciliation=section('reconciliation');
  return <section><h3>Condiciones de esta cotización</h3><p className="proposal-note">Costos de compra en USD. Estas ediciones afectan únicamente la propuesta; no cambian ofertas del inventario. También puedes pedir estos cambios al chat.</p>
    {!financial&&<div className="proposal-commercial-summary" id={reviewAnchor.commercial('totals')} tabIndex={-1}><dl className="proposal-totals"><div className="proposal-total-main" data-missing="true"><dt>Total a pagar</dt><dd>Pendiente</dd></div></dl><p className="proposal-note">Se calcula al resolver los bloqueos de precios y equipos.</p></div>}
    {financial&&<div className="proposal-commercial-summary" id={reviewAnchor.commercial('totals')} tabIndex={-1}><h4>{incomplete?'Subtotal provisional · faltan costos':'Resumen calculado'}</h4><dl className="proposal-totals"><div><dt>Costo de adquisición</dt><dd>{usd(financial.costMatrix.totalNetoUSD)}</dd></div><div><dt>Precio de lista</dt><dd>{usd(financial.costMatrix.listPorcentajeVentaUSD || 0)}</dd></div><div><dt>Descuentos</dt><dd>{usd(financial.costMatrix.totalDiscountUSD || 0)}</dd></div><div className="proposal-total-main"><dt>Total a pagar{incomplete?' provisional':''}</dt><dd>{usd(financial.contractPriceUSD)}</dd></div></dl><p className="proposal-note">Recargo real: {financial.costMatrix.markupOnCostPct?.toFixed(2)}% · Margen real sobre venta: {financial.costMatrix.marginOnSalePct?.toFixed(2)}%.</p></div>}
    <div className="proposal-fields proposal-commercial-basis">
      <label className="proposal-cost-source">Precios del documento<select value={c.priceBasis || 'purchase'} onChange={e=>change({priceBasis:e.target.value as AIProposalCommercial['priceBasis']})}><option value="purchase">Costos de compra</option><option value="sale">Precios de venta · aclarar costos</option><option value="unknown">Pendiente de aclarar</option></select></label>
      <label>Cambio del documento (RD$ por USD)<input type="number" min="1" step="0.01" value={draft.dopExchangeRate ?? ''} onChange={e=>update({dopExchangeRate:Number(e.target.value)})}/></label>
    </div>
    <h4 className="proposal-commercial-heading">Costos detallados de componentes · USD</h4>
    <div className="proposal-table-wrap" id={reviewAnchor.commercial('costs')} tabIndex={-1}><table className="proposal-price-table"><thead><tr><th>Componente</th><th className="num">Cantidad</th><th className="num">Unitario USD</th><th className="num">Total USD</th><th className="num">ITBIS USD</th></tr></thead><tbody>{rows.map(({key,row,i,totalUSD,itbisUSD})=><tr key={`${key}-${i}`} data-missing={totalUSD===undefined || undefined}><td>{row.brandModel}{totalUSD===undefined&&<span className="proposal-pending">Falta costo</span>}<small>{row.priceSource==='manual'?'Costo particular del borrador':'Oferta del inventario'}</small></td><td className="num"><input aria-label={`Cantidad ${row.brandModel}`} type="number" min="1" step="1" value={Number.isFinite(row.count)?row.count:''} onChange={e=>update({[key]:(draft[key] || []).map((r,j)=>i===j?{...r,count:Number(e.target.value)}:r)})}/></td><td className="num"><input aria-label={`Costo USD ${row.brandModel}`} type="number" min="0" step="0.01" value={row.unitPriceUSD ?? ''} onChange={e=>update({[key]:(draft[key] || []).map((r,j)=>i===j?{...r,unitPriceUSD:e.target.value===''?undefined:Number(e.target.value),priceSource:'manual'}:r)})}/></td><td className="num">{totalUSD===undefined?<Pending/>:usd(totalUSD)}</td><td className="num">{itbisUSD===undefined?<Pending/>:usd(itbisUSD)}</td></tr>)}</tbody>
      {rows.length>0&&<tfoot><tr><th scope="row" colSpan={3} data-provisional={incomplete||rows.some(r=>r.totalUSD===undefined)||undefined}>{incomplete||rows.some(r=>r.totalUSD===undefined)?'Subtotal provisional · faltan costos':'Total de equipos'}</th><td className="num">{usd(equipmentTotal)}</td><td className="num">{itbisTotal===undefined?<Pending/>:usd(itbisTotal)}</td></tr></tfoot>}
    </table></div>
    <div className="proposal-commercial-block" id={conditions.id} tabIndex={-1} data-flag={conditions['data-flag']}>
    <IssueNotes issues={conditions.list}/>
    <div className="proposal-fields">
      <div className="proposal-cost-mode"><span>Modalidad de precio</span><strong>Simple (Catálogo IA) · Matriz de costos con precios de proveedores</strong></div>
      <label>Base de mano de obra<select value={c.installationTotalUSD!==undefined?'total':'kwp'} onChange={e=>change(e.target.value==='total'?{installationTotalUSD:0,installationUnitPriceUSD:undefined}:{installationUnitPriceUSD:0,installationTotalUSD:undefined})}><option value="kwp">Costo por kWp</option><option value="total">Costo total del proyecto</option></select></label>
      <label>Mano de obra ({c.installationTotalUSD!==undefined?'USD total':'USD/kWp'})<input type="number" min="0" step="0.01" value={c.installationTotalUSD ?? c.installationUnitPriceUSD ?? ''} onChange={e=>change(c.installationTotalUSD!==undefined?{installationTotalUSD:Number(e.target.value),installationUnitPriceUSD:undefined}:{installationUnitPriceUSD:Number(e.target.value),installationTotalUSD:undefined})}/></label>
      <label>Base de utilidad<select value={c.marginOnSalePct!==undefined?'sale':'cost'} onChange={e=>change(e.target.value==='sale'?{marginOnSalePct:0,markupPct:undefined}:{markupPct:0,marginOnSalePct:undefined})}><option value="cost">Recargo sobre costo</option><option value="sale">Margen sobre venta</option></select></label>
      <label>{c.marginOnSalePct!==undefined?'Margen sobre venta (%)':'Recargo sobre costo (%)'}<input type="number" min="0" max={c.marginOnSalePct!==undefined?99.99:1000} step="0.01" value={c.marginOnSalePct ?? c.markupPct ?? ''} onChange={e=>change(c.marginOnSalePct!==undefined?{marginOnSalePct:Number(e.target.value),markupPct:undefined}:{markupPct:Number(e.target.value),marginOnSalePct:undefined})}/></label>
    </div></div>
    <div className="proposal-commercial-block" id={extras.id} tabIndex={-1} data-flag={extras['data-flag']}>
    <h4 className="proposal-commercial-heading">Ítems adicionales</h4>
    <IssueNotes issues={extras.list}/>
    {items.map((item,i)=><div className="proposal-commercial-item" key={item.id}>
      <label className="wide">Descripción<input value={item.description || ''} onChange={e=>change({customItems:items.map((r,j)=>i===j?{...r,description:e.target.value}:r)})}/></label>
      <label>Cantidad<input type="number" min="0.001" step="any" value={item.quantity ?? ''} onChange={e=>change({customItems:items.map((r,j)=>i===j?{...r,quantity:Number(e.target.value)}:r)})}/></label>
      <label>Unidad<input value={item.unit || 'UD'} onChange={e=>change({customItems:items.map((r,j)=>i===j?{...r,unit:e.target.value}:r)})}/></label>
      <label>Costo unitario USD<input type="number" min="0" step="0.01" value={item.unitPriceUSD ?? ''} onChange={e=>change({customItems:items.map((r,j)=>i===j?{...r,unitPriceUSD:Number(e.target.value)}:r)})}/></label>
      <label className="proposal-check"><input type="checkbox" checked={appliesItemMargin(item)} onChange={e=>change({customItems:items.map((r,j)=>i===j?{...r,applyMargin:e.target.checked}:r)})}/>Aplicar utilidad</label>
      <label className="proposal-check"><input type="checkbox" checked={isItemItbisExonerated(item)} onChange={e=>change({customItems:items.map((r,j)=>i===j?{...r,exonerateITBIS:e.target.checked}:r)})}/>Exonerar ITBIS</label>
      <label className="proposal-check"><input type="checkbox" checked={isItemHiddenInQuotation(item)} onChange={e=>change({customItems:items.map((r,j)=>i===j?{...r,hideInQuotation:e.target.checked}:r)})}/>Oculto en factura</label>
      <button type="button" className="proposal-ghost proposal-danger" onClick={()=>change({customItems:items.filter((_,j)=>i!==j)})}><Trash2 size={15} aria-hidden/>Quitar ítem</button>
    </div>)}
    <button type="button" className="proposal-ghost" onClick={()=>change({customItems:[...items,{id:crypto.randomUUID(),description:'',quantity:1,unit:'UD',unitPriceUSD:0,applyMargin:true,exonerateITBIS:false}]})}><Plus size={15} aria-hidden/>Añadir ítem adicional</button>
    </div>
    <div className="proposal-commercial-block" id={discountsAnchor.id} tabIndex={-1} data-flag={discountsAnchor['data-flag']}>
    <h4 className="proposal-commercial-heading">Descuentos</h4>
    <IssueNotes issues={discountsAnchor.list}/>
    {discounts.map((item,i)=><div className="proposal-commercial-item" key={item.id}>
      <label className="wide">Motivo<input value={item.description || ''} onChange={e=>change({customDiscounts:discounts.map((r,j)=>i===j?{...r,description:e.target.value}:r)})}/></label>
      <label>Tipo<select value={item.type} onChange={e=>change({customDiscounts:discounts.map((r,j)=>i===j?{...r,type:e.target.value as 'fixed'|'percentage'}:r)})}><option value="fixed">Importe USD</option><option value="percentage">Porcentaje</option></select></label>
      <label>Valor<input type="number" min="0" max={item.type==='percentage'?100:undefined} step="0.01" value={item.value ?? ''} onChange={e=>change({customDiscounts:discounts.map((r,j)=>i===j?{...r,value:Number(e.target.value)}:r)})}/></label>
      <label>Destino<select value={item.target || 'general'} onChange={e=>change({customDiscounts:discounts.map((r,j)=>i===j?{...r,target:e.target.value as 'general'|'equipment'}:r)})}><option value="general">General / cortesía</option><option value="equipment">Equipos / reduce base DGII</option></select></label>
      <button type="button" className="proposal-ghost proposal-danger" onClick={()=>change({customDiscounts:discounts.filter((_,j)=>i!==j)})}><Trash2 size={15} aria-hidden/>Quitar descuento</button>
    </div>)}
    <button type="button" className="proposal-ghost" onClick={()=>change({customDiscounts:[...discounts,{id:crypto.randomUUID(),description:'',type:'fixed',value:0,target:'general'}]})}><Plus size={15} aria-hidden/>Añadir descuento</button>
    </div>
    <p className="proposal-note">El margen sobre venta se convierte al factor del motor. El resultado real cambia por descuentos e impuestos. Revisa las exoneraciones y el destino DGII.</p>
    {(reconciliation.list.length>0 || (financial&&c.sourceTotals))&&<section className="proposal-source-totals" id={reconciliation.id} tabIndex={-1} data-flag={reconciliation['data-flag']}><h4>Conciliación con la ficha</h4><IssueNotes issues={reconciliation.list}/>{financial&&c.sourceTotals&&<><p>Totales documentados en USD, sin sumarlos como extras. El precio de lista se compara antes de descuentos; los beneficios fiscales siguen la configuración del proyecto.</p><table className="proposal-price-table proposal-reconcile-table"><thead><tr><th>Concepto</th><th className="num">Ficha</th><th className="num">Cálculo</th><th className="num">Diferencia</th></tr></thead><tbody>{([['subtotalUSD','Compra antes de ITBIS',financial.costMatrix.precioNetoUSD],['taxUSD','ITBIS de costos',financial.costMatrix.itbisUSD],['totalCostUSD','Costo total',financial.costMatrix.totalNetoUSD],['saleUSD','Precio de lista',financial.costMatrix.listPorcentajeVentaUSD]] as const).filter(([key])=>c.sourceTotals?.[key]!==undefined).map(([key,label,value])=>{const diff=(value || 0)-(c.sourceTotals?.[key] || 0);const off=Math.abs(diff)>.05;return <tr key={key} data-missing={off || undefined}><th scope="row">{label}</th><td className="num">{usd(c.sourceTotals?.[key] || 0)}</td><td className="num">{usd(value || 0)}</td><td className="num">{off?<span className="proposal-pending">{usd(diff)} · Revisar diferencia</span>:'Coincide'}</td></tr>;})}</tbody></table></>}</section>}
  </section>;
}
