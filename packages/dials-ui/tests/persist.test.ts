import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineDials } from '@zodal/dials-core';
import type { Layer } from '@zodal/dials-core';
import { createSettingsStore, persist } from '../src/index.js';

const dials = defineDials(z.object({ size: z.number().default(1), apiKey: z.string().default('') }));

function memoryLayerStore(initial: Layer = {}) {
  let saved: Layer = initial;
  const saves: Layer[] = [];
  const listeners = new Set<(l: Layer) => void>();
  return {
    scope: 'user',
    saves,
    push(l: Layer) { saved = l; listeners.forEach((f) => f(l)); },
    getCapabilities: () => ({ readable: true, writable: true, watchable: true }),
    load: async () => saved,
    save: async (l: Layer) => { saved = { ...l }; saves.push({ ...l }); },
    subscribe: (f: (l: Layer) => void) => { listeners.add(f); return () => listeners.delete(f); },
  };
}

describe('persist (#35)', () => {
  it('loads once, saves on change, applies external changes, stops', async () => {
    const settings = createSettingsStore(dials, { layer: {} });
    const layers = memoryLayerStore({ size: 5 });
    const p = persist(settings, layers);
    await p.ready;
    expect(settings.getState().effective.size).toBe(5);
    expect(settings.getState().dirty).toEqual([]);
    expect(layers.saves).toEqual([]); // loading is not a change
    settings.set('size', 7);
    await p.flush();
    expect(layers.saves).toEqual([{ size: 7 }]);
    layers.push({ size: 9 });
    expect(settings.getState().effective.size).toBe(9);
    expect(layers.saves.length).toBe(1); // an external change is not saved back
    p.stop();
    settings.set('size', 11);
    await p.flush();
    expect(layers.saves.length).toBe(1);
  });
  it('reports a failed save', async () => {
    const settings = createSettingsStore(dials, { layer: {} });
    const errors: unknown[] = [];
    const layers = { ...memoryLayerStore(), save: async () => { throw new Error('quota'); } };
    const p = persist(settings, layers, { onError: (e) => errors.push(e) });
    await p.ready;
    settings.set('size', 2);
    await p.flush();
    expect(String(errors[0])).toMatch(/quota/);
  });
});
