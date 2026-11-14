/**
 * `useSettings(store, dials)`: the React glue every consumer of `createSettingsStore` writes.
 *
 * Subscribes to the store with `useSyncExternalStore` (so concurrent rendering never tears), and
 * memoizes the headless form (`toSettingsForm`) and the per-field states (`toFieldStates`), which
 * are what `SettingsPanel` takes:
 *
 * ```tsx
 * const { state, form, states } = useSettings(store, dials);
 * return <SettingsPanel form={form} states={states} onChange={store.set} onReset={store.reset} />;
 * ```
 */

import { useMemo, useSyncExternalStore } from 'react';
import type { SettingKey } from '@zodal/dials-core';
import { toFieldStates, toSettingsForm } from '@zodal/dials-ui';
import type { SettingFieldState, SettingsForm, SettingsState, SettingsStore, ToSettingsFormOptions } from '@zodal/dials-ui';

export interface UseSettingsResult {
  /** The store's current state (effective values, provenance, layer, dirty keys, validation). */
  state: SettingsState;
  /** The headless form: ordered field configs and facet groups. */
  form: SettingsForm;
  /** Value-dependent state per field (value, provenance source, managed, dirty). */
  states: Record<SettingKey, SettingFieldState>;
}

/**
 * Subscribe to a settings store and derive what a panel renders.
 *
 * `formOptions` are passed to `toSettingsForm`; keep them stable (a constant or `useMemo`), since
 * the form is rebuilt when they change. Groups computed from values (`computedGroups`) are rebuilt
 * with each state change; otherwise the form is built once per `dials`.
 */
export function useSettings(
  store: Pick<SettingsStore, 'subscribe' | 'getState'>,
  dials: Parameters<typeof toSettingsForm>[0],
  formOptions?: Omit<ToSettingsFormOptions, 'result'>,
): UseSettingsResult {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const dependsOnValues = Boolean(formOptions?.computedGroups);
  const form = useMemo(
    () => toSettingsForm(dials, dependsOnValues ? { ...formOptions, result: state } : { ...formOptions }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dials, formOptions, dependsOnValues ? state : undefined],
  );
  const states = useMemo(() => toFieldStates(form.fields, state, state.dirty), [form, state]);
  return { state, form, states };
}
