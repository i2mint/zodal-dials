---
name: zodal-dials-dev-ui
description: Use when working on the zodal-dials HEADLESS UI LAYER — `@zodal/dials-ui`'s `toSettingsForm`, `createSettingsRendererRegistry` with its PRIORITY bands (FALLBACK/DEFAULT/LIBRARY/APP/OVERRIDE) and composable testers (`secretRoleIs`, `boundedNumber`, `isEnum`, `fieldNameMatches`) plus the terminal `rawJson` always-match renderer, the type→widget map and value-vs-organizational nesting, facet→group-descriptor projection with gesture-agnostic `revealed`/`reveal`, the `IndexableSetting[]` surface + pluggable `SearchProvider` + scoped `@`-filter parser, provenance→badge/lock/reset config, and dirty/save/undo headless events. Triggers on "add a settings widget", "settings renderer registry", "rawJson fallback", "facet grouping / reveal", "search the settings", "scoped filter parser", "provenance badge", "dirty/save events". Read BEFORE adding a renderer/widget or wiring search — it plugs into the open-closed registry, not hard-coded branching.
metadata:
  audience: developers
---

# zodal-dials · the headless UI layer (`@zodal/dials-ui`)

This package is **Affordances → Targets glue, emitted as config, never DOM**. It takes a
`DialsDefinition` (from `@zodal/dials-core`) and produces plain serializable objects a concrete
renderer (`-vanilla`, `-shadcn`, …) consumes. It **mirrors zodal's `RendererRegistry` exactly** —
mirror, don't reinvent. Reference implementations live in the `zodal` monorepo; route to them below.

## The one rule: headless-first

Every export returns a config object/array. No React, no HTML, no `document`. The *gesture*
(accordion vs route, toast vs banner) belongs in the renderer; the *intent* belongs here. If a
function would emit a DOM node or import a UI framework, it is in the wrong package.

## Pattern 1 — the settings renderer registry (port of zodal's `RendererRegistry`)

`createSettingsRendererRegistry<TWidget>()` closes over a private `entries[]`. `register(entry)`
only **pushes** (order-independent → adding a widget never edits another). `resolve(field, context)`
runs **every** tester, keeps the single highest score (ties → first-registered, strict `>`);
`explain(...)` returns all scored candidates for debugging *why* a widget won.

- **Testers are pure** `(field: ResolvedFieldAffordance, ctx) => number`, returning a **PRIORITY
  band, never a literal**: `PRIORITY = { FALLBACK:1, DEFAULT:10, LIBRARY:50, APP:100, OVERRIDE:200 } as const`.
- **Composable predicates** (port verbatim): `secretRoleIs('secret')`, `boundedNumber()`
  (`field.numericBounds != null`), `isEnum()`, `fieldNameMatches(/theme|color/i)`,
  `metaMatches(...)`, with `and()` (SUMS scores; `-1` if any sub-tester fails) and `or()` (MAX).
  Compounds can exceed a single band (`DEFAULT+LIBRARY=60`) — keep band arithmetic in mind so they
  don't accidentally outrank an `OVERRIDE`. A `.meta({ editWidget })` override wins via OVERRIDE.
- **The terminal `rawJson` renderer's tester ALWAYS matches** (`() => PRIORITY.FALLBACK`). This is
  the honest-degradation seam: any value the richer widgets decline still gets an editable,
  validated control. **Renderers declare WHY they declined** (open object / depth exceeded / unknown
  type) so the UI can show "rendered as raw JSON because the value is an open dictionary" — never a
  silent drop. `resolve()` returns `null` only if nothing scores `> -1`, so always register it.
- The registry is **user-instantiated, not a forced global singleton** (DI; a default convenience
  instance is fine). Generic over the opaque `TWidget`; never inspect it.

## Pattern 2 — type → widget mapping (the easy + the irreducible part)

First **separate two nestings** (this is a first-class affordance signal, not an accident):
- **Organizational nesting** — dotted keys (`editor.fontSize`) → the *facet tree* (Pattern 3),
  **never a widget**. The leaf is the scalar.
- **Value nesting** — the value *is* an object/array/record/union → recurse or raw-edit.

Scalar-leaf map (drives high-band testers): bool→switch, enum→radio (≤~5) / select, bounded-number
(`.min/.max`)→slider, unbounded→stepper, string→text/textarea, format-tagged→specialized picker
(color/date/duration/file/keybinding via `.meta` tag or `format`). Inference ordering matches
zodal: type → refinement → name heuristic → `.meta()` → registry → explicit.

Structural renderers (mid band): `objectRecurse` (matches **closed** objects — known props — within
a configurable **depth/field-count budget**, keyword-only, no magic number), `arrayList`,
`unionCombinator` for `z.discriminatedUnion` = **discriminator-select-then-recurse** (the
`z.literal` options give the select options for free). Open record / `additionalProperties` / mixed
/ `z.any` / over-budget → fall to `rawJson`. Always also expose an explicit "edit as source" escape
hatch (a raw edit is just another layer/patch). Best analog: HA's one `object` selector (structured
form *or* raw editor depending on whether a sub-schema is supplied).

## Pattern 3 — faceted organization (flat schema + a separate grouping layer)

Facets/tags are **canonical** (multi-membership); a **tree is one projection**. The schema stays a
flat dotted keyspace (SSOT); grouping lives in a sibling layer keyed by setting key. Build two
indexes once from it:
- **forward** `Map<FacetId, SettingKey[]>` (tree children, chips, bulk-op scopes),
- **inverse** `Map<SettingKey, FacetId[]>` (row chips, facet counts).

Emit a **group descriptor** `{ id, label, order, memberKeys, childFacetIds?, revealed, reveal }`
and **nothing commits to a gesture** — `reveal: 'inline' | 'route' | 'panel'` is a *hint* the
renderer may override (one model drives both open-a-panel and expand-in-place; ≤2 disclosure
levels). `order`: optional integer, lower wins, unordered-after-ordered, **lexical tie-break**
(VS Code's spec verbatim). Hierarchical facets → **materialized path** (not closure tables).
**Computed facets** are serializable predicates over (key, schema, effective value, provenance):
`@modified` (provenance.scope !== 'default'), `@managed`, `@secret`, `@advanced`, `@invalid` — so
`@modified` is just the first built-in computed facet, not a special case. The B×C primitive:
`(facetSelector) → keySet → JSON Merge Patch` unifies reset-all / export-slice / diff-over-facet.

## Pattern 4 — search (declared surface + pluggable provider + scoped parser)

Search queries the **declaration, never the values** (secrets excluded). Emit one
`IndexableSetting` per key — `{ key, title?, description?, enumLabels?, facets?, keywords?, group?,
defaultValue? }` — as a generator output (SSOT, engine-agnostic). Which fields are searched + their
weights is **configuration**, not hardcoded.

A pluggable `SearchProvider` interface — `index(settings, opts?)`, `search(query, opts?)`,
`capabilities()` (honest reporting: fuzzy/prefix/semantic/hybrid/facets/async) — has a **zero-dep
substring default** (`createSubstringProvider`); `createMiniSearchProvider` is the rich default;
Orama (facets + BM25 + hybrid vector) and a transformers.js `createSemanticProvider({ embedder })`
sit **behind the seam** (lazy, opt-in, never a hard dep); `createHybridProvider` fuses lexical +
semantic (RRF/weighted) in *zodal's own* layer.

The **scoped `@`-filter parser is engine-independent** and runs **before** free text reaches the
provider — it's zodal-domain logic (knows scopes/provenance/dirty/sensitivity), not engine logic:
`@modified` / `@facet:<tag>` / `@scope:<name>` / `@secret` / `@advanced` / `@managed`, composable
(AND/OR), evaluated as a predicate over effective values + provenance. Facets double as search
fields and filter scopes.

## Pattern 5 — provenance → badge / lock / reset, and the change lifecycle

All of {modified bar, scope tabs, reset, diff/preview} derive from **provenance + the layer/patch
model**, emitted as headless state — never renderer-baked widgets:
- **badge** = the modified indicator (effective ≠ default, or a non-default scope contributes) =
  the `@modified` provenance signal.
- **lock** = `managed`/policy band (non-overridable locally) → disabled control; the secret/
  `restricted` role also gates editability.
- **reset** = remove this key's layer from the active scope so a lower scope re-wins (NOT writing
  the default value).
- **dirty** = effective ≠ active profile/defaults, **always tied to provenance** (a boolean dirty
  flag divorced from provenance can't render an honest cross-scope diff).
- **save / undo** = per-setting `saveMode: 'live'|'explicit'`, `requiresRestart`, `sensitivity`
  drive the UX; emit toast / optimistic-UI / dirty-navigation-guard / undo as **headless events**.
  **undo = inverse RFC 6902 ops**. Sensitive fields need explicit confirm even when the rest
  autosaves — avoid a single global save model.
- **conditional visibility** = `enabledWhen`/`visibleWhen` (Storybook's `if:{arg,eq/neq/truthy}`)
  emitted in the field config, evaluated against effective values.

## Reuse from zodal (wrap, don't rebuild)

| zodal primitive | dials-ui use |
|---|---|
| `createRendererRegistry` + PRIORITY bands + composable testers | `createSettingsRendererRegistry` + settings testers + terminal `rawJson` |
| `ResolvedFieldAffordance`'s `[key]: unknown` index hook | settings affordance keys (`sensitivity`, `saveMode`, `requiresRestart`, facets, `order`, `numericBounds`) |
| `toFormConfig(collection, mode)` → `FormFieldConfig[]` | `toSettingsForm()` (a settings page is a form) |
| `createCollectionStore` / Zustand slices | the settings store re-emitting on layer change |
| `explain()` (`InferenceTrace`) | "why is this hidden / read-only / set to X?" + the provenance output |

`ResolvedFieldAffordance`/`SecretRef`/`ContentRef` live in `@zodal/core`, so dials-ui can use them
without depending on `@zodal/store`. Honor register-before-wrap (Zod-v4 `.meta()` returns a new
instance) — that's a `dials-core` concern, but testers read the resolved affordance, so a dropped
`.meta()` shows up as a wrong widget here. Factory functions, never classes; `.js` ESM imports;
`import type` for type-only.

## Reference implementations to copy (in the `zodal` repo)

- `zodal/packages/ui/src/registry/tester.ts` — PRIORITY bands + composable predicates + `and()`/`or()`.
- `zodal/packages/ui/src/registry/registry.ts` — `createRendererRegistry` with `resolve()`/`explain()`.
- `zodal/packages/ui/src/generators/` — `toFormConfig` (the model for `toSettingsForm`).
- `zodal-ui-vanilla/src/` — the reference renderer pattern (`@zodal/dials-ui-vanilla` mirrors it).

## Research routing

Open the doc, not the whole tree. All under `docs/research/raw/`.

| Question | Doc |
|---|---|
| Search-first IA, reveal-as-one-affordance, modified/reset, save semantics | `01-settings-ux.md` |
| Schema/metadata/organization three-bucket split; flat-keyspace rationale | `02A-separation-of-concerns.md` |
| Facets canonical, tree = projection; forward/inverse index; computed facets; B×C | `02B-organization-faceting.md` |
| `IndexableSetting` surface, `SearchProvider`, scoped-filter parser, MiniSearch/Orama/semantic | `02F-search.md` |
| Type→widget map, value-vs-organizational nesting, `rawJson` always-matches, discriminated unions | `02H-types-to-widgets.md` |
| VS Code registry/descriptor, `@`-filters, modified-bar provenance, `policy`/`restricted` | `03A-vscode.md` |
| Storybook control inference + `if:` conditional display; policy mandatory/recommended | `03D-frontend-settings-and-tokens.md` |
| zodal renderer registry / generators / `explain()` / `ResolvedFieldAffordance` hook | `05a-zodal-corpus-notes.md` |
| Cross-cutting decisions table (KEEP/AVOID per dimension), package map | `04-synthesis.md` (§2 J/K, §3, §4) |

Anything else: `/zodal-dials-dev-research-lookup`. Cascade/merge/provenance/secrets/codecs are
`dials-core` → `/zodal-dials-dev-cascade`.

## Maintenance

When you add a settings affordance key or a renderer, add/adjust the tester here and in the code
**in the same change**, and update the widget map + computed-facet list above. Drift here causes
wrong widget selection. This skill is a living artifact (see `AGENTS.md`).
