---
name: zodal-dials-dev-cascade
description: Use when working on the zodal-dials CORE MODEL or CASCADE ENGINE — defineDials, resolve/resolveEffective, Layer/Scope/Provenance, RFC 7386 JSON Merge Patch (internal) / RFC 6902 JSON Patch (history), the UNSET sentinel (never null), the type-directed per-key merge strategy (NixOS), hard constraints + dependent defaults (Zod superRefine, assertions/warnings, derive override-stickiness), sensitivity/SecretRef/bifurcation, deprecated/renamedTo/upcasters, field-level codecs, explain(). Triggers on "resolve the cascade", "merge layers", "provenance", "effective value", "UNSET vs null", "merge strategy", "policy band wins", "dependent default", "secret never leaks", "RFC 7386". Read BEFORE writing model/cascade code — the merge & provenance contract is easy to get wrong and expensive to change later.
metadata:
  audience: developers
---

# zodal-dials · core model + cascade (the keystone)

The cascade is **the contract every other layer consumes**. Build `@zodal/dials-core` first,
get **effective-value + provenance** right, and prove it with two checkpoint benchmarks
(cascade round-trip, secret-never-leaks) before layering UI on. This skill is the procedural
guide; the *why* and the surveyed alternatives live in the research (routed below).

## The rules this skill owns

1. **The cascade is the keystone.** An ordered `{ scope, layer }` stack resolves to an effective
   value **always paired with provenance**. Build it before anything UI.
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
8. **Wrap, don't rebuild.** The genuinely-new modules are the cascade/provenance engine and the
   constraint + dependent-default evaluator. Everything else is configured zodal.

## The model shapes (the contracts)

```ts
type SettingKey   = string & { __brand: 'SettingKey' };        // branded dotted path
const  UNSET      = Symbol('zodal.dials.UNSET');               // delete sentinel, ≠ null/undefined
type Value        = unknown;
type Layer        = Partial<Record<SettingKey, Value | typeof UNSET>>;   // RFC 7386-shaped, sparse
interface Scope   { id: string; order: number; }              // scopes are DATA, not constants
interface ScopedLayer { scope: Scope; layer: Layer; }
interface Provenance  { key: SettingKey; winningScope: string; shadowed: { scope: string; value: unknown }[]; managed: boolean; mergedFrom?: string[]; reset?: boolean; }
interface EffectiveResult { effective: Record<SettingKey, Value>; provenance: Record<SettingKey, Provenance>; conflicts: Conflict[]; warnings: string[]; }
interface SecretRef    { _tag: 'SecretRef'; key: SettingKey; isSet: boolean; }   // masked, mirrors ContentRef
```

The core operation:

```ts
resolve(orderedLayers: ScopedLayer[], policy: ResolvePolicy): EffectiveResult
// walk low→high; per key: scalar/array → replace, object → deep-merge (record mergedFrom);
// UNSET → delete + record reset; a managed scope short-circuits editability.
resolveEffective(key, stack): { value; provenance }    // single-key slice
explain(key, stack): Provenance                         // the provenance half, ties to zodal explain()
```

`ResolvePolicy` carries `scopeOrder` (low→high), `strategyFor(key, zType) → MergeStrategy`
(type-directed override), `managedScopes` (non-overridable), and a `conflictMode`
(`priority` | `interactive`; reserve `threeWay` only for reconciling two profiles, never live config).

## Merge strategy table (type-directed)

`MergeStrategy = 'replace' | 'deep-merge' | 'append' | { mergeByKey: string }`. Defaults dispatch
off the Zod type (the NixOS factoring): **object → `deep-merge`, array → `replace`, scalar →
`replace`**. `.meta({ mergeStrategy })` is the escape hatch (`append` for accumulating allowlists,
`{ mergeByKey }` for merge-array-elements-by-id). Default to `replace` when unspecified — matching
the Kubernetes "no strategy → replace" and Ansible replace-by-default rules. **Never** hardcode a
global "always deep-merge", and **never** deep-merge arrays by default.

## Constraints + warnings (the NixOS `assertions`/`warnings` shape)

Hard constraint and dependent default are **one primitive** — a relation over setting keys,
evaluated to VALIDATE or SUGGEST. Author hard cross-field constraints in **Zod** (`.refine` /
`.superRefine` with field-`path` issues; prefer `z.discriminatedUnion` for branchy shapes), then
*emit* a serializable, renderer-agnostic **`{ assertion, message }` list + a `warnings: string[]`
list** evaluated over the *effective* set, **fail-fast at resolve time** (.NET `ValidateOnStart`
discipline). Watch the Zod ordering gotcha: object-level `.superRefine` runs only *after* inner
fields validate — a cross-field error can be invisible until unrelated fields are filled; isolate
constrained fields or use a discriminated union. Keep the IR solver-agnostic and
propositional-translatable (door open, no bundled solver — Open Decision 6).

## Dependent defaults (derive selectors with override-stickiness)

A dependent default lives **outside the per-field schema** (Zod `.default()`/`.prefault()` can't see
siblings): a pure `derive(values) → partialSuggestion` selector keyed by its **input dependencies**,
recomputed on dependency change **only while the target is non-dirty**. Once the user edits the
target, the suggestion is shadowed and stops re-deriving (override-stickiness — <5% of users change
defaults, so silent clobbering is a real harm). A dependent default is just the lowest-precedence
*suggested* layer in the cascade, carrying provenance ("suggested, derived from A,B"). Always ship a
visible "reset to suggested" affordance.

## Secrets via bifurcation → masked `SecretRef`

Reuse zodal's content/metadata bifurcation **verbatim**, specialized to a sensitivity axis:

- A `sensitivity: 'public' | 'sensitive' | 'secret'` field role, classified by the **same 6-layer
  inference cascade**: name heuristics (`*_secret`/`*_token`/`*_key`/`password`/`apiKey`/`credential`)
  at Layer 3, `.meta({ secret: true })` override at Layer 4.
- `createSensitiveSettingsProvider()` = `createBifurcatedProvider` specialized — ordinary settings →
  the queryable config store; secrets → a separate secret backend (keychain/Vault/`.env`) as the
  "content provider". A `secretRoleIs()` renderer tester mirrors `storageRoleIs()`.
- List/read returns a masked **`SecretRef`** (mirroring `ContentRef`): "•••• (set)" / "not set",
  **never plaintext**; explicit lazy reveal via a `getContent`-style call. The sensitivity cascade
  implies `searchable/filterable: false`.
- **A secret value must never appear in the queryable store, any exported layer/patch, or the audit
  log.** This is the secret-never-leaks benchmark.

## Key lifecycle (declarative, not imperative)

Make migration a *data declaration* the headless layer executes, the UI surfaces, and codegen emits:
- `deprecated: true` + message (drives warnings + an `advanced`/hidden facet); `markdown` form can
  link to the replacement.
- `renamedTo: 'new.key'` + optional value transform → automatic read-time copy.
- Per-document `schemaVersion` + an ordered registry of **pure, lazy, idempotent `(layer) → layer`
  upcasters** run during cascade load (expand/contract for breaking shape changes).

Enforce VS Code's identity rule at compile time: **no key may be a complete prefix of another key**
(else a path is simultaneously scalar and object — a deep-merge collision).

## Field-level codecs

Field-level `Codec<TEncoded, TDecoded>` (Zod v4 `z.codec()`) handle value coercion
(`"30s" ↔ 30000`, `"true" ↔ true`, `"a,b,c" ↔ ['a','b','c']`); compose with `composeCodecs()`. The
field-level codecs live in `dials-core`; the provider-level `envCodec`/`tomlCodec` wrappers
(`wrapProvider`) live in `dials-store-*` — **patches model values, never comment-preserving file
writes** (Open Decision 5; key-vs-value codec unification is still open).

## Reuse-from-zodal map (the "wrap, don't rebuild" commitment)

| zodal primitive | dials-core use |
|---|---|
| `defineCollection` + 6-layer inference | `defineDials(schema, config?)` — a degenerate one-item collection + settings heuristics |
| `ResolvedFieldAffordance`'s `[key]: unknown` hook | new keys: `sensitivity`, `saveMode`, `requiresRestart`, `writableScopes`, `mergeStrategy`, facets, `order` |
| affordance registry (WeakMap, object identity) | **register-before-wrap** for any wrapped/optional field |
| bifurcation (`createBifurcatedProvider`/`ContentRef`/`storageRoleIs`) | secrets (`createSensitiveSettingsProvider`/`SecretRef`/`secretRoleIs`) |
| codecs + `wrapProvider` | value coercion + file round-trip |
| `explain()` (`InferenceTrace`) | provenance / "why is this setting set to X / read-only / hidden?" |
| `DataProvider.subscribe?()` | live/reactive settings (watch a config file, push changes) |

## Module docstrings (house rule)

Open every module with a top-level docstring (auto-extracted for generated docs). Example:

```ts
/**
 * The cascade engine: resolve an ordered stack of sparse layers into effective values
 * paired with provenance. RFC 7386 merge semantics; UNSET deletes; type-directed per-key
 * merge strategy; the policy band is non-overridable.
 */
```

## The build gate (do not skip — two checkpoint benchmarks)

1. **Cascade + provenance round-trip** (`tests/cascade.test.ts`). Resolve a multi-scope stack
   (`default → preset → profile → workspace → user → policy`), mutate one layer, re-resolve;
   **provenance must correctly attribute every key** (winning scope + shadowed list), the policy
   band must be non-overridable, and the whole layer set must round-trip serialize→deserialize as
   RFC 7386 layers (incl. `UNSET`-delete and object deep-merge) with **zero drift**. Any
   misattribution or drift fails the build — **STOP and fix the model.**
2. **Secret-never-leaks** (`tests/secrets.test.ts`). A secret value must never appear in the
   queryable store, any exported layer/patch, or the audit log; reads return a masked `SecretRef`.

Also unit-test the patch utils against the **RFC 7386 §1** and **RFC 6902 appendix** example tables
verbatim — JS merge-patch libraries diverge; pin or replace the lib if it disagrees.

## Research routing (open the doc the question needs)

- **Cascade / merge / layering / patch formats:** [`02C-collections-layering-merge.md`](../../docs/research/raw/02C-collections-layering-merge.md) (the `resolve` algorithm + API shape; KEEP/AVOID) and [`03C-cloud-native-layering.md`](../../docs/research/raw/03C-cloud-native-layering.md) (RFC 7386 pseudocode; Kustomize/Helm/Terraform/Ansible; per-key strategy).
- **Scopes / precedence / provenance / managed band:** [`02D-scopes-precedence.md`](../../docs/research/raw/02D-scopes-precedence.md) (the `resolveEffective` model; VS Code "Modified elsewhere"; CFPreferences `Forced`/`AppValueIsForced`; scopes-are-data).
- **Constraints + dependent defaults:** [`02E-validation-defaults-constraints.md`](../../docs/research/raw/02E-validation-defaults-constraints.md) (the one-relation model; Zod `superRefine` ordering gotcha; derive-stickiness; feature-model/solver framing) and [`03B-schema-driven-config.md`](../../docs/research/raw/03B-schema-driven-config.md) (NixOS type-directed merge, priority bands, `assertions`/`warnings`; .NET fail-fast).
- **Identity / lifecycle / secrets / codecs / file round-trip:** [`02G-identity-versioning-machine.md`](../../docs/research/raw/02G-identity-versioning-machine.md) (no-prefix rule; `deprecated`/`renamedTo`/upcasters; jsonc-parser edit-scripts; env binding; secrets).
- **What zodal already gives us (substrate):** [`05a-zodal-corpus-notes.md`](../../docs/research/raw/05a-zodal-corpus-notes.md) (6-layer inference, affordance taxonomy, bifurcation→`SecretRef`, renderer registry, codecs, `explain()`).
- **The arbiter / decision table:** [`04-synthesis.md`](../../docs/research/raw/04-synthesis.md) (§C,D,E,I,L,M,N + the package map + KEEP/AVOID table). Use `/zodal-dials-dev-research-lookup` for anything else.

## Open decisions (working defaults — build is never blocked; owner's call to change)

Full detail in [`docs/dev-plan.md` §8](../../docs/dev-plan.md) and [`04-synthesis.md` §5](../../docs/research/raw/04-synthesis.md):

1. **Flat keyspace from a nested Zod schema** — *default:* flatten an object schema to dotted keys;
   leave a registration seam. Confirm against `defineCollection`/affordance machinery first.
2. **Hard-constraint home** — *default:* author in Zod `.refine`/`.superRefine` (validation SSOT)
   and emit a serializable `{ assertion, message }` mirror for solver export. Decide sync direction.
3. **`UNSET` sentinel surface** — *default:* a unique symbol internally; an explicit token in
   serialized layers / CLI / patch log, distinct from `null`. Unit-test the merge-patch lib vs RFC 7386 §1.
4. **Secret backend contract** — *default:* `createSensitiveSettingsProvider` = `createBifurcatedProvider`
   specialized; masked reads + lazy reveal seam. Defer per-field reveal authorization/audit.
5. **Codec home & key codecs** — *default:* field-level codecs in `dials-core`; `envCodec`/`tomlCodec`
   provider wrappers in `dials-store-*`. Decide whether key codecs unify with value codecs.
6. **Solver/feature-model scope for v1** — *default:* ship only the propositional-translatable
   constraint IR (door open); defer a reference `json-rules-engine`/`logic-solver` adapter.

## Maintenance

This skill describes contracts under active construction. When a model shape or the merge/provenance
contract changes in code, update the shapes above in the SAME change, and reconcile
[`docs/dev-plan.md`](../../docs/dev-plan.md). If a contract here drifts from the implementation, fix
it — skill hygiene is part of the work.
