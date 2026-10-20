/**
 * The React settings components: `SettingField` (label + provenance badges + control via the
 * registry + reset) and `SettingsPanel` (a search box above `searchThreshold` settings, a section per
 * primary facet for the essentials, and the advanced settings after them behind ONE `<details>`
 * disclosure that a search match inside opens; each setting renders once). Uses `React.createElement` (no JSX). Plain elements + `zodal-dials-*` classes — swap
 * in shadcn/ui primitives in a consumer.
 */

import { createElement as h, useMemo, useState } from 'react';
import { showsSearch } from '@zodal/dials-ui';
import type { SearchBoxOptions } from '@zodal/dials-ui';
import type { ChangeEvent, ReactElement, SyntheticEvent } from 'react';
import type { ResolvedFieldAffordance } from '@zodal/core';
import type { SettingKey } from '@zodal/dials-core';
import type { RendererRegistry, SettingFieldConfig, SettingFieldState, SettingsForm } from '@zodal/dials-ui';
import type { FieldPresentation, PanelHandlers, SettingControl } from './types.js';
import { createShadcnSettingsRegistry } from './registry.js';

function humanize(id: string): string {
  return id.replace(/^[@_]/, '').replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Other';
}

function emptyState(): SettingFieldState {
  return { value: undefined, managed: false, shadowed: false, dirty: false };
}

export interface SettingFieldProps extends PanelHandlers, FieldPresentation {
  field: SettingFieldConfig;
  state: SettingFieldState;
  registry?: RendererRegistry<SettingControl>;
}

/** Render one setting as a labeled field row. */
export function SettingField({ field, state, onChange, onPreview, onReset, format, decorateOption, registry }: SettingFieldProps): ReactElement {
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
    ? h(Control, {
        field,
        state,
        format,
        decorateOption,
        onChange: (value: unknown) => onChange?.(field.key, value),
        onPreview: (value: unknown) => onPreview?.(field.key, value),
      })
    : h('span', null, '(no renderer)');

  return h(
    'div',
    { className: 'zodal-dials-field', 'data-key': field.key, 'data-widget': field.widget },
    h('label', { className: 'zodal-dials-label', htmlFor: field.key }, field.label, ...badges),
    field.description ? h('p', { className: 'zodal-dials-description' }, field.description) : null,
    h('div', { className: 'zodal-dials-control' }, control, reset),
  );
}

export interface SettingsPanelProps extends PanelHandlers, FieldPresentation, SearchBoxOptions {
  form: SettingsForm;
  states: Record<SettingKey, SettingFieldState>;
  registry?: RendererRegistry<SettingControl>;
  /** Where advanced settings go: `'disclose'` (default) after the essentials, behind one
   *  `<details>`; `'inline'` in their sections like any other setting. */
  advanced?: 'disclose' | 'inline';
  /** The disclosure's summary text. Default: `'Advanced'`. */
  advancedTitle?: string;
}

/** Render the full settings panel: search box, a section per primary facet, advanced disclosed. */
export function SettingsPanel(props: SettingsPanelProps): ReactElement {
  const { form, states, registry, advanced = 'disclose', advancedTitle = 'Advanced', ...rest } = props;
  const { onChange, onPreview, onReset, format, decorateOption } = rest;
  const [query, setQuery] = useState('');
  // The reader's own open/closed choice; a search overrides it while it matches inside.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const reg = useMemo(() => registry ?? createShadcnSettingsRegistry(), [registry]);
  const disclose = advanced !== 'inline';
  const q = query.trim().toLowerCase();
  const matches = (f: SettingFieldConfig): boolean =>
    !q || f.key.toLowerCase().includes(q) || f.label.toLowerCase().includes(q) || (f.description ?? '').toLowerCase().includes(q);

  // Bucket each field under its primary (first non-computed) facet, so every field renders once. When
  // advanced settings are disclosed, the `advanced` facet is their location, not their section.
  const primary = (f: SettingFieldConfig): string =>
    f.facets?.find((x) => !x.startsWith('@') && !(disclose && f.advanced && x === 'advanced')) ?? '_ungrouped';
  const groupMeta = new Map(form.groups.map((g) => [g.id, g]));

  const sections = (fields: SettingFieldConfig[]): ReactElement[] => {
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
    const out: ReactElement[] = [];
    for (const id of ids) {
      // A section with no matching row is left out, so a search does not leave a column of empty headings.
      const shown = (buckets.get(id) ?? []).filter(matches);
      if (shown.length === 0) continue;
      // The catch-all bucket is titled `Other`, and untitled when it is the only section here: a flat
      // sheet (or a flat advanced disclosure) needs no heading over everything.
      const title = groupMeta.get(id)?.title ?? (id === '_ungrouped' ? 'Other' : humanize(id));
      out.push(
        h(
          'section',
          { key: id, className: 'zodal-dials-group', 'data-group': id },
          id === '_ungrouped' && ids.length === 1 ? null : h('h3', { className: 'zodal-dials-group-title' }, title),
          ...shown.map((f) =>
            h(SettingField, { key: f.key, field: f, state: states[f.key] ?? emptyState(), onChange, onPreview, onReset, format, decorateOption, registry: reg }),
          ),
        ),
      );
    }
    return out;
  };

  const children: ReactElement[] = [];
  if (showsSearch(form.fields.length, rest)) {
    children.push(
      h('input', {
        key: '__search',
        type: 'search',
        className: 'zodal-dials-search',
        placeholder: 'Search settings…',
        'aria-label': 'Search settings',
        value: query,
        onChange: (e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
      }),
    );
  }
  const essentials = disclose ? form.fields.filter((f) => !f.advanced) : form.fields;
  const advancedFields = disclose ? form.fields.filter((f) => f.advanced) : [];
  children.push(...sections(essentials));
  if (advancedFields.length > 0) {
    const advancedSections = sections(advancedFields);
    // While searching, the disclosure opens on a match inside and is hidden without one.
    if (!q || advancedSections.length > 0) {
      children.push(
        h(
          'details',
          {
            key: '__advanced',
            className: 'zodal-dials-advanced',
            open: q ? true : advancedOpen,
            onToggle: (e: SyntheticEvent<HTMLDetailsElement>) => {
              if (!q) setAdvancedOpen(e.currentTarget.open);
            },
          },
          h('summary', { className: 'zodal-dials-advanced-title' }, advancedTitle),
          ...advancedSections,
        ),
      );
    }
  }
  return h('div', { className: 'zodal-dials-panel' }, ...children);
}
