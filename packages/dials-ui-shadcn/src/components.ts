/**
 * The React settings components: `SettingField` (label + provenance badges + control via the
 * registry + reset) and `SettingsPanel` (a search box + a section per primary facet; each setting
 * renders once). Uses `React.createElement` (no JSX). Plain elements + `zodal-dials-*` classes — swap
 * in shadcn/ui primitives in a consumer.
 */

import { createElement as h, useMemo, useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import type { ResolvedFieldAffordance } from '@zodal/core';
import type { SettingKey } from '@zodal/dials-core';
import type { RendererRegistry, SettingFieldConfig, SettingFieldState, SettingsForm } from '@zodal/dials-ui';
import type { PanelHandlers, SettingControl } from './types.js';
import { createShadcnSettingsRegistry } from './registry.js';

function humanize(id: string): string {
  return id.replace(/^[@_]/, '').replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Other';
}

function emptyState(): SettingFieldState {
  return { value: undefined, managed: false, shadowed: false, dirty: false };
}

export interface SettingFieldProps extends PanelHandlers {
  field: SettingFieldConfig;
  state: SettingFieldState;
  registry?: RendererRegistry<SettingControl>;
}

/** Render one setting as a labeled field row. */
export function SettingField({ field, state, onChange, onReset, registry }: SettingFieldProps): ReactElement {
  const reg = useMemo(() => registry ?? createShadcnSettingsRegistry(), [registry]);
  const Control = reg.resolve({ zodType: field.zodType } as unknown as ResolvedFieldAffordance, {
    mode: 'form',
    widget: field.widget,
    sensitivity: field.sensitivity,
  });

  const badges: ReactElement[] = [];
  if (state.source && state.source !== 'default') {
    badges.push(h('span', { key: 'src', className: 'zodal-dials-badge zodal-dials-source', title: `set by ${state.source}` }, state.source));
  }
  if (state.managed) badges.push(h('span', { key: 'mng', className: 'zodal-dials-badge zodal-dials-managed', title: 'managed by policy' }, 'policy'));
  if (state.dirty) badges.push(h('span', { key: 'dty', className: 'zodal-dials-badge zodal-dials-dirty' }, 'modified'));

  const reset =
    state.source && state.source !== 'default' && !state.managed
      ? h('button', { type: 'button', className: 'zodal-dials-reset', onClick: () => onReset?.(field.key) }, 'Reset')
      : null;

  const control = Control
    ? h(Control, { field, state, onChange: (value: unknown) => onChange?.(field.key, value) })
    : h('span', null, '(no renderer)');

  return h(
    'div',
    { className: 'zodal-dials-field', 'data-key': field.key, 'data-widget': field.widget },
    h('label', { className: 'zodal-dials-label', htmlFor: field.key }, field.label, ...badges),
    field.description ? h('p', { className: 'zodal-dials-description' }, field.description) : null,
    h('div', { className: 'zodal-dials-control' }, control, reset),
  );
}

export interface SettingsPanelProps extends PanelHandlers {
  form: SettingsForm;
  states: Record<SettingKey, SettingFieldState>;
  registry?: RendererRegistry<SettingControl>;
  /** Include the search box. Default: true. */
  search?: boolean;
}

/** Render the full settings panel: a search box + a section per primary facet (each setting once). */
export function SettingsPanel({ form, states, onChange, onReset, registry, search = true }: SettingsPanelProps): ReactElement {
  const [query, setQuery] = useState('');
  const reg = useMemo(() => registry ?? createShadcnSettingsRegistry(), [registry]);
  const q = query.trim().toLowerCase();
  const matches = (f: SettingFieldConfig): boolean =>
    !q || f.key.toLowerCase().includes(q) || f.label.toLowerCase().includes(q) || (f.description ?? '').toLowerCase().includes(q);

  const primary = (f: SettingFieldConfig): string => f.facets?.find((x) => !x.startsWith('@')) ?? '_ungrouped';
  const groupMeta = new Map(form.groups.map((g) => [g.id, g]));
  const buckets = new Map<string, SettingFieldConfig[]>();
  for (const f of form.fields) {
    const id = primary(f);
    const list = buckets.get(id);
    if (list) list.push(f);
    else buckets.set(id, [f]);
  }
  const sectionIds = [...buckets.keys()].sort(
    (a, b) => (groupMeta.get(a)?.order ?? 500) - (groupMeta.get(b)?.order ?? 500) || a.localeCompare(b),
  );

  const children: ReactElement[] = [];
  if (search) {
    children.push(
      h('input', {
        key: '__search',
        type: 'search',
        className: 'zodal-dials-search',
        placeholder: 'Search settings…',
        value: query,
        onChange: (e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
      }),
    );
  }
  for (const id of sectionIds) {
    const fields = (buckets.get(id) ?? []).filter(matches);
    if (fields.length === 0) continue;
    const title = groupMeta.get(id)?.title ?? humanize(id);
    children.push(
      h(
        'section',
        { key: id, className: 'zodal-dials-group', 'data-group': id },
        h('h3', { className: 'zodal-dials-group-title' }, title),
        ...fields.map((f) => h(SettingField, { key: f.key, field: f, state: states[f.key] ?? emptyState(), onChange, onReset, registry: reg })),
      ),
    );
  }
  return h('div', { className: 'zodal-dials-panel' }, ...children);
}
