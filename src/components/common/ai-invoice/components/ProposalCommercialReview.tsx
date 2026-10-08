import type { ExtractedInvoiceData } from '../../../../types/aiInvoice';
import type { FinancialSummaryResult } from '../../../../types';
import type { AIProposalCommercial } from '../../../../../shared/aiProposalCommercial';
interface Props{draft:ExtractedInvoiceData;financial?:FinancialSummaryResult;update:(patch:Partial<ExtractedInvoiceData>)=>void}
export function ProposalCommercialReview({draft,financial,update}:Props){
  const c=draft.commercial || {};
  const items=Array.isArray(c.customItems)?c.customItems:[];
  const discounts=Array.isArray(c.customDiscounts)?c.customDiscounts:[];
  const change=(patch:Partial<AIProposalCommercial>)=>update({commercial:{...c,...patch},targetMarginPct:undefined});
  const usd=(n:number)=>n.toLocaleString('es-DO',{style:'currency',currency:'USD'});
  const incomplete=[...(draft.panels || []),...(draft.inverters || []),...(draft.batteries || [])].some(g=>g.unitPriceUSD===undefined);
  return <section><h3>Condiciones de esta cotización</h3><p className="proposal-note">Costos de compra en USD. Estas ediciones afectan únicamente la propuesta; no cambian ofertas del inventario. También puedes pedir estos cambios al chat.</p>
    <div className="proposal-fields">
      <label>Modalidad de precio<select value={c.pricingMode || 'cost_matrix'} onChange={e=>change({pricingMode:e.target.value as AIProposalCommercial['pricingMode']})}><option value="cost_matrix">Matriz de costos y utilidad</option><option value="direct_watt">Precio de venta por Wp</option></select></label>
      <label>Base de mano de obra<select value={c.installationTotalUSD!==undefined?'total':'kwp'} onChange={e=>change(e.target.value==='total'?{installationTotalUSD:0,installationUnitPriceUSD:undefined}:{installationUnitPriceUSD:0,installationTotalUSD:undefined})}><option value="kwp">Costo por kWp</option><option value="total">Costo total del proyecto</option></select></label>
      <label>Mano de obra ({c.installationTotalUSD!==undefined?'USD total':'USD/kWp'})<input type="number" min="0" step="0.01" value={c.installationTotalUSD ?? c.installationUnitPriceUSD ?? ''} onChange={e=>change(c.installationTotalUSD!==undefined?{installationTotalUSD:Number(e.target.value),installationUnitPriceUSD:undefined}:{installationUnitPriceUSD:Number(e.target.value),installationTotalUSD:undefined})}/></label>
      <label>Base de utilidad<select value={c.marginOnSalePct!==undefined?'sale':'cost'} onChange={e=>change(e.target.value==='sale'?{marginOnSalePct:0,markupPct:undefined}:{markupPct:0,marginOnSalePct:undefined})}><option value="cost">Recargo sobre costo</option><option value="sale">Margen sobre venta</option></select></label>
      <label>{c.marginOnSalePct!==undefined?'Margen sobre venta (%)':'Recargo sobre costo (%)'}<input type="number" min="0" max={c.marginOnSalePct!==undefined?99.99:1000} step="0.01" value={c.marginOnSalePct ?? c.markupPct ?? ''} onChange={e=>change(c.marginOnSalePct!==undefined?{marginOnSalePct:Number(e.target.value),markupPct:undefined}:{markupPct:Number(e.target.value),marginOnSalePct:undefined})}/></label>
      {c.pricingMode==='direct_watt'&&<><label>Destino del excedente<select value={c.directPriceSurplusTarget || 'margin'} onChange={e=>change({directPriceSurplusTarget:e.target.value as 'margin'|'labor'})}><option value="margin">Utilidad</option><option value="labor">Mano de obra</option></select></label><label>Precio de venta (USD/Wp)<input type="number" min="0.01" step="0.01" value={c.pricePerWattUSD ?? ''} onChange={e=>change({pricePerWattUSD:e.target.value===''?undefined:Number(e.target.value)})}/></label></>}
    </div>
    <h4 className="proposal-commercial-heading">Ítems adicionales</h4>
    {items.map((item,i)=><div className="proposal-commercial-item" key={item.id}>
      <label className="wide">Descripción<input value={item.description || ''} onChange={e=>change({customItems:items.map((r,j)=>i===j?{...r,description:e.target.value}:r)})}/></label>
      <label>Cantidad<input type="number" min="0.001" step="any" value={item.quantity ?? ''} onChange={e=>change({customItems:items.map((r,j)=>i===j?{...r,quantity:Number(e.target.value)}:r)})}/></label>
      <label>Unidad<input value={item.unit || 'UD'} onChange={e=>change({customItems:items.map((r,j)=>i===j?{...r,unit:e.target.value}:r)})}/></label>
      <label>Costo unitario USD<input type="number" min="0" step="0.01" value={item.unitPriceUSD ?? ''} onChange={e=>change({customItems:items.map((r,j)=>i===j?{...r,unitPriceUSD:Number(e.target.value)}:r)})}/></label>
      <label className="proposal-check"><input type="checkbox" checked={Boolean(item.applyMargin)} onChange={e=>change({customItems:items.map((r,j)=>i===j?{...r,applyMargin:e.target.checked}:r)})}/>Aplicar utilidad</label>
      <label className="proposal-check"><input type="checkbox" checked={Boolean(item.exonerateITBIS)} onChange={e=>change({customItems:items.map((r,j)=>i===j?{...r,exonerateITBIS:e.target.checked}:r)})}/>Exonerar ITBIS</label>
      <button type="button" onClick={()=>change({customItems:items.filter((_,j)=>i!==j)})}>Quitar ítem</button>
    </div>)}
    <button type="button" onClick={()=>change({customItems:[...items,{id:crypto.randomUUID(),description:'',quantity:1,unit:'UD',unitPriceUSD:0,applyMargin:true,exonerateITBIS:false}]})}>Añadir ítem adicional</button>
    <h4 className="proposal-commercial-heading">Descuentos</h4>
    {discounts.map((item,i)=><div className="proposal-commercial-item" key={item.id}>
      <label className="wide">Motivo<input value={item.description || ''} onChange={e=>change({customDiscounts:discounts.map((r,j)=>i===j?{...r,description:e.target.value}:r)})}/></label>
      <label>Tipo<select value={item.type} onChange={e=>change({customDiscounts:discounts.map((r,j)=>i===j?{...r,type:e.target.value as 'fixed'|'percentage'}:r)})}><option value="fixed">Importe USD</option><option value="percentage">Porcentaje</option></select></label>
      <label>Valor<input type="number" min="0" max={item.type==='percentage'?100:undefined} step="0.01" value={item.value ?? ''} onChange={e=>change({customDiscounts:discounts.map((r,j)=>i===j?{...r,value:Number(e.target.value)}:r)})}/></label>
      <label>Destino<select value={item.target || 'general'} onChange={e=>change({customDiscounts:discounts.map((r,j)=>i===j?{...r,target:e.target.value as 'general'|'equipment'}:r)})}><option value="general">General / cortesía</option><option value="equipment">Equipos / reduce base DGII</option></select></label>
      <button type="button" onClick={()=>change({customDiscounts:discounts.filter((_,j)=>i!==j)})}>Quitar descuento</button>
    </div>)}
    <button type="button" onClick={()=>change({customDiscounts:[...discounts,{id:crypto.randomUUID(),description:'',type:'fixed',value:0,target:'general'}]})}>Añadir descuento</button>
    <p className="proposal-note">El margen sobre venta se convierte al factor del motor. El resultado real cambia por descuentos e impuestos. Revisa las exoneraciones y el destino DGII.</p>
    {financial&&<div className="proposal-commercial-summary"><h4>{incomplete?'Subtotal provisional · faltan costos':'Resumen calculado'}</h4><dl className="proposal-totals"><div><dt>Costo de adquisición</dt><dd>{usd(financial.costMatrix.totalNetoUSD)}</dd></div><div><dt>Precio de lista</dt><dd>{usd(financial.costMatrix.listPorcentajeVentaUSD || 0)}</dd></div><div><dt>Descuentos</dt><dd>{usd(financial.costMatrix.totalDiscountUSD || 0)}</dd></div><div><dt>Total a pagar{incomplete?' provisional':''}</dt><dd>{usd(financial.contractPriceUSD)}</dd></div></dl><p className="proposal-note">Recargo real: {financial.costMatrix.markupOnCostPct?.toFixed(2)}% · Margen real sobre venta: {financial.costMatrix.marginOnSalePct?.toFixed(2)}%.</p></div>}
  </section>;
}
