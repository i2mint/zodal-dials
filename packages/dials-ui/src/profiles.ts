/**
 * Named profile management — the "save / load / list named settings bundles" capability (an app may
 * call these "presets", "schemes", or — for thoremin — "instruments"). A profile is a NAME + a
 * sparse `Layer` (persisted losslessly via `serializeLayer`, so `UNSET` survives) + optional metadata.
 * Persistence is pluggable (`ProfileStorage`): an in-memory default and a `localStorage` adapter are
 * provided. To apply a profile, put its layer into the cascade scope stack (e.g.
 * `store.setScopes([{ scope: 'profile', layer }])`) or replace the editable layer.
 *
 * SECURITY: profiles are plaintext at rest. Pass `sensitivityFor` so `secret` keys are REDACTED on
 * save (never persisted) — fail-closed, mirroring the jsonc store; otherwise split secrets out first.
 * Mutations are serialized per store so concurrent saves cannot lose updates.
 */

import { deserializeLayer, redactSecretsFromLayer, serializeLayer } from '@zodal/dials-core';
import type { Layer, SerializedLayer, Sensitivity, SettingKey } from '@zodal/dials-core';

/** Lightweight profile descriptor (no layer payload) — for listing. */
export interface ProfileMeta {
  name: string;
  meta?: Record<string, unknown>;
}

/** A persisted named profile (a serialized sparse layer + metadata). */
export interface NamedProfile extends ProfileMeta {
  layer: SerializedLayer;
}

/** Pluggable persistence for the profile collection (reads/writes the whole list as JSON). */
export interface ProfileStorage {
  read(): Promise<NamedProfile[]>;
  write(profiles: NamedProfile[]): Promise<void>;
}

export interface ProfileStoreOptions {
  /** Classify a setting's sensitivity. When provided, `secret` keys are REDACTED on save. */
  sensitivityFor?: (key: SettingKey) => Sensitivity;
}

/** An in-memory `ProfileStorage` (default; tests / ephemeral use). */
export function createMemoryProfileStorage(initial: NamedProfile[] = []): ProfileStorage {
  let profiles: NamedProfile[] = initial.map((p) => ({ ...p }));
  return {
    read: () => Promise.resolve(profiles.map((p) => ({ ...p }))),
    write: (next) => {
      profiles = next.map((p) => ({ ...p }));
      return Promise.resolve();
    },
  };
}

/** A `localStorage`-backed `ProfileStorage` (browser). Throws if `localStorage` is unavailable. A
 *  corrupt stored value degrades to an empty list rather than throwing on every read. */
export function createLocalStorageProfileStorage(storageKey = 'zodal-dials.profiles'): ProfileStorage {
  const ls = (globalThis as { localStorage?: Storage }).localStorage;
  if (!ls) throw new Error('createLocalStorageProfileStorage: localStorage is not available');
  return {
    read: () => {
      const raw = ls.getItem(storageKey);
      if (!raw) return Promise.resolve([]);
      try {
        const parsed = JSON.parse(raw);
        return Promise.resolve(Array.isArray(parsed) ? (parsed as NamedProfile[]) : []);
      } catch {
        return Promise.resolve([]); // corrupt blob -> "no profiles" rather than a hard break
      }
    },
    write: (profiles) => {
      ls.setItem(storageKey, JSON.stringify(profiles));
      return Promise.resolve();
    },
  };
}

export interface ProfileStore {
  /** All saved profiles (name + metadata only). */
  list(): Promise<ProfileMeta[]>;
  /** Save (or overwrite) a profile from a sparse layer. Rejects an empty/whitespace name. */
  save(name: string, layer: Layer, meta?: Record<string, unknown>): Promise<void>;
  /** Load a profile's layer, or undefined if absent. */
  load(name: string): Promise<Layer | undefined>;
  /** Remove a profile. */
  remove(name: string): Promise<void>;
  /** Rename a profile (no-op if `from` is absent or equals `to`; throws if `to` already exists). */
  rename(from: string, to: string): Promise<void>;
  /** Whether a profile exists. */
  has(name: string): Promise<boolean>;
}

/** Create a profile store over a pluggable storage backend. */
export function createProfileStore(storage: ProfileStorage, options: ProfileStoreOptions = {}): ProfileStore {
  const findIndex = (profiles: NamedProfile[], name: string): number => profiles.findIndex((p) => p.name === name);

  // Serialize all read-modify-write mutations so concurrent saves cannot lose updates.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(run: () => Promise<T>): Promise<T> => {
    const result = queue.then(run, run);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    async list(): Promise<ProfileMeta[]> {
      const profiles = await storage.read();
      return profiles.map(({ name, meta }) => ({ name, ...(meta ? { meta } : {}) }));
    },

    save(name, layer, meta): Promise<void> {
      const trimmed = name.trim();
      if (!trimmed) return Promise.reject(new Error('profile name cannot be empty'));
      return enqueue(async () => {
        const profiles = await storage.read();
        let serialized = serializeLayer(layer);
        if (options.sensitivityFor) serialized = redactSecretsFromLayer(serialized, options.sensitivityFor);
        const entry: NamedProfile = { name: trimmed, layer: serialized, ...(meta ? { meta } : {}) };
        const index = findIndex(profiles, trimmed);
        if (index >= 0) profiles[index] = entry;
        else profiles.push(entry);
        await storage.write(profiles);
      });
    },

    async load(name): Promise<Layer | undefined> {
      const profiles = await storage.read();
      const found = profiles[findIndex(profiles, name)];
      return found ? deserializeLayer(found.layer) : undefined;
    },

    remove(name): Promise<void> {
      return enqueue(async () => {
        const profiles = await storage.read();
        await storage.write(profiles.filter((p) => p.name !== name));
      });
    },

    rename(from, to): Promise<void> {
      if (from === to) return Promise.resolve();
      return enqueue(async () => {
        const profiles = await storage.read();
        if (findIndex(profiles, to) >= 0) throw new Error(`profile "${to}" already exists`);
        const index = findIndex(profiles, from);
        if (index < 0) return;
        profiles[index] = { ...profiles[index], name: to };
        await storage.write(profiles);
      });
    },

    async has(name): Promise<boolean> {
      const profiles = await storage.read();
      return findIndex(profiles, name) >= 0;
    },
  };
}
