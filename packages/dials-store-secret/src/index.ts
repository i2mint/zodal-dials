/**
 * @zodal/dials-store-secret — the secret side of zodal-dials' content/metadata bifurcation.
 *
 * - `createMemorySecretBackend()` — a reference `SecretBackend` (in-memory; dev/test). A real backend
 *   (OS keychain, Vault, encrypted file) implements the same interface. A backend stores opaque
 *   string blobs; it is encoding-agnostic.
 * - `createSensitiveSettingsProvider({ config, secrets, sensitivityFor })` — composes a config
 *   `LayerStore` + a `SecretBackend` into ONE `LayerStore` that routes secret values to the backend
 *   (never to the config store). The provider stores each secret value JSON-ENCODED (so an object/
 *   array-valued secret — which the container fail-safe classification produces — survives losslessly);
 *   use `revealSetting` to decode it back. On `load`, config values come back plus a MASKED
 *   `SecretRef` for every secret the backend holds — never plaintext.
 *
 * Cross-store `save` is best-effort, not atomic: secrets are written first, so a secret-write failure
 * aborts before the visible config part is committed. A read-only config store causes `save` to throw
 * (rather than silently drop) when there is a non-secret part to persist.
 */

import { isUnset, makeSecretRef, splitBySensitivity } from '@zodal/dials-core';
import type { Layer, LayerStore, LayerStoreCapabilities, SecretBackend, Sensitivity, SettingKey } from '@zodal/dials-core';

/** An in-memory `SecretBackend` (reference implementation; dev/test). Holds string blobs in a Map. */
export function createMemorySecretBackend(initial: Record<SettingKey, string> = {}): SecretBackend {
  const store = new Map<SettingKey, string>(Object.entries(initial));
  return {
    has: (key) => Promise.resolve(store.has(key)),
    get: (key) => Promise.resolve(makeSecretRef(key, store.has(key))),
    reveal: (key) => Promise.resolve(store.get(key)),
    set: (key, value) => {
      store.set(key, value);
      return Promise.resolve(makeSecretRef(key, true));
    },
    delete: (key) => {
      store.delete(key);
      return Promise.resolve();
    },
    list: () => Promise.resolve([...store.keys()]),
  };
}

/**
 * Reveal a secret's ORIGINAL value (the inverse of how `createSensitiveSettingsProvider` stores it:
 * JSON-encoded). Returns undefined if the key is unset. Falls back to the raw string if it is not
 * valid JSON (tolerating values written outside the provider).
 */
export async function revealSetting(secrets: SecretBackend, key: SettingKey): Promise<unknown> {
  const raw = await secrets.reveal(key);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export interface SensitiveSettingsProviderOptions {
  /** The config `LayerStore` for non-secret values. */
  config: LayerStore;
  /** The `SecretBackend` for secret values. */
  secrets: SecretBackend;
  /** Classify a setting's sensitivity (e.g. `dials.sensitivityFor`). */
  sensitivityFor: (key: SettingKey) => Sensitivity;
  /** Scope id. Default: the config store's scope. */
  scope?: string;
}

/** Compose a config `LayerStore` + a `SecretBackend` into one bifurcated `LayerStore`. */
export function createSensitiveSettingsProvider(options: SensitiveSettingsProviderOptions): LayerStore {
  const { config, secrets, sensitivityFor } = options;
  const scope = options.scope ?? config.scope;

  return {
    scope,
    getCapabilities: (): LayerStoreCapabilities => {
      // The config store gates a FULL write (the non-secret part needs it); mirror it conservatively.
      const capabilities = config.getCapabilities();
      return { readable: capabilities.readable, writable: capabilities.writable, watchable: capabilities.watchable };
    },

    async load(): Promise<Layer> {
      // Copy the config store's returned object — never mutate it (we overlay masked refs onto it).
      const layer: Layer = { ...(await config.load()) };
      // Overlay a MASKED SecretRef for every secret the backend holds (never plaintext).
      for (const key of await secrets.list()) {
        layer[key] = await secrets.get(key);
      }
      return layer;
    },

    async save(layer: Layer): Promise<void> {
      const { config: configPart, secrets: secretPart } = splitBySensitivity(layer, sensitivityFor);
      const hasConfigPart = Object.keys(configPart).length > 0;
      if (hasConfigPart && !config.save) {
        throw new Error('@zodal/dials-store-secret: the config store is read-only; cannot persist non-secret settings');
      }
      // Secrets first: a secret-write failure aborts before the visible config part is committed.
      // Values are JSON-encoded so object/array-valued secrets survive losslessly (see revealSetting).
      for (const [key, value] of Object.entries(secretPart)) {
        if (isUnset(value)) await secrets.delete(key);
        else if (value !== undefined && value !== null) await secrets.set(key, JSON.stringify(value));
      }
      if (hasConfigPart) await config.save?.(configPart);
    },
  };
}
