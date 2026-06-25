/** Hardening regressions from the profile-store adversarial review: secret redaction on save (C1),
 *  serialized concurrent saves (C2), rename-to-self (H1), corrupt-storage degradation (H2), and
 *  empty-name rejection (M2). */
import { describe, it, expect } from 'vitest';
import {
  createProfileStore,
  createMemoryProfileStorage,
  createLocalStorageProfileStorage,
} from '../src/profiles.js';
import type { Sensitivity, SettingKey } from '@zodal/dials-core';

const sensitivityFor = (key: SettingKey): Sensitivity =>
  /token|secret|api[_-]?key|password/i.test(key) ? 'secret' : 'public';

function fakeLocalStorage(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  } as Storage;
}

describe('C1 — secrets are redacted on save when sensitivityFor is provided', () => {
  it('never persists a secret value', async () => {
    const storage = createMemoryProfileStorage();
    const store = createProfileStore(storage, { sensitivityFor });
    await store.save('p', { api_key: 'sk-LEAK', 'master.volume': 0.5 });
    expect(JSON.stringify(await storage.read()).includes('sk-LEAK')).toBe(false);
    const layer = await store.load('p');
    expect('api_key' in (layer ?? {})).toBe(false);
    expect(layer?.['master.volume']).toBe(0.5);
  });
});

describe('C2 — concurrent saves do not lose updates', () => {
  it('serializes mutations', async () => {
    const store = createProfileStore(createMemoryProfileStorage());
    await Promise.all([store.save('A', { x: 1 }), store.save('B', { x: 2 }), store.save('C', { x: 3 })]);
    expect((await store.list()).map((p) => p.name).sort()).toEqual(['A', 'B', 'C']);
  });
});

describe('H1 — rename to the same name is a no-op (not a clash error)', () => {
  it('does not throw', async () => {
    const store = createProfileStore(createMemoryProfileStorage());
    await store.save('A', { x: 1 });
    await expect(store.rename('A', 'A')).resolves.toBeUndefined();
    expect(await store.has('A')).toBe(true);
  });
});

describe('M2 — an empty/whitespace name is rejected', () => {
  it('rejects', async () => {
    const store = createProfileStore(createMemoryProfileStorage());
    await expect(store.save('   ', { x: 1 })).rejects.toThrow(/empty/);
  });
});

describe('H2 — a corrupt localStorage value degrades to empty, not a throw', () => {
  it('returns []', async () => {
    const previous = (globalThis as { localStorage?: Storage }).localStorage;
    (globalThis as { localStorage?: Storage }).localStorage = fakeLocalStorage({ zk: '{not valid json' });
    try {
      const storage = createLocalStorageProfileStorage('zk');
      expect(await storage.read()).toEqual([]);
    } finally {
      (globalThis as { localStorage?: Storage }).localStorage = previous;
    }
  });
});
