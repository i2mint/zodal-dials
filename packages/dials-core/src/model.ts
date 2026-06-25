/**
 * Core model types for zodal-dials: settings, layers, scopes, the cascade result, and provenance.
 *
 * A SETTING is a typed named parameter identified by a stable dotted-path KEY. A LAYER is a partial
 * map of key -> value (or the UNSET sentinel) from one source. A SCOPE names an ordered source of
 * layers; the CASCADE merges an ordered stack of scoped layers into an EFFECTIVE value per key,
 * paired with PROVENANCE (which scope won, what it shadowed, whether it is policy-managed).
 *
 * UNSET is the explicit deletion/reset sentinel — never raw `null` — so a layer can declare "I do
 * not contribute this key" (re-exposing a lower scope) without colliding with a legitimate `null`
 * value. See `docs/zodal-dials-concept.md` and `docs/dev-plan.md` §4.
 */

/** A setting's stable, serialization-independent identity (a dotted path, e.g. "editor.fontSize"). */
export type SettingKey = string;

/** A setting value: a scalar, an array, or an irreducible nested object. */
export type SettingValue = unknown;

/**
 * The deletion/reset sentinel. In a layer, `UNSET` marks a key as explicitly not contributed by
 * that scope, re-exposing the value from a lower-precedence scope (or its absence). Distinct from
 * `null`/`undefined`, which are legitimate setting values. Uses a registered symbol so it survives
 * realm boundaries and bundler duplication.
 */
export const UNSET: unique symbol = Symbol.for('@zodal/dials.UNSET');
export type Unset = typeof UNSET;

/** Type guard for the UNSET sentinel. */
export function isUnset(v: unknown): v is Unset {
  return v === UNSET;
}

/** A partial/sparse set of setting values from one source — the unit that gets merged. */
export type Layer = Record<SettingKey, SettingValue | Unset>;

/**
 * A named layer in the cascade. Scopes are DATA, not constants: the resolver is handed an ordered
 * stack (lowest precedence first) and never hardcodes the ladder. `managed: true` elevates a layer
 * into the policy band — it wins over every non-managed layer regardless of position and marks the
 * resulting value as non-overridable (the UI should lock the control).
 */
export interface ScopedLayer {
  /** The scope id this layer comes from (e.g. "default", "preset", "profile", "user", "policy"). */
  scope: string;
  /** The (sparse) layer of values. */
  layer: Layer;
  /** Policy/managed band: wins over all non-managed layers and marks the value non-overridable. */
  managed?: boolean;
}

/** Per-key merge strategy. Type-directed by default; `.meta({ mergeStrategy })`-overridable. */
export type MergeStrategy = 'replace' | 'deep-merge' | 'append';

/** A lower layer that set a key but did not win (or that explicitly UNSET it). */
export interface ShadowedLayer {
  scope: string;
  /** The shadowed value, or 'UNSET' if that layer reset the key. */
  value: SettingValue | 'UNSET';
  managed: boolean;
}

/**
 * The cascade's first-class explanation of an effective value: which scope won, how the value was
 * produced, what it shadowed, whether it is policy-managed, and (for deep-merged objects) which
 * scopes contributed. This is the deliberate differentiator — provenance is never a debug
 * afterthought.
 */
export interface KeyProvenance {
  key: SettingKey;
  /** The scope id that supplied the effective value. */
  winningScope: string;
  /** The resolved value (also present in `effective`). */
  value: SettingValue;
  /** True when the winning scope is in the managed/policy band (control should be locked). */
  managed: boolean;
  /** How the value was produced from the contributing layers. */
  mergeStrategy: MergeStrategy;
  /** Other layers that set this key, highest precedence first (each value or 'UNSET'). */
  shadowed: ShadowedLayer[];
  /** For deep-merged object values: the scope ids whose objects were merged, low -> high. */
  mergedFrom?: string[];
}

/** A key set to differing values by more than one layer (surfaced for the UI). */
export interface Conflict {
  key: SettingKey;
  /** Contributing scopes (highest precedence first) with their values. */
  contributors: Array<{ scope: string; value: SettingValue | 'UNSET'; managed: boolean }>;
  /** True when a managed/policy scope overrode a differing non-managed value. */
  overriddenByPolicy: boolean;
}

/** The complete result of resolving a cascade. */
export interface EffectiveResult {
  /** The resolved value per key (keys that resolve to UNSET/absent are omitted). */
  effective: Record<SettingKey, SettingValue>;
  /** Provenance per resolved key. */
  provenance: Record<SettingKey, KeyProvenance>;
  /** Keys set by multiple layers to differing values (informational). */
  conflicts: Conflict[];
}

/** Sensitivity classification of a setting. */
export type Sensitivity = 'public' | 'sensitive' | 'secret';

/**
 * A masked reference to a secret value — mirrors zodal's `ContentRef`. Reads of a secret setting
 * return a `SecretRef`, never plaintext; the plaintext is fetched via an explicit reveal call.
 */
export interface SecretRef {
  readonly _tag: 'SecretRef';
  /** The setting key this secret belongs to. */
  key: SettingKey;
  /** Whether a value is set (without revealing it). */
  isSet: boolean;
  /** A display mask, e.g. "•••• (set)" or "not set". */
  masked: string;
}

/** Type guard for SecretRef. */
export function isSecretRef(v: unknown): v is SecretRef {
  return typeof v === 'object' && v !== null && (v as { _tag?: unknown })._tag === 'SecretRef';
}
