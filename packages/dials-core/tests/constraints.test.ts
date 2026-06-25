/** Tests for linked validation (hard cross-field constraints + soft warnings) and dependent
 *  (smart) defaults with override-stickiness. */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { evaluateConstraints } from '../src/constraints.js';
import { applyDependentDefaults } from '../src/derive.js';
import { defineDials } from '../src/define-dials.js';

describe('evaluateConstraints', () => {
  it('reports a cross-field Zod constraint with the offending key path', () => {
    const schema = z
      .object({ a: z.boolean(), b: z.boolean(), c: z.boolean() })
      .superRefine((val, ctx) => {
        if (val.a && val.b && val.c) {
          ctx.addIssue({ code: 'custom', message: 'a, b, and c cannot all be true', path: ['c'] });
        }
      });
    const bad = evaluateConstraints({ a: true, b: true, c: true }, { schema });
    expect(bad.ok).toBe(false);
    expect(bad.errors[0].message).toMatch(/cannot all be true/);
    expect(bad.errors[0].keys).toEqual(['c']);

    const good = evaluateConstraints({ a: true, b: true, c: false }, { schema });
    expect(good.ok).toBe(true);
  });

  it('evaluates serializable assertions', () => {
    const r = evaluateConstraints(
      { mutexA: true, mutexB: true },
      {
        assertions: [
          {
            message: 'mutexA and mutexB are mutually exclusive',
            keys: ['mutexA', 'mutexB'],
            check: (v) => !(v.mutexA && v.mutexB),
          },
        ],
      },
    );
    expect(r.ok).toBe(false);
    expect(r.errors[0].keys).toEqual(['mutexA', 'mutexB']);
  });

  it('collects soft warnings without failing', () => {
    const r = evaluateConstraints(
      { poolSize: 500 },
      { warnings: [{ message: 'poolSize > 200 may exhaust connections', when: (v) => (v.poolSize as number) > 200 }] },
    );
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual(['poolSize > 200 may exhaust connections']);
  });

  it('treats a throwing predicate as unsatisfied', () => {
    const r = evaluateConstraints(
      {},
      { assertions: [{ message: 'boom', check: () => { throw new Error('x'); } }] },
    );
    expect(r.ok).toBe(false);
  });
});

describe('applyDependentDefaults (smart defaults + stickiness)', () => {
  const defaults = [
    {
      key: 'pool.max',
      dependsOn: ['cpu.cores'],
      derive: (v: Record<string, unknown>) => (v['cpu.cores'] as number) * 4,
    },
  ];

  it('applies a dependent default when the target is not dirty', () => {
    const { values, applied } = applyDependentDefaults({ 'cpu.cores': 8 }, defaults);
    expect(values['pool.max']).toBe(32);
    expect(applied).toEqual(['pool.max']);
  });

  it('does NOT recompute a dirty (user-set) target (override-stickiness)', () => {
    const { values, applied } = applyDependentDefaults(
      { 'cpu.cores': 8, 'pool.max': 99 },
      defaults,
      { dirtyKeys: ['pool.max'] },
    );
    expect(values['pool.max']).toBe(99);
    expect(applied).toEqual([]);
  });

  it('is wired through defineDials.withDependentDefaults', () => {
    const dials = defineDials(z.object({ 'cpu.cores': z.number().default(4), 'pool.max': z.number().optional() }), {
      dependentDefaults: defaults,
    });
    expect(dials.withDependentDefaults({ 'cpu.cores': 4 })['pool.max']).toBe(16);
    expect(dials.withDependentDefaults({ 'cpu.cores': 4, 'pool.max': 7 }, ['pool.max'])['pool.max']).toBe(7);
  });
});
