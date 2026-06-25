/**
 * `defineDials` — the entry point. A settings document is modeled as a degenerate one-item zodal
 * collection, so the Zod schema is the single source of truth and zodal's `defineCollection` supplies
 * per-field affordances (for the UI layer). On top of that this binds the cascade engine: declared
 * defaults become the lowest scope, the type-directed merge strategy and sensitivity classification
 * are precomputed per key, and `resolve`/`explain`/`validate`/`withDependentDefaults` operate over an
 * ordered stack of scoped layers.
 */

import type { z } from 'zod';
import { defineCollection } from '@zodal/core';
import type { CollectionConfig, CollectionDefinition } from '@zodal/core';
import type {
  EffectiveResult,
  KeyProvenance,
  MergeStrategy,
  ScopedLayer,
  Sensitivity,
  SettingKey,
} from './model.js';
import { resolve } from './cascade.js';
import type { ResolveOptions } from './cascade.js';
import { classifySensitivity, extractDefaults, getObjectShape, keyMergeStrategy } from './schema.js';
import { maskEffectiveResult } from './secrets.js';
import { evaluateConstraints } from './constraints.js';
import type { ConstraintResult, ConstraintsConfig } from './constraints.js';
import { applyDependentDefaults } from './derive.js';
import type { DependentDefault } from './derive.js';

export interface DefineDialsConfig<TSchema extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>> {
  /** Hard/soft constraints evaluated over the effective values. */
  constraints?: ConstraintsConfig;
  /** Dependent (smart) defaults. */
  dependentDefaults?: DependentDefault[];
  /** Passed through to `defineCollection` (escape hatch for affordance config). */
  collection?: CollectionConfig<z.infer<TSchema>>;
}

export interface DialsResolveOptions {
  /** Prepend the schema defaults as the lowest scope. Default: true. */
  includeDefaults?: boolean;
  /** Replace secret effective values with a masked `SecretRef`. Default: false. */
  maskSecrets?: boolean;
}

export interface DialsCapabilities {
  keyCount: number;
  hasSecrets: boolean;
  hasConstraints: boolean;
  hasDependentDefaults: boolean;
  mergeStrategies: Record<string, MergeStrategy>;
}

export interface DialsDefinition<TSchema extends z.ZodObject<z.ZodRawShape>> {
  schema: TSchema;
  /** The underlying zodal collection (affordance source for the UI). `undefined` if the schema is
   *  not a shape `defineCollection` accepts — the cascade does not depend on it. */
  collection: CollectionDefinition<TSchema> | undefined;
  /** The declared defaults (the lowest cascade layer). */
  defaults: Record<string, unknown>;
  keys: SettingKey[];
  mergeStrategyFor(key: SettingKey): MergeStrategy;
  sensitivityFor(key: SettingKey): Sensitivity;
  /** Resolve an ordered stack of scoped layers (lowest precedence first). */
  resolve(stack: ScopedLayer[], options?: DialsResolveOptions): EffectiveResult;
  /** Explain how one key resolved (its provenance), or undefined if no scope set it. */
  explain(key: SettingKey, stack: ScopedLayer[], options?: DialsResolveOptions): KeyProvenance | undefined;
  /** Evaluate constraints over a resolved values map. */
  validate(values: Record<string, unknown>): ConstraintResult;
  /** Fill dependent defaults into a values map, honoring dirty stickiness. */
  withDependentDefaults(values: Record<string, unknown>, dirtyKeys?: SettingKey[]): Record<string, unknown>;
  getCapabilities(): DialsCapabilities;
}

/** Define a settings surface from a Zod object schema. */
export function defineDials<TSchema extends z.ZodObject<z.ZodRawShape>>(
  schema: TSchema,
  config: DefineDialsConfig<TSchema> = {},
): DialsDefinition<TSchema> {
  const shape = getObjectShape(schema);
  const keys = Object.keys(shape);
  const defaults = extractDefaults(schema);

  // Reuse zodal's affordance inference (a settings doc = a degenerate one-item collection). The
  // cascade never depends on this, so a schema defineCollection rejects must not break resolution.
  let collection: CollectionDefinition<TSchema> | undefined;
  try {
    collection = defineCollection(schema, config.collection);
  } catch {
    collection = undefined;
  }

  const mergeCache = new Map<string, MergeStrategy>();
  const sensCache = new Map<string, Sensitivity>();

  const mergeStrategyFor = (key: SettingKey): MergeStrategy => {
    if (mergeCache.has(key)) return mergeCache.get(key) as MergeStrategy;
    const value = shape[key] ? keyMergeStrategy(shape[key]) : 'replace';
    mergeCache.set(key, value);
    return value;
  };
  // Out-of-schema (ad-hoc) layer keys still get name-classified (fail-safe toward secret) rather
  // than defaulting to public — `classifySensitivity` falls back to the heuristic when no field.
  const sensitivityFor = (key: SettingKey): Sensitivity => {
    if (sensCache.has(key)) return sensCache.get(key) as Sensitivity;
    const value = classifySensitivity(key, shape[key]);
    sensCache.set(key, value);
    return value;
  };

  const buildStack = (stack: ScopedLayer[], options: DialsResolveOptions): ScopedLayer[] =>
    options.includeDefaults === false ? stack : [{ scope: 'default', layer: defaults }, ...stack];

  const doResolve = (stack: ScopedLayer[], options: DialsResolveOptions = {}): EffectiveResult => {
    const resolveOptions: ResolveOptions = { strategyFor: mergeStrategyFor };
    const result = resolve(buildStack(stack, options), resolveOptions);
    return options.maskSecrets ? maskEffectiveResult(result, sensitivityFor) : result;
  };

  return {
    schema,
    collection,
    defaults,
    keys,
    mergeStrategyFor,
    sensitivityFor,
    resolve: doResolve,
    explain: (key, stack, options) => doResolve(stack, options).provenance[key],
    validate: (values) => evaluateConstraints(values, config.constraints),
    withDependentDefaults: (values, dirtyKeys) =>
      applyDependentDefaults(values, config.dependentDefaults ?? [], { dirtyKeys }).values,
    getCapabilities: () => {
      const mergeStrategies: Record<string, MergeStrategy> = {};
      for (const k of keys) mergeStrategies[k] = mergeStrategyFor(k);
      return {
        keyCount: keys.length,
        hasSecrets: keys.some((k) => sensitivityFor(k) === 'secret'),
        hasConstraints: Boolean(config.constraints?.schema || config.constraints?.assertions?.length),
        hasDependentDefaults: (config.dependentDefaults?.length ?? 0) > 0,
        mergeStrategies,
      };
    },
  };
}
