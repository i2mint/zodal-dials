/**
 * Value combination under a merge strategy. Given an ordered (low -> high precedence) list of
 * contributing values for one key, produce the merged value: `replace` (highest wins), `deep-merge`
 * (structural merge of object contributors), or `append` (concatenate array contributors). Pure.
 */

import { deepMerge, deepClone, isPlainObject } from './util.js';
import type { MergeStrategy, SettingValue } from './model.js';

/** Combine an ordered (low -> high precedence) list of contributing values under a strategy. */
export function mergeValues(values: SettingValue[], strategy: MergeStrategy): SettingValue {
  if (values.length === 0) return undefined;
  switch (strategy) {
    case 'replace':
      return deepClone(values[values.length - 1]);
    case 'deep-merge':
      return deepClone(
        values.reduce((acc, v) => (isPlainObject(acc) && isPlainObject(v) ? deepMerge(acc, v) : deepClone(v))),
      );
    case 'append': {
      const out: unknown[] = [];
      let sawArray = false;
      for (const v of values) {
        if (Array.isArray(v)) {
          sawArray = true;
          out.push(...deepClone(v));
        }
      }
      return sawArray ? out : deepClone(values[values.length - 1]);
    }
  }
}
