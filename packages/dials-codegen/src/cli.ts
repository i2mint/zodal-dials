/**
 * Headless CLI helpers for zodal-dials — the logic behind a `dials get|set|list|unset` command,
 * pure and IO-free (the consumer wires stores + argv + stdout). `list --show-origin` surfaces the
 * cascade's PROVENANCE per key (the differentiator, à la `git config --show-origin`). Secrets are
 * always shown masked. `set`/`unset` return a NEW editable layer; they never mutate the input.
 */

import type { z } from 'zod';
import { baseType, getObjectShape, isSecretRef } from '@zodal/dials-core';
import type { DialsDefinition, Layer, ScopedLayer, SettingKey } from '@zodal/dials-core';

export interface CliContext<T extends z.ZodObject<z.ZodRawShape>> {
  dials: DialsDefinition<T>;
  /** The ordered scope stack BELOW the editable layer (defaults are prepended by resolve). */
  stack?: ScopedLayer[];
  /** The editable (user) layer being get/set. */
  layer: Layer;
  /** The scope id of the editable layer. Default: 'user'. */
  scope?: string;
}

export interface RunCliResult {
  output: string;
  /** The (possibly updated) editable layer — changed by `set`/`unset`, unchanged otherwise. */
  layer: Layer;
}

/** Coerce a raw CLI string to a value of the given base type. Throws on a malformed number/JSON. */
export function coerceByType(type: string, raw: string): unknown {
  switch (type) {
    case 'number': {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new Error(`"${raw}" is not a number`);
      return n;
    }
    case 'boolean': {
      const t = raw.toLowerCase();
      if (t === 'true' || t === '1' || t === 'yes') return true;
      if (t === 'false' || t === '0' || t === 'no') return false;
      throw new Error(`"${raw}" is not a boolean (use true/false)`);
    }
    case 'object':
    case 'array':
      return JSON.parse(raw);
    case 'string':
    case 'enum':
      return raw;
    default:
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
  }
}

function typeOf<T extends z.ZodObject<z.ZodRawShape>>(dials: DialsDefinition<T>, key: SettingKey): string {
  const field = getObjectShape(dials.schema)[key];
  return field ? baseType(field) : 'unknown';
}

function formatValue(value: unknown): string {
  if (isSecretRef(value)) return value.masked;
  return JSON.stringify(value);
}

function resolveContext<T extends z.ZodObject<z.ZodRawShape>>(ctx: CliContext<T>): ReturnType<DialsDefinition<T>['resolve']> {
  const stack: ScopedLayer[] = [...(ctx.stack ?? []), { scope: ctx.scope ?? 'user', layer: ctx.layer }];
  return ctx.dials.resolve(stack, { maskSecrets: true });
}

export interface ListOptions {
  showOrigin?: boolean;
  modifiedOnly?: boolean;
}

/** Format the effective settings as lines (`key = value`, optionally `(scope)`). Secrets masked. */
export function formatList<T extends z.ZodObject<z.ZodRawShape>>(ctx: CliContext<T>, options: ListOptions = {}): string {
  const result = resolveContext(ctx);
  const lines: string[] = [];
  // schema keys first, then any ad-hoc (out-of-schema) keys that resolved — so nothing is hidden.
  const extras = Object.keys(result.provenance).filter((k) => !ctx.dials.keys.includes(k));
  for (const key of [...ctx.dials.keys, ...extras]) {
    const prov = result.provenance[key];
    if (!prov) continue; // unset
    if (options.modifiedOnly && prov.winningScope === 'default') continue;
    let line = `${key} = ${formatValue(result.effective[key])}`;
    if (options.showOrigin) line += `\t(${prov.winningScope}${prov.managed ? ', policy' : ''})`;
    lines.push(line);
  }
  return lines.join('\n');
}

/** Format a single setting's effective value + origin. */
export function formatGet<T extends z.ZodObject<z.ZodRawShape>>(ctx: CliContext<T>, key: SettingKey): string {
  if (!ctx.dials.keys.includes(key)) return `unknown setting: ${key}`;
  const result = resolveContext(ctx);
  const prov = result.provenance[key];
  if (!prov) return `${key} is unset`;
  const shadow = prov.shadowed.length > 0 ? ` [shadows ${prov.shadowed.map((s) => s.scope).join(', ')}]` : '';
  return `${key} = ${formatValue(result.effective[key])}\t(${prov.winningScope}${prov.managed ? ', policy' : ''})${shadow}`;
}

/**
 * Dispatch a CLI command against the context. `argv` is the command + args (e.g. `['set',
 * 'editor.fontSize', '16']`). Returns the output text and the (possibly new) editable layer. Pure.
 */
export function runCli<T extends z.ZodObject<z.ZodRawShape>>(argv: string[], ctx: CliContext<T>): RunCliResult {
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const positional = rest.filter((a) => !a.startsWith('--'));
  const layer = ctx.layer;

  switch (command) {
    case 'list':
      return { output: formatList(ctx, { showOrigin: flags.has('--show-origin'), modifiedOnly: flags.has('--modified') }), layer };
    case 'get': {
      const key = positional[0];
      if (!key) return { output: 'usage: get <key>', layer };
      return { output: formatGet(ctx, key), layer };
    }
    case 'set': {
      const [key, raw] = positional;
      if (key === undefined || raw === undefined) return { output: 'usage: set <key> <value>', layer };
      if (!ctx.dials.keys.includes(key)) return { output: `unknown setting: ${key}`, layer };
      let value: unknown;
      try {
        value = coerceByType(typeOf(ctx.dials, key), raw);
      } catch (error) {
        return { output: `invalid value for ${key}: ${(error as Error).message}`, layer };
      }
      // Validate the coerced value against the field schema (rejects out-of-enum / out-of-range).
      const field = getObjectShape(ctx.dials.schema)[key];
      if (field) {
        const parsed = field.safeParse(value);
        if (!parsed.success) {
          return { output: `invalid value for ${key}: ${parsed.error.issues[0]?.message ?? 'validation failed'}`, layer };
        }
      }
      // Never echo a secret's value back to stdout/history — confirm with a mask.
      const shown = ctx.dials.sensitivityFor(key) === 'secret' ? '•••• (set)' : JSON.stringify(value);
      return { output: `set ${key} = ${shown}`, layer: { ...layer, [key]: value } };
    }
    case 'unset': {
      const key = positional[0];
      if (!key) return { output: 'usage: unset <key>', layer };
      const next = { ...layer };
      delete next[key];
      return { output: `unset ${key}`, layer: next };
    }
    default:
      return { output: `usage: dials <list|get|set|unset> [...] (got "${command ?? ''}")`, layer };
  }
}
