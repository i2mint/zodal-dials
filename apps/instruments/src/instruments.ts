/**
 * The "instruments" store — named saved settings bundles, persisted to localStorage via dials-ui's
 * `createProfileStore`. An instrument is a profile: a name + the sparse editable layer. Falls back to
 * in-memory storage where localStorage is unavailable (SSR / tests), so importing this never throws.
 */

import { createProfileStore, createLocalStorageProfileStorage, createMemoryProfileStorage } from '@zodal/dials-ui';
import type { ProfileStorage } from '@zodal/dials-ui';

function instrumentStorage(): ProfileStorage {
  try {
    return createLocalStorageProfileStorage('thoremin.instruments');
  } catch {
    return createMemoryProfileStorage();
  }
}

export const instruments = createProfileStore(instrumentStorage());
