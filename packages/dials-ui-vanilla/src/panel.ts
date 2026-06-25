/**
 * Field and panel assembly. `renderField` builds one labeled row (label + provenance badges +
 * description + control via the registry + a reset button when overridden). `renderSettingsPanel`
 * builds the whole panel: a client-side search/filter box + a section per primary facet. Each setting
 * renders ONCE (under its primary facet); multi-membership facets and computed groups drive filtering,
 * not duplicate controls.
 */

import { el } from './dom.js';
import type { RendererRegistry, SettingFieldConfig, SettingFieldState, SettingsForm } from '@zodal/dials-ui';
import type { ResolvedFieldAffordance } from '@zodal/core';
import type { SettingKey } from '@zodal/dials-core';
import type { FieldHandlers, SettingRenderFn } from './types.js';
import { createVanillaSettingsRegistry } from './registry.js';

export interface RenderOptions extends FieldHandlers {
  /** Override the renderer registry (e.g. to register custom widgets). */
  registry?: RendererRegistry<SettingRenderFn>;
  /** Include the client-side search/filter box. Default: true. */
  search?: boolean;
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

function filterRows(panel: HTMLElement, query: string): void {
  const q = query.trim().toLowerCase();
  for (const row of Array.from(panel.querySelectorAll<HTMLElement>('.zodal-dials-field'))) {
    const key = (row.getAttribute('data-key') ?? '').toLowerCase();
    const label = (row.querySelector('.zodal-dials-label')?.textContent ?? '').toLowerCase();
    const description = (row.querySelector('.zodal-dials-description')?.textContent ?? '').toLowerCase();
    row.style.display = !q || key.includes(q) || label.includes(q) || description.includes(q) ? '' : 'none';
  }
}

/** Render the full settings panel (search box + a section per primary facet). */
export function renderSettingsPanel(
  form: SettingsForm,
  states: Record<SettingKey, SettingFieldState>,
  options: RenderOptions = {},
): HTMLElement {
  const registry = options.registry ?? createVanillaSettingsRegistry();
  const opts: RenderOptions = { ...options, registry };
  const panel = el('div', { class: 'zodal-dials-panel' });

  if (options.search !== false) {
    panel.appendChild(
      el('input', {
        type: 'search',
        class: 'zodal-dials-search',
        placeholder: 'Search settings…',
        oninput: (e: Event) => filterRows(panel, (e.target as HTMLInputElement).value),
      }),
    );
  }

  // Bucket each field under its primary (first non-computed) facet, so every field renders once.
  const primary = (f: SettingFieldConfig): string => f.facets?.find((x) => !x.startsWith('@')) ?? '_ungrouped';
  const buckets = new Map<string, SettingFieldConfig[]>();
  for (const f of form.fields) {
    const id = primary(f);
    const list = buckets.get(id);
    if (list) list.push(f);
    else buckets.set(id, [f]);
  }

  const groupMeta = new Map(form.groups.map((g) => [g.id, g]));
  const sectionIds = [...buckets.keys()].sort(
    (a, b) => (groupMeta.get(a)?.order ?? 500) - (groupMeta.get(b)?.order ?? 500) || a.localeCompare(b),
  );

  for (const id of sectionIds) {
    const title = groupMeta.get(id)?.title ?? humanize(id);
    const section = el('section', { class: 'zodal-dials-group', 'data-group': id }, el('h3', { class: 'zodal-dials-group-title' }, title));
    for (const f of buckets.get(id) ?? []) section.appendChild(renderField(f, states[f.key] ?? emptyState(), opts));
    panel.appendChild(section);
  }

  return panel;
}
