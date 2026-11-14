/**
 * `persist(settings, layerStore)`: the load-then-save-on-change loop every host writes (#35).
 *
 * Loads the store's layer into the settings store once (and marks it saved), then saves the
 * editable layer whenever it becomes dirty, and marks it saved again. With a watchable layer store
 * (another tab, a server push), external changes are loaded too.
 */

import type { Layer, LayerStore } from '@zodal/dials-core';
import type { SettingsStore } from './store.js';

export interface PersistOptions {
  /** Called when a save fails. Each save writes the whole layer, so the next change saves it again. Default: `console.error`. */
  onError?: (error: unknown) => void;
}

export interface Persistence {
  /** Resolves once the initial load is applied. */
  ready: Promise<void>;
  /** Resolves when every save started so far has finished. */
  flush(): Promise<void>;
  /** Stop saving and watching. */
  stop(): void;
}

/** Keep a settings store's editable layer in a writable `LayerStore`. */
export function persist(
  settings: Pick<SettingsStore, 'getState' | 'subscribe' | 'setLayer' | 'markSaved'>,
  layers: LayerStore & { save(layer: Layer): Promise<void> },
  options: PersistOptions = {},
): Persistence {
  const { onError = (e: unknown) => console.error('persist: save failed', e) } = options;
  let stopped = false;
  let applying = false;
  let pending: Promise<void> = Promise.resolve();
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

  const ready = layers.load().then((layer) => {
    if (stopped) return;
    apply(layer);
    unsubs.push(
      settings.subscribe(() => {
        if (applying || stopped) return;
        const state = settings.getState();
        if (!state.dirty.length) return;
        const snapshot = state.layer;
        settings.markSaved();
        pending = pending
          .then(() => layers.save(snapshot))
          .catch((err) => {
            onError(err);
          });
      }),
    );
    if (layers.subscribe) unsubs.push(layers.subscribe((layer) => !stopped && apply(layer)));
  });

  return {
    ready,
    flush: () => ready.then(() => pending),
    stop() {
      stopped = true;
      for (const u of unsubs.splice(0)) u();
    },
  };
}
