import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineDials, providerLayerStore, providerSecretBackend, UNSET, isUnset } from '../src/index.js';
import type { RecordProvider } from '../src/index.js';

/** A minimal DataProvider over a Map (what @zodal/store's in-memory provider does). */
function mapProvider<T extends { id: string }>(opts: { upsert?: boolean; failReads?: boolean } = {}) {
  const rows = new Map<string, T>();
  const listeners = new Set<(e: any) => void>();
  const emit = (e: any) => listeners.forEach((l) => l(e));
  const p: RecordProvider<T> & { rows: Map<string, T>; emit: typeof emit } = {
    rows,
    emit,
    async getOne(id) {
      if (opts.failReads) throw new Error('503');
      const r = rows.get(id);
      if (!r) throw new Error('not found');
      return structuredClone(r);
    },
    async create(d) { rows.set(d.id!, structuredClone(d) as T); return structuredClone(d) as T; },
    async update(id, d) { const r = { ...rows.get(id)!, ...d }; rows.set(id, r); return r; },
    async delete(id) { rows.delete(id); },
    async getList(params: any = {}) {
      const f = params.filter;
      const data = [...rows.values()].filter((r: any) =>
        !f ? true : f.operator === 'eq' ? r.id === f.value : String(r.id).startsWith(f.value));
      return { data, total: data.length };
    },
    subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  };
  if (opts.upsert) p.upsert = async (d) => { rows.set(d.id, structuredClone(d)); return d; };
  return p;
}

describe('providerLayerStore (#35)', () => {
  it('round-trips a layer, UNSET included, with or without upsert', async () => {
    for (const upsert of [true, false]) {
      const store = providerLayerStore(mapProvider({ upsert }));
      expect(await store.load()).toEqual({});
      await store.save({ size: 3, theme: UNSET });
      const back = await store.load();
      expect(back.size).toBe(3);
      expect(isUnset(back.theme)).toBe(true);
      await store.save({ size: 4 });
      expect((await store.load()).size).toBe(4);
    }
  });
  it('never saves a secret', async () => {
    const dials = defineDials(z.object({ model: z.string().default('m'), key: z.string().default('').meta({ sensitivity: 'secret' }) }));
    const p = mapProvider<any>();
    await providerLayerStore(p).save({ model: 'x', apiKey: 'sk-1' });
    await providerLayerStore(p, { scope: 's2', sensitivityFor: dials.sensitivityFor }).save({ model: 'x', key: 'sk-2' });
    const dump = JSON.stringify([...p.rows.values()]);
    expect(dump).not.toContain('sk-1');
    expect(dump).not.toContain('sk-2');
    expect(dump).toContain('"model":"x"');
  });
  it('fails closed without sensitivityFor: nested secret names, and secrets in loaded records', async () => {
    const p = mapProvider<any>();
    await providerLayerStore(p).save({ llm: { provider: 'x', apiKey: 'sk-nested' }, size: 1 });
    expect(JSON.stringify([...p.rows.values()])).not.toContain('sk-nested');
    p.rows.set('user', { id: 'user', layer: { size: 2, apiKey: 'sk-legacy' }, savedAt: 0 });
    expect(await providerLayerStore(p).load()).toEqual({ size: 2 });
    p.rows.set('user', { id: 'user', layer: { values: 3, unset: 'x' }, savedAt: 0 });
    expect(await providerLayerStore(p).load()).toEqual({ values: 3, unset: 'x' }); // a plain layer with such keys
  });
  it('honours idField', async () => {
    const rows = new Map<string, any>();
    const p: any = {
      getOne: async (id: string) => { const r = rows.get(id); if (!r) throw new Error('nf'); return r; },
      create: async (d: any) => { rows.set(d.key, d); return d; },
      update: async (id: string, d: any) => { rows.set(id, { ...rows.get(id), ...d }); return rows.get(id); },
      delete: async (id: string) => { rows.delete(id); },
      getList: async (params: any) => { const data = [...rows.values()].filter((r) => !params.filter || (params.filter.operator === 'eq' ? r.key === params.filter.value : r.key.startsWith(params.filter.value))); return { data, total: data.length }; },
    };
    await providerLayerStore(p, { idField: 'key' }).save({ a: 1 });
    await providerSecretBackend(p, { idField: 'key' }).set('openai', 'sk');
    expect([...rows.keys()].sort()).toEqual(['secret:openai', 'user']);
    expect(await providerSecretBackend(p, { idField: 'key' }).list()).toEqual(['openai']);
  });
  it('the secret backend never surfaces a storage error carrying plaintext', async () => {
    const p: any = { ...mapProvider<any>(), getOne: async () => { throw Object.assign(new Error('corrupt: {"value":"sk-raw"}'), { raw: 'sk-raw' }); }, getList: async () => { throw new Error('sk-raw'); } };
    const err = await providerSecretBackend(p).get('k').catch((e) => e);
    expect(String(err)).not.toContain('sk-raw');
    expect(JSON.stringify(err)).not.toContain('sk-raw');
  });
  it('loads a legacy plain-layer record and reports failed reads', async () => {
    const p = mapProvider<any>();
    p.rows.set('user', { id: 'user', layer: { size: 9 }, savedAt: 0 });
    expect((await providerLayerStore(p).load()).size).toBe(9);
    const broken = mapProvider<any>({ failReads: true });
    broken.rows.set('user', { id: 'user', layer: { values: {}, unset: [] }, savedAt: 0 });
    await expect(providerLayerStore(broken).load()).rejects.toThrow(/503/);
    await expect(providerLayerStore(mapProvider<any>({ failReads: true })).load()).resolves.toEqual({});
  });
  it('watches the provider when it can', async () => {
    const p = mapProvider<any>();
    const store = providerLayerStore(p);
    expect(store.getCapabilities().watchable).toBe(true);
    const seen: unknown[] = [];
    store.subscribe!((l) => seen.push(l));
    p.emit({ type: 'updated', id: 'user', item: { id: 'user', layer: { values: { a: 1 }, unset: [] } } });
    p.emit({ type: 'updated', id: 'other', item: { id: 'other', layer: { values: { b: 1 }, unset: [] } } });
    p.emit({ type: 'deleted', id: 'user' });
    expect(seen).toEqual([{ a: 1 }, {}]);
  });
});

describe('providerSecretBackend (#38)', () => {
  it('stores, masks, reveals, lists and forgets', async () => {
    const p = mapProvider<any>();
    const s = providerSecretBackend(p);
    expect(await s.has('openai')).toBe(false);
    const ref = await s.set('openai', 'sk-abc');
    expect(JSON.stringify(ref)).not.toContain('sk-abc');
    expect((await s.get('openai')).isSet).toBe(true);
    expect(await s.reveal('openai')).toBe('sk-abc');
    await s.set('anthropic', 'sk-def');
    expect((await s.list()).sort()).toEqual(['anthropic', 'openai']);
    await s.delete('openai');
    expect(await s.has('openai')).toBe(false);
    await s.delete('openai'); // idempotent
    expect(await s.list()).toEqual(['anthropic']);
  });
  it('namespaces records so apps can share a provider', async () => {
    const p = mapProvider<any>();
    await providerSecretBackend(p, { namespace: 'a:' }).set('k', 'v1');
    expect(await providerSecretBackend(p, { namespace: 'b:' }).list()).toEqual([]);
  });
});
