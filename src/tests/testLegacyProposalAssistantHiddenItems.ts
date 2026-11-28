// LEGADO: se elimina en F6 junto con el modal ai-invoice (ProposalCommercialReview).
// Lo que de testHiddenQuotationItems (sección 6) solo prueba la revisión comercial del borrador del asistente de propuestas: el ítem oculto se ve, marcado.
// Parte de una suite mixta partida en F0 (red de seguridad del asistente único): la lógica que sobrevive sigue en la suite de origen.
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProposalCommercialReview } from '../components/common/ai-invoice/components/ProposalCommercialReview';
import type { CustomQuotationItem } from '../types';

const VISIBLE_ROW = 'Herrajes de montaje especiales';
const HIDDEN_ROW = 'Comision de venta confidencial';
const item = (over: Partial<CustomQuotationItem>): CustomQuotationItem => ({
  id: 'x', description: 'x', quantity: 1, unit: 'UD', unitPriceUSD: 100, exonerateITBIS: false, applyMargin: true, ...over,
});

// 6. Revisión del borrador de IA: el ítem oculto se ve, marcado.
{
  const render = (hide: boolean | undefined) => renderToStaticMarkup(React.createElement(ProposalCommercialReview, {
    draft: { commercial: { customItems: [item({ id: 'i', description: HIDDEN_ROW, ...(hide === undefined ? {} : { hideInQuotation: hide }) })] } } as never, update: () => {},
  }));
  const checked = (html: string) => /<input type="checkbox"( checked="")?\/>Oculto en factura/.exec(html)?.[1] === ' checked=""';
  assert(render(true).includes(HIDDEN_ROW));
  assert(checked(render(true)));
  assert(!checked(render(false)) && render(false).includes('Oculto en factura'));
  assert(!checked(render(undefined)));
}
console.log('PASS (legado): la revisión del asistente de propuestas muestra el ítem oculto, marcado.');