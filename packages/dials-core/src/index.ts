/**
 * @zodal/dials-core — the canonical settings model + cascade engine for zodal-dials.
 *
 * Public surface:
 * - `defineDials(schema, config?)` — the entry point (a settings doc = a degenerate one-item zodal
 *   collection); exposes `resolve`/`explain`/`validate`/`withDependentDefaults`/`getCapabilities`.
 * - The cascade: `resolve(stack, options)` → effective values + provenance; the `UNSET` sentinel;
 *   `Layer`/`Scope`/`ScopedLayer`/`Provenance`/`EffectiveResult` types.
 * - Patch utils: RFC 7386 `applyMergePatch`, lossless `serializeLayer`/`deserializeLayer`, RFC 6902
 *   `applyJsonPatch`/`diffJsonPatch`/`invertJsonPatch`.
 * - Constraints + dependent defaults: `evaluateConstraints`, `applyDependentDefaults`.
 * - Secrets: `SecretRef`, `maskSecrets`, `splitBySensitivity`, `redactSecretsFromLayer`, `SecretBackend`.
 * - Schema introspection: `extractDefaults`, `keyMergeStrategy`, `classifySensitivity`, `baseType`.
 */

export {
  UNSET,
  isUnset,
  isSecretRef,
} from './model.js';
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

export {
  getObjectShape,
  readMeta,
  baseType,
  extractDefaults,
  keyMergeStrategy,
  classifySensitivity,
} from './schema.js';

export {
  makeSecretRef,
  maskSecrets,
  maskEffectiveResult,
  splitBySensitivity,
  redactSecretsFromLayer,
} from './secrets.js';
export type { SecretBackend } from './secrets.js';

export { evaluateConstraints } from './constraints.js';
export type {
  Assertion,
  Warning,
  ConstraintsConfig,
  ConstraintError,
  ConstraintResult,
} from './constraints.js';

export { applyDependentDefaults } from './derive.js';
export type { DependentDefault, DeriveOptions, DeriveResult } from './derive.js';

export { defineDials } from './define-dials.js';
export type {
  DefineDialsConfig,
  DialsResolveOptions,
  DialsCapabilities,
  DialsDefinition,
} from './define-dials.js';
