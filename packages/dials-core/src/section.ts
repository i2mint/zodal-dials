/**
 * Sections: mount a component's settings schema in a host's settings, and hand the component its
 * section back as its own `settings` argument (zodal-dials#36).
 *
 * The fleet rule for a reusable component: it owns its settings schema and reads it through one
 * `settings` argument; a host mounts that schema under a prefix of its choosing.
 *
 * ```ts
 * // host
 * const dials = defineDials(z.object({
 *   theme: z.enum(['light', 'dark']).default('light'),
 *   ...mountSection('naming', namingSettingsSchema, { facet: 'Song titles' }),
 * }));
 * // call site: the component gets its own keys and types, defaults filled in
 * nameSong(words, { settings: sectionOf(store, 'naming', namingSettingsSchema) });
 * ```
 */

import type { z } from 'zod';
import { getObjectShape, readMeta } from './schema.js';

type Shape = Record<string, z.ZodType>;

export interface MountSectionOptions {
  /** A facet every mounted setting joins, as its first (primary) facet: the section's heading. */
  facet?: string;
  /**
   * What happens to the component's own `facets`: `'append'` (default) keeps them after the
   * section's facet, so the component's sub-grouping survives; `'replace'` drops them.
   */
  facets?: 'append' | 'replace';
}

/**
 * The component's fields keyed `prefix.key` (`mode` becomes `naming.mode`), each keeping its own
 * `.meta()`, with the section's facet added. Spread the result into the host's `z.object({...})`.
 * Throws when the prefix is empty.
 */
export function mountSection(prefix: string, schema: z.ZodObject<z.ZodRawShape>, options: MountSectionOptions = {}): Shape {
  if (!prefix) throw new Error('mountSection: the prefix must be a non-empty string');
  const { facet, facets = 'append' } = options;
  const out: Shape = {};
  for (const [key, field] of Object.entries(getObjectShape(schema))) {
    let mounted: z.ZodType = field;
    if (facet !== undefined) {
      const meta = readMeta(field);
      const own = facets === 'append' && Array.isArray(meta.facets) ? meta.facets.map(String).filter((f) => f !== facet) : [];
      mounted = (field as z.ZodType & { meta(m: Record<string, unknown>): z.ZodType }).meta({ ...meta, facets: [facet, ...own] });
    }
    out[`${prefix}.${key}`] = mounted;
  }
  return out;
}

/** Something holding effective values: a values map, a resolution, or a settings store. */
export type EffectiveSource =
  | Record<string, unknown>
  | { effective: Record<string, unknown> }
  | { getState(): { effective: Record<string, unknown> } };

function effectiveOf(source: EffectiveSource): Record<string, unknown> {
  const s = source as Record<string, unknown>;
  if (typeof s.getState === 'function') return (s.getState as () => { effective: Record<string, unknown> })().effective;
  if (s.effective && typeof s.effective === 'object' && !Array.isArray(s.effective)) return s.effective as Record<string, unknown>;
  return s;
}

/**
 * The section's effective values under the component's own keys, parsed by its schema (defaults
 * filled in). A value the schema rejects is dropped so its default applies, rather than failing the
 * whole section; throws only when the section cannot be parsed even then (a required field with no
 * value and no default), naming the fields. A masked secret arrives as a `SecretRef`.
 */
export function sectionOf<T extends z.ZodObject<z.ZodRawShape>>(source: EffectiveSource, prefix: string, schema: T): z.infer<T> {
  const effective = effectiveOf(source);
  const shape = getObjectShape(schema);
  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) {
    const v = effective[`${prefix}.${key}`];
    if (v === undefined) continue;
    if (shape[key]!.safeParse(v).success) raw[key] = v;
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const fields = parsed.error.issues.map((i) => i.path.join('.') || '(root)');
  throw new Error(`sectionOf('${prefix}'): no valid value and no default for ${[...new Set(fields)].join(', ')}`);
}
