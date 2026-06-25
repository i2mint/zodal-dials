/** Tests for the defineDials facade: default extraction, default-aware resolution, type-directed +
 *  meta-overridden merge strategy, explain/provenance, and capabilities. */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineDials } from '../src/define-dials.js';

describe('defineDials', () => {
  const dials = defineDials(
    z.object({
      'editor.fontSize': z.number().min(6).max(72).default(14),
      'editor.theme': z.enum(['light', 'dark', 'system']).default('system'),
      'ui.layout': z.object({ sidebar: z.boolean(), width: z.number() }).default({ sidebar: true, width: 200 }),
      'search.exclude': z.array(z.string()).default([]).meta({ mergeStrategy: 'append' }),
    }),
  );

  it('extracts declared defaults', () => {
    expect(dials.defaults['editor.fontSize']).toBe(14);
    expect(dials.defaults['editor.theme']).toBe('system');
    expect(dials.defaults['ui.layout']).toEqual({ sidebar: true, width: 200 });
    expect(dials.keys.length).toBe(4);
  });

  it('resolve prepends defaults as the lowest scope', () => {
    const r = dials.resolve([{ scope: 'user', layer: { 'editor.fontSize': 18 } }]);
    expect(r.effective['editor.fontSize']).toBe(18);
    expect(r.effective['editor.theme']).toBe('system'); // from default
    expect(r.provenance['editor.theme'].winningScope).toBe('default');
    expect(r.provenance['editor.fontSize'].winningScope).toBe('user');
  });

  it('applies the type-directed merge strategy (object -> deep-merge) automatically', () => {
    const r = dials.resolve([{ scope: 'user', layer: { 'ui.layout': { width: 320 } } }]);
    expect(r.effective['ui.layout']).toEqual({ sidebar: true, width: 320 });
    expect(r.provenance['ui.layout'].mergeStrategy).toBe('deep-merge');
  });

  it('honors a .meta({ mergeStrategy: append }) override on an array field', () => {
    expect(dials.mergeStrategyFor('search.exclude')).toBe('append');
    const r = dials.resolve([{ scope: 'user', layer: { 'search.exclude': ['dist'] } }]);
    expect(r.effective['search.exclude']).toEqual(['dist']); // default is [] so append yields user's
  });

  it('defaults to replace for scalar fields', () => {
    expect(dials.mergeStrategyFor('editor.fontSize')).toBe('replace');
    expect(dials.mergeStrategyFor('editor.theme')).toBe('replace');
  });

  it('explain returns provenance for a single key', () => {
    const prov = dials.explain('editor.fontSize', [{ scope: 'user', layer: { 'editor.fontSize': 20 } }]);
    expect(prov?.winningScope).toBe('user');
    expect(prov?.shadowed.map((s) => s.scope)).toEqual(['default']);
  });

  it('reuses zodal defineCollection for affordances', () => {
    expect(dials.collection).toBeDefined();
  });

  it('reports honest capabilities', () => {
    const caps = dials.getCapabilities();
    expect(caps.keyCount).toBe(4);
    expect(caps.hasSecrets).toBe(false);
    expect(caps.mergeStrategies['ui.layout']).toBe('deep-merge');
    expect(caps.mergeStrategies['search.exclude']).toBe('append');
  });
});
