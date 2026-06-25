/**
 * The settings renderer registry — a thin specialization of zodal's capability-ranked
 * `RendererRegistry`. Concrete renderer packages (vanilla, shadcn, …) register `(tester, renderer)`
 * entries against the same open-closed API; selection is by PRIORITY band + composable testers, with
 * a terminal `alwaysMatch` entry (the rawJson fallback) guaranteeing total coverage and honest
 * degradation. Settings-specific testers read `sensitivity`/`structured` from the render context.
 */

import {
  createRendererRegistry,
  PRIORITY,
  zodTypeIs,
  fieldNameMatches,
  metaMatches,
  hasRefinement,
  editWidgetIs,
  and,
  or,
} from '@zodal/ui';
import type { RendererRegistry, RendererTester } from '@zodal/ui';

// Re-export the zodal renderer-registry primitives so renderer authors import everything from one place.
export {
  createRendererRegistry,
  PRIORITY,
  zodTypeIs,
  fieldNameMatches,
  metaMatches,
  hasRefinement,
  editWidgetIs,
  and,
  or,
};
export type { RendererRegistry, RendererTester };

/** Match a secret setting (its `sensitivity` is supplied via the render context). High priority so a
 *  secret is always rendered with the masked widget regardless of its underlying type. */
export function secretRoleIs(): RendererTester {
  return (_field, ctx) => (ctx.sensitivity === 'secret' ? PRIORITY.OVERRIDE : -1);
}

/** Match an irreducible nested value (`structured: true` in context, or an object/array Zod type). */
export function isStructuredValue(): RendererTester {
  return (field, ctx) =>
    ctx.structured === true || field.zodType === 'object' || field.zodType === 'array' ? PRIORITY.LIBRARY : -1;
}

export function isBoolean(): RendererTester {
  return zodTypeIs('boolean');
}
export function isEnum(): RendererTester {
  return zodTypeIs('enum');
}
export function isNumber(): RendererTester {
  return zodTypeIs('number');
}
export function isString(): RendererTester {
  return zodTypeIs('string');
}

/**
 * Terminal renderer tester: ALWAYS matches, at the given priority (default FALLBACK). Pairing this
 * with a raw-JSON renderer guarantees every setting resolves to something (the honest-degradation
 * fallback).
 */
export function alwaysMatch(priority: number = PRIORITY.FALLBACK): RendererTester {
  return () => priority;
}

/** Create a settings renderer registry (a zodal `RendererRegistry`). Concrete renderer packages
 *  populate it; remember to register a terminal `alwaysMatch` rawJson renderer for full coverage. */
export function createSettingsRendererRegistry<TComponent = unknown>(): RendererRegistry<TComponent> {
  return createRendererRegistry<TComponent>();
}
