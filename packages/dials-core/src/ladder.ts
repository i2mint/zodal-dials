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

import type { z } from 'zod';
import { getNumericBounds } from '@zodal/core';
import type { EffectiveResult, KeyProvenance, Layer, ScopedLayer, SettingKey, SettingValue } from './model.js';
import { isUnset } from './model.js';
import { getObjectShape, readMeta } from './schema.js';
import { makeSecretRef } from './secrets.js';
import { deepEqual } from './util.js';
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
  /**
   * A fixed layer, or one chosen from the context (`undefined`: this rung abstains). A function
   * may also return scoped layers (one or several, e.g. `preset:song` then `preset:dark`), whose
   * own scope ids then appear in provenance; they keep this rung's `managed` and `gated`.
   */
  layer: Layer | ((ctx: Ctx) => Layer | ScopedLayer | readonly ScopedLayer[] | undefined);
  /** Policy/managed band (see `ScopedLayer.managed`). */
  managed?: boolean;
  /**
   * Admit only keys whose `writableScopes` include this scope, within their bounds. Default:
   * false (a developer-controlled rung may set anything).
   */
  gated?: boolean;
  /**
   * Replace the schema-meta gate for this rung (a gated rung only): return `false` to refuse the
   * key, `true` to admit it unbounded, or bounds to admit it within them. For allowlists that come
   * from runtime config or depend on the context.
   */
  gate?: (key: SettingKey, value: SettingValue, ctx: Ctx) => boolean | ScopeBounds;
}

/** A value a gated rung tried to set and was not allowed to. */
export interface RefusedWrite {
  scope: string;
  key: SettingKey;
  value: SettingValue;
  reason: 'not-writable' | 'out-of-bounds';
  detail: string;
}

/** What a scope may set for one key. */
export interface WritableKey {
  key: SettingKey;
  bounds?: ScopeBounds;
  /** A managed (policy) rung holds this key for the context: draw the control locked. */
  locked?: boolean;
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
  /**
   * The keys a rung's scope may set, with their bounds (a gated rung: the opened keys; any other
   * rung: every key). With a context, keys a managed rung holds for it are marked `locked`.
   * Throws for a scope no rung has.
   */
  writableKeys(scope: string, ctx?: Ctx): WritableKey[];
  /** Whether `scope` may set `key` to `value` (`undefined` when it may), else why not. */
  checkWrite(scope: string, key: SettingKey, value: SettingValue, ctx?: Ctx): RefusedWrite | undefined;
}

function boundsOf(meta: Record<string, unknown>, scope: string): ScopeBounds | undefined {
  const perScope = meta.scopeBounds as Record<string, ScopeBounds> | undefined;
  if (perScope && typeof perScope === 'object' && perScope[scope]) return perScope[scope];
  if (scope === 'user' && meta.userBounds && typeof meta.userBounds === 'object') return meta.userBounds as ScopeBounds;
  return undefined;
}


function outOfBounds(value: unknown, bounds: ScopeBounds): string | undefined {
  if (bounds.oneOf && !bounds.oneOf.some((v) => deepEqual(v, value))) {
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
  const isSecret = (key: SettingKey) => dials.sensitivityFor(key) === 'secret';
  const show = (key: SettingKey, value: SettingValue) => (isSecret(key) ? '<secret>' : JSON.stringify(value));
  /** Declared bounds, else the schema's own numeric min/max. */
  const boundsFor = (key: SettingKey, scope: string): ScopeBounds | undefined => {
    const declared = boundsOf(metaOf(key), scope);
    if (declared) return declared;
    const field = shape[key];
    const nb = field ? getNumericBounds(field) : undefined;
    if (!nb || (nb.min === undefined && nb.max === undefined)) return undefined;
    const out: ScopeBounds = {};
    if (nb.min !== undefined) out.min = nb.min;
    if (nb.max !== undefined) out.max = nb.max;
    return out;
  };

  // ---- checks at definition time -------------------------------------------------------------
  const seen = new Set<string>();
  for (const r of rungs) {
    if (!r || typeof r.scope !== 'string' || r.scope === '') throw new Error('defineLadder: every rung needs a scope id');
    if (seen.has(r.scope)) throw new Error(`defineLadder: two rungs share the scope id \`${r.scope}\``);
    seen.add(r.scope);
    if (r.managed && r.gated) {
      throw new Error(`defineLadder: rung \`${r.scope}\` is both managed and gated; a gated (user) rung must not join the policy band`);
    }
  }
  for (const key of dials.keys) {
    const meta = metaOf(key);
    const scoped = (meta.scopeBounds && typeof meta.scopeBounds === 'object' ? Object.entries(meta.scopeBounds as Record<string, ScopeBounds>) : [])
      .concat(meta.userBounds && typeof meta.userBounds === 'object' ? [['user', meta.userBounds as ScopeBounds]] : []);
    for (const [scope, b] of scoped) {
      if (!scopesOf(key).includes(scope)) {
        throw new Error(`defineLadder: \`${key}\` has bounds for scope \`${scope}\` but its writableScopes do not include it`);
      }
      if (b.min !== undefined && b.max !== undefined && b.min > b.max) {
        throw new Error(`defineLadder: \`${key}\` bounds for \`${scope}\` have min ${b.min} > max ${b.max}`);
      }
      if (dials.mergeStrategyFor(key) !== 'replace') {
        throw new Error(`defineLadder: \`${key}\` merges (${dials.mergeStrategyFor(key)}), so bounds on a partial value would not bound the result; bound a replace key`);
      }
    }
  }

  const rungFor = (scope: string): Rung<Ctx> => {
    const r = rungs.find((x) => x.scope === scope);
    if (!r) throw new Error(`defineLadder: no rung has scope \`${scope}\` (rungs: ${rungs.map((x) => x.scope).join(', ')})`);
    return r;
  };

  const refusal = (scope: string, key: SettingKey, value: SettingValue, reason: RefusedWrite['reason'], why: string): RefusedWrite => ({
    scope,
    key,
    // A refused secret is reported, never echoed.
    value: isSecret(key) ? makeSecretRef(key, true) : value,
    reason,
    detail: reason === 'not-writable' ? why : `\`${key}\` = ${show(key, value)} from \`${scope}\`: ${why}`,
  });

  const gateCheck = (rung: Rung<Ctx>, key: SettingKey, value: SettingValue, ctx: Ctx | undefined): RefusedWrite | undefined => {
    if (!rung.gated) return undefined;
    let bounds: ScopeBounds | undefined;
    if (rung.gate) {
      const verdict = rung.gate(key, value, ctx as Ctx);
      if (verdict === false) return refusal(rung.scope, key, value, 'not-writable', `\`${key}\` is not writable from scope \`${rung.scope}\` (refused by the rung's gate)`);
      bounds = verdict === true ? undefined : verdict;
    } else {
      if (!scopesOf(key).includes(rung.scope)) {
        return refusal(rung.scope, key, value, 'not-writable', `\`${key}\` is not writable from scope \`${rung.scope}\` (writableScopes: ${JSON.stringify(scopesOf(key))})`);
      }
      bounds = boundsFor(key, rung.scope);
    }
    if (isUnset(value)) return undefined; // resetting to the scope below is always allowed
    const why = bounds ? outOfBounds(value, bounds) : undefined;
    return why ? refusal(rung.scope, key, value, 'out-of-bounds', why) : undefined;
  };

  const stack = (ctx: Ctx) => {
    const out: ScopedLayer[] = [];
    const refused: RefusedWrite[] = [];
    for (const rung of rungs) {
      const got = typeof rung.layer === 'function' ? rung.layer(ctx) : rung.layer;
      if (!got) continue;
      const scoped: ScopedLayer[] = Array.isArray(got)
        ? [...(got as ScopedLayer[])]
        : isScopedLayer(got)
          ? [got]
          : [{ scope: rung.scope, layer: got as Layer }];
      for (const sl of scoped) {
        let admitted: Layer = sl.layer;
        if (rung.gated) {
          admitted = {};
          for (const [key, value] of Object.entries(sl.layer)) {
            const r = gateCheck(rung, key, value, ctx);
            if (r) refused.push(r);
            else admitted[key] = value;
          }
        }
        out.push(rung.managed ? { scope: sl.scope, layer: admitted, managed: true } : { scope: sl.scope, layer: admitted });
      }
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
    writableKeys(scope, ...rest) {
      const rung = rungFor(scope);
      const hasCtx = rest.length > 0;
      const ctx = rest[0] as Ctx;
      const lockedKeys = new Set<SettingKey>();
      if (hasCtx) {
        const { stack: s } = stack(ctx);
        for (const sl of s) if (sl.managed) for (const k of Object.keys(sl.layer)) lockedKeys.add(k);
      }
      const keys = rung.gated && !rung.gate ? dials.keys.filter((k) => scopesOf(k).includes(scope)) : dials.keys;
      return keys.map((key) => {
        const out: WritableKey = { key };
        const bounds = rung.gated && !rung.gate ? boundsFor(key, scope) : undefined;
        if (bounds) out.bounds = bounds;
        if (lockedKeys.has(key)) out.locked = true;
        return out;
      });
    },
    checkWrite(scope, key, value, ctx) {
      return gateCheck(rungFor(scope), key, value, ctx);
    },
  };
}

function isScopedLayer(v: unknown): v is ScopedLayer {
  return typeof v === 'object' && v !== null && typeof (v as ScopedLayer).scope === 'string' &&
    typeof (v as ScopedLayer).layer === 'object' && (v as ScopedLayer).layer !== null && Object.keys(v).every((k) => k === 'scope' || k === 'layer' || k === 'managed');
}
