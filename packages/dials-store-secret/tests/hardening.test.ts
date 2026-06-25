/** Hardening regressions from the secret-store adversarial review: object-valued secrets survive
 *  losslessly (CRITICAL), a read-only config throws instead of silently dropping (HIGH), and load
 *  does not mutate the config store's object (MEDIUM). */
import { describe, it, expect } from 'vitest';
import { createMemorySecretBackend, createSensitiveSettingsProvider, revealSetting } from '../src/index.js';
import { isSecretRef } from '@zodal/dials-core';
import type { Layer, LayerStore, Sensitivity, SettingKey } from '@zodal/dials-core';

const sensitivityFor = (key: SettingKey): Sensitivity =>
  /secret|token|password|api[_-]?key|^network$/i.test(key) ? 'secret' : 'public';

function writableConfig(scope = 'user'): { box: { data: Layer }; store: LayerStore } {
  const box = { data: {} as Layer };
  return {
    box,
    store: {
      scope,
      getCapabilities: () => ({ readable: true, writable: true, watchable: false }),
      load: () => Promise.resolve({ ...box.data }),
      save: (layer) => {
        box.data = { ...layer };
        return Promise.resolve();
      },
    },
  };
}

/** A read-only config store (no `save`), like the env store. */
function readOnlyConfig(): LayerStore {
  return {
    scope: 'env',
    getCapabilities: () => ({ readable: true, writable: false, watchable: false }),
    load: () => Promise.resolve({}),
  };
}

/** A config store that returns its INTERNAL object by reference (aliasing) — to catch mutation. */
function aliasingConfig(): { data: Layer; store: LayerStore } {
  const data: Layer = { 'editor.theme': 'dark' };
  return {
    data,
    store: {
      scope: 'user',
      getCapabilities: () => ({ readable: true, writable: true, watchable: false }),
      load: () => Promise.resolve(data), // returns the internal object by reference
      save: () => Promise.resolve(),
    },
  };
}

describe('CRITICAL — an object-valued secret survives losslessly (no [object Object])', () => {
  it('JSON-encodes and round-trips a container secret', async () => {
    const { box, store } = writableConfig();
    const secrets = createMemorySecretBackend();
    const provider = createSensitiveSettingsProvider({ config: store, secrets, sensitivityFor });

    await provider.save({ network: { host: 'h', apiKey: 'sk-NESTED' } });
    // not in the config store, no plaintext
    expect(box.data).toEqual({});
    expect(JSON.stringify(box.data).includes('sk-NESTED')).toBe(false);
    // the object value is recoverable (not corrupted to '[object Object]')
    expect(await revealSetting(secrets, 'network')).toEqual({ host: 'h', apiKey: 'sk-NESTED' });
    // load surfaces a masked ref, no plaintext
    const loaded = await provider.load();
    expect(isSecretRef(loaded.network)).toBe(true);
    expect(JSON.stringify(loaded).includes('sk-NESTED')).toBe(false);
  });
});

describe('HIGH — a read-only config store throws instead of silently dropping the config part', () => {
  it('throws when there is a non-secret part to persist', async () => {
    const provider = createSensitiveSettingsProvider({ config: readOnlyConfig(), secrets: createMemorySecretBackend(), sensitivityFor });
    await expect(provider.save({ 'editor.theme': 'dark', 'network.apiKey': 'sk' })).rejects.toThrow(/read-only/);
  });

  it('a secrets-only save still succeeds with a read-only config', async () => {
    const secrets = createMemorySecretBackend();
    const provider = createSensitiveSettingsProvider({ config: readOnlyConfig(), secrets, sensitivityFor });
    await provider.save({ 'network.apiKey': 'sk-ONLY' });
    expect(await secrets.has('network.apiKey')).toBe(true);
  });
});

describe('MEDIUM — load does not mutate the config store object', () => {
  it('overlays masked refs onto a copy, not the store internals', async () => {
    const { data, store } = aliasingConfig();
    const secrets = createMemorySecretBackend({ 'network.apiKey': 'sk-LIVE' });
    const provider = createSensitiveSettingsProvider({ config: store, secrets, sensitivityFor });
    await provider.load();
    expect('network.apiKey' in data).toBe(false); // the store's internal object is untouched
  });
});
