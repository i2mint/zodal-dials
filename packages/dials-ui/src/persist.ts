/**
 * `persist(settings, layerStore)`: the load-then-save-on-change loop every host writes (#35).
 *
 * - Loads the store's layer into the settings store (edits made while it loads are kept, on top),
 *   and marks it saved. A failed load goes to `onError` and saving still works.
 * - Saves the editable layer when it becomes dirty. Saves are coalesced (one in flight; the next
 *   writes the latest layer), and the layer is marked saved only once a save of exactly that layer
 *   has succeeded, so a failed save leaves it dirty (shown as unsaved; the next change retries).
 * - With a watchable layer store (another tab, a server push), external changes are applied; the
 *   echo of this store's own save is recognized and ignored, so it never undoes a later edit.
 */

import type { Layer, LayerStore } from '@zodal/dials-core';
import type { SettingsStore } from './store.js';

export interface PersistOptions {
  /** Called when a load or save fails. Default: `console.error` (with no layer contents). */
  onError?: (error: unknown) => void;
}

export interface Persistence {
  /** Resolves once the initial load is applied (or has failed and been reported). */
  ready: Promise<void>;
  /** Resolves when no save is in flight or pending. */
  flush(): Promise<void>;
  /** Stop saving and watching. */
  stop(): void;
}

function sameLayer(a: Layer, b: Layer): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => k in b && (Object.is(a[k], b[k]) || JSON.stringify(a[k]) === JSON.stringify(b[k])));
}

/** Keep a settings store's editable layer in a writable `LayerStore`. */
export function persist(
  settings: Pick<SettingsStore, 'getState' | 'subscribe' | 'setLayer' | 'markSaved'>,
  layers: LayerStore & { save(layer: Layer): Promise<void> },
  options: PersistOptions = {},
): Persistence {
  const { onError = (e: unknown) => console.error('persist: failed', e instanceof Error ? e.message : e) } = options;
  let stopped = false;
  let loaded = false;
  let applying = false;
  let editedDuringLoad = false;
  /**
   * Layers this store recently saved (or loaded). A watchable store echoes them back, possibly
   * before the save resolves, and possibly without the keys it strips (secrets): an incoming
   * layer whose every key matches one of these is our own echo and is ignored.
   */
  const own: Layer[] = [];
  const remember = (layer: Layer) => {
    own.push(layer);
    if (own.length > 8) own.shift();
  };
  const isOwnEcho = (incoming: Layer) =>
    own.some((mine) => Object.keys(incoming).every((k) => k in mine && sameLayer({ [k]: incoming[k] }, { [k]: mine[k] })));
  let saving: Promise<void> | undefined;
  let again = false;
  const unsubs: (() => void)[] = [];

  const apply = (layer: Layer) => {
    applying = true;
    try {
      settings.setLayer(layer);
      settings.markSaved();
    } finally {
      applying = false;
    }
  };

  const saveLatest = (): Promise<void> => {
    if (saving) {
      again = true;
      return saving;
    }
    saving = (async () => {
      do {
        again = false;
        const snapshot = settings.getState().layer;
        remember(snapshot);
        try {
          await layers.save(snapshot);
          // Only a save of exactly the current layer makes it "saved".
          if (!stopped && sameLayer(settings.getState().layer, snapshot)) {
            applying = true;
            try {
              settings.markSaved();
            } finally {
              applying = false;
            }
          }
        } catch (err) {
          onError(err);
          break; // left dirty; the next change tries again
        }
      } while (again && !stopped);
    })().finally(() => {
      saving = undefined;
    });
    return saving;
  };

  unsubs.push(
    settings.subscribe(() => {
      if (applying || stopped) return;
      if (!loaded) {
        editedDuringLoad = true;
        return;
      }
      if (settings.getState().dirty.length) void saveLatest();
    }),
  );

  const ready = (async () => {
    let base: Layer = {};
    try {
      base = await layers.load();
    } catch (err) {
      onError(err);
    }
    if (stopped) return;
    remember(base);
    const edits = settings.getState().layer;
    loaded = true;
    if (editedDuringLoad) {
      // Keep what the user did while the layer loaded, on top of what was stored.
      applying = true;
      try {
        settings.setLayer({ ...base, ...edits });
      } finally {
        applying = false;
      }
      void saveLatest();
    } else {
      apply(base);
    }
    if (layers.subscribe) {
      unsubs.push(
        layers.subscribe((layer) => {
          if (stopped) return;
          if (isOwnEcho(layer)) return; // our own save, echoed back
          remember(layer);
          apply(layer);
        }),
      );
    }
  })();

  return {
    ready,
    flush: async () => {
      await ready;
      while (saving) await saving;
    },
    stop() {
      stopped = true;
      for (const u of unsubs.splice(0)) u();
    },
  };
}
