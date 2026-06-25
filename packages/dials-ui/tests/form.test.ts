/** toSettingsForm + toFieldStates tests. */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineDials } from '@zodal/dials-core';
import { toSettingsForm, toFieldStates } from '../src/form.js';
import { describeSettings } from '../src/introspect.js';
import { makeDials } from './fixture.js';

describe('toSettingsForm', () => {
  const dials = makeDials();

  it('produces order-respecting fields and facet groups', () => {
    const form = toSettingsForm(dials);
    expect(form.fields[0].key).toBe('editor.fontSize'); // order: 1
    expect(form.groups.some((g) => g.id === 'editor')).toBe(true);
    expect(form.groups.some((g) => g.id === '@secret')).toBe(true);
  });

  it('excludes hidden fields by default, includes them on request', () => {
    const d = defineDials(
      z.object({ visible: z.string().default('x'), internal: z.string().default('y').meta({ hidden: true }) }),
    );
    expect(toSettingsForm(d).fields.map((f) => f.key)).toEqual(['visible']);
    expect(toSettingsForm(d, { includeHidden: true }).fields.length).toBe(2);
  });
});

describe('toFieldStates', () => {
  const dials = makeDials();
  const fields = describeSettings(dials);

  it('derives value, provenance source, and dirty', () => {
    const result = dials.resolve([{ scope: 'user', layer: { 'editor.fontSize': 20 } }]);
    const states = toFieldStates(fields, result, ['editor.fontSize']);
    expect(states['editor.fontSize'].value).toBe(20);
    expect(states['editor.fontSize'].source).toBe('user');
    expect(states['editor.fontSize'].shadowed).toBe(true); // shadows the default
    expect(states['editor.fontSize'].dirty).toBe(true);
    expect(states['editor.theme'].source).toBe('default');
    expect(states['editor.theme'].dirty).toBe(false);
  });

  it('marks managed (policy) state', () => {
    const result = dials.resolve([{ scope: 'policy', layer: { 'editor.theme': 'light' }, managed: true }]);
    expect(toFieldStates(fields, result)['editor.theme'].managed).toBe(true);
  });
});
