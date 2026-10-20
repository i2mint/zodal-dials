/** Registry + panel + end-to-end tests (jsdom). */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { defineDials } from '@zodal/dials-core';
import type { ResolvedFieldAffordance } from '@zodal/core';
import { toSettingsForm, toFieldStates } from '@zodal/dials-ui';
import { createVanillaSettingsRegistry } from '../src/registry.js';
import { renderField, renderSettingsPanel } from '../src/panel.js';
import { showsSearch, DEFAULT_SEARCH_THRESHOLD } from '../src/index.js';
import { cfg, st, fire } from './fixture.js';

const stub = (zodType: string) => ({ zodType }) as unknown as ResolvedFieldAffordance;

describe('createVanillaSettingsRegistry', () => {
  const reg = createVanillaSettingsRegistry();

  it('resolves a DOM renderer for each widget kind', () => {
    const fn = reg.resolve(stub('boolean'), { mode: 'form', widget: 'switch' });
    const node = fn?.(cfg({ widget: 'switch' }), st(), {});
    expect(node?.getAttribute('type')).toBe('checkbox');
  });

  it('a secret resolves to the masked widget via OVERRIDE', () => {
    const fn = reg.resolve(stub('string'), { mode: 'form', widget: 'secret', sensitivity: 'secret' });
    const node = fn?.(cfg({ widget: 'secret', sensitivity: 'secret' }), st(), {});
    expect(node?.querySelector('input[type=password]')).toBeTruthy();
  });

  it('an unknown widget falls back to rawJson (total coverage)', () => {
    const fn = reg.resolve(stub('weird'), { mode: 'form', widget: 'nonsense' as never });
    const node = fn?.(cfg({ widget: 'rawJson' }), st(), {});
    expect(node?.querySelector('.zodal-dials-json-note')).toBeTruthy();
  });
});

describe('renderField', () => {
  it('renders label, control, provenance badge, and a reset button when overridden', () => {
    const onReset = vi.fn();
    const row = renderField(cfg({ widget: 'switch', zodType: 'boolean' }), st({ value: true, source: 'user', dirty: true }), { onReset });
    expect(row.querySelector('.zodal-dials-label')?.textContent).toContain('K');
    expect(row.querySelector('.zodal-dials-source')?.textContent).toBe('user');
    expect(row.querySelector('.zodal-dials-dirty')).toBeTruthy();
    const reset = row.querySelector('.zodal-dials-reset') as HTMLButtonElement;
    expect(reset).toBeTruthy();
    fire(reset, 'click');
    expect(onReset).toHaveBeenCalledWith('k');
  });

  it('a managed field shows a policy badge and no reset', () => {
    const row = renderField(cfg(), st({ source: 'policy', managed: true }), {});
    expect(row.querySelector('.zodal-dials-managed')).toBeTruthy();
    expect(row.querySelector('.zodal-dials-reset')).toBeNull();
  });
});

describe('renderSettingsPanel end-to-end', () => {
  const dials = defineDials(
    z.object({
      'editor.fontSize': z.number().min(6).max(72).default(14).meta({ facets: ['editor'] }),
      'editor.theme': z.enum(['light', 'dark', 'system']).default('system').meta({ facets: ['editor'] }),
      'network.apiKey': z.string().optional().meta({ facets: ['network'] }),
    }),
  );
  const result = dials.resolve([{ scope: 'user', layer: { 'editor.fontSize': 20, 'network.apiKey': 'SUPER-SECRET' } }], { maskSecrets: true });
  const form = toSettingsForm(dials, { result });
  const states = toFieldStates(form.fields, result, ['editor.fontSize']);

  it('renders a panel with one row per setting, grouped into sections, with a search box', () => {
    const panel = renderSettingsPanel(form, states, { search: true });
    expect(panel.querySelectorAll('.zodal-dials-field').length).toBe(3);
    expect(panel.querySelector('input[type=search]')).toBeTruthy();
    expect(panel.querySelector('section[data-group=editor]')).toBeTruthy();
    expect(panel.querySelector('section[data-group=network]')).toBeTruthy();
    // fontSize is a slider, modified by 'user'
    const fontRow = panel.querySelector('[data-key="editor.fontSize"]');
    expect(fontRow?.getAttribute('data-widget')).toBe('slider');
    expect(fontRow?.querySelector('.zodal-dials-source')?.textContent).toBe('user');
  });

  it('never renders a secret in plaintext', () => {
    const panel = renderSettingsPanel(form, states);
    expect(panel.innerHTML.includes('SUPER-SECRET')).toBe(false);
    expect(panel.querySelector('[data-key="network.apiKey"] input[type=password]')).toBeTruthy();
  });

  it('the search box filters rows client-side', () => {
    const panel = renderSettingsPanel(form, states, { search: true });
    const search = panel.querySelector('input[type=search]') as HTMLInputElement;
    fire(search, 'input', 'theme');
    const visible = Array.from(panel.querySelectorAll<HTMLElement>('.zodal-dials-field')).filter((r) => r.style.display !== 'none');
    expect(visible.map((r) => r.getAttribute('data-key'))).toEqual(['editor.theme']);
  });

  it('editing a control fires onChange with the decoded value', () => {
    const onChange = vi.fn();
    const panel = renderSettingsPanel(form, states, { onChange });
    const range = panel.querySelector('[data-key="editor.fontSize"] input[type=range]') as HTMLInputElement;
    fire(range, 'change', '30');
    expect(onChange).toHaveBeenCalledWith('editor.fontSize', 30);
  });
});

describe("search: 'auto' (the default)", () => {
  const manyFields = (n: number) =>
    defineDials(z.object(Object.fromEntries(Array.from({ length: n }, (_, i) => [`s${i}`, z.boolean().default(false)]))));
  const panelOf = (n: number, options = {}) => {
    const dials = manyFields(n);
    const result = dials.resolve([]);
    const form = toSettingsForm(dials, { result });
    return renderSettingsPanel(form, toFieldStates(form.fields, result), options);
  };

  it('hides the search box on a small form and shows it above the threshold', () => {
    expect(panelOf(DEFAULT_SEARCH_THRESHOLD).querySelector('input[type=search]')).toBeNull();
    expect(panelOf(DEFAULT_SEARCH_THRESHOLD + 1).querySelector('input[type=search]')).toBeTruthy();
  });

  it('searchThreshold moves the cut-off; true and false override it', () => {
    expect(panelOf(4, { searchThreshold: 3 }).querySelector('input[type=search]')).toBeTruthy();
    expect(panelOf(2, { search: true }).querySelector('input[type=search]')).toBeTruthy();
    expect(panelOf(DEFAULT_SEARCH_THRESHOLD + 5, { search: false }).querySelector('input[type=search]')).toBeNull();
  });

  it('showsSearch is the rule the panel applies', () => {
    expect(showsSearch(DEFAULT_SEARCH_THRESHOLD)).toBe(false);
    expect(showsSearch(DEFAULT_SEARCH_THRESHOLD + 1)).toBe(true);
    expect(showsSearch(1, { search: true })).toBe(true);
  });
});
