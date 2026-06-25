/**
 * @zodal/dials-store-env — an environment-variable `LayerStore` for zodal-dials.
 *
 * Env is a high-precedence, READ-MOSTLY scope: it produces a layer from `process.env` (or any
 * injected env map) using one deterministic dotted-key -> ENV_VAR mapping, coercing string values to
 * settings values. It is key-driven (you supply the setting keys to look for) and never writes.
 */

import type { Layer, LayerStore, LayerStoreCapabilities } from '@zodal/dials-core';

export interface EnvStoreOptions {
  /** Scope id. Default: 'env'. */
  scope?: string;
  /** The setting keys to read (their env var names are derived). Env is key-driven — supply the keys
   *  you expect to be overridable via the environment. */
  keys?: string[];
  /** Env var prefix (e.g. 'MYAPP' -> `MYAPP_…`). Default: '' (no prefix). */
  prefix?: string;
  /** The environment to read. Default: the ambient `process.env` (or `{}` in a non-Node runtime). */
  env?: Record<string, string | undefined>;
  /** Coerce a raw string env value to a setting value. Default: `defaultCoerce`. */
  coerce?: (raw: string, key: string) => unknown;
}

/**
 * Map a dotted setting key to its env var name: PREFIX + the path with `.`/`-`/`/` -> `__` and
 * camelCase -> `_`, uppercased. e.g. `editor.fontSize` (prefix `MYAPP`) -> `MYAPP_EDITOR__FONT_SIZE`.
 */
export function envVarName(key: string, prefix = ''): string {
  const body = key
    .replace(/[.\-/]+/g, '__')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toUpperCase();
  return prefix ? `${prefix.replace(/_+$/, '')}_${body}` : body;
}

/**
 * Coerce a raw env string: booleans, numbers, and JSON objects/arrays are parsed; else the string.
 * A numeric-looking string is only coerced when it ROUND-TRIPS exactly (`String(Number(x)) === x`),
 * so leading-zero values ("007"), big integers beyond MAX_SAFE_INTEGER, signed zero, etc. are kept
 * as strings rather than silently corrupted.
 */
export function defaultCoerce(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    return String(n) === trimmed ? n : raw;
  }
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // not valid JSON — fall through to the raw string
    }
  }
  return raw;
}

function ambientEnv(): Record<string, string | undefined> {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env ?? {};
}

/** Create a read-only environment-variable LayerStore. */
export function createEnvStore(options: EnvStoreOptions = {}): LayerStore {
  const scope = options.scope ?? 'env';
  const prefix = options.prefix ?? '';
  const keys = options.keys ?? [];
  const coerce = options.coerce ?? defaultCoerce;

  // The key -> env-var mapping is not injective (e.g. `a.b`, `a-b`, `a/b` all map to `A__B`). Detect
  // collisions at construction so two distinct keys can never silently read the same variable.
  const claimed = new Map<string, string>();
  for (const key of keys) {
    const name = envVarName(key, prefix);
    const prior = claimed.get(name);
    if (prior !== undefined && prior !== key) {
      throw new Error(`@zodal/dials-store-env: keys "${prior}" and "${key}" both map to env var ${name}`);
    }
    claimed.set(name, key);
  }

  return {
    scope,
    getCapabilities: (): LayerStoreCapabilities => ({ readable: true, writable: false, watchable: false }),
    load(): Promise<Layer> {
      const env = options.env ?? ambientEnv();
      const layer: Layer = {};
      for (const key of keys) {
        const raw = env[envVarName(key, prefix)];
        if (raw !== undefined) layer[key] = coerce(raw, key);
      }
      return Promise.resolve(layer);
    },
  };
}
