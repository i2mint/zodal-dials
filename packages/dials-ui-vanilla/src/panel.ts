/**
 * Field and panel assembly. `renderField` builds one labeled row (label + provenance badges +
 * description + control via the registry + a reset button when overridden). `renderSettingsPanel`
 * builds the whole panel: a client-side search/filter box (shown above `searchThreshold` settings),
 * a section per primary facet for the essentials, and the advanced settings after them behind ONE
 * `<details>` disclosure (searching opens it when a match is inside). Each setting renders ONCE (under its primary facet); multi-membership
 * facets and computed groups drive filtering, not duplicate controls.
 */

import { el } from './dom.js';
import type { RendererRegistry, SettingFieldConfig, SettingFieldState, SettingsForm } from '@zodal/dials-ui';
import type { ResolvedFieldAffordance } from '@zodal/core';
import type { SettingKey } from '@zodal/dials-core';
import type { SettingRenderFn, WidgetContext } from './types.js';
import { createVanillaSettingsRegistry } from './registry.js';

export interface RenderOptions extends WidgetContext {
  /** Override the renderer registry (e.g. to register custom widgets). */
  registry?: RendererRegistry<SettingRenderFn>;
  /** Include the client-side search/filter box: `true`, `false`, or `'auto'` (default), which shows
   *  it only when the form has more than `searchThreshold` settings — a large surface is searched, a
   *  phone sheet of a dozen settings is read top to bottom. */
  search?: boolean | 'auto';
  /** With `search: 'auto'`, the setting count above which the search box appears. Every field
   *  counts, advanced ones behind the disclosure included. A non-finite value falls back to the
   *  default, `DEFAULT_SEARCH_THRESHOLD` (15). */
  searchThreshold?: number;
  /** Where advanced settings go: `'disclose'` (default) after the essentials, behind one
   *  `<details>`; `'inline'` in their sections like any other setting. */
  advanced?: 'disclose' | 'inline';
  /** The disclosure's summary text. Default: `'Advanced'`. */
  advancedTitle?: string;
}

/** The default `searchThreshold`: a form with more settings than this gets a search box under
 *  `search: 'auto'`. */
export const DEFAULT_SEARCH_THRESHOLD = 15;

/** Whether a panel of `fieldCount` settings shows its search box under these options. */
export function showsSearch(fieldCount: number, options: Pick<RenderOptions, 'search' | 'searchThreshold'> = {}): boolean {
  const search = options.search ?? 'auto';
  if (search !== 'auto') return search === true;
  const threshold = Number.isFinite(options.searchThreshold) ? (options.searchThreshold as number) : DEFAULT_SEARCH_THRESHOLD;
  return fieldCount > threshold;
}

function humanize(id: string): string {
  return id.replace(/^[@_]/, '').replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Other';
}

function emptyState(): SettingFieldState {
  return { value: undefined, managed: false, shadowed: false, dirty: false };
}

/** Render one setting as a labeled field row. */
export function renderField(
  field: SettingFieldConfig,
  state: SettingFieldState,
  options: RenderOptions = {},
): HTMLElement {
  const registry = options.registry ?? createVanillaSettingsRegistry();
  const render = registry.resolve({ zodType: field.zodType } as unknown as ResolvedFieldAffordance, {
    mode: 'form',
    widget: field.widget,
    sensitivity: field.sensitivity,
  });
  const control = render ? render(field, state, options) : el('span', null, '(no renderer)');

  const badges: HTMLElement[] = [];
  if (state.source && state.source !== 'default') {
    badges.push(el('span', { class: 'zodal-dials-badge zodal-dials-source', title: `set by ${state.source}` }, state.source));
  }
  if (state.managed) badges.push(el('span', { class: 'zodal-dials-badge zodal-dials-managed', title: 'managed by policy' }, 'policy'));
  if (state.dirty) badges.push(el('span', { class: 'zodal-dials-badge zodal-dials-dirty' }, 'modified'));

  const reset =
    state.source && state.source !== 'default' && !state.managed
      ? el('button', { type: 'button', class: 'zodal-dials-reset', onclick: () => options.onReset?.(field.key) }, 'Reset')
      : null;

  return el(
    'div',
    { class: 'zodal-dials-field', 'data-key': field.key, 'data-widget': field.widget },
    el('label', { class: 'zodal-dials-label', for: field.key }, field.label, ...badges),
    field.description ? el('p', { class: 'zodal-dials-description' }, field.description) : null,
    el('div', { class: 'zodal-dials-control' }, control, reset),
  );
}

const isShown = (node: HTMLElement): boolean => node.style.display !== 'none';

function filterRows(panel: HTMLElement, query: string): void {
  const q = query.trim().toLowerCase();
  for (const row of Array.from(panel.querySelectorAll<HTMLElement>('.zodal-dials-field'))) {
    const key = (row.getAttribute('data-key') ?? '').toLowerCase();
    const label = (row.querySelector('.zodal-dials-label')?.textContent ?? '').toLowerCase();
    const description = (row.querySelector('.zodal-dials-description')?.textContent ?? '').toLowerCase();
    row.style.display = !q || key.includes(q) || label.includes(q) || description.includes(q) ? '' : 'none';
  }
  // A section with no matching row is hidden, so a search does not leave a column of empty headings.
  for (const section of Array.from(panel.querySelectorAll<HTMLElement>('.zodal-dials-group'))) {
    section.style.display = Array.from(section.querySelectorAll<HTMLElement>('.zodal-dials-field')).some(isShown) ? '' : 'none';
  }
  // The advanced disclosure opens while a search matches inside it, and returns to the reader's own
  // open/closed choice when the search is cleared.
  const details = panel.querySelector<HTMLDetailsElement>('details.zodal-dials-advanced');
  if (!details) return;
  if (q) {
    if (!details.hasAttribute('data-open-before-search')) details.setAttribute('data-open-before-search', String(details.open));
    const match = Array.from(details.querySelectorAll<HTMLElement>('.zodal-dials-field')).some(isShown);
    details.open = match;
    details.style.display = match ? '' : 'none';
  } else {
    const before = details.getAttribute('data-open-before-search');
    if (before !== null) details.open = before === 'true';
    details.removeAttribute('data-open-before-search');
    details.style.display = '';
  }
}

/** Render the full settings panel: search box, a section per primary facet, advanced disclosed. */
export function renderSettingsPanel(
  form: SettingsForm,
  states: Record<SettingKey, SettingFieldState>,
  options: RenderOptions = {},
): HTMLElement {
  const registry = options.registry ?? createVanillaSettingsRegistry();
  const opts: RenderOptions = { ...options, registry };
  const disclose = options.advanced !== 'inline';
  const panel = el('div', { class: 'zodal-dials-panel' });

  if (showsSearch(form.fields.length, options)) {
    panel.appendChild(
      el('input', {
        type: 'search',
        class: 'zodal-dials-search',
        placeholder: 'Search settings…',
        'aria-label': 'Search settings',
        oninput: (e: Event) => filterRows(panel, (e.target as HTMLInputElement).value),
      }),
    );
  }

  // Bucket each field under its primary (first non-computed) facet, so every field renders once. When
  // advanced settings are disclosed, the `advanced` facet is their location, not their section.
  const primary = (f: SettingFieldConfig): string =>
    f.facets?.find((x) => !x.startsWith('@') && !(disclose && f.advanced && x === 'advanced')) ?? '_ungrouped';
  const groupMeta = new Map(form.groups.map((g) => [g.id, g]));

  const sections = (fields: SettingFieldConfig[]): HTMLElement[] => {
    const buckets = new Map<string, SettingFieldConfig[]>();
    for (const f of fields) {
      const id = primary(f);
      const list = buckets.get(id);
      if (list) list.push(f);
      else buckets.set(id, [f]);
    }
    const ids = [...buckets.keys()].sort(
      (a, b) => (groupMeta.get(a)?.order ?? 500) - (groupMeta.get(b)?.order ?? 500) || a.localeCompare(b),
    );
    return ids.map((id) => {
      // The catch-all bucket is titled like toGroups' (`Other`), and untitled when it is the only
      // section here: a flat sheet (or a flat advanced disclosure) needs no heading over everything.
      const title = groupMeta.get(id)?.title ?? (id === '_ungrouped' ? 'Other' : humanize(id));
      const heading = id === '_ungrouped' && ids.length === 1 ? null : el('h3', { class: 'zodal-dials-group-title' }, title);
      const section = el('section', { class: 'zodal-dials-group', 'data-group': id }, heading);
      for (const f of buckets.get(id) ?? []) section.appendChild(renderField(f, states[f.key] ?? emptyState(), opts));
      return section;
    });
  };

  const essentials = disclose ? form.fields.filter((f) => !f.advanced) : form.fields;
  const advanced = disclose ? form.fields.filter((f) => f.advanced) : [];
  for (const section of sections(essentials)) panel.appendChild(section);
  if (advanced.length > 0) {
    panel.appendChild(
      el(
        'details',
        { class: 'zodal-dials-advanced' },
        el('summary', { class: 'zodal-dials-advanced-title' }, options.advancedTitle ?? 'Advanced'),
        ...sections(advanced),
      ),
    );
  }

  return panel;
}
