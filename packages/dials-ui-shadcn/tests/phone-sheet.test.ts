/** Parity with the vanilla phone-sheet contract (issue #22): preview while moving and commit on
 *  release, value formatting + aria-valuetext, a colour input, enum chips with `decorateOption`, the
 *  unit beside a number input, `search: 'auto'`, the advanced disclosure, and the shared stylesheet. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement as h } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { z } from 'zod';
import { defineDials } from '@zodal/dials-core';
import { toSettingsForm, toFieldStates } from '@zodal/dials-ui';
import type { SettingFieldConfig, SettingFieldState } from '@zodal/dials-ui';
import { SliderControl, ColorControl, RadioControl, NumberControl, SettingsPanel, createShadcnSettingsRegistry } from '../src/index.js';
import type { ResolvedFieldAffordance } from '@zodal/core';

afterEach(cleanup);

const cfg = (over: Partial<SettingFieldConfig> = {}): SettingFieldConfig =>
  ({
    key: 'k',
    label: 'K',
    widget: 'text',
    zodType: 'string',
    required: false,
    readOnly: false,
    hidden: false,
    sensitivity: 'public',
    mergeStrategy: 'replace',
    facets: [],
    advanced: false,
    isStructured: false,
    ...over,
  }) as SettingFieldConfig;
const st = (value: unknown): SettingFieldState => ({ value, managed: false, shadowed: false, dirty: false });
const slider = (over = {}) => cfg({ widget: 'slider', zodType: 'number', bounds: { min: 0.1, max: 1 }, step: 0.05, ...over });

describe('slider: preview, commit, format', () => {
  it('previews on input and commits once on change (release)', () => {
    const onPreview = vi.fn();
    const onChange = vi.fn();
    const { container } = render(h(SliderControl, { field: slider(), state: st(0.8), onPreview, onChange }));
    const range = container.querySelector('input[type=range]') as HTMLInputElement;
    fireEvent.input(range, { target: { value: '0.5' } });
    fireEvent.input(range, { target: { value: '0.45' } });
    expect(onPreview.mock.calls).toEqual([[0.5], [0.45]]);
    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector('output')?.textContent).toBe('0.45');
    fireEvent.change(range, { target: { value: '0.45' } });
    expect(onChange.mock.calls).toEqual([[0.45]]);
  });

  it('formats the readout and aria-valuetext with the host format, live', () => {
    const format = (_f: SettingFieldConfig, v: unknown) => `${Math.round(Number(v) * 100)}%`;
    const { container } = render(h(SliderControl, { field: slider(), state: st(0.8), format }));
    const range = container.querySelector('input[type=range]') as HTMLInputElement;
    expect(range.getAttribute('aria-valuetext')).toBe('80%');
    fireEvent.input(range, { target: { value: '0.3' } });
    expect(range.getAttribute('aria-valuetext')).toBe('30%');
    expect(container.querySelector('output')?.textContent).toBe('30%');
  });

  it('default format rounds to the step and appends the unit; the output is not a live region', () => {
    const { container } = render(h(SliderControl, { field: slider({ bounds: { min: 8, max: 32 }, step: 1, unit: 'px' }), state: st(14) }));
    expect(container.querySelector('output')?.textContent).toBe('14px');
    expect(container.querySelector('output')?.getAttribute('aria-live')).toBe('off');
  });
});

describe('colour', () => {
  it('is registered for the color widget and renders <input type=color>', () => {
    const Control = createShadcnSettingsRegistry().resolve({ zodType: 'string' } as unknown as ResolvedFieldAffordance, { mode: 'form', widget: 'color' });
    const { container } = render(h(Control!, { field: cfg({ widget: 'color' }), state: st('#abc') }));
    expect((container.querySelector('input[type=color]') as HTMLInputElement).value).toBe('#aabbcc');
  });

  it('previews on input, commits on change', () => {
    const onPreview = vi.fn();
    const onChange = vi.fn();
    const { container } = render(h(ColorControl, { field: cfg({ widget: 'color' }), state: st('#222222'), onPreview, onChange }));
    const input = container.querySelector('input[type=color]') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '#ff0000' } });
    expect(onPreview).toHaveBeenCalledWith('#ff0000');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '#ff0000' } });
    expect(onChange.mock.calls).toEqual([['#ff0000']]);
  });
});

describe('enum chips and number units', () => {
  const placement = cfg({ widget: 'radio', zodType: 'enum', enumValues: ['above', 'inline'], enumLabels: { above: 'Above the line' } });

  it('radio chips show the label, commit the value, and take decorateOption', () => {
    const onChange = vi.fn();
    const decorateOption = (_f: SettingFieldConfig, v: string, label: string) => (v === 'inline' ? h('em', null, label) : undefined);
    const { container } = render(h(RadioControl, { field: placement, state: st('above'), onChange, decorateOption }));
    const labels = Array.from(container.querySelectorAll('.zodal-dials-choice-label')).map((n) => n.textContent);
    expect(labels).toEqual(['Above the line', 'inline']);
    expect(container.querySelector('[data-value=inline] .zodal-dials-choice-label em')).toBeTruthy();
    expect(container.querySelector('fieldset')?.getAttribute('aria-label')).toBe('K');
    fireEvent.click(container.querySelector('input[value=inline]') as HTMLInputElement);
    expect(onChange).toHaveBeenCalledWith('inline');
  });

  it('a number input shows its unit beside the box', () => {
    const { container } = render(h(NumberControl, { field: cfg({ widget: 'number', zodType: 'number', unit: ' s' }), state: st(3) }));
    expect(container.querySelector('.zodal-dials-number-wrap .zodal-dials-unit')?.textContent).toBe('s');
  });
});

describe('panel: search auto and the advanced disclosure', () => {
  const dials = defineDials(
    z.object({
      paper: z.enum(['white', 'cream']).default('white').meta({ facets: ['look'] }),
      columns: z.number().int().min(1).max(4).default(1).meta({ facets: ['look'] }),
      'ink.opacity': z.number().min(0.1).max(1).default(0.8).meta({ facets: ['look', 'advanced'], title: 'Ink opacity' }),
      'chord.font': z.string().default('serif').meta({ advanced: true, facets: ['chords'] }),
    }),
  );
  const result = dials.resolve([], {});
  const form = toSettingsForm(dials, { result });
  const states = toFieldStates(form.fields, result);

  it("a small form has no search box by default; searchThreshold brings it back", () => {
    expect(render(h(SettingsPanel, { form, states })).container.querySelector('input[type=search]')).toBeNull();
    cleanup();
    expect(render(h(SettingsPanel, { form, states, searchThreshold: 3 })).container.querySelector('input[type=search]')).toBeTruthy();
  });

  it('renders essentials first, then one closed <details> holding the advanced settings in their sections', () => {
    const { container } = render(h(SettingsPanel, { form, states }));
    const panel = container.querySelector('.zodal-dials-panel') as HTMLElement;
    const details = panel.querySelector('details.zodal-dials-advanced') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(panel.lastElementChild).toBe(details);
    expect(details.querySelector('summary')?.textContent).toBe('Advanced');
    expect(details.querySelector('[data-group=look] [data-key="ink.opacity"]')).toBeTruthy();
    expect(details.querySelector('[data-group=advanced]')).toBeNull();
    const outside = Array.from(panel.querySelectorAll('.zodal-dials-field')).filter((r) => !details.contains(r));
    expect(outside.map((r) => r.getAttribute('data-key')).sort()).toEqual(['columns', 'paper']);
  });

  it('search opens the disclosure on a match inside, hides it without one, and restores on clear', () => {
    const { container } = render(h(SettingsPanel, { form, states, search: true }));
    const search = container.querySelector('input[type=search]') as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'opacity' } });
    expect((container.querySelector('details') as HTMLDetailsElement).open).toBe(true);
    fireEvent.change(search, { target: { value: 'columns' } });
    expect(container.querySelector('details')).toBeNull();
    fireEvent.change(search, { target: { value: '' } });
    expect((container.querySelector('details') as HTMLDetailsElement).open).toBe(false);
  });

  it("advanced: 'inline' keeps the flat layout, under a custom title", () => {
    const { container } = render(h(SettingsPanel, { form, states, advanced: 'inline', advancedTitle: 'More' }));
    expect(container.querySelector('details')).toBeNull();
    expect(container.querySelector('[data-group=look] [data-key="ink.opacity"]')).toBeTruthy();
  });

  it('a flat sheet has no "Other" heading over everything', () => {
    const flat = defineDials(z.object({ a: z.boolean().default(true), b: z.string().default('') }));
    const r = flat.resolve([], {});
    const f = toSettingsForm(flat, { result: r });
    const { container } = render(h(SettingsPanel, { form: f, states: toFieldStates(f.fields, r) }));
    expect(container.querySelector('h3')).toBeNull();
  });

  it('forwards onPreview and format from the panel to a slider', () => {
    const onPreview = vi.fn();
    const format = () => 'X';
    const { container } = render(h(SettingsPanel, { form, states, onPreview, format, advanced: 'inline' }));
    const range = container.querySelector('[data-key="ink.opacity"] input[type=range]') as HTMLInputElement;
    expect(range.getAttribute('aria-valuetext')).toBe('X');
    fireEvent.input(range, { target: { value: '0.5' } });
    expect(onPreview).toHaveBeenCalledWith('ink.opacity', 0.5);
  });
});

describe('styles.css', () => {
  it('is the shared vanilla stylesheet, shipped as ./styles.css', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    expect(pkg.exports['./styles.css']).toBe('./dist/styles.css');
    expect(readFileSync(join(__dirname, '..', 'tsup.config.ts'), 'utf8')).toContain('../dials-ui-vanilla/styles.css');
  });

  it('styles every zodal-dials-* class the React controls and panel produce', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'dials-ui-vanilla', 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const all = defineDials(
      z.object({
        on: z.boolean().default(true).meta({ facets: ['a'] }),
        pick: z.enum(['x', 'y']).default('x').meta({ facets: ['a'] }),
        many: z.enum(['p', 'q', 'r', 's', 't']).default('p'),
        level: z.number().min(0).max(1).default(0.5),
        count: z.number().default(3).meta({ unit: ' s' }),
        name: z.string().default('n'),
        ink: z.string().default('#000000').meta({ editWidget: 'color' }),
        apiKey: z.string().optional(),
        layout: z.object({ w: z.number() }).default({ w: 1 }),
        raw: z.string().default('').meta({ editWidget: 'rawJson', advanced: true }),
      }),
    );
    const r = all.resolve([{ scope: 'user', layer: { level: 0.7 } }], { maskSecrets: true });
    const f = toSettingsForm(all, { result: r });
    const { container } = render(h(SettingsPanel, { form: f, states: toFieldStates(f.fields, r, ['level']), search: true }));
    const produced = new Set<string>();
    for (const node of Array.from(container.querySelectorAll('[class]'))) {
      for (const c of Array.from(node.classList)) if (c.startsWith('zodal-dials-')) produced.add(c);
    }
    const optOut = new Set(['zodal-dials-source', 'zodal-dials-managed', 'zodal-dials-dirty']);
    const unstyled = [...produced].filter((c) => !optOut.has(c) && !new RegExp(`\\.${c}(?![\\w-])`).test(css));
    expect(unstyled).toEqual([]);
    expect(produced.size).toBeGreaterThan(15);
  });
});
