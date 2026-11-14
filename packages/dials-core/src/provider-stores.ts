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
 * calls secret (by default, the same name heuristic `defineDials` applies to ad-hoc keys) before
 * saving. Keep them in a `SecretBackend` instead.
 */

import type { Layer, SecretRef, Sensitivity, SettingKey } from './model.js';
import { deserializeLayer, serializeLayer } from './patch.js';
import type { SerializedLayer } from './patch.js';
import { makeSecretRef, redactSecretsFromLayer } from './secrets.js';
import type { SecretBackend } from './secrets.js';
import type { LayerStore } from './store.js';
import { secretByName } from './names.js';

/** The part of a zodal `DataProvider<T>` these stores use (any `DataProvider` satisfies it). */
export interface RecordProvider<T> {
  getOne(id: string): Promise<T>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
  getList(params: Record<string, never> | object): Promise<{ data: T[]; total: number }>;
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
  /**
   * Which keys are secret (stripped before saving). Default: the name heuristic. Pass
   * `dials.sensitivityFor` to also strip keys the schema marks secret.
   */
  sensitivityFor?: (key: SettingKey) => Sensitivity;
  /** Clock for `savedAt`. Default: `Date.now`. */
  now?: () => number;
}

const byName = (key: SettingKey): Sensitivity => (secretByName(key) ? 'secret' : 'public');

async function getOrUndefined<T>(provider: RecordProvider<T>, id: string): Promise<T | undefined> {
  try {
    return await provider.getOne(id);
  } catch {
    // getOne rejects for a missing record, but also for a failed read: tell them apart.
    const { data } = await provider.getList({});
    if (data.some((r) => (r as { id?: unknown }).id === id)) throw new Error(`could not read record \`${id}\``);
    return undefined;
  }
}

async function put<T extends { id: string }>(provider: RecordProvider<T>, record: T): Promise<void> {
  if (provider.upsert) {
    await provider.upsert(record);
    return;
  }
  const existing = await getOrUndefined(provider, record.id);
  if (existing) await provider.update(record.id, record);
  else await provider.create(record);
}

function readLayer(stored: StoredLayer | undefined): Layer {
  const raw = stored?.layer as unknown;
  if (!raw || typeof raw !== 'object') return {};
  // A record written as a plain layer (the pre-serialization shape hosts used) still loads.
  if (!('values' in (raw as object)) && !('unset' in (raw as object))) return { ...(raw as Layer) };
  return deserializeLayer(raw as SerializedLayer);
}

/**
 * A `LayerStore` keeping one scope's layer as one record (id = scope) in a `DataProvider`.
 * Watchable when the provider has `subscribe` (another tab, a server push).
 */
export function providerLayerStore(
  provider: RecordProvider<StoredLayer>,
  options: ProviderLayerStoreOptions = {},
): LayerStore & { save(layer: Layer): Promise<void> } {
  const { scope = 'user', sensitivityFor = byName, now = Date.now } = options;
  const store: LayerStore & { save(layer: Layer): Promise<void> } = {
    scope,
    getCapabilities: () => ({ readable: true, writable: true, watchable: typeof provider.subscribe === 'function' }),
    async load() {
      return readLayer(await getOrUndefined(provider, scope));
    },
    async save(layer) {
      const serialized = redactSecretsFromLayer(serializeLayer(layer), sensitivityFor);
      await put(provider, { id: scope, layer: serialized, savedAt: now() });
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
        if (event.item?.id === scope) onChange(readLayer(event.item));
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
  const { namespace = 'secret:', now = Date.now } = options;
  const idOf = (key: SettingKey) => `${namespace}${key}`;
  const read = (key: SettingKey) => getOrUndefined(provider, idOf(key));
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
      const record = { id: idOf(key), value, savedAt: now() };
      await put(provider, record);
      return refOf(key, record);
    },
    async delete(key) {
      if (await read(key)) await provider.delete(idOf(key));
    },
    async list() {
      const { data } = await provider.getList({});
      return data
        .map((r) => r.id)
        .filter((id) => id.startsWith(namespace))
        .map((id) => id.slice(namespace.length));
    },
  };
}
