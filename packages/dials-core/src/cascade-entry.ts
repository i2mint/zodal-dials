/**
 * `@zodal/dials-core/cascade`: the cascade without zod or `@zodal/core` (zodal-dials#44).
 *
 * Everything here works on plain data: `resolvePlan(plan, stack)` resolves a stack with a
 * `ResolvePlan` computed elsewhere by `toResolvePlan(dials)` (at build time, or on a server), and
 * the patch and secret-masking utilities need no schema. Import this entry on a light main path;
 * import `@zodal/dials-core` where zod is already loaded (a settings screen, a build script).
 */

export { UNSET, isUnset, isSecretRef } from './model.js';
export type {
  SettingKey,
  SettingValue,
  Unset,
  Layer,
  ScopedLayer,
  MergeStrategy,
  ShadowedLayer,
  KeyProvenance,
  Conflict,
  EffectiveResult,
  Sensitivity,
  SecretRef,
} from './model.js';
export { resolve } from './cascade.js';
export type { ResolveOptions } from './cascade.js';
export { mergeValues } from './merge.js';
export {
  applyMergePatch,
  serializeLayer,
  deserializeLayer,
  layerToMergePatch,
  applyJsonPatch,
  diffJsonPatch,
  invertJsonPatch,
} from './patch.js';
export type { SerializedLayer, JsonPatchOp } from './patch.js';
export { makeSecretRef, maskSecrets, maskEffectiveResult } from './secrets.js';
export { resolvePlan, toResolvePlan } from './plan.js';
export type { ResolvePlan, ResolvePlanOptions } from './plan.js';
