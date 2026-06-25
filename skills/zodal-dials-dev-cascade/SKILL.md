---
name: zodal-dials-dev-cascade
description: Use when working on the zodal-dials CORE MODEL or CASCADE ENGINE — defineDials, resolve/resolveEffective, Layer/Scope/Provenance, RFC 7386 JSON Merge Patch (internal) / RFC 6902 JSON Patch (history), the UNSET sentinel (never null), the type-directed per-key merge strategy (NixOS), hard constraints + dependent defaults (Zod superRefine, assertions/warnings, derive override-stickiness), sensitivity/SecretRef/bifurcation, deprecated/renamedTo/upcasters, field-level codecs, explain(). Triggers on "resolve the cascade", "merge layers", "provenance", "effective value", "UNSET vs null", "merge strategy", "policy band wins", "dependent default", "secret never leaks", "RFC 7386". Read BEFORE writing model/cascade code — the merge & provenance contract is easy to get wrong and expensive to change later.
metadata:
  audience: developers
---

# zodal-dials · core model + cascade (the keystone)

`@zodal/dials-core` is **BUILT and merged** — it is the contract every other layer consumes. This
skill maps the shipped public surface and the rules behind it. The two checkpoint benchmarks
(cascade + provenance round-trip, secret-never-leaks) are green; keep them green. When you touch the
model or cascade, edit the shapes here in the same change. This skill is the procedural guide; the
*why* and the surveyed alternatives live in the research (routed below).

The exported public surface lives in [`packages/dials-core/src/index.ts`](../../packages/dials-core/src/index.ts)
(the barrel). The shapes below are the real signatures from that build — keep them in sync with it.

## The rules this skill owns

1. **The cascade is the keystone.** An ordered `{ scope, layer }` stack resolves (via `resolve` /
   `defineDials(...).resolve`) to an effective value **always paired with provenance**. Every other
   layer consumes this contract.
2. **Sparse layers, not snapshots.** A layer *is* the diff — intent-preserving, composable,
   auditable. Absent keys mean "defer to a lower scope," never "set to default."
3. **RFC 7386 internally; RFC 6902 for history.** Layers serialize as JSON Merge Patch (objects
   recurse, scalars/arrays replace); the undo/audit log is a reversible JSON Patch op-list.
4. **`UNSET`, never raw `null`.** Deletion ("reset to a lower scope") uses an explicit `UNSET`
   sentinel. Overloading `null` reproduces the RFC 7386 / Helm footgun — `null` is a *value*.
5. **Type-directed per-key merge (NixOS model).** The Zod type picks the default strategy
   (object→deep-merge, array/scalar→replace), overridable via `.meta({ mergeStrategy })`.
6. **The policy band always wins** and is non-overridable locally (CSS `!important` / CFPreferences
   `Forced` analogue) — it drives control editability, not just resolution.
7. **Provenance is first-class**, never a debug afterthought. It is the deliberate differentiator;
   almost no surveyed tool surfaces it well. It reuses zodal's `explain()`.
8. **Wrap, don't rebuild.** The genuinely-new modules (`cascade.ts`, `merge.ts`, `patch.ts`,
   `constraints.ts`, `derive.ts`, `secrets.ts`) are the cascade/provenance engine and the constraint +
   dependent-default evaluator; `schema.ts` + `define-dials.ts` are configured zodal (`defineCollection`,
   `unwrapZodSchema`, `.meta()`).

## The model shapes (the contracts — from `src/model.ts`)

```ts
type SettingKey   = string;                              // a stable dotted path, e.g. "editor.fontSize"
type SettingValue = unknown;
const  UNSET: unique symbol = Symbol.for('@zodal/dials.UNSET');   // registered → survives realm/bundler dup
type Unset        = typeof UNSET;
function isUnset(v: unknown): v is Unset;
type Layer        = Record<SettingKey, SettingValue | Unset>;     // sparse; absent ≠ UNSET

interface ScopedLayer { scope: string; layer: Layer; managed?: boolean; }  // scopes are DATA; managed = policy band
type MergeStrategy = 'replace' | 'deep-merge' | 'append';
interface ShadowedLayer { scope: string; value: SettingValue | 'UNSET'; managed: boolean; }
interface KeyProvenance {
  key: SettingKey; winningScope: string; value: SettingValue; managed: boolean;
  mergeStrategy: MergeStrategy; shadowed: ShadowedLayer[]; mergedFrom?: string[];
}
interface Conflict {
  key: SettingKey;
  contributors: Array<{ scope: string; value: SettingValue | 'UNSET'; managed: boolean }>;
  overriddenByPolicy: boolean;
}
interface EffectiveResult {
  effective: Record<SettingKey, SettingValue>;           // keys resolving to UNSET/absent are omitted
  provenance: Record<SettingKey, KeyProvenance>;
  conflicts: Conflict[];                                 // NOTE: warnings live on ConstraintResult, not here
}

type Sensitivity = 'public' | 'sensitive' | 'secret';
interface SecretRef { readonly _tag: 'SecretRef'; key: SettingKey; isSet: boolean; masked: string; }  // mirrors ContentRef
function isSecretRef(v: unknown): v is SecretRef;
```

The core operation (`src/cascade.ts`):

```ts
function resolve(stack: ScopedLayer[], options?: ResolveOptions): EffectiveResult;
interface ResolveOptions { strategyFor?: (key: SettingKey) => MergeStrategy; }  // default: 'replace' for every key
// walk the stack (lowest precedence first); managed layers occupy a top band (precedence = stack.length+1+index)
// that wins over every non-managed layer. Per key: scalar/array → replace (clone the winner); object → deep-merge;
// 'append' folds. An UNSET layer ABSTAINS for that key (fall-through, re-exposing the next lower scope) — it does
// NOT sever lower contributors under deep-merge/append. provenance records winningScope, shadowed, mergeStrategy,
// and (for merges) honest `mergedFrom`; conflicts list keys set to differing values by >1 contributor.
```

There is **no** `resolveEffective`/`resolvePolicy`/`scopeOrder` API: precedence is the stack order and
`managed: true` on a `ScopedLayer`; the only knob is `strategyFor`. `explain()` is a single-key slice
exposed by `defineDials` (returns `KeyProvenance | undefined`), not a standalone export.

## The entry point: `defineDials(schema, config?)` (`src/define-dials.ts`)

A settings document is a **degenerate one-item zodal collection** — `defineDials` runs
`defineCollection(schema, config.collection)` for affordances (swallowing the error if the schema
isn't a shape `defineCollection` accepts: the cascade never depends on it), precomputes the
type-directed merge strategy and sensitivity per key, and binds the cascade. The returned
`DialsDefinition` is the façade everything downstream uses:

```ts
function defineDials<TSchema extends z.ZodObject<z.ZodRawShape>>(
  schema: TSchema, config?: DefineDialsConfig<TSchema>,
): DialsDefinition<TSchema>;

interface DefineDialsConfig {
  constraints?: ConstraintsConfig;            // hard/soft constraints over effective values
  dependentDefaults?: DependentDefault[];     // smart defaults
  collection?: CollectionConfig;              // passthrough to defineCollection
}
interface DialsResolveOptions { includeDefaults?: boolean; maskSecrets?: boolean; }  // defaults: true / false

interface DialsDefinition<TSchema> {
  schema: TSchema;
  collection: CollectionDefinition<TSchema> | undefined;   // undefined if defineCollection rejected the shape
  defaults: Record<string, unknown>;                       // the lowest cascade layer (extractDefaults)
  keys: SettingKey[];
  mergeStrategyFor(key: SettingKey): MergeStrategy;
  sensitivityFor(key: SettingKey): Sensitivity;
  resolve(stack: ScopedLayer[], options?: DialsResolveOptions): EffectiveResult;   // prepends defaults unless includeDefaults:false
  explain(key: SettingKey, stack: ScopedLayer[], options?: DialsResolveOptions): KeyProvenance | undefined;
  validate(values: Record<string, unknown>): ConstraintResult;
  withDependentDefaults(values: Record<string, unknown>, dirtyKeys?: SettingKey[]): Record<string, unknown>;
  getCapabilities(): DialsCapabilities;        // { keyCount, hasSecrets, hasConstraints, hasDependentDefaults, mergeStrategies }
}
```

`resolve({ maskSecrets: true })` and `explain()` route through `maskEffectiveResult` — so the
provenance/audit path masks too (see the secret rules below). `includeDefaults !== false` prepends
`{ scope: 'default', layer: defaults }` as the lowest scope.

## Merge strategy table (type-directed)

`MergeStrategy = 'replace' | 'deep-merge' | 'append'` (the shipped union — `{ mergeByKey }` was
deferred). `keyMergeStrategy(field)` dispatches off the Zod type (the NixOS factoring): **object
(incl. `ZodRecord`) → `deep-merge`, array → `replace`, scalar → `replace`**. `.meta({ mergeStrategy })`
is the escape hatch (`append` for accumulating allowlists). Default to `replace` when unspecified —
matching the Kubernetes "no strategy → replace" and Ansible replace-by-default rules. **Never**
hardcode a global "always deep-merge", and **never** deep-merge arrays by default. `defineDials`
caches `mergeStrategyFor`/`sensitivityFor` per key and passes `mergeStrategyFor` as `strategyFor`.

## Constraints + warnings (`src/constraints.ts` — `evaluateConstraints`)

Hard constraint and dependent default are **one primitive** — a relation over setting keys,
evaluated to VALIDATE or SUGGEST. `evaluateConstraints(values, config?) → ConstraintResult` evaluates
a `ConstraintsConfig` over a resolved values map and collects ALL errors (fail-fast UX, .NET
`ValidateOnStart` discipline). `defineDials(...).validate(values)` is this, bound to `config.constraints`.

```ts
interface ConstraintsConfig {
  schema?: z.ZodType;                                       // Zod, cross-field via .refine/.superRefine
  assertions?: Assertion[];                                 // serializable, solver-exportable mirror
  warnings?: Warning[];                                     // soft, advisory; never fail
}
interface Assertion { id?: string; message: string; keys?: SettingKey[]; check: (values) => boolean; }  // a throw = unsatisfied
interface Warning   { message: string; keys?: SettingKey[]; when: (values) => boolean; }
interface ConstraintResult { ok: boolean; errors: { message: string; keys: SettingKey[] }[]; warnings: string[]; }
```

Author hard cross-field constraints in **Zod** (`.refine`/`.superRefine` with field-`path` issues;
prefer `z.discriminatedUnion` for branchy shapes) AND/OR as the serializable `assertions` mirror.
Watch the Zod ordering gotcha: object-level `.superRefine` runs only *after* inner fields validate —
a cross-field error can be invisible until unrelated fields are filled; isolate constrained fields or
use a discriminated union. Keep the `assertions` IR solver-agnostic and propositional-translatable
(door open, no bundled solver — Open Decision 6).

## Dependent defaults (`src/derive.ts` — `applyDependentDefaults`)

A dependent default lives **outside the per-field schema** (Zod `.default()`/`.prefault()` can't see
siblings). `applyDependentDefaults(values, defaults, options?) → { values, applied }` fills them in
declaration order (each sees earlier results) and returns a NEW map.
`defineDials(...).withDependentDefaults(values, dirtyKeys?)` is this, bound to `config.dependentDefaults`.

```ts
interface DependentDefault {
  key: SettingKey;
  dependsOn: SettingKey[];                                  // documented; drives recompute scheduling in reactive consumers
  derive: (values: Record<string, unknown>) => unknown;    // return undefined → suggest nothing; a throw is swallowed
}
interface DeriveOptions { dirtyKeys?: Iterable<SettingKey>; }
```

Override-stickiness: a key listed in `dirtyKeys` is **never** recomputed — once the user edits the
target, the suggestion stops re-deriving (<5% of users change defaults, so silent clobbering is a real
harm). Conceptually a dependent default is the lowest-precedence *suggested* layer; always ship a
visible "reset to suggested" affordance in the UI.

## Secrets via bifurcation → masked `SecretRef` (`src/secrets.ts`)

Reuse zodal's content/metadata bifurcation, specialized to a sensitivity axis. The shipped helpers
are all PURE and never copy plaintext into their output:

```ts
function makeSecretRef(key, isSet): SecretRef;
function maskSecrets(effective, sensitivityFor): Record<SettingKey, SettingValue>;       // effective-only mask
function maskEffectiveResult(result, sensitivityFor): EffectiveResult;                    // masks EVERY surface — use this
function splitBySensitivity(layer, sensitivityFor): { config: Layer; secrets: Layer };   // route secrets out of config
function redactSecretsFromLayer(serialized: SerializedLayer, sensitivityFor): SerializedLayer;  // strip before export/audit
interface SecretBackend { has; get; reveal; set; delete; }   // satellite store contract (reveal = explicit, audited)
```

- Classification is `classifySensitivity(key, field?)` (`src/schema.ts`): `.meta({ secret: true })` /
  `.meta({ sensitivity })` override first, then a field-name heuristic (`secret`/`password`/`token`/
  `api key`/`access key`/`private key`/`client secret`/`credential`…), then a **fail-safe recursion**
  into container values. `field` is optional so **out-of-schema (ad-hoc) layer keys are still
  name-classified**, never defaulted to public.
- A masked **`SecretRef`** (`{ _tag, key, isSet, masked }`, mirroring `ContentRef`): "•••• (set)" /
  "not set", **never plaintext**; reveal is an explicit, separate `SecretBackend.reveal` call.
- **A secret value must never appear in the queryable store, any exported layer/patch, or the audit
  log.** This is the secret-never-leaks benchmark. The non-obvious leak surfaces it actually closes
  are listed under "Gotchas the build taught us" below.

## Patch & serialization utils (`src/patch.ts` — BUILT)

The barrel ships the full patch layer. **RFC 7386 internally, RFC 6902 for history:**

```ts
function applyMergePatch(target, patch): unknown;                 // RFC 7386; null deletes; proto-key guard
function serializeLayer(layer): SerializedLayer;                 // LOSSLESS: { values, unset[] } — UNSET kept distinct from null
function deserializeLayer(s: SerializedLayer): Layer;            // exact inverse; round-trips with zero drift
function layerToMergePatch(layer): Record<string, unknown>;     // layer AS RFC 7386 (UNSET→null) — lossy only for literal-null
function applyJsonPatch(doc, ops: JsonPatchOp[]): unknown;      // RFC 6902; throws on failed test / bad path
function diffJsonPatch(before, after): JsonPatchOp[];           // object-member granularity (arrays/scalars replaced wholesale)
function invertJsonPatch(ops, before): JsonPatchOp[];           // reversible undo log
type JsonPatchOp = add | remove | replace | move | copy | test;
```

`SerializedLayer = { values: Record<string, unknown>; unset: string[] }` is the on-disk/wire shape:
UNSET keys are recorded **separately** from values, so `serializeLayer`→`deserializeLayer` is lossless
(this is why `UNSET` is not conflated with `null`). Pointer traversal rejects `__proto__`/`constructor`/
`prototype` and validates array indices per RFC 6902 §4.

## Identity rule (enforced)

Enforce VS Code's identity rule: **no key may be a complete prefix of another key** (else a path is
simultaneously scalar and object — a deep-merge collision).

## Not yet built (planned; do not document as shipped)

These were in the design plan but are **not** in the `dials-core` barrel — they live in satellites or
remain open decisions. Do not reference them as core exports:
- **Key lifecycle** (`deprecated`/`renamedTo` + value transform, per-document `schemaVersion` +
  ordered `(layer) → layer` upcasters run at cascade load).
- **Field-level codecs** (`Codec<TEncoded, TDecoded>` / `composeCodecs`) and the provider-level
  `envCodec`/`tomlCodec` `wrapProvider` wrappers — those belong to `dials-store-*` (Open Decision 5;
  key-vs-value codec unification still open). dials-core ships **patch-as-values**, never
  comment-preserving file writes.
- A `LayerStore`/`LayerStoreCapabilities` **interface** ships (`src/store.ts`, see below); concrete
  adapters do not — they live in `@zodal/dials-store-*`.

## The `LayerStore` seam (`src/store.ts` — interface only)

How a scope sources (and optionally persists) its layer; the cascade resolves an ordered stack of
`{ scope, layer }`, and a `LayerStore` is what produces one scope's layer. Pure types, no Node dep —
concrete adapters live in satellite `@zodal/dials-store-*` packages.

```ts
interface LayerStoreCapabilities { readable: boolean; writable: boolean; watchable: boolean; }  // honest report
interface LayerStore {
  readonly scope: string;
  getCapabilities(): LayerStoreCapabilities;
  load(): Promise<Layer>;
  save?(layer: Layer): Promise<void>;                                      // present only when writable
  subscribe?(onChange: (layer: Layer) => void): () => void;               // present only when watchable
}
```

## Reuse-from-zodal map (the "wrap, don't rebuild" commitment)

| zodal primitive | dials-core use (as shipped) |
|---|---|
| `defineCollection` + 6-layer inference | `defineDials(schema, config?)` runs `defineCollection` for affordances (degenerate one-item collection) |
| `unwrapZodSchema`, `_zod.def.shape` | `getObjectShape`/`readMeta`/`baseType`/`extractDefaults` (`src/schema.ts`) — register-before-wrap still applies |
| bifurcation (`ContentRef`/`storageRoleIs`) | secrets: `SecretRef` + `classifySensitivity`; `SecretBackend` is the satellite content-provider seam |
| `.meta()` overrides | `keyMergeStrategy` (`mergeStrategy`) + `classifySensitivity` (`secret`/`sensitivity`) read field metadata |
| `explain()` (`InferenceTrace`) | `KeyProvenance` / `defineDials(...).explain()` — "why is this set to X / locked?" |
| `DataProvider.subscribe?()` | `LayerStore.subscribe?()` — live/reactive settings (satellite stores) |

## Module docstrings (house rule)

Open every module with a top-level docstring (auto-extracted for generated docs). Example:

```ts
/**
 * The cascade engine: resolve an ordered stack of sparse layers into effective values
 * paired with provenance. RFC 7386 merge semantics; UNSET deletes; type-directed per-key
 * merge strategy; the policy band is non-overridable.
 */
```

## The build gate (green — keep it green)

The two checkpoint benchmarks pass; any change that breaks them means **STOP and fix the model**.

1. **Cascade + provenance round-trip** ([`tests/cascade.test.ts`](../../packages/dials-core/tests/cascade.test.ts)).
   Resolve a multi-scope stack (`default → preset → profile → workspace → user → policy`), mutate one
   layer, re-resolve; provenance must correctly attribute every key (winning scope + shadowed list),
   the policy band must be non-overridable, and the layer set must round-trip
   `serializeLayer`→`deserializeLayer` (incl. `UNSET` and object deep-merge) with **zero drift**.
2. **Secret-never-leaks** ([`tests/secrets.test.ts`](../../packages/dials-core/tests/secrets.test.ts)).
   A secret value must never appear in the effective set, provenance, conflicts, an exported
   layer/patch, or an audit log; masked reads return a `SecretRef`.

`tests/patch.test.ts` and `tests/adversarial.test.ts` lock the patch utils against the **RFC 7386 §1**
and **RFC 6902 appendix** example tables and the hardening cases below — do not relax them.

## Gotchas the build taught us (read [`docs/lessons-from-the-build.md`](../../docs/lessons-from-the-build.md))

Every package shipped through adversarial-critic passes that found **real, ship-blocking bugs the
happy-path tests missed**. The cascade/secret ones are this skill's territory; each is pinned by a
regression test. Do not re-introduce:

- **Mask the WHOLE result, not just `effective`.** `provenance[key].value`,
  `provenance[key].shadowed[].value`, and `conflicts[].contributors[].value` all carry raw values, and
  `explain()` returns provenance — use `maskEffectiveResult`, never a hand-rolled effective-only mask.
- **Nested-container secret classification (fail-safe).** `classifySensitivity` recurses into
  `ZodObject`/`ZodArray`/`ZodRecord`/tuple/union — a secret-named field *inside* a container value
  classifies the **whole** setting as secret (an irreducible nested value can't be masked field-by-field).
- **Out-of-schema keys fail safe.** An ad-hoc layer key not in the schema is still name-classified (a
  `*_token` ad-hoc key → secret), never defaulted to public.
- **`UNSET` ≠ `null` ≠ `undefined`.** The `UNSET` sentinel is fall-through/abstain (re-expose lower
  scope); a literal `null` is a value. Serialize losslessly (`{ values, unset[] }`), not via
  RFC-7386 null-as-delete.
- **Prototype-pollution guard.** Reject `__proto__`/`constructor`/`prototype` in JSON-pointer writes
  and merge-patch keys; build cloned/merged objects so a literal `__proto__` own key can't pollute.
- **RFC 6902 array/test strictness.** Validate array indices (`/^(0|[1-9][0-9]*)$/`, bounds-check
  `add`/`replace`); a `test` against a non-existent member must FAIL (no `undefined === undefined` pass).
- **Honest `mergedFrom` by surviving-leaf.** Attribute a deep-merge by surviving-leaf origin, not naive
  leave-one-out (which under-reports when two scopes set an identical leaf).

## Research routing (open the doc the question needs)

- **Cascade / merge / layering / patch formats:** [`02C-collections-layering-merge.md`](../../docs/research/raw/02C-collections-layering-merge.md) (the `resolve` algorithm + API shape; KEEP/AVOID) and [`03C-cloud-native-layering.md`](../../docs/research/raw/03C-cloud-native-layering.md) (RFC 7386 pseudocode; Kustomize/Helm/Terraform/Ansible; per-key strategy).
- **Scopes / precedence / provenance / managed band:** [`02D-scopes-precedence.md`](../../docs/research/raw/02D-scopes-precedence.md) (the effective-value/provenance model; VS Code "Modified elsewhere"; CFPreferences `Forced`/`AppValueIsForced`; scopes-are-data).
- **Constraints + dependent defaults:** [`02E-validation-defaults-constraints.md`](../../docs/research/raw/02E-validation-defaults-constraints.md) (the one-relation model; Zod `superRefine` ordering gotcha; derive-stickiness; feature-model/solver framing) and [`03B-schema-driven-config.md`](../../docs/research/raw/03B-schema-driven-config.md) (NixOS type-directed merge, priority bands, `assertions`/`warnings`; .NET fail-fast).
- **Identity / lifecycle / secrets / codecs / file round-trip:** [`02G-identity-versioning-machine.md`](../../docs/research/raw/02G-identity-versioning-machine.md) (no-prefix rule; `deprecated`/`renamedTo`/upcasters; jsonc-parser edit-scripts; env binding; secrets).
- **What zodal already gives us (substrate):** [`05a-zodal-corpus-notes.md`](../../docs/research/raw/05a-zodal-corpus-notes.md) (6-layer inference, affordance taxonomy, bifurcation→`SecretRef`, renderer registry, codecs, `explain()`).
- **The arbiter / decision table:** [`04-synthesis.md`](../../docs/research/raw/04-synthesis.md) (§C,D,E,I,L,M,N + the package map + KEEP/AVOID table). Use `/zodal-dials-dev-research-lookup` for anything else.

## Open decisions (status — several now resolved by the build)

Full detail in [`docs/dev-plan.md` §8](../../docs/dev-plan.md) and [`04-synthesis.md` §5](../../docs/research/raw/04-synthesis.md):

1. **Flat keyspace from a nested Zod schema** — *shipped:* keys are the top-level object keys; nested
   objects are values merged via `deep-merge`. A deeper flatten/registration seam is still open.
2. **Hard-constraint home** — *shipped:* both supported — Zod `schema` AND a serializable `assertions`
   mirror in `ConstraintsConfig`. Sync direction between them is the caller's choice.
3. **`UNSET` sentinel surface** — *shipped:* `Symbol.for('@zodal/dials.UNSET')` internally; serialized
   layers carry it as a separate `unset[]` list (`layerToMergePatch` maps it to `null` only for interop).
4. **Secret backend contract** — *shipped:* the `SecretBackend` interface (`has`/`get`/`reveal`/`set`/
   `delete`) is the seam; concrete backends are satellite `@zodal/dials-store-*`. Per-field reveal
   authorization/audit still deferred.
5. **Codec home & key codecs** — *open:* field-level codecs and `envCodec`/`tomlCodec` are NOT in the
   `dials-core` barrel yet; they belong to `dials-store-*`. Key-vs-value codec unification still open.
6. **Solver/feature-model scope for v1** — *shipped as planned:* only the propositional-translatable
   `assertions` IR (door open); a `json-rules-engine`/`logic-solver` adapter is still deferred.

## Maintenance

This skill describes **shipped, merged** contracts (`@zodal/dials-core`). The barrel
[`packages/dials-core/src/index.ts`](../../packages/dials-core/src/index.ts) is the source of truth —
when a model shape or the merge/provenance contract changes in code, update the shapes above in the
SAME change, and reconcile [`docs/lessons-from-the-build.md`](../../docs/lessons-from-the-build.md) and
[`docs/dev-plan.md`](../../docs/dev-plan.md). If a contract here drifts from the implementation, fix it —
skill hygiene is part of the work.
