/**
 * Build the static, value-independent `SettingFieldConfig[]` from a `DialsDefinition`, combining the
 * schema (via dials-core introspection helpers + `@zodal/core` enum/bounds helpers), the dials
 * classification (sensitivity, merge strategy, defaults), and `.meta()` annotations + an optional
 * external facet-assignment map. Pure.
 */

import type { z } from 'zod';
import { baseType, getObjectShape, readMeta } from '@zodal/dials-core';
import type { DialsDefinition } from '@zodal/dials-core';
import { getEnumValues, getNumericBounds, humanizeFieldName } from '@zodal/core';
import { widgetKindFor } from './widgets.js';
import type { SettingFieldConfig } from './types.js';

export interface DescribeOptions {
  /** Extra facet membership, merged with each setting's `.meta({ facets })`: key -> facet ids. */
  facets?: Record<string, string[]>;
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

/** Describe every setting in a dials definition as a headless field config. */
export function describeSettings<T extends z.ZodObject<z.ZodRawShape>>(
  dials: DialsDefinition<T>,
  options: DescribeOptions = {},
): SettingFieldConfig[] {
  const shape = getObjectShape(dials.schema);
  return dials.keys.map((key) => {
    const field = shape[key];
    const meta = field ? readMeta(field) : {};
    const zodType = field ? baseType(field) : 'unknown';
    const sensitivity = dials.sensitivityFor(key);

    const enumValues = field ? safe(() => getEnumValues(field) as unknown as string[]) : undefined;
    // getNumericBounds reports an absent bound as a non-finite value (±Infinity, or null in some
    // versions). Keep only FINITE bounds, so an unbounded / one-sided number is not mistaken for a
    // fully-bounded one (which would wrongly pick a slider).
    const rawBounds = field ? safe(() => getNumericBounds(field) as unknown as { min?: number | null; max?: number | null }) : undefined;
    const min = rawBounds != null && Number.isFinite(rawBounds.min) ? (rawBounds.min as number) : undefined;
    const max = rawBounds != null && Number.isFinite(rawBounds.max) ? (rawBounds.max as number) : undefined;
    const bounds = min !== undefined || max !== undefined ? { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) } : undefined;

    const metaFacets = Array.isArray(meta.facets) ? meta.facets.map((f) => String(f)) : [];
    const facets = uniqueStrings([...metaFacets, ...(options.facets?.[key] ?? [])]);
    const advanced = facets.includes('advanced') || meta.advanced === true;

    const required = field ? !field.safeParse(undefined).success && dials.defaults[key] === undefined : false;

    return {
      key,
      label: typeof meta.title === 'string' ? meta.title : humanizeFieldName(key),
      description: typeof meta.description === 'string' ? meta.description : undefined,
      widget: widgetKindFor({ zodType, sensitivity, bounds, enumValues, metaWidget: meta.editWidget }),
      zodType,
      required,
      readOnly: meta.readOnly === true || meta.editable === false,
      hidden: meta.hidden === true,
      sensitivity,
      mergeStrategy: dials.mergeStrategyFor(key),
      // Never put a secret's plaintext default into the headless config — a renderer that prefills
      // from `defaultValue` would expose it. Secrets carry no default here (the secret backend owns it).
      defaultValue: sensitivity === 'secret' ? undefined : dials.defaults[key],
      enumValues: enumValues && enumValues.length > 0 ? enumValues : undefined,
      bounds,
      facets,
      advanced,
      order: typeof meta.order === 'number' ? meta.order : undefined,
      isStructured: zodType === 'object' || zodType === 'array',
    };
  });
}
