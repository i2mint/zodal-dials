/**
 * Type -> widget classification for settings. Pure. Distinguishes a scalar leaf (switch/select/
 * slider/text/…) from an irreducible nested value (object/array), with `rawJson` as the terminal
 * fallback for anything unhandled — so coverage is total and degradation is honest. A `secret`
 * setting always maps to the `secret` widget regardless of its underlying type.
 */

import type { Sensitivity } from '@zodal/dials-core';
import type { WidgetKind } from './types.js';

export interface WidgetInput {
  zodType: string;
  sensitivity: Sensitivity;
  bounds?: { min?: number; max?: number };
  enumValues?: string[];
  /** An explicit `.meta({ editWidget })` override (wins over inference). */
  metaWidget?: unknown;
}

const KNOWN_WIDGETS = new Set<WidgetKind>([
  'switch', 'select', 'radio', 'slider', 'number', 'text', 'textarea',
  'secret', 'color', 'date', 'path', 'object', 'array', 'rawJson',
]);

/** Choose the widget kind for a setting. */
export function widgetKindFor(input: WidgetInput): WidgetKind {
  if (typeof input.metaWidget === 'string' && KNOWN_WIDGETS.has(input.metaWidget as WidgetKind)) {
    return input.metaWidget as WidgetKind;
  }
  if (input.sensitivity === 'secret') return 'secret';
  switch (input.zodType) {
    case 'boolean':
      return 'switch';
    case 'enum':
      return input.enumValues && input.enumValues.length > 0 && input.enumValues.length <= 4 ? 'radio' : 'select';
    case 'number':
      return input.bounds && input.bounds.min !== undefined && input.bounds.max !== undefined ? 'slider' : 'number';
    case 'string':
      return 'text';
    case 'object':
      return 'object';
    case 'array':
      return 'array';
    default:
      return 'rawJson';
  }
}
