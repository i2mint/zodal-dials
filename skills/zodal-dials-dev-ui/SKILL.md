---
name: zodal-dials-dev-ui
description: Use when working on the zodal-dials HEADLESS UI LAYER — `@zodal/dials-ui`'s `toSettingsForm`, `createSettingsRendererRegistry` with its PRIORITY bands (FALLBACK/DEFAULT/LIBRARY/APP/OVERRIDE) and composable testers (`secretRoleIs`, `boundedNumber`, `isEnum`, `fieldNameMatches`) plus the terminal `rawJson` always-match renderer, the type→widget map and value-vs-organizational nesting, facet→group-descriptor projection with gesture-agnostic `revealed`/`reveal`, the `IndexableSetting[]` surface + pluggable `SearchProvider` + scoped `@`-filter parser, provenance→badge/lock/reset config, and dirty/save/undo headless events. Triggers on "add a settings widget", "settings renderer registry", "rawJson fallback", "facet grouping / reveal", "search the settings", "scoped filter parser", "provenance badge", "dirty/save events". Read BEFORE adding a renderer/widget or wiring search — it plugs into the open-closed registry, not hard-coded branching.
metadata:
  audience: developers
---

# zodal-dials · the headless UI layer (`@zodal/dials-ui`)

This package is **BUILT**. It is **Affordances → Targets glue, emitted as config, never DOM**: it
takes a `DialsDefinition` (from `@zodal/dials-core`) and produces plain serializable objects a
concrete renderer consumes. The two reference renderers are also **BUILT**: `@zodal/dials-ui-vanilla`
(DOM reference, no framework) and `@zodal/dials-ui-shadcn` (React). The registry **mirrors zodal's
`RendererRegistry`** (re-exported, not reinvented). The exported API is the source of truth; the
signatures below are the shipped ones (`packages/dials-ui/src/index.ts`).

## The one rule: headless-first

Every `dials-ui` export returns a config object/array (or a reactive store of them). No React, no
HTML, no `document`. The *gesture* (accordion vs route, toast vs banner) belongs in the renderer; the
*intent* belongs here. DOM/React lives only in `dials-ui-vanilla` / `dials-ui-shadcn`. If a function
in `dials-ui` would emit a DOM node or import a UI framework, it is in the wrong package.

## Pattern 1 — the settings renderer registry (re-export of zodal's `RendererRegistry`)

`createSettingsRendererRegistry<TComponent>()` returns a zodal `RendererRegistry` (a thin
specialization — `registry.ts` re-exports `createRendererRegistry`, `PRIORITY`, and the zodal testers
so renderer authors import everything from one place). `register(tester, renderer)` only **pushes**
(order-independent → adding a widget never edits another). `resolve(field, ctx)` runs **every** tester,
keeps the single highest score (ties → first-registered, strict `>`); `explain(...)` returns all
scored candidates for debugging *why* a widget won.

- **Testers are pure** `RendererTester` `(field, ctx) => number`, returning a **PRIORITY band, never
  a literal**: `PRIORITY = { FALLBACK:1, DEFAULT:10, LIBRARY:50, APP:100, OVERRIDE:200 }`.
- **Settings testers shipped** (factories, call them): `secretRoleIs()` (`ctx.sensitivity === 'secret'`
  → OVERRIDE), `isStructuredValue()` (`ctx.structured` or object/array zodType → LIBRARY),
  `isBoolean()` / `isEnum()` / `isNumber()` / `isString()` (thin `zodTypeIs(...)` wrappers),
  `alwaysMatch(priority = PRIORITY.FALLBACK)` (the terminal rawJson tester). Plus the re-exported
  zodal predicates `zodTypeIs`, `fieldNameMatches`, `metaMatches`, `hasRefinement`, `editWidgetIs`,
  with `and()` (SUMS scores; `-1` if any sub-tester fails) and `or()` (MAX). Compounds can exceed a
  single band — keep band arithmetic in mind so they don't accidentally outrank an `OVERRIDE`.
  `secretRoleIs()` reads `ctx.sensitivity`, so a secret always gets the masked widget regardless of
  underlying type.
- **The terminal `rawJson` renderer's tester ALWAYS matches** via `alwaysMatch()` (`() =>
  PRIORITY.FALLBACK`). This is the honest-degradation seam: any value the richer widgets decline
  still gets an editable, validated control — never a silent drop. Always register one.
- The registry is **user-instantiated, not a forced global singleton** (DI). Generic over the opaque
  `TComponent`; never inspect it. Concrete renderers populate it: `createVanillaSettingsRegistry()`
  and `createShadcnSettingsRegistry()` pre-register per-widget renderers + the terminal rawJson.

## Pattern 2 — type → widget mapping (`widgetKindFor`)

First **separate two nestings** (a first-class affordance signal, not an accident):
- **Organizational nesting** — dotted keys (`editor.fontSize`) → the *facet groups* (Pattern 3),
  **never a widget**. The leaf is the scalar.
- **Value nesting** — the value *is* an object/array → `object` / `array` widget (LIBRARY band).

`widgetKindFor(input: WidgetInput): WidgetKind` is the shipped classifier. Precedence (verbatim):
explicit `.meta({ editWidget })` override (if it names a known `WidgetKind`) → `sensitivity:'secret'`
→ `secret` → then by zodType: bool→`switch`, enum→`radio` (≤4 values) / `select`, number→`slider`
(when BOTH `bounds.min` and `bounds.max` are defined) / `number`, string→`text`, object→`object`,
array→`array`, default→`rawJson`. `WidgetKind` = `switch | select | radio | slider | number | text
| textarea | secret | color | date | path | object | array | rawJson`.

Anything unhandled (open record / mixed / `z.any` / over-budget) falls to `rawJson`, the honest
"edit as source" escape hatch (a raw edit is just another layer/patch). The two concrete renderers
register a control per widget kind plus the terminal `rawJson`.

## Pattern 3 — faceted organization (`toGroups`)

Facets/tags are **canonical** (multi-membership); a **group tree is one projection**. The schema
stays a flat dotted keyspace (SSOT); grouping is computed by `toGroups(fields, result?, options)` →
`SettingsGroup[]`. It builds the **forward index** (`facet → SettingKey[]`) internally and emits one
group per facet: `{ id, title, order, settingKeys, computed }`. The gesture is the renderer's choice,
never encoded here (the same model serves open-a-panel and expand-in-place).

- `GroupingOptions`: `facetDefs?: FacetDef[]` (`{ id, title?, order? }` — undeclared facets get a
  humanized title + default order `100`), `computedGroups?` (default true), `ungroupedTitle?`
  (default `'Other'`). Fields with no facet collect into a reserved `_ungrouped` group (order 1000).
- **Computed ("smart") groups** are predicates over field config + resolution state: `@secret`
  (`sensitivity === 'secret'`), `@advanced` (`advanced`), and — only when a `result` is passed —
  `@modified` (`winningScope !== 'default'`) and `@managed` (`provenance.managed`). So `@modified` is
  just one built-in computed group, not a special case.
- **Group ids must be unique** (renderers key off them): a declared facet colliding with `_ungrouped`
  or a computed `@…` id takes precedence; the reserved/computed group is skipped, never duplicated.
- Output is sorted by `order` then `title.localeCompare` (lexical tie-break). `order`: lower wins,
  unordered-after-ordered.

## Pattern 4 — search (declared surface + pluggable provider + scoped parser)

Search queries the **declaration, never the values** (secrets excluded). `toIndexableSettings(fields)`
→ `IndexableSetting[]` projects the engine-agnostic surface (`{ key, title, description, enumLabels,
facets, keywords }`; `keywords` includes the key plus its dotted/`_`/`-`/`/` segments).

`SearchProvider` is the pluggable seam (`search(query) → SettingKey[]`). The shipped default is
`createSubstringSearchProvider(settings, { fields? })` — zero-dep lowercased-substring match over the
selected `IndexField`s (`title | description | enumLabels | facets | keywords`); title/keyword hits
score 3, others 1; empty query returns all keys. Richer engines (MiniSearch, semantic) plug in behind
the same interface — none is a hard dep.

The **scoped `@`-filter parser is engine-independent** and runs **before** free text reaches the
provider — it knows scopes/provenance/sensitivity, not engine internals:
- `parseScopedQuery(query)` → `{ filters: ScopeFilter[], text }`. `ScopeFilter` types: `modified`,
  `managed`, `secret`, `advanced`, `facet:<id>`, `scope:<id>`. Unrecognized `@tokens` fall back to
  free text.
- `applyScopedFilters(keys, filters, { fields, result? })` keeps keys satisfying **ALL** filters
  (predicate over field config + provenance).
- `searchSettings(query, provider, context)` is end-to-end: parse → scoped-filter → free-text search
  the survivors, preserving the provider's ranking order.

## Pattern 5 — form, field states, the change lifecycle, and the reactive store

All of {modified bar, scope tabs, reset, diff/preview} derive from **provenance + the layer/patch
model**, emitted as headless state — never renderer-baked widgets.

**The form generator.** `toSettingsForm(dials, options)` → `SettingsForm` `{ fields, groups }` is the
top-level entry: it describes every non-hidden setting (`describeSettings`), orders them (by `order`,
then `label.localeCompare`), and projects them into `toGroups`. `options` extends `DescribeOptions` +
`GroupingOptions` plus `result?` (a resolution, enables computed groups) and `includeHidden?`.
`toFieldStates(fields, result, dirty?)` → `Record<key, SettingFieldState>` derives the value-dependent
state: `{ value, source: winningScope, managed, shadowed, dirty }`. **Defense in depth:** it masks a
secret to a `SecretRef` even from an UNMASKED resolution.

**Lifecycle helpers** (thin wrappers over dials-core; wire to your own toasts/guards/undo stack):
- `dirtyKeys(current, baseline)` / `isDirty(...)` — distinguish absent / UNSET / `undefined` / `null`
  / value as separate states.
- `resetToDefault(layer, key)` — **removes** the key so a lower scope re-wins (NOT writing the
  default). `unsetKey(layer, key)` — sets the explicit `UNSET` sentinel (intentional reset).
- `recordLayerChange(before, after)` → `ChangeRecord { forward, inverse }` (reversible RFC 6902 patches
  over the *serialized* layer, so UNSET survives); `applyLayerPatch(layer, ops)` redo/undo.

**The reactive store** (`createSettingsStore(dials, options)` → `SettingsStore`) is the framework-
agnostic source of truth. It holds the ordered lower-scope stack + the editable (user) layer; every
mutation re-resolves the cascade (effective + provenance + conflicts), recomputes the dirty set and
validation, masks secrets, and notifies subscribers. `subscribe`/`getState` plug straight into React's
`useSyncExternalStore`.
- API: `getState()`, `subscribe(listener) → unsub`, `set(key, value)`, `unset(key)` (UNSET sentinel),
  `reset(key)` (remove → lower scope re-wins), `setLayer(layer)`, `setScopes(scopes)`, `markSaved()`
  (clears dirty), `get(key)`, `explain(key) → KeyProvenance`.
- `SettingsState`: `{ effective, provenance, conflicts, layer (RAW — split secrets before persisting),
  scopes, dirty, validation }`. Options: `scopes?`, `layer?`, `scope?` (default `'user'`),
  `maskSecrets?` (default true), `onListenerError?`.
- It **validates over UNMASKED** values then masks the exposed surfaces; `set` has a no-op guard
  (skips recompute/notify on unchanged scalar, also breaking the write-back re-entrancy loop).

**Save / lock / conditional visibility.** Per-setting `saveMode`, `requiresRestart`, `sensitivity`
drive the UX as headless signals (sensitive fields confirm even when the rest autosaves); `managed`
gates editability (disabled control). Undo = inverse RFC 6902 ops.

## Reuse from zodal (wrap, don't rebuild)

| zodal primitive | dials-ui use |
|---|---|
| `createRendererRegistry` + PRIORITY bands + testers (re-exported by `registry.ts`) | `createSettingsRendererRegistry` + settings testers + terminal `alwaysMatch` rawJson |
| `RendererTester` `(field, ctx) → number` | settings testers read `ctx.sensitivity` / `ctx.structured` + field zodType |
| `toFormConfig` generator model | `toSettingsForm(dials, options)` → `{ fields, groups }` (a settings page is a form) |
| Zustand-style external store | `createSettingsStore` (re-resolves the cascade on every mutation; `useSyncExternalStore`-ready) |
| `explain()` / `InferenceTrace` | registry `explain()` + the store's `explain(key) → KeyProvenance` |

Factory functions, never classes; `.js` ESM imports; `import type` for type-only. Honor
register-before-wrap (Zod-v4 `.meta()` returns a new instance) — that's a `dials-core` concern, but a
dropped `.meta()` shows up as a wrong widget here.

## Gotchas the build taught us

Adversarial-critic passes caught ship-blocking bugs the happy path missed — each is now a regression
test. The UI/store ones (full list + the secrets/patch/store gotchas in
`docs/lessons-from-the-build.md`):

- **`getNumericBounds` returns ±Infinity (or null) when unbounded — not undefined.** Coalesce
  non-finite with `Number.isFinite`, or every number becomes a slider.
- **Group ids must be unique** — a user facet colliding with a computed (`@secret`) or the catch-all
  (`_ungrouped`) must not yield two groups with one id (renderers key off id). `toGroups` enforces this.
- **Dirty distinguishes `null` / `undefined` / absent / UNSET** as four separate states.
- **Number inputs:** `Number('')` is `0`, `Number('abc')` is `NaN` — decode empty/invalid as "no
  change", never write 0/NaN.
- **React (`-shadcn`):** uncontrolled JSON editors desync on re-render → re-seed the rawJson control
  via a `key` on the serialized value; key mapped children by index; **memoize the registry**.
- **Store:** validate over **UNMASKED** values (a constraint must see the real secret, not a
  `SecretRef`); isolate throwing listeners (try/catch per listener + `onListenerError`); **copy
  `scopes` in and out** — never alias the caller's array into internal state.

## Reference implementations (BUILT, in this repo)

- `packages/dials-ui-vanilla/src/` — the DOM reference renderer (`createVanillaSettingsRegistry`,
  per-widget `render*` fns, `renderField`/`renderSettingsPanel`, terminal `renderRawJson`). No framework.
- `packages/dials-ui-shadcn/src/` — the React renderer (`createShadcnSettingsRegistry`, `*Control`
  components, `SettingField`/`SettingsPanel`, terminal `RawJsonControl`). Both register a control per
  widget kind + the terminal rawJson and follow the registry+widget pattern above.

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
