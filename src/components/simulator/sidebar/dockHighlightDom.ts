/**
 * Marcas del resaltado en el DOM del dock (F5a). Funciones sobre un `MarkRoot` mínimo (tres métodos del DOM) para poder
 * probarlas sin DOM simulado. Las anclas son los `data-dock-anchor` de las filas, los controles y las secciones del dock
 * (`src/domain/fieldAnchors.ts`); la marca es `data-assistant-changed="control"`, que pinta `src/index.css`. React nunca
 * renderiza ese atributo en filas y tarjetas, así que no lo pisa al repintar; el de la sección (`section`) sí lo pone React
 * (`ParamSection`, prop `changeHint`) y aquí no se toca.
 */
export const ANCHOR_ATTR = 'data-dock-anchor';
export const CHANGED_ATTR = 'data-assistant-changed';

export interface MarkableElement {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export interface MarkRoot {
  querySelectorAll(selector: string): ArrayLike<MarkableElement> | Iterable<MarkableElement>;
  querySelector(selector: string): unknown;
}

/** Los ids de ancla solo llevan minúsculas, dígitos y guiones: seguros dentro de un selector. */
const SAFE_ANCHOR = /^[a-z0-9-]+$/;

/** ¿Hay en el dock un elemento con esa ancla? (un control que oculta la organización o el modo no lo hay). */
export const presentInDock = (root: MarkRoot, target: string): boolean => SAFE_ANCHOR.test(target) && root.querySelector(`[${ANCHOR_ATTR}="${target}"]`) != null;

/**
 * Deja marcados exactamente los controles de `targets`: pone la marca a los que faltan y la quita a los que ya no tocan
 * (caducaron o son de otra propuesta). No toca el foco, el desplazamiento ni nada más del elemento.
 */
export function syncChangedMarks(root: MarkRoot, targets: readonly string[]): void {
  const wanted = new Set(targets.filter((target) => SAFE_ANCHOR.test(target)));
  for (const element of Array.from(root.querySelectorAll(`[${CHANGED_ATTR}="control"]`)))
    if (!wanted.has(element.getAttribute(ANCHOR_ATTR) ?? '')) element.removeAttribute(CHANGED_ATTR);
  for (const target of wanted)
    for (const element of Array.from(root.querySelectorAll(`[${ANCHOR_ATTR}="${target}"]`))) {
      if (element.getAttribute(CHANGED_ATTR) !== 'control') element.setAttribute(CHANGED_ATTR, 'control');
    }
}
