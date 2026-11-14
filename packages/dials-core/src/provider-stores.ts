/**
 * Persist dials over any zodal `DataProvider`: a scope's layer (`providerLayerStore`, #35) and a
 * device-local secret backend (`providerSecretBackend`, #38).
 *
 * A browser host gets persistence without writing a backend: pass `@zodal/store-localstorage`
 * today, `@zodal/store-http` for a per-user server layer, IndexedDB later. Only the structural
 * subset of `DataProvider` used here is required ({@link RecordProvider}), so this module adds no
 * dependency on `@zodal/store`.
 *
 * Secrets never reach a layer record: `providerLayerStore` strips every key `sensitivityFor`
 * calls secret, on save and on load (without `sensitivityFor` it fails closed: any key whose name,
 * or whose value's nested field names, look secret). Keep secrets in a `SecretBackend` instead.
 * `@zodal/store-localstorage` has no `subscribe`, so a layer store over it is not watchable
 * (another tab's changes are not seen until the next load).
 */

import type { Layer, SecretRef, Sensitivity, SettingKey } from './model.js';
import { deserializeLayer, serializeLayer } from './patch.js';
import type { SerializedLayer } from './patch.js';
import { makeSecretRef } from './secrets.js';
import type { SecretBackend } from './secrets.js';
import type { LayerStore } from './store.js';
import { secretByName } from './names.js';
import { isPlainObject } from './util.js';

/** The part of a zodal `DataProvider<T>` these stores use (any `DataProvider` satisfies it). */
export interface RecordProvider<T> {
  getOne(id: string): Promise<T>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
  getList(params: {
    filter?: { field: string; operator: 'eq' | 'startsWith'; value: unknown };
    pagination?: { page: number; pageSize: number };
  }): Promise<{ data: T[]; total: number }>;
  upsert?(data: T): Promise<T>;
  subscribe?(callback: (event: { type: 'created' | 'updated'; item: T } | { type: 'updated'; id: string; item: T } | { type: 'deleted'; id: string }) => void): () => void;
}

/** One scope's layer, as stored. */
export interface StoredLayer {
  id: string;
  /** The layer, losslessly serialized (`UNSET` keys listed apart from values). */
  layer: SerializedLayer;
  savedAt: number;
}

export interface ProviderLayerStoreOptions {
  /** The scope this store provides, and the record id. Default: `'user'`. */
  scope?: string;
  /** The provider's id field. Default: `'id'`. */
  idField?: string;
  /**
   * Which keys are secret (never saved, and dropped on load). Pass `dials.sensitivityFor` so keys
   * the schema marks secret are caught. Without it the store fails closed: a key is dropped when
   * its name, or the name of any field nested in its value, looks secret.
   */
  sensitivityFor?: (key: SettingKey) => Sensitivity;
  /** Clock for `savedAt`. Default: `Date.now`. */
  now?: () => number;
}

/** Whether a value holds a field whose name looks secret, at any depth. */
function holdsSecretName(value: unknown, depth = 0): boolean {
  if (depth > 8 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((v) => holdsSecretName(v, depth + 1));
  return Object.entries(value).some(([k, v]) => secretByName(k) || holdsSecretName(v, depth + 1));
}

/** Drop secret keys from a layer (fail-closed when no `sensitivityFor` is given). */
function stripSecrets(layer: Layer, sensitivityFor: ((key: SettingKey) => Sensitivity) | undefined): Layer {
  const out: Layer = {};
  for (const [k, v] of Object.entries(layer)) {
    const secret = sensitivityFor ? sensitivityFor(k) === 'secret' : secretByName(k) || holdsSecretName(v);
    if (!secret) out[k] = v;
  }
  return out;
}

/** Read one record, `undefined` when it does not exist (a failed read rethrows). */
async function getOrUndefined<T>(provider: RecordProvider<T>, idField: string, id: string): Promise<T | undefined> {
  try {
    return await provider.getOne(id);
  } catch (err) {
    // getOne rejects for a missing record and for a failed read alike: ask for that id only.
    let total: number;
    try {
      total = (await provider.getList({ filter: { field: idField, operator: 'eq', value: id } })).total;
    } catch {
      throw err;
    }
    if (total > 0) throw err;
    return undefined;
  }
}

async function put<T extends object>(provider: RecordProvider<T>, idField: string, id: string, record: T): Promise<void> {
  if (provider.upsert) {
    await provider.upsert(record);
    return;
  }
  const existing = await getOrUndefined(provider, idField, id);
  if (existing) await provider.update(id, record);
  else await provider.create(record);
}

function readLayer(stored: StoredLayer | undefined): Layer {
  const raw = stored?.layer as unknown;
  if (!isPlainObject(raw)) return {};
  const serialized = isPlainObject(raw.values) && Array.isArray(raw.unset);
  // A record written as a plain layer (the pre-serialization shape hosts used) still loads.
  return serialized ? deserializeLayer(raw as unknown as SerializedLayer) : { ...(raw as Layer) };
}

/**
 * A `LayerStore` keeping one scope's layer as one record (id = scope) in a `DataProvider`.
 * Watchable when the provider has `subscribe` (another tab, a server push).
 */
export function providerLayerStore(
  provider: RecordProvider<StoredLayer>,
  options: ProviderLayerStoreOptions = {},
): LayerStore & { save(layer: Layer): Promise<void> } {
  const { scope = 'user', idField = 'id', sensitivityFor, now = Date.now } = options;
  const load = (stored: StoredLayer | undefined) => stripSecrets(readLayer(stored), sensitivityFor);
  const store: LayerStore & { save(layer: Layer): Promise<void> } = {
    scope,
    getCapabilities: () => ({ readable: true, writable: true, watchable: typeof provider.subscribe === 'function' }),
    async load() {
      return load(await getOrUndefined(provider, idField, scope));
    },
    async save(layer) {
      const serialized = serializeLayer(stripSecrets(layer, sensitivityFor));
      await put(provider, idField, scope, { [idField]: scope, id: scope, layer: serialized, savedAt: now() } as StoredLayer);
    },
  };
  if (provider.subscribe) {
    const subscribe = provider.subscribe.bind(provider);
    store.subscribe = (onChange) =>
      subscribe((event) => {
        if (event.type === 'deleted') {
          if (event.id === scope) onChange({});
          return;
        }
        if ((event.item as unknown as Record<string, unknown>)?.[idField] === scope) onChange(load(event.item));
      });
  }
  return store;
}

/** One secret, as stored. */
export interface StoredSecret {
  id: string;
  value: string;
  savedAt: number;
}

export interface ProviderSecretBackendOptions {
  /** Prefix for record ids, so several apps can share one provider. Default: `'secret:'`. */
  namespace?: string;
  /** The provider's id field. Default: `'id'`. */
  idField?: string;
  now?: () => number;
}

/**
 * A `SecretBackend` over a `DataProvider` (e.g. `@zodal/store-localstorage` for a browser's
 * "bring your own key" setting). Reads return a masked `SecretRef`; the plaintext comes only from
 * `reveal`.
 *
 * What it protects against, stated plainly: secrets never enter a settings layer, a form value,
 * provenance or an export. What it does not: anyone with the unlocked device and browser profile
 * can read the stored value (encrypting it in the same storage would not change that). Use a
 * server vault behind `@zodal/store-http` when that matters.
 */
export function providerSecretBackend(
  provider: RecordProvider<StoredSecret>,
  options: ProviderSecretBackendOptions = {},
): SecretBackend {
  const { namespace = 'secret:', idField = 'id', now = Date.now } = options;
  const idOf = (key: SettingKey) => `${namespace}${key}`;
  const recordId = (r: StoredSecret) => String((r as unknown as Record<string, unknown>)[idField]);
  /**
   * Run a provider call, replacing any error with one that names only the key: a storage error
   * may carry the raw stored text (every plaintext secret in it).
   */
  const guarded = async <R>(what: string, key: SettingKey | undefined, call: () => Promise<R>): Promise<R> => {
    try {
      return await call();
    } catch {
      throw new Error(`secret backend: ${what}${key === undefined ? '' : ` \`${key}\``} failed`);
    }
  };
  const read = (key: SettingKey) => guarded('read', key, () => getOrUndefined(provider, idField, idOf(key)));
  const refOf = (key: SettingKey, stored: StoredSecret | undefined): SecretRef =>
    makeSecretRef(key, stored !== undefined && stored.value !== '');
  return {
    async has(key) {
      const s = await read(key);
      return s !== undefined && s.value !== '';
    },
    async get(key) {
      return refOf(key, await read(key));
    },
    async reveal(key) {
      return (await read(key))?.value;
    },
    async set(key, value) {
      if (typeof value !== 'string') throw new Error(`secret \`${key}\` must be a string`);
      const record = { [idField]: idOf(key), id: idOf(key), value, savedAt: now() } as StoredSecret;
      await guarded('write', key, () => put(provider, idField, idOf(key), record));
      return refOf(key, record);
    },
    async delete(key) {
      if (await read(key)) await guarded('delete', key, () => provider.delete(idOf(key)));
    },
    async list() {
      return guarded('list', undefined, async () => {
        const out: string[] = [];
        const pageSize = 200;
        for (let page = 1; ; page++) {
          const { data, total } = await provider.getList({
            filter: { field: idField, operator: 'startsWith', value: namespace },
            pagination: { page, pageSize },
          });
          for (const r of data) {
            const id = recordId(r);
            if (id.startsWith(namespace)) out.push(id.slice(namespace.length));
          }
          if (data.length < pageSize || page * pageSize >= total) break;
        }
        return out;
      });
    },
  };
}
