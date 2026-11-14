import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineDials } from '@zodal/dials-core';
import type { Layer } from '@zodal/dials-core';
import { createSettingsStore, persist } from '../src/index.js';

const dials = defineDials(z.object({ size: z.number().default(1), name: z.string().default('a') }));

function memoryLayerStore(initial: Layer = {}, opts: { echo?: boolean; delay?: number } = {}) {
  let saved: Layer = initial;
  const saves: Layer[] = [];
  const listeners = new Set<(l: Layer) => void>();
  const store = {
    scope: 'user',
    saves,
    fail: false,
    push(l: Layer) { saved = l; listeners.forEach((f) => f(l)); },
    getCapabilities: () => ({ readable: true, writable: true, watchable: true }),
    load: async () => saved,
    save: async (l: Layer) => {
      if (store.fail) throw new Error('quota');
      if (opts.delay) await new Promise((r) => setTimeout(r, opts.delay));
      saved = { ...l };
      saves.push({ ...l });
      if (opts.echo) listeners.forEach((f) => f({ ...l }));
    },
    subscribe: (f: (l: Layer) => void) => { listeners.add(f); return () => listeners.delete(f); },
  };
  return store;
}

describe('persist (#35)', () => {
  it('loads once, saves on change, applies external changes, stops', async () => {
    const settings = createSettingsStore(dials, { layer: {} });
    const layers = memoryLayerStore({ size: 5 });
    const p = persist(settings, layers);
    await p.ready;
    expect(settings.getState().effective.size).toBe(5);
    expect(settings.getState().dirty).toEqual([]);
    expect(layers.saves).toEqual([]);
    settings.set('size', 7);
    await p.flush();
    expect(layers.saves).toEqual([{ size: 7 }]);
    expect(settings.getState().dirty).toEqual([]);
    layers.push({ size: 9 });
    expect(settings.getState().effective.size).toBe(9);
    expect(layers.saves.length).toBe(1);
    p.stop();
    settings.set('size', 11);
    await p.flush();
    expect(layers.saves.length).toBe(1);
  });
  it('a failed save leaves the layer dirty and reports it', async () => {
    const settings = createSettingsStore(dials, { layer: {} });
    const errors: unknown[] = [];
    const layers = memoryLayerStore();
    const p = persist(settings, layers, { onError: (e) => errors.push(e) });
    await p.ready;
    layers.fail = true;
    settings.set('size', 2);
    await p.flush();
    expect(String(errors[0])).toMatch(/quota/);
    expect(settings.getState().dirty).toEqual(['size']);
    layers.fail = false;
    settings.set('name', 'b');
    await p.flush();
    expect(layers.saves.at(-1)).toEqual({ size: 2, name: 'b' });
    expect(settings.getState().dirty).toEqual([]);
  });
  it('coalesces rapid edits and ignores its own echo', async () => {
    const settings = createSettingsStore(dials, { layer: {} });
    const layers = memoryLayerStore({}, { echo: true, delay: 5 });
    const p = persist(settings, layers);
    await p.ready;
    settings.set('size', 2);
    settings.set('size', 3);
    settings.set('size', 4);
    await p.flush();
    expect(layers.saves.at(-1)).toEqual({ size: 4 });
    expect(layers.saves.length).toBeLessThanOrEqual(2);
    expect(settings.getState().effective.size).toBe(4);
  });
  it('keeps edits made while loading, and reports a failed load', async () => {
    const settings = createSettingsStore(dials, { layer: {} });
    const layers = memoryLayerStore({ size: 5, name: 'stored' });
    const p = persist(settings, layers);
    settings.set('size', 8); // before load resolves
    await p.ready;
    await p.flush();
    expect(settings.getState().effective).toMatchObject({ size: 8, name: 'stored' });
    expect(layers.saves.at(-1)).toEqual({ size: 8, name: 'stored' });
    const errors: unknown[] = [];
    const broken = { ...memoryLayerStore(), load: async () => { throw new Error('offline'); } };
    const q = persist(createSettingsStore(dials, { layer: {} }), broken, { onError: (e) => errors.push(e) });
    await q.ready;
    expect(String(errors[0])).toMatch(/offline/);
  });
});
