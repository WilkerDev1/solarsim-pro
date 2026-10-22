// Runs inside the host's sandboxed iframe. One bundle serves every card type; the document's `data-card` picks the view.
import { App } from '@modelcontextprotocol/ext-apps/app-with-deps';
import { isMcpAppCardType } from '../../../shared/agentCards';
import { escapeHtml, extractCards, fallbackText, renderCards } from './render';

const type = document.documentElement.dataset.card;
const root = document.getElementById('root');

if (root && isMcpAppCardType(type)) {
  const app = new App({ name: `solarsim-${type}`, version: '1.0.0' });
  app.ontoolresult = (result) => {
    const cards = extractCards(result, type);
    // Text fallback keeps the view useful when a result carries no card of this type (for example an error).
    root.innerHTML = cards.length ? renderCards(type, cards) : `<p class="muted">${escapeHtml(fallbackText(result))}</p>`;
  };
  app.connect().catch(() => {
    root.textContent = 'No se pudo conectar con el anfitrión; usa el texto de la respuesta.';
  });
}
