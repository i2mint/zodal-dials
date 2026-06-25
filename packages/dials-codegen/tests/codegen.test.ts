/** Tests for codegen: JSON Schema emit, AI prompt, and the CLI helpers (provenance + secret masking). */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineDials } from '@zodal/dials-core';
import { toJsonSchema, toPrompt, runCli, coerceByType } from '../src/index.js';

const dials = defineDials(
  z.object({
    'editor.fontSize': z.number().min(6).max(72).default(14).meta({ description: 'Font size in px' }),
    'editor.theme': z.enum(['light', 'dark', 'system']).default('system'),
    'editor.wordWrap': z.boolean().default(false),
    'network.apiKey': z.string().default('sk-DEFAULT-SECRET').meta({ secret: true }),
  }),
);

describe('toJsonSchema', () => {
  const schema = toJsonSchema(dials, { $id: 'https://x/settings.json', title: 'My Settings' });
  const props = schema.properties as Record<string, Record<string, unknown>>;

  it('emits flat dotted-key properties with type/default/enum/bounds', () => {
    expect(props['editor.fontSize']).toMatchObject({ type: 'number', default: 14, minimum: 6, maximum: 72 });
    expect(props['editor.theme'].enum).toEqual(['light', 'dark', 'system']);
  });

  it('drops required (overrides are optional) and sets additionalProperties false', () => {
    expect(schema.required).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);
  });

  it('redacts secret defaults — no plaintext anywhere', () => {
    expect(props['network.apiKey'].default).toBeUndefined();
    expect(JSON.stringify(schema).includes('sk-DEFAULT-SECRET')).toBe(false);
  });

  it('honors $id and title', () => {
    expect(schema.$id).toBe('https://x/settings.json');
    expect(schema.title).toBe('My Settings');
  });
});

describe('toPrompt', () => {
  const prompt = toPrompt(dials, { title: 'App Settings' });
  it('describes each setting, marks secrets, leaks no secret default', () => {
    expect(prompt).toContain('# App Settings');
    expect(prompt).toContain('`editor.theme` (enum: light | dark | system');
    expect(prompt).toContain('default 14');
    expect(prompt).toContain('Font size in px');
    expect(prompt).toContain('[secret]');
    expect(prompt.includes('sk-DEFAULT-SECRET')).toBe(false);
  });
});

describe('coerceByType', () => {
  it('coerces a raw string by base type', () => {
    expect(coerceByType('number', '16')).toBe(16);
    expect(coerceByType('boolean', 'true')).toBe(true);
    expect(coerceByType('string', 'dark')).toBe('dark');
    expect(coerceByType('array', '[1,2]')).toEqual([1, 2]);
    expect(() => coerceByType('number', 'abc')).toThrow();
  });
});

describe('CLI', () => {
  const ctx = () => ({ dials, layer: { 'editor.fontSize': 20 } as Record<string, unknown>, scope: 'user' });

  it('list --show-origin shows provenance', () => {
    const { output } = runCli(['list', '--show-origin'], ctx());
    expect(output).toContain('editor.fontSize = 20\t(user)');
    expect(output).toContain('editor.theme = "system"\t(default)');
  });

  it('list --modified shows only non-default settings', () => {
    const { output } = runCli(['list', '--modified'], ctx());
    expect(output).toContain('editor.fontSize');
    expect(output).not.toContain('editor.theme');
  });

  it('get shows value, origin, and shadowed scopes', () => {
    const { output } = runCli(['get', 'editor.fontSize'], ctx());
    expect(output).toContain('editor.fontSize = 20\t(user)');
    expect(output).toContain('shadows default');
  });

  it('masks a secret in list — never plaintext', () => {
    const { output } = runCli(['list'], { dials, layer: { 'network.apiKey': 'sk-LIVE-VALUE' }, scope: 'user' });
    expect(output.includes('sk-LIVE-VALUE')).toBe(false);
    expect(output).toContain('network.apiKey = •••• (set)');
  });

  it('set coerces and returns a NEW layer (input unchanged)', () => {
    const c = ctx();
    const { output, layer } = runCli(['set', 'editor.fontSize', '30'], c);
    expect(output).toBe('set editor.fontSize = 30');
    expect(layer['editor.fontSize']).toBe(30);
    expect(c.layer['editor.fontSize']).toBe(20);
  });

  it('rejects an unknown key and an invalid value', () => {
    expect(runCli(['set', 'nope.key', '1'], ctx()).output).toMatch(/unknown setting/);
    expect(runCli(['set', 'editor.fontSize', 'abc'], ctx()).output).toMatch(/invalid value/);
  });

  it('unset removes a key from the layer', () => {
    const { layer } = runCli(['unset', 'editor.fontSize'], ctx());
    expect('editor.fontSize' in layer).toBe(false);
  });
});
