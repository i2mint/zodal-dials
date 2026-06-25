/**
 * Dependent (smart) defaults — the SUGGEST mode of the same field-relation model that constraints
 * use to VALIDATE. A dependent default computes an advisory value for one key from the current
 * values of others ("C is usually near f(A,B), but any C is valid"). It honors OVERRIDE-STICKINESS:
 * once the user has set the target key (it is dirty), its dependent default is never recomputed, so
 * a user's choice is never silently clobbered. Pure.
 */

import type { SettingKey } from './model.js';

export interface DependentDefault {
  /** The key this default applies to. */
  key: SettingKey;
  /** Keys this default depends on (documented; drives recompute scheduling in reactive consumers). */
  dependsOn: SettingKey[];
  /** Compute the suggested value from the current values. Return `undefined` to suggest nothing. */
  derive: (values: Record<string, unknown>) => unknown;
}

export interface DeriveOptions {
  /** Keys the user has explicitly set (dirty) — their dependent defaults are NOT recomputed. */
  dirtyKeys?: Iterable<SettingKey>;
}

export interface DeriveResult {
  values: Record<string, unknown>;
  /** Keys whose dependent default was applied this pass. */
  applied: SettingKey[];
}

/**
 * Fill dependent defaults into a values map, returning a new map. A dirty target key is never
 * overwritten (stickiness). Defaults are applied in declaration order, each seeing the results of
 * earlier ones.
 */
export function applyDependentDefaults(
  values: Record<string, unknown>,
  defaults: DependentDefault[],
  options: DeriveOptions = {},
): DeriveResult {
  const dirty = new Set<SettingKey>(options.dirtyKeys ?? []);
  const out: Record<string, unknown> = { ...values };
  const applied: SettingKey[] = [];
  for (const d of defaults) {
    if (dirty.has(d.key)) continue;
    let suggestion: unknown;
    try {
      suggestion = d.derive(out);
    } catch {
      continue;
    }
    if (suggestion !== undefined) {
      out[d.key] = suggestion;
      applied.push(d.key);
    }
  }
  return { values: out, applied };
}
