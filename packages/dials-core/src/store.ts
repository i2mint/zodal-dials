/**
 * The `LayerStore` contract — how a scope sources (and optionally persists) its layer. The cascade
 * resolves an ordered stack of `{ scope, layer }`; a `LayerStore` is what produces one scope's layer
 * from a backing source (env vars, a JSONC/TOML/YAML file, a remote store, a secret backend, …).
 * Concrete adapters live in satellite `@zodal/dials-store-*` packages; this is just the interface +
 * an honest capability report. Pure types — no runtime/Node dependency.
 */

import type { Layer } from './model.js';

/** What a store can do, reported honestly (mirrors the spirit of zodal `ProviderCapabilities`). */
export interface LayerStoreCapabilities {
  /** Can produce a layer via `load()`. */
  readable: boolean;
  /** Can persist a layer via `save()`. */
  writable: boolean;
  /** Can notify on external change via `subscribe()`. */
  watchable: boolean;
}

/** A source/sink for a single scope's layer. */
export interface LayerStore {
  /** The scope id this store provides a layer for (e.g. 'env', 'user', 'workspace'). */
  readonly scope: string;
  /** Honest capability report. */
  getCapabilities(): LayerStoreCapabilities;
  /** Load the current layer from the backing source. */
  load(): Promise<Layer>;
  /** Persist a layer to the backing source (present only when `writable`). */
  save?(layer: Layer): Promise<void>;
  /** Subscribe to external changes (present only when `watchable`); returns an unsubscribe function. */
  subscribe?(onChange: (layer: Layer) => void): () => void;
}
