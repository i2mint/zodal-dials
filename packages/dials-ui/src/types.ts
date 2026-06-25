/**
 * Headless output types for the settings UI layer. These are plain configuration objects (never
 * DOM/React) that any concrete renderer (vanilla, shadcn, …) turns into a settings panel.
 */

import type { MergeStrategy, Sensitivity, SettingKey } from '@zodal/dials-core';

/** The widget kind chosen for a setting's value type. A `secret` setting always maps to `secret`;
 *  an irreducible nested value maps to `object`/`array`, with `rawJson` as the terminal fallback. */
export type WidgetKind =
  | 'switch'
  | 'select'
  | 'radio'
  | 'slider'
  | 'number'
  | 'text'
  | 'textarea'
  | 'secret'
  | 'color'
  | 'date'
  | 'path'
  | 'object'
  | 'array'
  | 'rawJson';

/** A headless field configuration for one setting (the static, value-independent shape). */
export interface SettingFieldConfig {
  key: SettingKey;
  label: string;
  description?: string;
  widget: WidgetKind;
  /** The setting's base Zod type ('string'/'number'/'boolean'/'enum'/'object'/'array'/…). */
  zodType: string;
  required: boolean;
  readOnly: boolean;
  hidden: boolean;
  sensitivity: Sensitivity;
  mergeStrategy: MergeStrategy;
  defaultValue?: unknown;
  enumValues?: string[];
  bounds?: { min?: number; max?: number };
  /** Facet ids this setting belongs to (multi-membership). */
  facets: string[];
  /** Advanced-disclosure flag (membership in the `advanced` facet). */
  advanced: boolean;
  order?: number;
  /** The value is an irreducible nested object/array (use a sub-editor or the rawJson fallback). */
  isStructured: boolean;
}

/** The value-dependent state of a setting field, derived from cascade resolution. */
export interface SettingFieldState {
  /** The current effective value (a masked `SecretRef` for secrets). */
  value: unknown;
  /** The winning scope (provenance). */
  source?: string;
  /** True if the effective value comes from a managed/policy scope (lock the control). */
  managed: boolean;
  /** True if another scope also set this key (shadowed). */
  shadowed: boolean;
  /** True if the active layer overrides the baseline (dirty). */
  dirty: boolean;
}

/** A group projected from a facet (or a computed/"smart" facet). The gesture (open a panel vs.
 *  expand in place) is NOT encoded here — both are driven by this one model. */
export interface SettingsGroup {
  id: string;
  title: string;
  order: number;
  settingKeys: SettingKey[];
  /** True for a computed/"smart" group (e.g. `@modified`, `@secret`) vs. a declared facet. */
  computed: boolean;
}

/** The full headless settings form: field configs + facet-projected groups. */
export interface SettingsForm {
  fields: SettingFieldConfig[];
  groups: SettingsGroup[];
}

/** The engine-agnostic, indexable projection of a setting for search providers. */
export interface IndexableSetting {
  key: SettingKey;
  title: string;
  description: string;
  enumLabels: string[];
  facets: string[];
  keywords: string[];
}

/** A pluggable search provider over the indexable surface. */
export interface SearchProvider {
  /** Return the matching setting keys for a free-text query (best match first). */
  search(query: string): SettingKey[];
}
