/**
 * Ladders: a cascade declared once, with layers selected from a context.
 *
 * `defineDials(...).resolve(stack)` takes a stack the caller assembles each time. When the stack
 * depends on *what* is being resolved — a preset for the item's type, the policy rule that matches
 * it, the end-user's settings — every caller would assemble it again, and resolve, explain, the
 * panel and the checks could disagree. A ladder declares the rungs once:
 *
 * ```ts
 * const ladder = defineLadder(dials, [
 *   { scope: 'preset', layer: (item) => PRESETS[item.type] },
 *   { scope: 'project', layer: projectConfig },
 *   { scope: 'policy', layer: (item) => matchRule(item)?.layer, managed: true },
 *   { scope: 'user', layer: () => userSettings, gated: true },
 * ]);
 * ladder.resolve(item);              // effective values + provenance (+ refused user writes)
 * ladder.explain('size', item);      // why `size` has its value for this item
 * ```
 *
 * A **gated** rung (typically the end-user's) may only set the keys the developer opened to its
 * scope, within bounds, declared on the field:
 *
 * ```ts
 * size: z.number().default(64).meta({ writableScopes: ['user'], userBounds: { min: 16, max: 256 } })
 * ```
 *
 * `scopeBounds: { <scope>: bounds }` gives bounds for any scope; `userBounds` is the shorthand for
 * `scopeBounds.user`. A value a gated rung may not set (closed key, out of bounds) is left out of
 * the stack and reported in `refused`, never silently applied.
 */

import { z } from 'zod';
import type { EffectiveResult, KeyProvenance, Layer, ScopedLayer, SettingKey, SettingValue } from './model.js';
import { isUnset } from './model.js';
import { getObjectShape, readMeta } from './schema.js';
import type { DialsDefinition, DialsResolveOptions } from './define-dials.js';

/** Bounds on what a gated scope may set for a key. */
export interface ScopeBounds {
  min?: number;
  max?: number;
  /** The only values allowed (compared with `===` / JSON for objects). */
  oneOf?: readonly unknown[];
}

/** One rung of a ladder, lowest precedence first. */
export interface Rung<Ctx> {
  /** The scope id this rung's layer comes from (appears in provenance). */
  scope: string;
  /** A fixed layer, or one chosen from the context (`undefined`: this rung abstains). */
  layer: Layer | ((ctx: Ctx) => Layer | undefined);
  /** Policy/managed band (see `ScopedLayer.managed`). */
  managed?: boolean;
  /**
   * Admit only keys whose `writableScopes` include this scope, within their bounds. Default:
   * false (a developer-controlled rung may set anything).
   */
  gated?: boolean;
}

/** A value a gated rung tried to set and was not allowed to. */
export interface RefusedWrite {
  scope: string;
  key: SettingKey;
  value: SettingValue;
  reason: 'not-writable' | 'out-of-bounds';
  detail: string;
}

/** What a gated scope may set for one key. */
export interface WritableKey {
  key: SettingKey;
  bounds?: ScopeBounds;
}

export interface LadderResult extends EffectiveResult {
  /** Values gated rungs tried to set and were refused (empty when none). */
  refused: RefusedWrite[];
}

export interface Ladder<Ctx> {
  readonly rungs: readonly Rung<Ctx>[];
  /** The scoped stack for a context (gated values filtered), lowest precedence first, no defaults. */
  stack(ctx: Ctx): { stack: ScopedLayer[]; refused: RefusedWrite[] };
  /** Resolve the ladder for a context. */
  resolve(ctx: Ctx, options?: DialsResolveOptions): LadderResult;
  /** How one key resolved for a context, or `undefined` when no scope set it. */
  explain(key: SettingKey, ctx: Ctx, options?: DialsResolveOptions): KeyProvenance | undefined;
  /** The keys a scope may set, with their bounds (for a panel showing only what the user may change). */
  writableKeys(scope: string): WritableKey[];
  /** Whether `scope` may set `key` to `value` (`undefined` when it may), else why not. */
  checkWrite(scope: string, key: SettingKey, value: SettingValue): RefusedWrite | undefined;
}

function boundsOf(meta: Record<string, unknown>, scope: string): ScopeBounds | undefined {
  const perScope = meta.scopeBounds as Record<string, ScopeBounds> | undefined;
  if (perScope && typeof perScope === 'object' && perScope[scope]) return perScope[scope];
  if (scope === 'user' && meta.userBounds && typeof meta.userBounds === 'object') return meta.userBounds as ScopeBounds;
  return undefined;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  try {
    return typeof a === 'object' && a !== null && JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function outOfBounds(value: unknown, bounds: ScopeBounds): string | undefined {
  if (bounds.oneOf && !bounds.oneOf.some((v) => sameValue(v, value))) {
    return `not one of ${JSON.stringify(bounds.oneOf)}`;
  }
  if (bounds.min !== undefined || bounds.max !== undefined) {
    if (typeof value !== 'number' || Number.isNaN(value)) return 'not a number, but the key has numeric bounds';
    if (bounds.min !== undefined && value < bounds.min) return `below the minimum ${bounds.min}`;
    if (bounds.max !== undefined && value > bounds.max) return `above the maximum ${bounds.max}`;
  }
  return undefined;
}

/**
 * Declare a ladder of rungs over a dials definition, so resolve, explain, the panel and checks
 * share one cascade for every context.
 */
export function defineLadder<Ctx = void, TSchema extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>>(
  dials: DialsDefinition<TSchema>,
  rungs: readonly Rung<Ctx>[],
): Ladder<Ctx> {
  const shape = getObjectShape(dials.schema);
  const metaOf = (key: SettingKey): Record<string, unknown> => (shape[key] ? readMeta(shape[key]!) : {});
  const scopesOf = (key: SettingKey): string[] => {
    const w = metaOf(key).writableScopes;
    return Array.isArray(w) ? w.filter((s): s is string => typeof s === 'string') : [];
  };
  for (const r of rungs) {
    if (!r || typeof r.scope !== 'string' || r.scope === '') throw new Error('defineLadder: every rung needs a scope id');
  }

  const checkWrite = (scope: string, key: SettingKey, value: SettingValue): RefusedWrite | undefined => {
    if (!scopesOf(key).includes(scope)) {
      return { scope, key, value, reason: 'not-writable', detail: `\`${key}\` is not writable from scope \`${scope}\` (writableScopes: ${JSON.stringify(scopesOf(key))})` };
    }
    if (isUnset(value)) return undefined; // resetting to the scope below is always allowed
    const bounds = boundsOf(metaOf(key), scope);
    const why = bounds ? outOfBounds(value, bounds) : undefined;
    return why ? { scope, key, value, reason: 'out-of-bounds', detail: `\`${key}\` = ${JSON.stringify(value)} from \`${scope}\`: ${why}` } : undefined;
  };

  const stack = (ctx: Ctx) => {
    const out: ScopedLayer[] = [];
    const refused: RefusedWrite[] = [];
    for (const rung of rungs) {
      const layer = typeof rung.layer === 'function' ? rung.layer(ctx) : rung.layer;
      if (!layer) continue;
      let admitted: Layer = layer;
      if (rung.gated) {
        admitted = {};
        for (const [key, value] of Object.entries(layer)) {
          const refusal = checkWrite(rung.scope, key, value);
          if (refusal) refused.push(refusal);
          else admitted[key] = value;
        }
      }
      out.push(rung.managed ? { scope: rung.scope, layer: admitted, managed: true } : { scope: rung.scope, layer: admitted });
    }
    return { stack: out, refused };
  };

  return {
    rungs,
    stack,
    resolve(ctx, options) {
      const { stack: s, refused } = stack(ctx);
      return { ...dials.resolve(s, options), refused };
    },
    explain(key, ctx, options) {
      return dials.resolve(stack(ctx).stack, options).provenance[key];
    },
    writableKeys(scope) {
      return dials.keys
        .filter((k) => scopesOf(k).includes(scope))
        .map((key) => {
          const bounds = boundsOf(metaOf(key), scope);
          return bounds ? { key, bounds } : { key };
        });
    },
    checkWrite,
  };
}
