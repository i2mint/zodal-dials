import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve as resolvePath } from 'node:path';
import { z } from 'zod';
import { defineDials, toResolvePlan, resolvePlan, UNSET } from '../src/index.js';

const dials = defineDials(
  z.object({
    size: z.number().default(10),
    tags: z.array(z.string()).default(['a']).meta({ mergeStrategy: 'append' }),
    theme: z.object({ fg: z.string(), bg: z.string() }).default({ fg: 'k', bg: 'w' }),
    apiKey: z.string().default(''),
  }),
);

const stack = [
  { scope: 'project', layer: { size: 20, tags: ['b'], theme: { fg: 'r' } } },
  { scope: 'user', layer: { size: UNSET, apiKey: 'sk-1', service_token: 't' } },
];

describe('resolvePlan (zodal-dials#44)', () => {
  it('matches dials.resolve, with and without masking', () => {
    const plan = JSON.parse(JSON.stringify(toResolvePlan(dials)));
    expect(resolvePlan(plan, stack as any)).toEqual(dials.resolve(stack as any));
    expect(resolvePlan(plan, stack as any, { maskSecrets: true })).toEqual(dials.resolve(stack as any, { maskSecrets: true }));
    expect(resolvePlan(plan, stack as any, { includeDefaults: false })).toEqual(dials.resolve(stack as any, { includeDefaults: false }));
  });
  it('the cascade entry imports neither zod nor @zodal/core', () => {
    const seen = new Set<string>();
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/^(?:import|export)\s(?!type\b)[^'"]*from\s+['"]([^'"]+)['"]/gm)) {
        const spec = m[1]!;
        expect(spec, `${file} imports ${spec}`).toMatch(/^\./);
        walk(resolvePath(dirname(file), spec.replace(/\.js$/, '.ts')));
      }
    };
    walk(join(__dirname, '../src/cascade-entry.ts'));
    expect(seen.size).toBeGreaterThan(3);
  });
});
