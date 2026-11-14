import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineDials, defineLadder, UNSET } from '../src/index.js';

const dials = defineDials(
  z.object({
    size: z.number().default(64).meta({ writableScopes: ['user'], userBounds: { min: 16, max: 256 } }),
    shape: z.enum(['ring', 'grid', 'blob']).default('ring').meta({ writableScopes: ['user'], scopeBounds: { user: { oneOf: ['ring', 'grid'] } } }),
    seed: z.string().default('x'),
  }),
);

type Item = { type: 'song' | 'book'; id: string };
const PRESETS: Record<string, Record<string, unknown>> = { song: { shape: 'grid' }, book: { size: 96 } };

const ladder = defineLadder<Item>(dials, [
  { scope: 'preset', layer: (it) => PRESETS[it.type] },
  { scope: 'project', layer: { seed: 'proj' } },
  { scope: 'policy', layer: (it) => (it.id === 'locked' ? { size: 32 } : undefined), managed: true },
  { scope: 'user', layer: () => ({ size: 128, seed: 'mine', shape: 'blob' }), gated: true },
]);

describe('defineLadder', () => {
  it('selects layers from the context and records provenance', () => {
    const r = ladder.resolve({ type: 'song', id: 'a' });
    expect(r.effective).toEqual({ size: 128, shape: 'grid', seed: 'proj' });
    expect(r.provenance.shape.winningScope).toBe('preset');
    expect(r.provenance.size.winningScope).toBe('user');
    expect(r.provenance.size.shadowed.map((s) => s.scope)).toEqual(['default']);
  });
  it('refuses closed keys and out-of-bounds values from a gated rung, and reports them', () => {
    const r = ladder.resolve({ type: 'book', id: 'b' });
    expect(r.effective.seed).toBe('proj');
    expect(r.refused.map((x) => [x.key, x.reason])).toEqual([
      ['seed', 'not-writable'],
      ['shape', 'out-of-bounds'],
    ]);
  });
  it('keeps the policy band on top', () => {
    const r = ladder.resolve({ type: 'book', id: 'locked' });
    expect(r.effective.size).toBe(32);
    expect(ladder.explain('size', { type: 'book', id: 'locked' })?.managed).toBe(true);
  });
  it('checks bounds and lists what a scope may set', () => {
    expect(ladder.checkWrite('user', 'size', 8)?.reason).toBe('out-of-bounds');
    expect(ladder.checkWrite('user', 'size', 300)?.detail).toMatch(/maximum 256/);
    expect(ladder.checkWrite('user', 'size', 100)).toBeUndefined();
    expect(ladder.checkWrite('user', 'size', UNSET)).toBeUndefined();
    expect(ladder.checkWrite('user', 'size', 'big')?.reason).toBe('out-of-bounds');
    expect(ladder.writableKeys('user')).toEqual([
      { key: 'size', bounds: { min: 16, max: 256 } },
      { key: 'shape', bounds: { oneOf: ['ring', 'grid'] } },
    ]);
    // A rung that is not gated may set every key.
    expect(ladder.writableKeys('project').map((k) => k.key)).toEqual(['size', 'shape', 'seed']);
    expect(ladder.checkWrite('project', 'seed', 'x')).toBeUndefined();
    expect(() => ladder.writableKeys('nope')).toThrow(/no rung/);
  });
  it('exposes the stack it built', () => {
    const { stack } = ladder.stack({ type: 'song', id: 'a' });
    expect(stack.map((s) => s.scope)).toEqual(['preset', 'project', 'user']);
  });
  it('refuses a rung without a scope, duplicate scopes, and managed + gated', () => {
    expect(() => defineLadder(dials, [{ scope: '', layer: {} }])).toThrow(/scope/);
    expect(() => defineLadder(dials, [{ scope: 'a', layer: {} }, { scope: 'a', layer: {} }])).toThrow(/share/);
    expect(() => defineLadder(dials, [{ scope: 'u', layer: {}, managed: true, gated: true }])).toThrow(/managed and gated/);
  });
  it('validates bounds at definition time', () => {
    const bad = (meta: Record<string, unknown>, field = z.number()) =>
      () => defineLadder(defineDials(z.object({ k: field.meta(meta) })), []);
    expect(bad({ writableScopes: ['user'], userBounds: { min: 5, max: 1 } })).toThrow(/min 5 > max 1/);
    expect(bad({ userBounds: { min: 1 } })).toThrow(/writableScopes/);
    expect(bad({ writableScopes: ['user'], userBounds: { oneOf: [{}] } }, z.object({ a: z.number() }) as any)).toThrow(/merges/);
  });
  it('never echoes a refused secret', () => {
    const d = defineDials(z.object({ apiKey: z.string().default('') }));
    const l = defineLadder(d, [{ scope: 'user', layer: { apiKey: 'sk-live-123' }, gated: true }]);
    const r = l.resolve(undefined);
    expect(JSON.stringify(r.refused)).not.toContain('sk-live-123');
    expect(r.refused[0]!.reason).toBe('not-writable');
  });
  it('a rung may return several scoped layers, and a gate seam from runtime config', () => {
    const allow: Record<string, boolean> = { size: true };
    const l = defineLadder<{ dark: boolean }>(dials, [
      { scope: 'preset', layer: (c) => [{ scope: 'preset:base', layer: { size: 20 } }, ...(c.dark ? [{ scope: 'preset:dark', layer: { size: 30 } }] : [])] },
      { scope: 'user', layer: { size: 50, seed: 'u' }, gated: true, gate: (key) => (allow[key] ? { max: 40 } : false) },
    ]);
    const r = l.resolve({ dark: true });
    expect(r.effective.size).toBe(30);
    expect(r.provenance.size.winningScope).toBe('preset:dark');
    expect(r.refused.map((x) => x.reason).sort()).toEqual(['not-writable', 'out-of-bounds']);
  });
  it('marks keys a managed rung holds as locked for the context', () => {
    const keys = ladder.writableKeys('user', { type: 'book', id: 'locked' });
    expect(keys.find((k) => k.key === 'size')?.locked).toBe(true);
    expect(ladder.writableKeys('user').some((k) => k.locked)).toBe(false);
  });
  it('falls back to the schema bounds', () => {
    const d = defineDials(z.object({ n: z.number().min(1).max(9).default(5).meta({ writableScopes: ['user'] }) }));
    const l = defineLadder(d, [{ scope: 'user', layer: { n: 99 }, gated: true }]);
    expect(l.writableKeys('user')).toEqual([{ key: 'n', bounds: { min: 1, max: 9 } }]);
    expect(l.resolve(undefined).refused[0]!.reason).toBe('out-of-bounds');
  });
});
