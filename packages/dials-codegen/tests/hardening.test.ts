/** Hardening regressions from the codegen adversarial review: set never echoes a secret (C1), secret
 *  enum/const stripped from the schema (C2), schema allows the file $schema pointer (H1), set validates
 *  (H2), strict boolean coercion (L2), list shows ad-hoc keys masked (M3). */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineDials } from '@zodal/dials-core';
import { toJsonSchema, runCli, coerceByType } from '../src/index.js';

type Props = Record<string, Record<string, unknown>>;

describe('C1 — set never echoes a secret value', () => {
  const dials = defineDials(z.object({ 'network.apiKey': z.string().optional().meta({ secret: true }) }));
  it('masks the confirmation but still stores the value', () => {
    const { output, layer } = runCli(['set', 'network.apiKey', 'sk-TYPED-LIVE'], { dials, layer: {}, scope: 'user' });
    expect(output).toBe('set network.apiKey = •••• (set)');
    expect(output.includes('sk-TYPED-LIVE')).toBe(false);
    expect(layer['network.apiKey']).toBe('sk-TYPED-LIVE');
  });
});

describe('C2 — secret enum/const values are stripped from the schema', () => {
  it('removes enum and default for a secret key', () => {
    const dials = defineDials(z.object({ 'a.token': z.enum(['LIVE-1', 'LIVE-2']).default('LIVE-1').meta({ secret: true }) }));
    const schema = toJsonSchema(dials);
    const prop = (schema.properties as Props)['a.token'];
    expect(prop.enum).toBeUndefined();
    expect(prop.default).toBeUndefined();
    expect(JSON.stringify(schema).includes('LIVE-1')).toBe(false);
  });
});

describe('H1 — the schema permits the file $schema pointer', () => {
  it('adds a $schema property under additionalProperties:false', () => {
    const schema = toJsonSchema(defineDials(z.object({ 'a.b': z.number().default(1) })));
    expect((schema.properties as Props)['$schema']).toEqual({ type: 'string' });
    expect(schema.additionalProperties).toBe(false);
  });
  it('does not add it when additionalProperties:true', () => {
    const schema = toJsonSchema(defineDials(z.object({ 'a.b': z.number().default(1) })), { additionalProperties: true });
    expect((schema.properties as Props)['$schema']).toBeUndefined();
  });
});

describe('H2 — set validates the value against the field schema', () => {
  const dials = defineDials(
    z.object({ 'editor.fontSize': z.number().min(6).max(72).default(14), 'editor.theme': z.enum(['light', 'dark']).default('light') }),
  );
  const ctx = () => ({ dials, layer: {} as Record<string, unknown>, scope: 'user' });
  it('rejects out-of-range and out-of-enum values', () => {
    expect(runCli(['set', 'editor.fontSize', '9999'], ctx()).output).toMatch(/invalid value/);
    expect(runCli(['set', 'editor.fontSize', '3'], ctx()).output).toMatch(/invalid value/);
    expect(runCli(['set', 'editor.theme', 'neon'], ctx()).output).toMatch(/invalid value/);
  });
  it('accepts a valid value', () => {
    expect(runCli(['set', 'editor.fontSize', '30'], ctx()).output).toBe('set editor.fontSize = 30');
  });
});

describe('L2 — boolean coercion is strict', () => {
  it('rejects ambiguous tokens', () => {
    expect(coerceByType('boolean', 'true')).toBe(true);
    expect(coerceByType('boolean', 'no')).toBe(false);
    expect(() => coerceByType('boolean', 'on')).toThrow();
  });
});

describe('M3 — list shows ad-hoc (out-of-schema) keys, masked if secret', () => {
  it('includes an ad-hoc secret-named key, masked', () => {
    const dials = defineDials(z.object({ 'a.b': z.number().default(1) }));
    const { output } = runCli(['list'], { dials, layer: { 'adhoc.api_key': 'sk-ADHOC-LIVE' }, scope: 'user' });
    expect(output.includes('sk-ADHOC-LIVE')).toBe(false);
    expect(output).toContain('adhoc.api_key = •••• (set)');
  });
});
