/**
 * Hardening regressions — the vectors found by the dials-ui adversarial critic. RED before the fix,
 * GREEN after: secret plaintext default (C1), unmasked secret value in field state (C2), every-number-
 * a-slider (H1), duplicate group ids (H2), null/undefined dirty conflation (H3).
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineDials, isSecretRef } from '@zodal/dials-core';
import { describeSettings } from '../src/introspect.js';
import { toGroups } from '../src/facets.js';
import { toFieldStates } from '../src/form.js';
import { dirtyKeys } from '../src/lifecycle.js';
import { makeDials } from './fixture.js';

describe('C1 — a secret default never reaches the headless config as plaintext', () => {
  it('omits a secret field defaultValue', () => {
    const d = defineDials(z.object({ 'network.apiKey': z.string().default('sk-PLAINTEXT-SECRET').meta({ secret: true }) }));
    const f = describeSettings(d).find((x) => x.key === 'network.apiKey');
    expect(f?.sensitivity).toBe('secret');
    expect(f?.defaultValue).toBeUndefined();
    expect(JSON.stringify(describeSettings(d)).includes('sk-PLAINTEXT-SECRET')).toBe(false);
  });
});

describe('C2 — toFieldStates masks secrets even from an UNMASKED resolution', () => {
  it('emits a SecretRef, never plaintext', () => {
    const d = defineDials(z.object({ 'network.apiKey': z.string().optional() }));
    const fields = describeSettings(d);
    const result = d.resolve([{ scope: 'user', layer: { 'network.apiKey': 'sk-LIVE-PLAINTEXT' } }]); // unmasked
    const states = toFieldStates(fields, result);
    expect(isSecretRef(states['network.apiKey'].value)).toBe(true);
    expect(JSON.stringify(states).includes('sk-LIVE-PLAINTEXT')).toBe(false);
  });
});

describe('H1 — only a fully-bounded number is a slider', () => {
  const widgetOf = (schema: z.ZodType) => describeSettings(defineDials(z.object({ n: schema })))[0].widget;
  it('unbounded / one-sided numbers are number inputs, fully-bounded is a slider', () => {
    expect(widgetOf(z.number().default(1))).toBe('number');
    expect(widgetOf(z.number().min(5).default(10))).toBe('number');
    expect(widgetOf(z.number().max(5).default(1))).toBe('number');
    expect(widgetOf(z.number().min(0).max(10).default(5))).toBe('slider');
  });
});

describe('H2 — group ids stay unique when a facet collides with a reserved id', () => {
  it('a user facet named @secret does not duplicate the computed group', () => {
    const d = defineDials(z.object({ a: z.string().default('x').meta({ secret: true, facets: ['@secret'] }) }));
    expect(toGroups(describeSettings(d)).filter((g) => g.id === '@secret').length).toBe(1);
  });
  it('a user facet named _ungrouped does not duplicate the catch-all', () => {
    const fields = describeSettings(makeDials()).map((f) => ({ ...f, facets: f.key === 'ui.layout' ? ['_ungrouped'] : [] }));
    expect(toGroups(fields, undefined, { computedGroups: false }).filter((g) => g.id === '_ungrouped').length).toBe(1);
  });
});

describe('H3 — dirtyKeys distinguishes null / undefined / absent / UNSET', () => {
  it('null and undefined are different values', () => {
    expect(dirtyKeys({ a: null }, { a: undefined })).toEqual(['a']);
  });
  it('undefined-present differs from absent', () => {
    expect(dirtyKeys({ a: undefined }, {})).toEqual(['a']);
  });
  it('like values are clean', () => {
    expect(dirtyKeys({ a: null }, { a: null })).toEqual([]);
    expect(dirtyKeys({ a: undefined }, { a: undefined })).toEqual([]);
  });
});
