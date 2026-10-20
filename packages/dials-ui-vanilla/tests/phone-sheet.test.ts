/** The phone-sheet affordances (issue #19): step, enum labels as chips, live preview vs commit,
 *  value formatting + aria-valuetext, colour input, advanced disclosure, and the stylesheet. */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { defineDials } from '@zodal/dials-core';
import { toSettingsForm, toFieldStates } from '@zodal/dials-ui';
import { renderSlider, renderRadio, renderSelect, renderColor, renderNumber, formatValue } from '../src/widgets.js';
import { createVanillaSettingsRegistry } from '../src/registry.js';
import { renderSettingsPanel } from '../src/panel.js';
import { cfg, st, fire } from './fixture.js';

const slider = (over = {}) => cfg({ widget: 'slider', zodType: 'number', bounds: { min: 0.1, max: 1 }, step: 0.05, ...over });

describe('slider: step, preview, commit, format', () => {
  it('sets the step (and keeps a fractional value instead of snapping it to an integer)', () => {
    const range = renderSlider(slider(), st({ value: 0.8 }), {}).querySelector('input[type=range]') as HTMLInputElement;
    expect(range.getAttribute('step')).toBe('0.05');
    expect(range.value).toBe('0.8');
  });

  it('without a declared step is continuous, not steps of 1', () => {
    const range = renderSlider(slider({ step: undefined }), st({ value: 0.5 }), {}).querySelector('input[type=range]') as HTMLInputElement;
    expect(range.getAttribute('step')).toBe('any');
  });

  it('previews on input and commits once on change', () => {
    const onPreview = vi.fn();
    const onChange = vi.fn();
    const range = renderSlider(slider(), st({ value: 0.8 }), { onPreview, onChange }).querySelector('input') as HTMLInputElement;
    fire(range, 'input', '0.5');
    fire(range, 'input', '0.45');
    expect(onPreview).toHaveBeenNthCalledWith(1, 'k', 0.5);
    expect(onPreview).toHaveBeenNthCalledWith(2, 'k', 0.45);
    expect(onChange).not.toHaveBeenCalled();
    fire(range, 'change');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('k', 0.45);
  });

  it('formats the readout and aria-valuetext with the host format, live', () => {
    const format = (_f: unknown, v: unknown) => `${Math.round((v as number) * 100)}%`;
    const wrap = renderSlider(slider(), st({ value: 0.8 }), { format });
    const range = wrap.querySelector('input') as HTMLInputElement;
    expect(wrap.querySelector('output')?.textContent).toBe('80%');
    expect(range.getAttribute('aria-valuetext')).toBe('80%');
    fire(range, 'input', '0.35');
    expect(wrap.querySelector('output')?.textContent).toBe('35%');
    expect(range.getAttribute('aria-valuetext')).toBe('35%');
  });

  it('default format rounds to the step precision and appends the unit', () => {
    expect(formatValue(cfg({ step: 0.05 }), 0.30000000000000004)).toBe('0.3');
    expect(formatValue(cfg({ step: 2, unit: 'px' }), 14)).toBe('14px');
    expect(formatValue(cfg({ step: 0.25 }), 1.25)).toBe('1.25');
    expect(formatValue(cfg(), 'x')).toBe('x');
  });

  it('a number input carries the step too', () => {
    const input = renderNumber(cfg({ widget: 'number', zodType: 'number', step: 0.1 }), st({ value: 1 }), {}) as HTMLInputElement;
    expect(input.getAttribute('step')).toBe('0.1');
    expect(input.getAttribute('inputmode')).toBe('decimal');
  });
});

describe('enum display labels', () => {
  const field = cfg({ widget: 'radio', zodType: 'enum', enumValues: ['above', 'inline'], enumLabels: { inline: 'In the line' } });

  it('radio chips show the label but commit the value', () => {
    const onChange = vi.fn();
    const set = renderRadio(field, st({ value: 'above' }), { onChange });
    const labels = Array.from(set.querySelectorAll('.zodal-dials-choice-label')).map((n) => n.textContent);
    expect(labels).toEqual(['above', 'In the line']);
    const inline = set.querySelector('input[value=inline]') as HTMLInputElement;
    inline.checked = true;
    fire(inline, 'change');
    expect(onChange).toHaveBeenCalledWith('k', 'inline');
    expect(set.getAttribute('aria-label')).toBe('K');
  });

  it('decorateOption receives each chip label', () => {
    const decorateOption = vi.fn((_f, v: string, label: HTMLElement) => label.setAttribute('data-deco', v));
    const set = renderRadio(field, st(), { decorateOption });
    expect(decorateOption).toHaveBeenCalledTimes(2);
    expect(set.querySelector('[data-deco=inline]')?.textContent).toBe('In the line');
  });

  it('select options show the label, keep the value', () => {
    const select = renderSelect({ ...field, widget: 'select' }, st({ value: 'inline' }), {}) as HTMLSelectElement;
    const option = select.querySelector('option[value=inline]') as HTMLOptionElement;
    expect(option.textContent).toBe('In the line');
    expect(select.value).toBe('inline');
  });
});

describe('colour', () => {
  it('is registered for the color widget and renders <input type=color>', () => {
    const fn = createVanillaSettingsRegistry().resolve({ zodType: 'string' } as never, { mode: 'form', widget: 'color' });
    const node = fn?.(cfg({ widget: 'color' }), st({ value: '#ABC' }), {}) as HTMLInputElement;
    expect(node.getAttribute('type')).toBe('color');
    expect(node.value).toBe('#aabbcc');
  });

  it('previews on input, commits on change', () => {
    const onPreview = vi.fn();
    const onChange = vi.fn();
    const node = renderColor(cfg({ widget: 'color', defaultValue: '#000000' }), st({ value: 'not a colour' }), { onPreview, onChange }) as HTMLInputElement;
    expect(node.value).toBe('#000000');
    fire(node, 'input', '#ff0000');
    expect(onPreview).toHaveBeenCalledWith('k', '#ff0000');
    expect(onChange).not.toHaveBeenCalled();
    fire(node, 'change');
    expect(onChange).toHaveBeenCalledWith('k', '#ff0000');
  });
});

describe('advanced settings behind one disclosure', () => {
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

  it('renders essentials first, then one closed <details> holding the advanced settings in their sections', () => {
    const panel = renderSettingsPanel(form, states);
    const details = panel.querySelector('details.zodal-dials-advanced') as HTMLDetailsElement;
    expect(details).toBeTruthy();
    expect(details.open).toBe(false);
    expect(panel.lastElementChild).toBe(details);
    expect(details.querySelector('summary')?.textContent).toBe('Advanced');
    const inside = Array.from(details.querySelectorAll('.zodal-dials-field')).map((r) => r.getAttribute('data-key'));
    expect(inside.sort()).toEqual(['chord.font', 'ink.opacity']);
    // grouped by their own facet, not under an "Advanced" section
    expect(details.querySelector('[data-group=look] [data-key="ink.opacity"]')).toBeTruthy();
    expect(details.querySelector('[data-group=advanced]')).toBeNull();
    const outside = Array.from(panel.querySelectorAll('.zodal-dials-field')).filter((r) => !details.contains(r));
    expect(outside.map((r) => r.getAttribute('data-key')).sort()).toEqual(['columns', 'paper']);
  });

  it('search opens the disclosure when a match is inside, hides empty sections, and restores on clear', () => {
    const panel = renderSettingsPanel(form, states);
    const details = panel.querySelector('details.zodal-dials-advanced') as HTMLDetailsElement;
    const search = panel.querySelector('input[type=search]') as HTMLInputElement;
    fire(search, 'input', 'opacity');
    expect(details.open).toBe(true);
    const lookOutside = panel.querySelector(':scope > [data-group=look]') as HTMLElement;
    expect(lookOutside.style.display).toBe('none');
    fire(search, 'input', 'columns');
    expect(details.style.display).toBe('none');
    fire(search, 'input', '');
    expect(details.open).toBe(false);
    expect(details.style.display).toBe('');
    expect(lookOutside.style.display).toBe('');
  });

  it("advanced: 'inline' keeps the old flat layout", () => {
    const panel = renderSettingsPanel(form, states, { advanced: 'inline', advancedTitle: 'More' });
    expect(panel.querySelector('details')).toBeNull();
    expect(panel.querySelectorAll('.zodal-dials-field').length).toBe(4);
  });
});

describe('styles.css', () => {
  const css = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('never sets a font family (it inherits host typography)', () => {
    expect(rules).not.toMatch(/font-family/);
    for (const m of rules.matchAll(/\bfont:\s*([^;]+);/g)) expect(m[1].trim()).toBe('inherit');
  });

  it('carries the touch sizes: 44px targets, 28px thumb, 16px+ inputs', () => {
    expect(rules).toContain('var(--zodal-dials-target, 44px)');
    expect(rules).toContain('var(--zodal-dials-thumb, 28px)');
    expect(rules).toContain('font-size: max(16px, 1em)');
  });

  it('is exported by the package', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    expect(pkg.exports['./styles.css']).toBe('./styles.css');
    expect(pkg.files).toContain('styles.css');
  });
});
