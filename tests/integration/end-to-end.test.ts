/**
 * Cross-package integration story: @zodal/dials-core + @zodal/dials-ui compose end-to-end —
 * define a settings surface, resolve a cascade with provenance + secret masking, generate the
 * headless form/groups/states, search it, and pick a renderer via the registry. Proves the two
 * packages integrate (imported as their published entry points, resolved to the workspace builds).
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineDials } from '@zodal/dials-core';
import type { ResolvedFieldAffordance } from '@zodal/core';
import {
  toSettingsForm,
  toFieldStates,
  createSettingsRendererRegistry,
  alwaysMatch,
  isBoolean,
  secretRoleIs,
  toIndexableSettings,
  createSubstringSearchProvider,
  searchSettings,
} from '@zodal/dials-ui';

describe('zodal-dials end-to-end', () => {
  const dials = defineDials(
    z.object({
      'editor.fontSize': z.number().min(6).max(72).default(14).meta({ facets: ['editor'] }),
      'editor.theme': z.enum(['light', 'dark', 'system']).default('system').meta({ facets: ['editor', 'appearance'] }),
      'network.apiKey': z.string().optional().meta({ facets: ['network'] }),
    }),
  );

  it('resolves with provenance, masks secrets, forms, groups, searches, and picks renderers', () => {
    const result = dials.resolve(
      [
        { scope: 'profile', layer: { 'editor.theme': 'dark' } },
        { scope: 'user', layer: { 'editor.fontSize': 18, 'network.apiKey': 'SUPER-SECRET' } },
      ],
      { maskSecrets: true },
    );

    // cascade + provenance
    expect(result.effective['editor.theme']).toBe('dark');
    expect(result.provenance['editor.theme'].winningScope).toBe('profile');
    expect(result.provenance['editor.fontSize'].winningScope).toBe('user');
    // secret never leaks anywhere in the masked result
    expect(JSON.stringify(result).includes('SUPER-SECRET')).toBe(false);

    // headless form + groups + field states
    const form = toSettingsForm(dials, { result });
    expect(form.fields.length).toBe(3);
    expect(form.groups.some((g) => g.id === 'editor')).toBe(true);
    expect(form.groups.some((g) => g.id === '@secret')).toBe(true);
    const states = toFieldStates(form.fields, result, ['editor.fontSize']);
    expect(states['editor.fontSize'].dirty).toBe(true);
    expect(states['editor.theme'].source).toBe('profile');

    // search: scoped filter + free text
    const provider = createSubstringSearchProvider(toIndexableSettings(form.fields));
    expect(searchSettings('@secret', provider, { fields: form.fields, result })).toEqual(['network.apiKey']);
    expect(searchSettings('theme', provider, { fields: form.fields })).toContain('editor.theme');

    // renderer selection: a secret picks the masked widget via the OVERRIDE band
    const reg = createSettingsRendererRegistry<string>();
    reg.register({ tester: alwaysMatch(), renderer: 'rawJson' });
    reg.register({ tester: isBoolean(), renderer: 'switch' });
    reg.register({ tester: secretRoleIs(), renderer: 'secret' });
    const apiField = { zodType: 'string' } as unknown as ResolvedFieldAffordance;
    expect(reg.resolve(apiField, { mode: 'form', sensitivity: dials.sensitivityFor('network.apiKey') })).toBe('secret');
  });
});
