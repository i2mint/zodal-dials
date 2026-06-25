/**
 * Secret handling — the model-side of zodal's content/metadata bifurcation applied to settings.
 *
 * A setting classified `secret` (by name heuristic or `.meta({ secret: true })`) must never appear
 * in the queryable config store, an exported layer/patch, or an audit log as plaintext. These pure
 * helpers enforce that: `splitBySensitivity` routes secret values out of the config layer to a
 * secret backend; `redactSecretsFromLayer` strips them from anything serialized for export/audit;
 * `maskSecrets` replaces secret effective values with a masked `SecretRef`. The concrete secret
 * backend (OS keychain / Vault / encrypted store) is a satellite store package; here we define the
 * seam and the guarantees.
 */

import type { EffectiveResult, Layer, SecretRef, Sensitivity, SettingKey, SettingValue } from './model.js';
import type { SerializedLayer } from './patch.js';
import { isUnset } from './model.js';

/** A masked stand-in for any secret value carried in provenance/conflicts (never plaintext). */
const SECRET_MASK = '••••';

/** Build a masked reference to a secret value (never carries the plaintext). */
export function makeSecretRef(key: SettingKey, isSet: boolean): SecretRef {
  return { _tag: 'SecretRef', key, isSet, masked: isSet ? '•••• (set)' : 'not set' };
}

/** Whether a raw value counts as "set" for masking purposes (not undefined/null/empty-string/UNSET). */
function isMeaningfullySet(v: SettingValue): boolean {
  return !isUnset(v) && v !== undefined && v !== null && v !== '';
}

/**
 * Replace the effective values of secret settings with a masked `SecretRef`. Pure. The plaintext is
 * never copied into the output — reveal is an explicit, separate operation against the secret backend.
 */
export function maskSecrets(
  effective: Record<SettingKey, SettingValue>,
  sensitivityFor: (key: SettingKey) => Sensitivity,
): Record<SettingKey, SettingValue> {
  const out: Record<SettingKey, SettingValue> = {};
  for (const [k, v] of Object.entries(effective)) {
    out[k] = sensitivityFor(k) === 'secret' ? makeSecretRef(k, isMeaningfullySet(v)) : v;
  }
  return out;
}

/**
 * Mask EVERY surface of a resolved result that could carry a secret as plaintext: `effective`,
 * `provenance[key].value`, every `provenance[key].shadowed[].value`, and `conflicts[].contributors[].value`.
 * This is the function `defineDials.resolve({ maskSecrets: true })` and `explain()` go through — so
 * the audit/provenance path can never leak. Pure.
 */
export function maskEffectiveResult(
  result: EffectiveResult,
  sensitivityFor: (key: SettingKey) => Sensitivity,
): EffectiveResult {
  const isSecret = (key: SettingKey): boolean => sensitivityFor(key) === 'secret';
  const maskShadowValue = (v: SettingValue | 'UNSET'): SettingValue | 'UNSET' => (v === 'UNSET' ? 'UNSET' : SECRET_MASK);

  const effective: Record<SettingKey, SettingValue> = {};
  for (const [k, v] of Object.entries(result.effective)) {
    effective[k] = isSecret(k) ? makeSecretRef(k, isMeaningfullySet(v)) : v;
  }

  const provenance: EffectiveResult['provenance'] = {};
  for (const [k, p] of Object.entries(result.provenance)) {
    provenance[k] = isSecret(k)
      ? {
          ...p,
          value: makeSecretRef(k, isMeaningfullySet(p.value)),
          shadowed: p.shadowed.map((s) => ({ ...s, value: maskShadowValue(s.value) })),
        }
      : p;
  }

  const conflicts = result.conflicts.map((c) =>
    isSecret(c.key)
      ? { ...c, contributors: c.contributors.map((ct) => ({ ...ct, value: maskShadowValue(ct.value) })) }
      : c,
  );

  return { effective, provenance, conflicts };
}

/**
 * Partition a layer into the config values (safe to persist/query) and the secret values (to route
 * to a secret backend). Secret keys never appear in `config`. Pure.
 */
export function splitBySensitivity(
  layer: Layer,
  sensitivityFor: (key: SettingKey) => Sensitivity,
): { config: Layer; secrets: Layer } {
  const config: Layer = {};
  const secrets: Layer = {};
  for (const [k, v] of Object.entries(layer)) {
    if (sensitivityFor(k) === 'secret') secrets[k] = v;
    else config[k] = v;
  }
  return { config, secrets };
}

/** Strip secret keys from a serialized layer before export/audit (they must never be written). */
export function redactSecretsFromLayer(
  serialized: SerializedLayer,
  sensitivityFor: (key: SettingKey) => Sensitivity,
): SerializedLayer {
  const values: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(serialized.values ?? {})) {
    if (sensitivityFor(k) !== 'secret') values[k] = v;
  }
  const unset = (serialized.unset ?? []).filter((k) => sensitivityFor(k) !== 'secret');
  return { values, unset };
}

/**
 * The contract a secret backend implements (OS keychain, Vault, encrypted store). Mirrors zodal's
 * bifurcation "content provider". Reads return a masked ref; the plaintext is fetched only via an
 * explicit `reveal`. Implemented by satellite `@zodal/dials-store-*` packages.
 */
export interface SecretBackend {
  has(key: SettingKey): Promise<boolean>;
  get(key: SettingKey): Promise<SecretRef>;
  /** Explicit, audited plaintext reveal — separate from ordinary reads. */
  reveal(key: SettingKey): Promise<string | undefined>;
  set(key: SettingKey, value: string): Promise<SecretRef>;
  delete(key: SettingKey): Promise<void>;
}
