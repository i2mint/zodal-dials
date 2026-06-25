/** Tests for the secret backend + bifurcation provider: secrets routed to the backend, never the
 *  config store; load surfaces masked SecretRefs; reveal is explicit; UNSET deletes. */
import { describe, it, expect } from 'vitest';
import { createMemorySecretBackend, createSensitiveSettingsProvider, revealSetting } from '../src/index.js';
import { isSecretRef, UNSET } from '@zodal/dials-core';
import type { Layer, LayerStore, Sensitivity, SettingKey } from '@zodal/dials-core';

const sensitivityFor = (key: SettingKey): Sensitivity =>
  /secret|token|password|api[_-]?key/i.test(key) ? 'secret' : 'public';

function memoryConfigStore(scope = 'user'): { box: { data: Layer }; store: LayerStore } {
  const box = { data: {} as Layer };
  const store: LayerStore = {
    scope,
    getCapabilities: () => ({ readable: true, writable: true, watchable: false }),
    load: () => Promise.resolve({ ...box.data }),
    save: (layer) => {
      box.data = { ...layer };
      return Promise.resolve();
    },
  };
  return { box, store };
}

describe('createMemorySecretBackend', () => {
  it('stores, masks on get, reveals explicitly, lists, and deletes', async () => {
    const backend = createMemorySecretBackend();
    await backend.set('network.apiKey', 'sk-LIVE');
    expect(await backend.has('network.apiKey')).toBe(true);
    const ref = await backend.get('network.apiKey');
    expect(isSecretRef(ref)).toBe(true);
    expect(ref.masked).toBe('•••• (set)');
    expect(JSON.stringify(ref).includes('sk-LIVE')).toBe(false);
    expect(await backend.reveal('network.apiKey')).toBe('sk-LIVE'); // explicit reveal
    expect(await backend.list()).toEqual(['network.apiKey']);
    await backend.delete('network.apiKey');
    expect(await backend.has('network.apiKey')).toBe(false);
  });
});

describe('createSensitiveSettingsProvider (bifurcation)', () => {
  it('routes secrets to the backend, never the config store', async () => {
    const { box, store } = memoryConfigStore();
    const secrets = createMemorySecretBackend();
    const provider = createSensitiveSettingsProvider({ config: store, secrets, sensitivityFor });

    await provider.save({ 'editor.theme': 'dark', 'network.apiKey': 'sk-LIVE-VALUE' });

    expect(box.data).toEqual({ 'editor.theme': 'dark' });
    expect(JSON.stringify(box.data).includes('sk-LIVE-VALUE')).toBe(false);
    expect(await revealSetting(secrets, 'network.apiKey')).toBe('sk-LIVE-VALUE');
  });

  it('load returns config values + masked SecretRefs (no plaintext)', async () => {
    const { store } = memoryConfigStore();
    const secrets = createMemorySecretBackend({ 'network.apiKey': 'sk-LIVE' });
    const provider = createSensitiveSettingsProvider({ config: store, secrets, sensitivityFor });
    await store.save?.({ 'editor.theme': 'dark' });

    const loaded = await provider.load();
    expect(loaded['editor.theme']).toBe('dark');
    expect(isSecretRef(loaded['network.apiKey'])).toBe(true);
    expect(JSON.stringify(loaded).includes('sk-LIVE')).toBe(false);
  });

  it('UNSET on a secret deletes it from the backend', async () => {
    const { store } = memoryConfigStore();
    const secrets = createMemorySecretBackend({ 'network.apiKey': 'sk-LIVE' });
    const provider = createSensitiveSettingsProvider({ config: store, secrets, sensitivityFor });
    await provider.save({ 'network.apiKey': UNSET });
    expect(await secrets.has('network.apiKey')).toBe(false);
  });

  it('capabilities mirror the config store', () => {
    const { store } = memoryConfigStore('workspace');
    const provider = createSensitiveSettingsProvider({ config: store, secrets: createMemorySecretBackend(), sensitivityFor });
    expect(provider.getCapabilities()).toEqual({ readable: true, writable: true, watchable: false });
    expect(provider.scope).toBe('workspace');
  });
});
