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
    expect(ladder.writableKeys('project')).toEqual([]);
  });
  it('exposes the stack it built', () => {
    const { stack } = ladder.stack({ type: 'song', id: 'a' });
    expect(stack.map((s) => s.scope)).toEqual(['preset', 'project', 'user']);
  });
  it('refuses a rung without a scope', () => {
    expect(() => defineLadder(dials, [{ scope: '', layer: {} }])).toThrow(/scope/);
  });
});
