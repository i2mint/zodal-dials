/** Hardening regressions from the dials-ui-vanilla adversarial review: number/slider decode (H1/H2),
 *  secret masking by widget kind + rawJson secret guard (M1), and description-aware search (M3). */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { defineDials, makeSecretRef } from '@zodal/dials-core';
import type { ResolvedFieldAffordance } from '@zodal/core';
import { toSettingsForm, toFieldStates } from '@zodal/dials-ui';
import { renderNumber, renderSlider, renderRawJson } from '../src/widgets.js';
import { createVanillaSettingsRegistry } from '../src/registry.js';
import { renderSettingsPanel } from '../src/panel.js';
import { cfg, st, fire } from './fixture.js';

const stub = (zodType: string) => ({ zodType }) as unknown as ResolvedFieldAffordance;

describe('H1/H2 — number/slider do not emit 0 or NaN on empty/invalid input', () => {
  it('clearing a number emits nothing (use Reset to unset)', () => {
    const onChange = vi.fn();
    const node = renderNumber(cfg({ widget: 'number', zodType: 'number' }), st({ value: 42 }), { onChange });
    fire(node, 'change', '');
    expect(onChange).not.toHaveBeenCalled();
    fire(node, 'change', 'abc');
    expect(onChange).not.toHaveBeenCalled();
    fire(node, 'change', '30');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('k', 30);
  });

  // Note: a range input can never be empty/NaN (the browser/jsdom clamps to a value in [min,max]),
  // so the decodeNumber guard on the slider is purely defensive; the bug only affects number inputs.
  it('slider always emits a valid Number on change', () => {
    const onChange = vi.fn();
    const wrap = renderSlider(cfg({ widget: 'slider', zodType: 'number', bounds: { min: 0, max: 100 } }), st({ value: 20 }), { onChange });
    const range = wrap.querySelector('input[type=range]') as HTMLInputElement;
    fire(range, 'change', '55');
    expect(onChange).toHaveBeenCalledWith('k', 55);
  });
});

describe('M1 — secret masking does not depend on context lockstep', () => {
  it('a resolved secret widget kind renders the masked control even without ctx.sensitivity', () => {
    const reg = createVanillaSettingsRegistry();
    const fn = reg.resolve(stub('string'), { mode: 'form', widget: 'secret' });
    const node = fn?.(cfg({ widget: 'secret' }), st(), {});
    expect(node?.querySelector('input[type=password]')).toBeTruthy();
  });

  it('the rawJson renderer refuses to serialize a secret (falls back to the masked widget)', () => {
    const node = renderRawJson(cfg({ widget: 'rawJson', sensitivity: 'secret' }), st({ value: makeSecretRef('k', true) }), {});
    expect(node.querySelector('input[type=password]')).toBeTruthy();
    expect(node.querySelector('textarea')).toBeNull();
    expect(node.innerHTML.includes('_tag')).toBe(false);
  });
});

describe('M3 — client-side search matches descriptions', () => {
  it('finds a setting by a word only in its description', () => {
    const dials = defineDials(
      z.object({
        'editor.fontSize': z.number().min(6).max(72).default(14).meta({ facets: ['editor'], description: 'controls the pixel height of glyphs' }),
        'editor.theme': z.enum(['light', 'dark']).default('light').meta({ facets: ['editor'], description: 'colour palette' }),
      }),
    );
    const result = dials.resolve([]);
    const form = toSettingsForm(dials, { result });
    const panel = renderSettingsPanel(form, toFieldStates(form.fields, result));
    const search = panel.querySelector('input[type=search]') as HTMLInputElement;
    fire(search, 'input', 'glyphs');
    const visible = Array.from(panel.querySelectorAll<HTMLElement>('.zodal-dials-field')).filter((r) => r.style.display !== 'none');
    expect(visible.map((r) => r.getAttribute('data-key'))).toEqual(['editor.fontSize']);
  });
});
