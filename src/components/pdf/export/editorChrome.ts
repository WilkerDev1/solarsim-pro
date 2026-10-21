/** Cromo del editor (barras, insignias, editores): nunca debe aparecer en el PDF ni en la impresión. */
export const EDITOR_CHROME_SELECTOR = '[data-pdf-chrome]';

interface ChromeNode {
  hasAttribute(name: string): boolean;
  removeAttribute(name: string): void;
  remove(): void;
}

interface ChromeRoot {
  querySelectorAll(selector: string): ArrayLike<ChromeNode> | Iterable<ChromeNode>;
}

const EDITING_ATTRIBUTES = ['contenteditable', 'role', 'tabindex'];

/** Quita el cromo de una copia de la página y deja los textos sin atributos de edición. Devuelve cuántos nodos quitó. */
export function stripEditorChrome(root: ChromeRoot): number {
  const chrome = Array.from(root.querySelectorAll(EDITOR_CHROME_SELECTOR) as ArrayLike<ChromeNode>);
  chrome.forEach((node) => node.remove());
  for (const node of Array.from(root.querySelectorAll('[contenteditable],[data-doc-text]') as ArrayLike<ChromeNode>)) {
    for (const attribute of EDITING_ATTRIBUTES) if (node.hasAttribute(attribute)) node.removeAttribute(attribute);
  }
  return chrome.length;
}

/** Filtro `ignoreElements` de html2canvas. */
export function isEditorChrome(element: Element): boolean {
  return element.hasAttribute(EDITOR_CHROME_SELECTOR.slice(1, -1));
}
