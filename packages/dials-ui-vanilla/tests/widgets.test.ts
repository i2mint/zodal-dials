/** Widget renderer tests (jsdom): correct DOM, value reflection, change wiring, disabled state. */
import { describe, it, expect, vi } from 'vitest';
import {
  renderSwitch,
  renderText,
  renderNumber,
  renderSlider,
  renderSelect,
  renderSecret,
  renderRawJson,
} from '../src/widgets.js';
import { makeSecretRef } from '@zodal/dials-core';
import { cfg, st, fire } from './fixture.js';

describe('scalar widgets', () => {
  it('switch reflects boolean state and fires onChange', () => {
    const onChange = vi.fn();
    const node = renderSwitch(cfg({ widget: 'switch', zodType: 'boolean' }), st({ value: true }), { onChange });
    expect(node.getAttribute('type')).toBe('checkbox');
    expect((node as HTMLInputElement).checked).toBe(true);
    (node as HTMLInputElement).checked = false;
    fire(node, 'change');
    expect(onChange).toHaveBeenCalledWith('k', false);
  });

  it('text reflects value and fires a string', () => {
    const onChange = vi.fn();
    const node = renderText(cfg(), st({ value: 'hello' }), { onChange });
    expect((node as HTMLInputElement).value).toBe('hello');
    fire(node, 'change', 'world');
    expect(onChange).toHaveBeenCalledWith('k', 'world');
  });

  it('number fires a Number', () => {
    const onChange = vi.fn();
    const node = renderNumber(cfg({ widget: 'number', zodType: 'number' }), st({ value: 7 }), { onChange });
    fire(node, 'change', '42');
    expect(onChange).toHaveBeenCalledWith('k', 42);
  });

  it('slider renders a range + output and fires a Number', () => {
    const onChange = vi.fn();
    const wrap = renderSlider(cfg({ widget: 'slider', zodType: 'number', bounds: { min: 0, max: 100 } }), st({ value: 20 }), { onChange });
    const range = wrap.querySelector('input[type=range]') as HTMLInputElement;
    expect(range).toBeTruthy();
    expect(wrap.querySelector('output')?.textContent).toBe('20');
    fire(range, 'change', '55');
    expect(onChange).toHaveBeenCalledWith('k', 55);
  });

  it('select renders options and reflects the selected value', () => {
    const node = renderSelect(cfg({ widget: 'select', zodType: 'enum', enumValues: ['light', 'dark', 'system'] }), st({ value: 'dark' }), {}) as HTMLSelectElement;
    expect(node.querySelectorAll('option').length).toBe(3);
    expect(node.value).toBe('dark');
  });
});

describe('secret widget', () => {
  it('shows the masked status and a write-only field, never plaintext', () => {
    const onChange = vi.fn();
    const node = renderSecret(cfg({ widget: 'secret', sensitivity: 'secret' }), st({ value: makeSecretRef('k', true) }), { onChange });
    expect(node.querySelector('.zodal-dials-secret-status')?.textContent).toBe('•••• (set)');
    const input = node.querySelector('input[type=password]') as HTMLInputElement;
    expect(input).toBeTruthy();
    fire(input, 'change', 'new-secret');
    expect(onChange).toHaveBeenCalledWith('k', 'new-secret');
  });
});

describe('structured / rawJson', () => {
  it('rawJson renders a textarea with a why-note and parses JSON on change', () => {
    const onChange = vi.fn();
    const wrap = renderRawJson(cfg({ widget: 'rawJson', zodType: 'unknown' }), st({ value: { a: 1 } }), { onChange });
    expect(wrap.querySelector('.zodal-dials-json-note')?.textContent).toMatch(/raw JSON/);
    const ta = wrap.querySelector('textarea') as HTMLTextAreaElement;
    fire(ta, 'change', '{"a":2}');
    expect(onChange).toHaveBeenCalledWith('k', { a: 2 });
  });

  it('ignores invalid JSON (does not call onChange)', () => {
    const onChange = vi.fn();
    const wrap = renderRawJson(cfg({ widget: 'rawJson' }), st({ value: {} }), { onChange });
    fire(wrap.querySelector('textarea') as HTMLTextAreaElement, 'change', '{not json');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('disabled state', () => {
  it('a managed or read-only field disables the control', () => {
    expect((renderText(cfg(), st({ managed: true }), {}) as HTMLInputElement).disabled).toBe(true);
    expect((renderText(cfg({ readOnly: true }), st(), {}) as HTMLInputElement).disabled).toBe(true);
    expect((renderText(cfg(), st(), {}) as HTMLInputElement).disabled).toBe(false);
  });
});
