# zodal-dials — Concept & Design Intent

> The durable "why and what" of zodal-dials. Behavioral rules for agents live in
> [`AGENTS.md`](../AGENTS.md) and the dev skills; the phased build lives in
> [`docs/dev-plan.md`](dev-plan.md); the evidence lives in [`docs/research/`](research/). This
> document is the design narrative those three hang from. Where it cites a finding, the anchor is
> the research corpus (see [`research_guide.md`](research_guide.md)).

## 1. The problem

Every non-trivial app accumulates settings / configuration / preferences / parameters. They start
as a handful on one screen. Then the design choice to **push parameters to the surface** — expose
as much of the system as is tunable — turns that handful into hundreds, and the ad-hoc settings
screen collapses: inconsistent presentation, no reuse of hard-won tuned bundles, no defense against
overwhelm, no cross-field validation, no way to see *where a value came from*. A few products solve
this well (VS Code is the canonical example; GNOME GSettings, JetBrains, Sourcegraph, NixOS, and
Kubernetes/Helm each solve a slice). The patterns are known; what is missing is a **schema-driven,
headless, renderer-agnostic library** that gives any app those patterns for free.

## 2. The thesis (inherited from zodal)

**Declare once, render anywhere.** A setting's nature — its type, validation, constraints, docs,
and capabilities — is declared *once* as a Zod v4 schema. From that single declaration zodal-dials
derives the cascade, the validation, the UI configuration, the search surface, the file round-trip,
and AI/codegen artifacts. zodal-dials **wraps, it does not rebuild**: a settings document is
modeled as a **degenerate one-item zodal collection**, so it reuses zodal's 6-layer affordance
inference, `.meta()` metadata, `explain()`, codecs, the capability-ranked renderer registry, and
the content/metadata bifurcation. It is the **settings specialization of zodal**, built the way
`zodal-graphs` is the graph specialization.

## 3. The vocabulary (settled — use verbatim)

| Term | Meaning |
|---|---|
| **Setting / dial** | A typed, named parameter — the atomic unit. Identified by a stable **key** (dotted path). |
| **Schema** | The Zod v4 declaration; SSOT for type, validation, hard constraints, `.meta()` affordances. |
| **Layer** | A *partial/sparse* set of `key→value` from one source — the unit that gets merged. |
| **Scope** | A named, **ordered** source of layers (`default`, `preset`, `profile`, `workspace`, `user`, `policy`). Scopes are **data, not constants**. |
| **Cascade** | The algorithm that merges layers across scopes (objects deep-merge; scalars/arrays replace; higher scope wins). |
| **Effective value** | The cascade's output for a key — **always paired with provenance**. |
| **Provenance** | Winning scope + ordered shadowed layers + `managed` flag. The renderable "why is this the value?" output (`explain()`). |
| **Profile** | A complete, user-selectable named bundle of values. |
| **Preset** | A curated, shippable base bundle, extended/overridden. |
| **Merge strategy** | Per-key rule for combining layers (`replace` / `deep-merge` / `append` / `strategic`), type-directed by default, `.meta()`-overridable. |
| **Patch** | A serialized layer/delta: **JSON Merge Patch (RFC 7386)** internally; **JSON Patch (RFC 6902)** for history/undo. |
| **Constraint (hard)** | A cross-field rule making a *combination* invalid. **Dependent default (soft)** — an advisory computed default derived from other fields; overridable. |
| **Facet / tag** | A grouping dimension allowing **multi-membership**; canonical grouping. A **tree** is one rendered projection of a facet. |
| **Sensitivity / secret** | A field role marking a value confidential (masked, never plain-exported, routed to a secret store). **Managed/policy value** — enforced by an admin scope atop the cascade. |

## 4. The architecture — three layers (Model → Affordances → Targets)

Mirrors zodal-graphs. SSOT + open-closed throughout.

1. **Model** — the settings **schema** (Zod v4, flat dotted keyspace) + the **cascade** primitives
   (layers, scopes, merge strategies, effective value, provenance).
2. **Affordances** — the declared capability layer: read / write / reset, validate, suggest
   (dependent defaults), import / export, reveal-secret, group-by-facet, conditional visibility,
   view-as-form/JSON/CLI, deprecate / migrate.
3. **Targets** — pluggable renderers, store/secret adapters, and codegen, selected by a
   **capability-ranked registry that degrades honestly** (e.g. an irreducible nested-object value
   falls back to a raw-JSON editor, and says *why*).

### The keystone: the cascade

The single most important contract. An ordered list of `{ scope, layer }`, resolved to an effective
value **with provenance**:

```
resolve(orderedLayers, policy) → { effective, provenance, conflicts, warnings }
```

- **Sparse layers**, not snapshots — a layer *is* the diff; intent-preserving, composable, auditable.
- **RFC 7386 merge semantics** internally (objects recurse; scalars/arrays replace); an explicit
  **`UNSET` sentinel** deletes (never raw `null`, which is the RFC-7386/Helm footgun).
- **Type-directed, per-key merge strategy** (the NixOS model): the Zod type picks the default
  (object→deep-merge, array/scalar→replace), overridable via `.meta({ mergeStrategy })`.
- **Provenance is first-class**, not a debug afterthought: for each key, the winning scope, the
  ordered shadowed layers, and a `managed` flag. This reuses zodal's `explain()` and is the
  deliberate **differentiator** — almost no surveyed tool surfaces provenance well.
- The **policy/managed** band always wins and is non-overridable locally.

### Secrets reuse the bifurcation machinery

A `sensitivity: 'public' | 'sensitive' | 'secret'` field role (classified by the same inference
cascade: name heuristics like `*_token`/`password`/`apiKey` at layer 3, `.meta({ secret: true })`
override at layer 4) routes secret values to a **separate secret backend** via a
`createBifurcatedProvider`-style composition. Reads return a masked **`SecretRef`** (mirroring
zodal's `ContentRef`), never plaintext. Secrets never enter the queryable config store, any
exported layer/patch, or the audit log.

## 5. What we reuse from zodal (the "wrap, don't rebuild" map)

| zodal primitive | zodal-dials use |
|---|---|
| `defineCollection` + 6-layer inference | `defineDials` (a degenerate one-item collection) + settings name-heuristics |
| `ResolvedFieldAffordance` `[key]: unknown` hook | new affordance keys: `sensitivity`, `saveMode`, `requiresRestart`, `writableScopes`, `mergeStrategy`, facets, `order` |
| `RendererRegistry` + PRIORITY bands + composable testers | `createSettingsRendererRegistry` + settings testers + terminal `rawJson` |
| Content/metadata **bifurcation** (`createBifurcatedProvider`, `ContentRef`, `storageRoleIs`) | secrets (`createSensitiveSettingsProvider`, `SecretRef`, `secretRoleIs`) |
| **Codecs** + `wrapProvider` | file round-trip (`envCodec`/`tomlCodec`), value coercion (`"30s"↔30000`), key remapping |
| `createCollectionStore` (Zustand slices) | `createSettingsStore` — a store of effective values that re-emits on layer change |
| `explain()` (`InferenceTrace`) | provenance / "why is this setting hidden / read-only / set to X?" |
| `DataProvider.subscribe?()` | live/reactive settings (watch a config file, push changes) |
| existing `zodal-store-*` adapters | config backends (fs / localStorage / S3 / Supabase) |

## 6. Differentiators (what makes zodal-dials worth building)

1. **Provenance as a first-class, renderable output** of every effective value — `git blame` for
   settings. No surveyed app library does this well.
2. **One cascade primitive** unifying defaults, presets, profiles, scopes, and partial bundles —
   instead of bespoke per-app merge code.
3. **Constraints and smart defaults as one model** (relations over fields, evaluated to validate or
   suggest), authored in Zod, exportable to a solver IR for heavy parameter spaces.
4. **Honest degradation** for irreducible nested values (raw-JSON fallback that explains itself),
   distinguishing *organizational* nesting (facets) from *value* nesting (sub-schemas).
5. **Python-sibling consistency** with `config2py` (cascade-of-sources on `dol` stores + `i2`
   signatures): a zero-config getter that is fully overridable, stores as Mappings over pluggable
   backends, formats as extension-keyed codecs.

## 7. Non-goals / scope discipline

- **Not a SAT solver.** Constraints are expressed so they *could* be handed to a CSP/SAT engine;
  v1 ships eager rule evaluation and an optional solver-adapter seam, no bundled solver.
- **Not config-as-code.** The core is inert serializable layers + a pure cascade.
- **Not a single renderer.** The headless layer emits configuration; concrete renderers (vanilla,
  shadcn, …) are separate packages.
- **No premature generalization** beyond the settings domain.

See [`docs/dev-plan.md`](dev-plan.md) for how this gets built, and
[`docs/research/04-synthesis.md`](research/raw/04-synthesis.md) for the full evidentiary synthesis.
