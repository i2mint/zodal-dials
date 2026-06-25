/** Named profile ("instrument") store tests: save/load round-trip (incl. UNSET), list, remove,
 *  rename, has, overwrite. */
import { describe, it, expect } from 'vitest';
import { createProfileStore, createMemoryProfileStorage } from '../src/profiles.js';
import { UNSET, isUnset } from '@zodal/dials-core';

describe('createProfileStore', () => {
  const fresh = () => createProfileStore(createMemoryProfileStorage());

  it('saves and loads a sparse layer losslessly (UNSET survives)', async () => {
    const store = fresh();
    await store.save('Bright Lead', { 'voice.instrument': 'saw', 'voice.octaves': 3, 'fx.reverb': UNSET });
    const layer = await store.load('Bright Lead');
    expect(layer?.['voice.instrument']).toBe('saw');
    expect(layer?.['voice.octaves']).toBe(3);
    expect(isUnset(layer?.['fx.reverb'])).toBe(true);
  });

  it('lists saved profiles with metadata (no layer payload)', async () => {
    const store = fresh();
    await store.save('A', { x: 1 }, { tags: ['lead'] });
    await store.save('B', { x: 2 });
    const list = await store.list();
    expect(list.map((p) => p.name)).toEqual(['A', 'B']);
    expect(list[0].meta).toEqual({ tags: ['lead'] });
    expect('layer' in list[0]).toBe(false);
  });

  it('overwrites a profile saved under the same name', async () => {
    const store = fresh();
    await store.save('A', { x: 1 });
    await store.save('A', { x: 2 });
    expect((await store.list()).length).toBe(1);
    expect((await store.load('A'))?.x).toBe(2);
  });

  it('has / remove', async () => {
    const store = fresh();
    await store.save('A', { x: 1 });
    expect(await store.has('A')).toBe(true);
    await store.remove('A');
    expect(await store.has('A')).toBe(false);
    expect(await store.load('A')).toBeUndefined();
  });

  it('renames a profile and rejects a clash', async () => {
    const store = fresh();
    await store.save('A', { x: 1 });
    await store.save('B', { x: 2 });
    await store.rename('A', 'A2');
    expect(await store.has('A')).toBe(false);
    expect((await store.load('A2'))?.x).toBe(1);
    await expect(store.rename('A2', 'B')).rejects.toThrow(/already exists/);
  });

  it('load of a missing profile returns undefined; rename of a missing is a no-op', async () => {
    const store = fresh();
    expect(await store.load('nope')).toBeUndefined();
    await expect(store.rename('nope', 'x')).resolves.toBeUndefined();
  });

  it('persists across store instances sharing one storage', async () => {
    const storage = createMemoryProfileStorage();
    await createProfileStore(storage).save('Shared', { x: 1 });
    expect((await createProfileStore(storage).load('Shared'))?.x).toBe(1);
  });
});
