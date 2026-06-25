/**
 * Internal DOM element factory (no framework). Sets value/checked/disabled/selected as PROPERTIES
 * (so form controls reflect state), `on*` keys as event listeners, and everything else as attributes.
 */

export type Attrs = Record<string, unknown>;

const PROP_KEYS = new Set(['value', 'checked', 'disabled', 'selected']);

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Array<Node | string | null | undefined>
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key.startsWith('on') && typeof value === 'function') {
        element.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key === 'class') {
        element.className = String(value);
      } else if (PROP_KEYS.has(key)) {
        (element as unknown as Record<string, unknown>)[key] = value;
      } else {
        element.setAttribute(key, String(value));
      }
    }
  }
  for (const child of children) {
    if (child == null) continue;
    element.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return element;
}
