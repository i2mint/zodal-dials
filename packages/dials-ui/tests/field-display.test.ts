/** describeSettings: the display affordances a phone sheet needs (step, enum labels, unit). */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineDials } from '@zodal/dials-core';
import { describeSettings } from '../src/introspect.js';
import { toIndexableSettings } from '../src/search.js';

const dials = defineDials(
  z.object({
    opacity: z.number().min(0.1).max(1).default(0.8),
    lineSpacing: z.number().min(1).max(2).multipleOf(0.05).default(1.2),
    columns: z.number().int().min(1).max(4).default(1),
    chordSize: z.number().min(8).max(32).default(14).meta({ step: 2, unit: 'px' }),
    span: z.number().min(0).max(1000).default(10),
    free: z.number().default(3),
    placement: z
      .enum(['above', 'inline'])
      .default('above')
      .meta({ enumLabels: { inline: 'In the line', bogus: 'ignored', above: 7 } }),
  }),
);
const byKey = Object.fromEntries(describeSettings(dials).map((f) => [f.key, f]));

describe('step', () => {
  it('derives a round step of ~1/100 of a bounded range when nothing declares one', () => {
    expect(byKey.opacity.step).toBe(0.01);
    expect(byKey.span.step).toBe(10);
  });
  it('takes .multipleOf(), then .int(), then .meta({ step }) wins over both', () => {
    expect(byKey.lineSpacing.step).toBe(0.05);
    expect(byKey.columns.step).toBe(1);
    expect(byKey.chordSize.step).toBe(2);
  });
  it('leaves an unbounded, undeclared number without a step', () => {
    expect(byKey.free.step).toBeUndefined();
    expect('step' in byKey.placement).toBe(false);
  });
});

describe('enum labels and unit', () => {
  it('keeps only string labels for real enum values', () => {
    expect(byKey.placement.enumLabels).toEqual({ inline: 'In the line' });
  });
  it('carries the unit', () => {
    expect(byKey.chordSize.unit).toBe('px');
    expect(byKey.opacity.unit).toBeUndefined();
  });
  it('makes enum labels searchable', () => {
    const indexed = toIndexableSettings(describeSettings(dials)).find((s) => s.key === 'placement');
    expect(indexed?.enumLabels).toEqual(['above', 'inline', 'In the line']);
  });
});
