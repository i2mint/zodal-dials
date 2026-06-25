/** React render + interaction tests for the shadcn settings renderer (jsdom + testing-library). */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement as h } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { z } from 'zod';
import { defineDials } from '@zodal/dials-core';
import { toSettingsForm, toFieldStates } from '@zodal/dials-ui';
import { SettingsPanel, SettingField, createShadcnSettingsRegistry } from '../src/index.js';

afterEach(cleanup);

const dials = defineDials(
  z.object({
    'editor.fontSize': z.number().min(6).max(72).default(14).meta({ facets: ['editor'] }),
    'editor.theme': z.enum(['light', 'dark', 'system']).default('system').meta({ facets: ['editor'] }),
    'editor.wordWrap': z.boolean().default(false).meta({ facets: ['editor'] }),
    'network.apiKey': z.string().optional().meta({ facets: ['network'] }),
  }),
);

function renderPanel(overrides: { onChange?: ReturnType<typeof vi.fn>; onReset?: ReturnType<typeof vi.fn> } = {}) {
  const result = dials.resolve([{ scope: 'user', layer: { 'editor.fontSize': 20, 'network.apiKey': 'SUPER-SECRET' } }], { maskSecrets: true });
  const form = toSettingsForm(dials, { result });
  const states = toFieldStates(form.fields, result, ['editor.fontSize']);
  return render(h(SettingsPanel, { form, states, ...overrides }));
}

describe('SettingsPanel', () => {
  it('renders one row per setting, grouped into sections, with a search box', () => {
    const { container } = renderPanel();
    expect(container.querySelectorAll('.zodal-dials-field').length).toBe(4);
    expect(container.querySelector('input[type=search]')).toBeTruthy();
    expect(container.querySelector('section[data-group=editor]')).toBeTruthy();
    expect(container.querySelector('section[data-group=network]')).toBeTruthy();
    expect(container.querySelector('[data-key="editor.fontSize"]')?.getAttribute('data-widget')).toBe('slider');
    // editor.theme is a 3-value enum -> radio (<=4 values); wordWrap -> switch
    expect(container.querySelector('[data-key="editor.theme"]')?.getAttribute('data-widget')).toBe('radio');
    expect(container.querySelectorAll('[data-key="editor.theme"] input[type=radio]').length).toBe(3);
    expect(container.querySelector('[data-key="editor.wordWrap"] input[type=checkbox]')).toBeTruthy();
  });

  it('never renders a secret in plaintext (masked + write-only field)', () => {
    const { container } = renderPanel();
    expect(container.innerHTML.includes('SUPER-SECRET')).toBe(false);
    expect(container.querySelector('[data-key="network.apiKey"] input[type=password]')).toBeTruthy();
    expect(container.querySelector('[data-key="network.apiKey"] .zodal-dials-secret-status')?.textContent).toBe('•••• (set)');
  });

  it('shows a provenance badge on a modified setting', () => {
    const { container } = renderPanel();
    expect(container.querySelector('[data-key="editor.fontSize"] .zodal-dials-source')?.textContent).toBe('user');
  });

  it('fires onChange with the decoded value when a control changes', () => {
    const onChange = vi.fn();
    const { container } = renderPanel({ onChange });
    fireEvent.change(container.querySelector('[data-key="editor.fontSize"] input[type=range]') as HTMLInputElement, { target: { value: '30' } });
    expect(onChange).toHaveBeenCalledWith('editor.fontSize', 30);
  });

  it('the search box filters rows', () => {
    const { container } = renderPanel();
    fireEvent.change(container.querySelector('input[type=search]') as HTMLInputElement, { target: { value: 'theme' } });
    const keys = Array.from(container.querySelectorAll('.zodal-dials-field')).map((r) => r.getAttribute('data-key'));
    expect(keys).toEqual(['editor.theme']);
  });
});

describe('SettingField', () => {
  it('renders a reset button for an overridden field and fires onReset', () => {
    const onReset = vi.fn();
    const fields = toSettingsForm(dials).fields;
    const field = fields.find((f) => f.key === 'editor.fontSize')!;
    const { container } = render(
      h(SettingField, { field, state: { value: 20, source: 'user', managed: false, shadowed: true, dirty: true }, onReset, registry: createShadcnSettingsRegistry() }),
    );
    const reset = container.querySelector('.zodal-dials-reset') as HTMLButtonElement;
    expect(reset).toBeTruthy();
    fireEvent.click(reset);
    expect(onReset).toHaveBeenCalledWith('editor.fontSize');
  });

  it('a managed field shows a policy badge and no reset', () => {
    const fields = toSettingsForm(dials).fields;
    const field = fields.find((f) => f.key === 'editor.theme')!;
    const { container } = render(h(SettingField, { field, state: { value: 'light', source: 'policy', managed: true, shadowed: false, dirty: false } }));
    expect(container.querySelector('.zodal-dials-managed')).toBeTruthy();
    expect(container.querySelector('.zodal-dials-reset')).toBeNull();
  });
});
