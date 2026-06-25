/**
 * @zodal/dials-ui — the headless settings UI layer for zodal-dials.
 *
 * Emits plain configuration objects (never DOM/React) that concrete renderers turn into a panel:
 * - `toSettingsForm(dials, options)` — ordered field configs + facet-projected groups.
 * - `toFieldStates(fields, result)` — value/provenance/managed/dirty state per field.
 * - widget classification (`widgetKindFor`) + the settings renderer registry
 *   (`createSettingsRendererRegistry`, PRIORITY bands, composable testers incl. the terminal
 *   `alwaysMatch` rawJson fallback).
 * - faceted organization (`toGroups`) and search (`toIndexableSettings`, `createSubstringSearchProvider`,
 *   `parseScopedQuery`, `applyScopedFilters`, `searchSettings`).
 * - change-lifecycle helpers (`dirtyKeys`, `resetToDefault`, `unsetKey`, `recordLayerChange`, undo).
 */

export type {
  WidgetKind,
  SettingFieldConfig,
  SettingFieldState,
  SettingsGroup,
  SettingsForm,
  IndexableSetting,
  SearchProvider,
} from './types.js';

export { widgetKindFor } from './widgets.js';
export type { WidgetInput } from './widgets.js';

export {
  createSettingsRendererRegistry,
  secretRoleIs,
  isStructuredValue,
  isBoolean,
  isEnum,
  isNumber,
  isString,
  alwaysMatch,
  // re-exported zodal renderer-registry primitives
  createRendererRegistry,
  PRIORITY,
  zodTypeIs,
  fieldNameMatches,
  metaMatches,
  hasRefinement,
  editWidgetIs,
  and,
  or,
} from './registry.js';
export type { RendererRegistry, RendererTester } from './registry.js';

export { describeSettings } from './introspect.js';
export type { DescribeOptions } from './introspect.js';

export { toGroups } from './facets.js';
export type { FacetDef, GroupingOptions } from './facets.js';

export {
  toIndexableSettings,
  createSubstringSearchProvider,
  parseScopedQuery,
  applyScopedFilters,
  searchSettings,
} from './search.js';
export type { IndexField, SubstringSearchOptions, ScopeFilter, ParsedQuery, FilterContext } from './search.js';

export { dirtyKeys, isDirty, resetToDefault, unsetKey, recordLayerChange, applyLayerPatch } from './lifecycle.js';
export type { ChangeRecord } from './lifecycle.js';

export { toSettingsForm, toFieldStates } from './form.js';
export type { ToSettingsFormOptions } from './form.js';

export { createSettingsStore } from './store.js';
export type { SettingsStore, SettingsState, CreateSettingsStoreOptions } from './store.js';
