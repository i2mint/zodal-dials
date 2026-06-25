/**
 * `toSettingsForm` — the top-level headless generator: describe every (non-hidden) setting as a
 * field config, order them, and project them into facet groups. `toFieldStates` derives the
 * value-dependent state (effective value, provenance source, managed/shadowed flags, dirty) from a
 * cascade resolution — the input to provenance badges, locks, and reset affordances. Pure; emits
 * configuration objects only (never DOM).
 */

import type { z } from 'zod';
import { isSecretRef, makeSecretRef } from '@zodal/dials-core';
import type { DialsDefinition, EffectiveResult, SettingKey } from '@zodal/dials-core';
import { describeSettings } from './introspect.js';
import type { DescribeOptions } from './introspect.js';
import { toGroups } from './facets.js';
import type { GroupingOptions } from './facets.js';
import type { SettingFieldConfig, SettingFieldState, SettingsForm } from './types.js';

export interface ToSettingsFormOptions extends DescribeOptions, GroupingOptions {
  /** A resolution result, used for computed groups (@modified/@managed). */
  result?: EffectiveResult;
  /** Include hidden settings in the form. Default: false. */
  includeHidden?: boolean;
}

/** Build the full headless settings form (ordered field configs + facet groups). */
export function toSettingsForm<T extends z.ZodObject<z.ZodRawShape>>(
  dials: DialsDefinition<T>,
  options: ToSettingsFormOptions = {},
): SettingsForm {
  const all = describeSettings(dials, { facets: options.facets });
  const visible = options.includeHidden ? all : all.filter((f) => !f.hidden);
  const fields = [...visible].sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000) || a.label.localeCompare(b.label));
  const groups = toGroups(fields, options.result, {
    facetDefs: options.facetDefs,
    computedGroups: options.computedGroups,
    ungroupedTitle: options.ungroupedTitle,
  });
  return { fields, groups };
}

/** Derive value-dependent field state (value, provenance source, managed/shadowed, dirty) for each
 *  field from a cascade resolution and an optional dirty set. */
export function toFieldStates(
  fields: SettingFieldConfig[],
  result: EffectiveResult,
  dirty: Iterable<SettingKey> = [],
): Record<SettingKey, SettingFieldState> {
  const dirtySet = new Set<SettingKey>(dirty);
  const states: Record<SettingKey, SettingFieldState> = {};
  for (const field of fields) {
    const prov = result.provenance[field.key];
    const raw = result.effective[field.key];
    // Defense in depth: never surface a secret's plaintext to a renderer, even if the caller passed
    // an UNMASKED resolution (resolve defaults to maskSecrets:false). Emit a masked SecretRef.
    const value =
      field.sensitivity === 'secret' && !isSecretRef(raw)
        ? makeSecretRef(field.key, raw !== undefined && raw !== null && raw !== '')
        : raw;
    states[field.key] = {
      value,
      source: prov?.winningScope,
      managed: prov?.managed ?? false,
      shadowed: (prov?.shadowed.length ?? 0) > 0,
      dirty: dirtySet.has(field.key),
    };
  }
  return states;
}
