/**
 * `createSettingsStore` — a framework-agnostic reactive store of effective settings. It holds the
 * ordered lower-scope stack + the editable (user) layer; every mutation re-resolves the cascade
 * (effective + provenance + conflicts), recomputes the dirty set and validation, masks secrets, and
 * notifies subscribers. No framework dependency: `subscribe`/`getState` plug into React via
 * `useSyncExternalStore`, or into anything via the listener. Constraints/secret-masking are honored
 * by reusing dials-core (`resolve`, `validate`, `maskEffectiveResult`).
 */

import type { z } from 'zod';
import { UNSET, maskEffectiveResult } from '@zodal/dials-core';
import type {
  ConstraintResult,
  DialsDefinition,
  EffectiveResult,
  KeyProvenance,
  Layer,
  ScopedLayer,
  SettingKey,
} from '@zodal/dials-core';
import { dirtyKeys } from './lifecycle.js';

export interface SettingsState {
  /** Effective value per key (secrets masked as `SecretRef`). */
  effective: Record<SettingKey, unknown>;
  /** Provenance per key (also masked for secrets). */
  provenance: Record<SettingKey, KeyProvenance>;
  /** Keys set by multiple layers to differing values. */
  conflicts: EffectiveResult['conflicts'];
  /** The editable (user) layer — holds RAW values (including secrets), as the source to persist.
   *  Split secrets out (dials-core `splitBySensitivity`) before saving to a config store. The
   *  display surfaces (`effective`/`provenance`) mask secrets; this does not. */
  layer: Layer;
  /** The ordered lower-scope stack. */
  scopes: ScopedLayer[];
  /** Keys whose editable-layer value differs from the last saved baseline. */
  dirty: SettingKey[];
  /** Validation of the (unmasked) effective values. */
  validation: ConstraintResult;
}

export interface CreateSettingsStoreOptions {
  /** Initial lower-scope stack (defaults are prepended by resolve). */
  scopes?: ScopedLayer[];
  /** Initial editable layer. */
  layer?: Layer;
  /** Scope id of the editable layer. Default: 'user'. */
  scope?: string;
  /** Mask secret effective values + provenance. Default: true. */
  maskSecrets?: boolean;
  /** Called if a subscriber throws during notification (so one bad listener can't break the others
   *  or escape a mutation). Default: rethrow asynchronously is avoided — errors are reported here. */
  onListenerError?: (error: unknown) => void;
}

export interface SettingsStore {
  getState(): SettingsState;
  /** Subscribe to state changes; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Set a key in the editable layer. */
  set(key: SettingKey, value: unknown): void;
  /** Explicitly UNSET a key in the editable layer (re-exposes a lower scope). */
  unset(key: SettingKey): void;
  /** Remove a key from the editable layer (reset — a lower scope re-wins). */
  reset(key: SettingKey): void;
  /** Replace the whole editable layer. */
  setLayer(layer: Layer): void;
  /** Replace the lower-scope stack. */
  setScopes(scopes: ScopedLayer[]): void;
  /** Mark the current editable layer as saved (clears the dirty set). */
  markSaved(): void;
  /** Current effective value for a key (masked for secrets). */
  get(key: SettingKey): unknown;
  /** Provenance for a key. */
  explain(key: SettingKey): KeyProvenance | undefined;
}

/** Create a reactive settings store over a dials definition. */
export function createSettingsStore<T extends z.ZodObject<z.ZodRawShape>>(
  dials: DialsDefinition<T>,
  options: CreateSettingsStoreOptions = {},
): SettingsStore {
  const scopeId = options.scope ?? 'user';
  const maskSecrets = options.maskSecrets !== false;
  const listeners = new Set<() => void>();

  let scopes: ScopedLayer[] = [...(options.scopes ?? [])];
  let layer: Layer = { ...(options.layer ?? {}) };
  let baseline: Layer = { ...layer };
  let state: SettingsState;

  const recompute = (): void => {
    // Resolve UNMASKED for validation (a masked SecretRef would fail value constraints), then mask
    // for the exposed state.
    const raw = dials.resolve([...scopes, { scope: scopeId, layer }]);
    const validation = dials.validate(raw.effective);
    const shown = maskSecrets ? maskEffectiveResult(raw, dials.sensitivityFor) : raw;
    state = {
      effective: shown.effective,
      provenance: shown.provenance,
      conflicts: shown.conflicts,
      layer: { ...layer },
      scopes: [...scopes],
      dirty: dirtyKeys(layer, baseline),
      validation,
    };
    // Notify defensively: one throwing listener must not break the others or escape the mutation.
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        options.onListenerError?.(error);
      }
    }
  };

  recompute();

  const mutate = (next: Layer): void => {
    layer = next;
    recompute();
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (key, value) => {
      // No-op guard: skip recompute+notify when a scalar value is unchanged (also breaks the naive
      // "write back on change" re-entrancy loop). Deep-equal object no-ops are not detected.
      if (Object.prototype.hasOwnProperty.call(layer, key) && Object.is(layer[key], value)) return;
      mutate({ ...layer, [key]: value });
    },
    unset: (key) => mutate({ ...layer, [key]: UNSET }),
    reset: (key) => {
      const next = { ...layer };
      delete next[key];
      mutate(next);
    },
    setLayer: (next) => mutate({ ...next }),
    setScopes: (next) => {
      scopes = [...next];
      recompute();
    },
    markSaved: () => {
      baseline = { ...layer };
      recompute();
    },
    get: (key) => state.effective[key],
    explain: (key) => state.provenance[key],
  };
}
