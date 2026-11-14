/**
 * A resolution plan: what `resolve` needs from a dials definition, as plain JSON, so a cascade
 * can be resolved where zod is not loaded (zodal-dials#44).
 *
 * Classic zod is ~92 kB gzip; an app whose main path must stay light can compute the plan at
 * build time (or on the server) with `toResolvePlan(dials)` and ship only `resolvePlan` from
 * `@zodal/dials-core/cascade`, which imports no zod and no `@zodal/core`. Values are not
 * validated on this path: use it for layers that were validated when written.
 */

import type { EffectiveResult, MergeStrategy, ScopedLayer, Sensitivity, SettingKey } from './model.js';
import { resolve } from './cascade.js';
import { maskEffectiveResult } from './secrets.js';
import { secretByName } from './names.js';

/** What a resolution needs from a dials definition, as JSON. */
export interface ResolvePlan {
  /** The schema defaults (the lowest scope). */
  defaults: Record<SettingKey, unknown>;
  /** Merge strategy per key (absent: `'replace'`). */
  mergeStrategies: Record<SettingKey, MergeStrategy>;
  /** Sensitivity per key (absent: classified by name, as `defineDials` does for ad-hoc keys). */
  sensitivities: Record<SettingKey, Sensitivity>;
}

export interface ResolvePlanOptions {
  /** Prepend the plan's defaults as the lowest scope. Default: true. */
  includeDefaults?: boolean;
  /** Replace secret effective values with a masked `SecretRef`. Default: false. */
  maskSecrets?: boolean;
}

/** Resolve a stack with a plan: the same result as `dials.resolve(stack, options)`, without zod. */
export function resolvePlan(plan: ResolvePlan, stack: ScopedLayer[], options: ResolvePlanOptions = {}): EffectiveResult {
  const full = options.includeDefaults === false ? stack : [{ scope: 'default', layer: plan.defaults }, ...stack];
  const result = resolve(full, { strategyFor: (key) => plan.mergeStrategies[key] ?? 'replace' });
  return options.maskSecrets ? maskEffectiveResult(result, (key) => plan.sensitivities[key] ?? (secretByName(key) ? 'secret' : 'public')) : result;
}

/** The plan of a dials definition (JSON-serializable; compute it where zod is loaded). */
export function toResolvePlan(dials: {
  keys: SettingKey[];
  defaults: Record<SettingKey, unknown>;
  mergeStrategyFor(key: SettingKey): MergeStrategy;
  sensitivityFor(key: SettingKey): Sensitivity;
}): ResolvePlan {
  const mergeStrategies: Record<SettingKey, MergeStrategy> = {};
  const sensitivities: Record<SettingKey, Sensitivity> = {};
  for (const key of dials.keys) {
    const m = dials.mergeStrategyFor(key);
    if (m !== 'replace') mergeStrategies[key] = m;
    const sv = dials.sensitivityFor(key);
    if (sv !== 'public') sensitivities[key] = sv;
  }
  return { defaults: JSON.parse(JSON.stringify(dials.defaults)), mergeStrategies, sensitivities };
}
