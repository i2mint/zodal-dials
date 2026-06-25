/**
 * Zod v4 introspection helpers for settings schemas: reading the object shape, per-field `.meta()`
 * (unwrapping wrappers so wrapped metadata survives), extracting declared defaults (robustly, by
 * parsing `undefined` — no reliance on private internals), the type-directed merge strategy, and the
 * sensitivity classification (name heuristics + `.meta()` override). Uses `@zodal/core` helpers
 * where they apply and stable `instanceof` checks for base typing.
 */

import { z } from 'zod';
import { unwrapZodSchema } from '@zodal/core';
import type { MergeStrategy, Sensitivity } from './model.js';

/** Get the field map of a Zod object schema. Prefers `_zod.def.shape` (the workspace Zod-v4 rule),
 *  falling back to the public `.shape`. */
export function getObjectShape(schema: z.ZodObject<z.ZodRawShape>): Record<string, z.ZodType> {
  const anySchema = schema as unknown as {
    shape?: Record<string, z.ZodType>;
    _zod?: { def?: { shape?: Record<string, z.ZodType> } };
  };
  return anySchema._zod?.def?.shape ?? anySchema.shape ?? {};
}

/** Read a field's `.meta()` metadata, unwrapping wrappers so metadata on the inner schema is found. */
export function readMeta(schema: z.ZodType): Record<string, unknown> {
  const tryMeta = (s: z.ZodType): Record<string, unknown> | undefined => {
    const m = (s as unknown as { meta?: () => unknown }).meta?.();
    return m && typeof m === 'object' ? (m as Record<string, unknown>) : undefined;
  };
  return tryMeta(schema) ?? tryMeta(unwrapZodSchema(schema)) ?? {};
}

/** The stable base type of a field (after unwrapping optional/default/nullable). */
export function baseType(field: z.ZodType): string {
  const s = unwrapZodSchema(field);
  if (s instanceof z.ZodObject) return 'object';
  if (s instanceof z.ZodRecord) return 'object';
  if (s instanceof z.ZodArray) return 'array';
  if (s instanceof z.ZodNumber) return 'number';
  if (s instanceof z.ZodBoolean) return 'boolean';
  if (s instanceof z.ZodString) return 'string';
  if (s instanceof z.ZodEnum) return 'enum';
  return 'unknown';
}

/** Extract the per-key default values declared in the schema (the lowest cascade layer). */
export function extractDefaults(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(getObjectShape(schema))) {
    const r = field.safeParse(undefined);
    if (r.success && r.data !== undefined) defaults[key] = r.data;
  }
  return defaults;
}

/** The type-directed default merge strategy for a field, overridable via `.meta({ mergeStrategy })`. */
export function keyMergeStrategy(field: z.ZodType): MergeStrategy {
  const override = readMeta(field).mergeStrategy;
  if (override === 'replace' || override === 'deep-merge' || override === 'append') return override;
  return baseType(field) === 'object' ? 'deep-merge' : 'replace';
}

/** Split a dotted/snake/camelCase key into lowercased word-separated form for heuristic matching. */
function normalizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[._\-/]+/g, ' ')
    .toLowerCase();
}

/**
 * Field-name heuristic for secret values. Matched against the de-camelCased, separator-normalized
 * key so `apiKey`, `api_key`, `apiKeys`, `refreshToken`, `privateKeyPath`, `passwordHash`,
 * `client_secret`, `secretId` all trip it, while `keyboard`, `tokenize`, `secretary` do not. Errs
 * toward classifying-as-secret (fail-safe).
 */
const SECRET_NAME =
  /(?:^| )(secret|secrets|secret ?id|passwords?|passwd|credentials?|tokens?|api ?keys?|access ?keys?|private ?keys?|client ?secret|refresh ?token|access ?token|auth ?token)(?: |$)/;

function secretByName(key: string): boolean {
  return SECRET_NAME.test(normalizeKey(key));
}

/** Maximum nesting depth searched for a nested secret (settings schemas are rarely deeper). */
const MAX_SECRET_DEPTH = 8;

/** Immediate child schemas of a container type (array element, record value, tuple items, union
 *  options), read defensively from public getters and `_zod.def`. Objects are handled separately
 *  because their children carry KEY names the heuristic needs. */
function childSchemas(inner: z.ZodType): z.ZodType[] {
  const a = inner as unknown as Record<string, unknown> & { _zod?: { def?: Record<string, unknown> } };
  const def = a._zod?.def ?? {};
  const kids: z.ZodType[] = [];
  const push = (c: unknown): void => {
    if (c && typeof c === 'object' && '_zod' in (c as object)) kids.push(c as z.ZodType);
  };
  push(a.element);
  push(def.element);
  push(a.valueType);
  push(def.valueType);
  for (const arr of [a.items, def.items, a.options, def.options]) {
    if (Array.isArray(arr)) for (const c of arr) push(c);
  }
  return kids;
}

/** True if a (possibly nested) schema declares a secret — by `.meta`, by a secret-named object key,
 *  or recursively inside an object/array/record/tuple/union. Fail-safe basis for whole-value masking. */
function schemaContainsSecret(field: z.ZodType, depth: number): boolean {
  if (depth > MAX_SECRET_DEPTH) return false;
  const meta = readMeta(field);
  if (meta.secret === true || meta.sensitivity === 'secret') return true;
  const inner = unwrapZodSchema(field);
  if (inner instanceof z.ZodObject) {
    for (const [subKey, subField] of Object.entries(getObjectShape(inner))) {
      if (secretByName(subKey)) return true;
      if (schemaContainsSecret(subField, depth + 1)) return true;
    }
    return false;
  }
  for (const kid of childSchemas(inner)) {
    if (schemaContainsSecret(kid, depth + 1)) return true;
  }
  return false;
}

/**
 * Classify a setting's sensitivity: `.meta()` override first, then field-name heuristics, then — for
 * a container-valued setting (object/array/record/tuple/union) — a fail-safe recursion: if any
 * nested field is secret, the WHOLE setting is classified `secret`, so masking/redaction protects
 * the nested value (an irreducible nested value cannot be masked field-by-field). `field` is optional
 * so out-of-schema (ad-hoc) layer keys are still name-classified rather than defaulting to `public`.
 */
export function classifySensitivity(key: string, field?: z.ZodType): Sensitivity {
  if (field) {
    const meta = readMeta(field);
    if (meta.secret === true || meta.sensitivity === 'secret') return 'secret';
    if (meta.sensitivity === 'sensitive') return 'sensitive';
    if (meta.sensitivity === 'public') return 'public';
  }
  if (secretByName(key)) return 'secret';
  if (field && schemaContainsSecret(field, 0)) return 'secret';
  return 'public';
}
