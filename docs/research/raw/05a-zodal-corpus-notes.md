# zodal Corpus Notes — Grounding for zodal-settings

> **Purpose.** Extracted, cited notes from the entire zodal research/design corpus, read
> read-only to ground a new domain specialization: **zodal-settings** (settings /
> configuration / preferences / parameterization). This is the source the zodal-settings
> synthesis + design plan will read. All file paths are absolute under the workspace root
> `/Users/thorwhalen/Dropbox/py/proj/i/_zodals`. Bracketed tags `[A]…[L]` map findings to the
> zodal-settings dimensions named in the brief.
>
> **Sources read in full:** `zodal/docs/research/01,04,05,06,07-*.md`,
> `zodal/docs/architecture.md`, `zodal/docs/ideas-and-future.md`, `zodal/docs/known-issues.md`,
> all four bifurcation docs, `zodal/.claude/CLAUDE.md` + rules, the `zodal-dev` / `zodal-store-adapter` /
> `zodal-ui-renderer` skills, the workspace `zodal-ecosystem` skill, and the zodal-graphs
> precedent (`README.md`, `dev-plan.md`, `.claude/CLAUDE.md`, `zodal-graph-concept.md`,
> `research_guide.md`, `_grounding-brief.md`, `_reconciliation.md`, dev-skill frontmatters,
> root monorepo config). Skimmed `03-technology-research-takeaways.md` (102 KB).
>
> **Note on a missing file:** `zodal/.claude/CLAUDE.md` and the workspace guide reference an
> "approved architecture plan" at `zodal/.claude/plans/stateless-beaming-feather.md`, but
> **that file does not exist** (`zodal/.claude/plans/` is absent). The durable design SSOT is
> instead `zodal/docs/architecture.md` + the `docs/research/` corpus + the `.claude` skills.
> zodal-settings should not assume a plan doc by that name exists.

---

## 1. Conventions the new package MUST obey

These are non-negotiable ecosystem rules. Sources: `.claude/CLAUDE.md` (workspace + zodal),
`.claude/rules/cross-package.md`, `zodal-ecosystem/SKILL.md`, the three skill files, and the
zodal-graphs root config.

### Package identity & naming
- **npm scope `@zodal`.** Official packages publish under the `@zodal` org. Store adapters →
  `@zodal/store-<backend>`; UI renderers → `@zodal/ui-<library>`. Community/third-party use
  **unscoped** `zodal-store-*` / `zodal-ui-*`. zodal-graphs publishes `@zodal/graph-*`. By that
  precedent, settings packages would be **`@zodal/settings-*`** (working folder names stay
  unscoped, e.g. `zodal-settings/`).
- **GitHub repo & local folder names remain unscoped** (e.g. folder `zodal-store-fs/` publishes
  as `@zodal/store-fs`). (`cross-package.md` §npm Naming.)

### Factory functions, never classes
- Every adapter/renderer/definition exports a **factory**: `createXxxProvider()`,
  `createXxxRegistry()`, `defineCollection()`, `defineGraph()`. Returns a **plain object**
  implementing the interface. No `new`, no `class`. (Workspace CLAUDE.md "Shared Patterns";
  zodal-graphs CLAUDE.md "Working conventions".)

### Headless first
- Produce **plain serializable configuration objects, never DOM/React**. Generators like
  `toColumnDefs` / `toFormConfig` return config arrays; rendering is the consumer's concern.
  (`zodal/docs/architecture.md` "Design Principles"; `05-architecture-and-patterns.md` Pattern 6.)

### Monorepo vs satellite
- **Interfaces live in the monorepo; implementations in satellites.** Core types/interfaces are
  defined in `@zodal/core` / `@zodal/store` / `@zodal/ui`; concrete backends and renderers are
  separate repos. (Workspace CLAUDE.md.)
- **Satellite packages are independent repos** — NOT part of the monorepo `pnpm-workspace.yaml`.
  They use **real semver ranges** (not `workspace:*`) for `@zodal/*` dev deps, and declare
  `@zodal/core` + the relevant side (`@zodal/store` **or** `@zodal/ui`, never both) as
  **peer dependencies**. (`cross-package.md` §Satellite Packages Are Independent Repos /
  §Version Compatibility; `zodal-ecosystem/SKILL.md` package.json template.)
- **Hard dependency rule:** `core ← store`, `core ← ui`; `@zodal/ui` and `@zodal/store` **never
  depend on each other**. Satellites depend on one side only. No cross-satellite deps.
  (`architecture.md`; `cross-package.md` §No Cross-Satellite Dependencies.)
- zodal-graphs chose the **monorepo-of-many-lightweight-packages** model (one private repo,
  many tree-shakeable `@zodal/graph-*` published separately). zodal-settings should likely do
  the same: one `zodal-settings/` monorepo → `@zodal/settings-core`, `@zodal/settings-ui`, etc.

### Build tooling (identical across the fleet)
- **tsup** (dual CJS/ESM + `.d.ts`), **vitest** (unit per-package + integration at root),
  **TypeScript strict mode**. Monorepo adds **pnpm workspaces + Turborepo**. **Zod v4 as a peer
  dependency.** (Workspace CLAUDE.md "Build tooling"; zodal-graphs `package.json`,
  `pnpm-workspace.yaml` (`packages/*`), `turbo.json`, `tsconfig.base.json`.)
- zodal-graphs root config to mirror: `packageManager: pnpm@9.15.0`; turbo tasks
  `build`(`dependsOn ^build`, outputs `dist/**`)/`test`(`dependsOn build`)/`lint`/`typecheck`;
  `tsconfig.base.json` uses `target ES2022`, `module ESNext`, `moduleResolution bundler`,
  `strict`, `verbatimModuleSyntax`, `isolatedModules`, `declaration`+`declarationMap`.
- **exports map:** `types` condition **must come first**, then `import`, then `require`.
  Pin Zod `peerDependencies.zod: ">=4.1.13"` (the version where `z.union`→`anyOf`,
  `z.discriminatedUnion`→`oneOf` for `z.toJSONSchema()`). (`zodal-ecosystem/SKILL.md`;
  zodal-graphs dev-plan §4.1.)

### Zod v4 introspection gotchas (apply everywhere) [A]
From `zodal/.claude/CLAUDE.md`, workspace CLAUDE.md, `known-issues.md`, zodal-graphs CLAUDE.md:
1. **Schema internals via `schema._zod.def`** — not `.shape`, not `._def`. (Undocumented API;
   isolate all access in inference helpers `getZodBaseType`, `unwrapZodSchema`, `hasZodCheck`,
   `getEnumValues`, `getZodMeta`, `getNumericBounds` so internal changes touch one file.)
2. **Enum entries** stored as a `{ key: value }` object, not an array.
3. **Reading metadata:** `schema.meta()` with **no arguments** returns the metadata.
4. **`.meta()` returns a NEW instance** — metadata is **lost if wrapped** with
   `.optional()/.nullable()/.refine()/.transform()/.array()`. **Register-before-wrap:** use
   `affordanceRegistry.register(innerSchema, …)` on the unwrapped schema before wrapping. The
   registry is **WeakMap-backed, keyed by object identity** (not structural equality), and
   `unwrapZodSchema()` walks wrappers to find the inner schema.
5. **`.js` extensions on all internal ESM imports** (e.g. `'./types.js'`); `import type` for
   type-only. tsup emits the CJS build.
6. **`z.toJSONSchema()` throws on unrepresentable types** — keep emitted schemas in the
   representable subset. (zodal-graphs CLAUDE.md.)
7. **`z.codec()`** (Zod v4.1+) for bidirectional field-level transforms.

### `.claude` dev-toolkit layout (the dev-skills pattern)
- zodal-graphs keeps dev skills in **repo-root `skills/<name>/`**, symlinked into
  `.claude/skills/`, invoked as **`/zodal-graphs-dev-<name>`**. By that precedent, settings dev
  skills are **`/zodal-settings-dev-<name>`**.
- The **`.claude/CLAUDE.md` is the index/map, not a content store** (placement test: *"if I
  deleted this sentence, would behavior change? If not, it belongs in a file."*). Behavioral
  rules live in CLAUDE.md + skills; context/decisions live in named docs the skills route to.
- Dev skills are **living artifacts**: create when a recurring dev task emerges, **revise in the
  same change** that alters the code they describe, prune with a reversible
  `metadata.delete-after: <milestone>` frontmatter marker. New `.claude/skills/` dirs only become
  invocable **after a session restart**. (zodal-graphs CLAUDE.md "skill-maintenance loop".)
- Dev-skill frontmatter convention (verbatim shape from zodal-graphs):
  `name: zodal-graphs-dev-<topic>`, a long **trigger-rich `description:`** ("Use when … Triggers
  on … Read BEFORE …"), and `metadata: { audience: developers }`.

### Other working conventions
- **Every module opens with a top-level docstring** (auto-extracted for generated docs).
- **Branch discipline:** report the starting branch; switch back when done; worktree for
  parallel work. **Never publish to npm from a laptop** — publishing is CI-driven via a
  `[publish]` commit marker on `main`, gated on owner approval for the first release.
- **Privacy:** never write absolute local paths, secrets, or machine names into committed files,
  issues, PRs, or commit messages.
- **Testing consistency:** contract tests per package (mirror the `describe.each` adapter
  contract suite). Layered: unit (`packages/*/tests/`), integration (`tests/integration/`),
  heavy/manual (`tests/heavy/`, not in CI), BDD story specs (`tests/stories/`, Given/When/Then).

---

## 2. Reusable core primitives [A, J, K]

What already exists in `@zodal/core` / `@zodal/store` / `@zodal/ui` that directly serves a
settings package. (Sources: `architecture.md`, `zodal-dev/SKILL.md`, `zodal-ecosystem/SKILL.md`,
`04-affordance-taxonomy-summary.md`, `05-architecture-and-patterns.md`.)

### The 6-layer inference engine (the keystone reuse)
`@zodal/core` resolves field affordances through six layers, **lowest → highest precedence**
(from `architecture.md` "@zodal/core" + `zodal-dev/SKILL.md` "Inference Engine"):
1. **Type defaults** — `getTypeDefaults(zodType)`: `z.string()` → sortable/searchable;
   `z.number()` → `aggregatable`, `filterable:'range'`; `z.enum()` → `filterable:'select'`,
   `groupable`; `z.boolean()` → `filterable:'boolean'`.
2. **Validation refinements** — `refineByValidations`: `.email()` → email widget;
   `.min(0).max(100)` → range slider.
3. **Name heuristics** — `refineByFieldName(key, …)` regex patterns: `password` → hidden;
   `createdAt` → not editable / relative-date.
4. **Zod `.meta()`** — `extractAffordancesFromMeta(meta)`, explicit developer annotation.
5. **affordanceRegistry** — external WeakMap registry, **survives `.optional()/.nullable()/
   .default()` wrapping** (register-before-wrap).
6. **CollectionConfig.fields** — explicit config overrides, **always wins**.

Entry points: `defineCollection(schema, config?)` → `CollectionDefinition` with resolved
affordances; `inferFieldAffordances(key, schema)`; **`explain()` on a `CollectionDefinition`** →
a **layer-by-layer inference trace** (the `InferenceTrace`/`InferenceStep` types live in
`core/types.ts`; new traced props are added to a `TRACED_PROPS` array). For settings, `explain()`
is exactly the "why is this setting hidden / read-only?" debugging affordance.

> **Direct mapping for settings:** a settings schema *is* a Zod object; each field is one
> setting. The inference engine already classifies each field's editability, visibility,
> widget, format, grouping, etc. from type + name + `.meta()` — which is most of what a settings
> form needs out of the box. zodal-settings is largely a **domain specialization of
> `defineCollection`** (a single-item "collection" = a settings document), plus settings-specific
> heuristics (e.g. `*_secret`, `*_token`, `enableX`/`isX` booleans, units, ranges).

### Affordance taxonomy — fields relevant to a setting [A, K]
From `04-affordance-taxonomy-summary.md`, the **Field-Level** affordances (the ones a single
setting cares about; "Typed in predecessor?" column quoted):

| Affordance | Definition | Predecessor type |
|---|---|---|
| `editable` | Field can be modified by the user. Options: edit widget, validation, permission, confirmation. | `boolean` |
| `inlineEditable` | Editable directly in the collection view (click-to-edit). | `boolean` |
| `visible` | Whether the field appears in the view by default. | `boolean` |
| `hidden` | Stronger than `visible:false` — **cannot be toggled by user**. | `boolean` |
| `detailOnly` | Only shown in detail/edit view, never in the list. | `boolean` |
| `summaryField` | Appears in compact/summary views. | `boolean` |
| `displayFormat` | How to render the raw value (format string, currency, date…). | `string` |
| `badge` | Render enum values as colored badges/chips. | `Record<string,string>` |
| `editWidget` | Override the default edit widget type. | `string` |
| `description` | Help text for the field. | `string` |
| `title` | Human-readable label. | `string` |
| `tooltip` | Show full value on hover when truncated. | `boolean` |
| `copyable` | Show a copy-to-clipboard button. | `boolean` |
| `truncate` | Max chars before truncation. | `number` |
| `readable` | Whether the field is returned in responses. | `boolean` |
| `requiredOnCreate` | Required when creating, not on update. | `boolean` |
| `requiredOnUpdate` | Required when updating. | `boolean` |
| `immutableAfterCreate` | Editable on create, **read-only on update**. | `boolean` |
| `editPermission` | Role/ownership-based edit control. | taxonomy only |
| `editHistory` | Track edit history for this field. | taxonomy only |
| `groupable` | Items can be grouped by this field's values. | `boolean` |

These translate near-directly to settings semantics: `editable`/`hidden`/`immutableAfterCreate`
→ read-only vs. mutable vs. set-once settings; `requiredOnCreate` → required-at-bootstrap;
`editWidget`/`displayFormat`/`badge` → widget choice; `description`/`title`/`tooltip` → labels &
help; `editPermission` → who may change a setting; `groupable` → **settings sections/categories**
(a settings UI is fundamentally a grouped form). `editHistory` → settings audit/change log.

**Cross-cutting concerns** (apply at any level): `Confirmation` (`OperationConfirmation` type —
"are you sure?" for destructive setting changes), `keyboardShortcut`, **Context sensitivity**
(`enabledWhen` / `visibleWhen` — **conditional setting visibility**, e.g. show "proxy host" only
when "use proxy" is true; *not yet typed in predecessor*), and **Server vs. Client** declaration.

**Resolution order (memorize):** inferred defaults < `.meta()` < `affordanceRegistry` <
`CollectionConfig.fields`. The `.meta()` attach pattern (verbatim example):
```ts
z.object({
  status: z.enum(['draft','published']).meta({ badge: { draft:'secondary', published:'success' } }),
  notes: z.string().meta({ detailOnly: true, editable: true }),
})
```

### Generators & state [J]
`@zodal/ui` exports (from `architecture.md`):
- `toColumnDefs(collection)` → TanStack-Table-compatible `ColumnConfig[]`.
- `toFormConfig(collection, mode)` → `FormFieldConfig[]` for create/edit — **the primary
  generator for a settings editor** (a settings page is a form).
- `toFilterConfig(collection)` → `FilterFieldConfig[]`.
- `createCollectionStore(collection)` — pure-function state; 5 composable slices
  (`createSortingSlice`, `createFilterSlice`, `createPaginationSlice`, `createSelectionSlice`,
  `createColumnSlice`), each returning `{ initialState, actions }`;
  `createZustandStoreSlice(collection, provider?)` for Zustand `create()`.
- **`toPrompt(collection)`** — AI/LLM-consumable description of the collection [AI artifacts].
- **`toCode(collection, options?)`** — TypeScript code generation.

`FormFieldConfig` shape (from `zodal-ui-renderer/SKILL.md`): `{ name, label, type, required,
disabled, hidden, placeholder, helpText, defaultValue, options, order, zodType }` — `type` is
`'text'|'number'|'checkbox'|'select'|'date'|'tags'|'json'|<custom>`. `defaultValue` + `helpText`
+ `hidden` + `disabled` are exactly the settings-form primitives.

### DataProvider (where a settings document is stored) [I, L]
`@zodal/store` `DataProvider<T>` — **7 required CRUD methods** (`getList`, `getOne`, `create`,
`update`, `updateMany`, `delete`, `deleteMany`) + optional `upsert?()`, `getCapabilities?()`,
`subscribe?()` + 2 bifurcation-optional `getContent?()`/`setContent?()`. Plus
`createInMemoryProvider`, `filterToFunction`, `wrapProvider(provider, codec)`,
`ProviderCapabilities`. For settings, the existing fs / localStorage / S3 / Supabase adapters
already cover the obvious config backends (a config file, browser prefs, env-backed store).
`getCapabilities()` is **honest capability reporting** — settings UI can degrade (hide an editor
when a backend is read-only).

### `defineCollection` "single item" framing for settings
The taxonomy is collection-oriented, but a **settings object is one item with many typed
fields**. zodal-settings can model "a settings document" as a degenerate collection (one record),
reusing field-level affordances + `toFormConfig` and ignoring list/selection/pagination
affordances. zodal-graphs proves the pattern: it kept `defineCollection`'s 6-layer inference and
`ResolvedFieldAffordance`'s **`[key:string]: unknown` index signature as the extensibility hook**
for new domain metadata. zodal-settings should add settings-specific affordance keys the same way.

---

## 3. Bifurcation → secrets / sensitivity [dimension I]

The content-metadata bifurcation machinery is the **direct precedent for separating secret /
sensitive settings from ordinary ones**. Sources: all four bifurcation docs + `zodal-dev/SKILL.md`
"Content-Metadata Bifurcation Pattern".

### The mechanism as built (status: implemented in zodal)
- **`FieldStorageRole = 'metadata' | 'content'`** added to `FieldAffordance` (a *classification*,
  not a config; default `metadata`; no "both"/"auto"). (`bifurcation_implementation_notes.md` §1.1.)
- **`ContentRef`** type lives in **`@zodal/core`** (so `@zodal/ui` can use it without depending on
  `@zodal/store`): `{ _tag:'ContentRef'; field; itemId; hash?; url?; mimeType?; size? }`, with an
  **`isContentRef()` type guard**. The `_tag` discriminator makes runtime narrowing reliable.
- **Inference fits the 6-layer engine:** Layer 1 type (`z.instanceof(Blob|File|ArrayBuffer|
  Uint8Array)` → content), Layer 3 name heuristics → content, Layers 4–6 override. Content
  classification **cascades** `sortable/filterable/searchable:false` + `detailOnly:true`.
  `'storageRole'` is added to `TRACED_PROPS` so `explain()` shows the classifying layer.
- **`CollectionDefinition` gains** `getContentFields()`, `getMetadataFields()`, `hasBifurcation()`.
- **`createBifurcatedProvider({ metadataProvider, contentProvider, contentFields })`** in
  `@zodal/store` composes **two standard `DataProvider<T>`s into one** — `getList` hits metadata
  only; writes go metadata-first then content with **compensating actions** (Saga pattern); deletes
  content-first. `splitFields()` partitions an object; capabilities = query caps from metadata
  provider, CRUD caps **intersected**. Optional `getContent?()/setContent?()` route to the content
  provider (zero breaking change to existing adapters).
- **UI awareness:** `ColumnConfig.meta.storageRole`/`meta.isContentRef`;
  `FormFieldConfig.isContentField` + inferred `type:'file'` (+ `acceptMimeTypes`, `maxSize`);
  composable tester `storageRoleIs('content')`; `contentLoading` state +
  `setContentLoading()` action for lazy "click-to-load" UIs.

### How this maps to a "sensitivity" axis for settings [I]
The brief asks how bifurcation maps to separating secret/sensitive settings. The bifurcation
design is a **general two-store routing pattern driven by a schema-level field classification**,
and it generalizes cleanly:

- **Add a `storageRole`-analogue for sensitivity**, e.g. a `sensitivity: 'public' | 'sensitive' |
  'secret'` field affordance (or reuse `storageRole` conceptually). Classify via the **same
  6-layer cascade**: Layer 3 **name heuristics** (`*_secret`, `*_token`, `*_key`, `password`,
  `apiKey`, `credential`…) → `sensitive/secret`; Layer 4 `.meta({ secret:true })` override.
  The bifurcation name-heuristic precedent already special-cases `password`/`token`-style names.
- **`createBifurcatedProvider` is the routing template for secrets:** ordinary settings →
  the queryable/readable config store; secret settings → a **secret backend** (OS keychain, Vault,
  a `.env`/secrets manager, an encrypted store) as the "content provider". The unified
  `DataProvider` interface hides the split — exactly the **Repository/Facade** anti-leak rule
  ("consumers never call `vault.get()` and `config.read()` directly";
  `bifurcation_research_for_zodal.md` "Leaky Bifurcation Anti-Pattern").
- **`ContentRef` → a "SecretRef"**: list/read views return a **reference**, not the secret value
  (analogous to `ContentRef` standing in for a blob). A settings form shows "•••• (set)" /
  "not set" from a `SecretRef` without ever loading the plaintext, with explicit `getContent`-style
  lazy reveal. Cascade implies `searchable/filterable:false` + masked rendering by default.
- **Write ordering & compensation** (Saga, `bifurcation_research_for_zodal.md` §5): write the
  ordinary record first, then the secret; compensate on failure. **CQRS framing** (§6): the
  config store is the query model; the secret store is write/read-only by key.
- **Anti-patterns to honor** (`bifurcation_research_for_zodal.md`): never store secrets as
  ordinary queryable columns ("Content in the DB"); never expose the two stores as independent
  write targets ("Uncoordinated writes"); don't present a union keyspace that masks
  inconsistency.
- **No adapter changes required** — existing store adapters compose as the metadata side; a new
  secret adapter is just another `DataProvider`. This is the cheap path to secret-aware settings.

> **Design note:** the cleanest reuse is to treat "secret/sensitive" as a **new field-storage-role
> dimension** modeled identically to bifurcation, with a `createSensitiveSettingsProvider()` that
> is `createBifurcatedProvider` specialized to a secrets backend, plus a `SecretRef` mirroring
> `ContentRef`, plus a `secretRoleIs()` renderer tester mirroring `storageRoleIs()`.

---

## 4. Renderer registry — hosting settings widgets [J]

Source: `05-architecture-and-patterns.md` Pattern 3, `zodal-ui-renderer/SKILL.md`, `zodal-dev/SKILL.md`.

- **Ranked tester registry** (JSON Forms-inspired): a registry of `(tester, renderer, name)`
  entries; each tester `(field: ResolvedFieldAffordance, context: RendererContext) => number`
  scores the match; **highest score wins**. `RendererContext` carries `mode: 'cell'|'form'|'filter'`.
- **Registry is user-instantiated, not a global singleton** (`createRendererRegistry<T>()`), with
  **`registry.explain(field, ctx)`** returning scored candidates for debugging. (Resolves the
  open question about global vs. per-collection vs. DI in favor of DI.)
- **Named PRIORITY bands** (verbatim): `FALLBACK=1`, `DEFAULT=10`, `LIBRARY=50`, `APP=100`,
  `OVERRIDE=200`. (Bands: defaults 1–10, type-specific 11–50, refinement-specific 51–100,
  explicit override 101+.)
- **Composable predicate builders:** `zodTypeIs()`, `hasRefinement()`, `fieldNameMatches()`,
  `metaMatches()`, `editWidgetIs()`, `storageRoleIs()`, `and()`, `or()`. (Scores add: e.g.
  `and(zodTypeIs('string'), hasRefinement('email'))` = 10+50.)
- **Open for extension, closed for modification:** adding a settings widget = registering one new
  entry; no switch statements. A `.meta({ editWidget:'…' })` override beats everything via the
  OVERRIDE band.

> **For settings [J]:** a settings UI needs widgets keyed by *kind of setting* — toggle (boolean),
> slider/stepper (bounded number), select (enum), secret input (masked), file/path picker, key-value
> map, duration, color, theme. Each is a renderer entry with a tester: e.g.
> `and(zodTypeIs('number'), metaMatches(f => f.numericBounds != null))` → slider;
> `secretRoleIs('secret')` → masked input + reveal; `fieldNameMatches(/theme|color/i)` → color
> picker. zodal-graphs already ported this verbatim (`createGraphRendererRegistry`, graph-aware
> testers, same PRIORITY bands, rank-and-degrade selection) — zodal-settings should mirror it as
> `createSettingsRendererRegistry()`.

---

## 5. Codecs — config-file round-trip / type coercion [L]

Source: `05-architecture-and-patterns.md` Pattern 2, `zodal-dev/SKILL.md` "Codec Pattern",
`architecture.md`, `06-prior-art` (io-ts / effect / dol), `07-open-questions.md` "Codec/Transform".

- **Two levels:**
  1. **Field-level** — `Codec<TEncoded, TDecoded>` in `@zodal/core/codec-types.ts`. Pre-built:
     **`dateIsoCodec`, `dateEpochCodec`, `jsonCodec()`**. Compose with `composeCodecs()`. Zod v4
     `z.codec()` is the first-class field-level transform; the inference engine (Layer 2) should
     **detect `z.codec()` and record the transform** (ideas-and-future "Zod v4 z.codec() detection").
  2. **Provider-level** — **`wrapProvider(provider, codec)`** in `@zodal/store/wrap-provider.ts`
     wraps a `DataProvider<TStored>` with decode/encode to yield `DataProvider<TApp>`.
- **Codec duality:** every transform has **encode (store→display) and decode (display→store)**;
  codecs **compose by chaining** (reverse order for the reverse direction). Following dol's
  `wrap_kvs`: transforms apply to **keys** (field names/paths — aliasing, path remapping),
  **values** (formatting, unit conversion, serialization), or **both**.

> **For settings [L]:** config files come in many encodings (JSON, YAML, TOML, `.env`, ini) and
> store raw strings that must coerce to typed values (a port is a number, a flag is a boolean, a
> duration is `"30s"`→ms, a list is comma-separated). This is **exactly the codec round-trip**:
> a `tomlCodec()`/`envCodec()` at the provider level (`wrapProvider`) handles file ↔ object; a
> field-level codec handles `"30s" ↔ 30000`, `"true" ↔ true`, `"a,b,c" ↔ ['a','b','c']`. **Key
> codecs** map between a config file's snake_case/dotted keys and the app's camelCase setting
> names (e.g. `server.max_connections` ↔ `serverMaxConnections`). The pre-built date codecs and
> `composeCodecs()` are reusable as-is. **Open question** (`07-open-questions.md`): whether
> codecs live in `@zodal/core` (schema-adjacent) or `@zodal/store` (transport-adjacent), and how
> much of dol's `wrap_kvs` to port — settings work must pick a side (recommend field-level in core,
> the `envCodec`/`tomlCodec` provider wrappers in a settings-store package).

---

## 6. zodal-graphs as a template (the blueprint) [the org/plan shape]

zodal-graphs is the **precedent domain specialization** of zodal. zodal-settings should copy its
structure wholesale. Sources: `zodal-graphs/.claude/CLAUDE.md`, `docs/dev-plan.md`,
`docs/research/README.md`, `docs/research_guide.md`, `docs/zodal-graph-concept.md`, dev-skill
frontmatters, root config, and the delegated read of `_grounding-brief.md`/`_reconciliation.md`.

### Three-layer framing: **Model → Affordances → Targets**
(`zodal-graph-concept.md`, `.claude/CLAUDE.md` "What zodal-graphs is"):
1. **Model** — Zod schemas describing the domain (for graphs: nodes/edges/ports; **for settings:
   the settings/config schema**). Single source of truth.
2. **Affordances** — declared catalog of operations & views over the model, pure declaration, no
   implementation baked in (for settings: read/write/reset, validate, import/export config,
   reveal-secret, group-by-section, conditional-visibility, view-as-form/JSON/CLI).
3. **Targets (adapters/renderers)** — pluggable bindings realizing affordances against a concrete
   system: a UI renderer, a storage backend, or (graphs) a graph DB. The affordance layer is the
   stable interface; targets are open-closed extension points.

**Design commitments** (verbatim from concept doc): Facade + SSOT · open-closed via adapters ·
declarative over imperative · composition over inheritance · **progressive disclosure** (simple
declaration → default renderer; advanced features opt-in) · **wrap, don't rebuild** ("renders
nothing, runs no engine itself").

### Architecture rules it pins (mirror zodal exactly)
1. One canonical model, **three physically-separate serializable layers** (never fuse
   presentation into the model). 2. **Three plugin registries, one registration API**
   (affordances/schemas · renders · schema↔render mappings; factory + tester + PRIORITY band).
   3. **Capability-ranked renderer selection** that **degrades honestly**. 4. Monorepo of many
   lightweight `@zodal/*-*` packages. 5. Wrap, don't rebuild — minimize genuinely-new modules.

### Package list (the monorepo → many `@zodal/graph-*` packages)
From `dev-plan.md` §2 + the `packages/` dir (9 built): `@zodal/graph-core` (canonical model,
capabilities vocab, `defineGraph`, serializer, pure adapters, the bespoke `portTypeCompatible`),
`@zodal/graph-ui` (registries + capability-ranked selection + generators), `@zodal/graph-compute`,
`@zodal/graph-react-flow`, `@zodal/graph-runtime`, `@zodal/graph-sigma`, `@zodal/graph-table`,
`@zodal/graph-timeline`, `@zodal/graph-layout`. **Hard rule inherited:** a renderer package
depends on `@zodal/graph-ui`, never on another renderer; shared logic → `@zodal/graph-core`.

> **Settings analogue (proposed):** `@zodal/settings-core` (settings schema + affordances +
> inference specialization + `defineSettings` + codecs + `SecretRef`), `@zodal/settings-ui`
> (settings renderer registry + `toSettingsForm` generator + grouping/sections + conditional
> visibility), then satellites `@zodal/settings-store-*` (env/toml/yaml/keychain) and
> `@zodal/settings-ui-*` (shadcn settings panel, CLI prompts).

### Dev-plan phasing — **horizon-graded "living document"**
`dev-plan.md` is explicitly a **living, horizon-graded** plan: **near horizon is detailed** (named
packages, modules, functions, files, acceptance tests); **far horizon deliberately coarse**
("we *learn as we build* and sharpen later horizons as earlier ones land"). It co-evolves with the
dev-skill toolkit and the build. Audience = **AI agents**; each near-term task is scoped so an
agent picks it up from an issue + the routed skill and executes independently; decisions are
pre-made with rationale, genuinely-open ones flagged with a **working default so building is never
blocked**. Structure: a **North-star one-picture**, a **package map table** (Package | Role |
Depends on | Horizon), a **build-order rationale** (keystone first), **Horizon 1** in full detail
(numbered tasks ≈ one issue each, with a **checkpoint gate**: a flagship benchmark test that fails
the build if violated — for graphs, the **port-fidelity round-trip benchmark**), **Horizon 2**
medium detail, **Horizon 3+** coarse, **cross-cutting workstreams** (CI/publish, testing, work
tracking via GitHub issues-as-journal + discussions-as-rationale, docs SSOT), a **Decisions
baked-in vs. open** section (each open item has a working default), a **Risks & gates** table,
and a **"How an agent executes a near-term task"** checklist (read issue + routed skill → branch →
build to acceptance criteria, write the contract/benchmark test first → `pnpm build && typecheck &&
test` → adversarial critic subagent for checkpoints → PR → merge → update plan + skill; never
publish). zodal-settings' dev-plan should follow this exact skeleton; pick a flagship checkpoint
benchmark (e.g. **config-file round-trip fidelity** + **secret never leaks into the queryable
store**).

### Research-doc structure (replicate this)
The corpus proceeds **concept → affordance analysis → N deep-research prompts ("regimes") → 2N
reports → reconciliation → decision table.** Conventions:
- **Regime decomposition (P1…Pn):** decompose the domain into independent research regimes
  (graphs used P1 typed-port editor … P6 timeline). For settings, regimes might be: schema/affordance
  model, secrets/sensitivity, config-file codecs, the settings-form UI surface, layered/merged
  config (defaults→file→env→runtime), and live/reactive settings.
- **Dual-mode per regime:** filename `zsettings_NN -- <slug>.md` with suffix letter **`a` =
  Claude-AI deep-research survey** (broad over the JS/TS landscape) and **`b` = Claude-Code
  grounded report** (pinned to the zodal substrate, **primary-source/adversarially verified** vs.
  npm/GitHub/docs). Either may be skipped per regime (graphs had b-only, a-only, and both-merged).
- **Reconciliation** (`_reconciliation.md`): per-regime sections with **`Topic | Survey said |
  Grounded said | Resolution | Winner`** conflict tables. **Arbitration rule:** *the grounded
  report wins on integration with the substrate; the survey wins only where it surfaces a concrete
  external fact* (license, version, maintenance). The reconciled decision supersedes both reports.
- **Grounding brief** (`_grounding-brief.md`): the **single SSOT reference** fusing (a) the
  affordance synthesis, (b) the **zodal substrate to extend** (`defineCollection`, the 6-layer
  inference, `RendererRegistry` + PRIORITY bands, `ResolvedFieldAffordance`'s `[key]:unknown`
  extension hook, `ProviderCapabilities`, `FilterExpression`, `CollectionState`'s `contentLoading`
  precedent), and (c) the backend data models to round-trip — **every claim carries file:line
  cites.**
- **`README.md` = the money summary:** a status table (Regime | Files | How researched | FINAL
  pick) + a **consolidated decision table** (Fleet role | Primary | Fallback/alternate | License)
  + **"genuinely-new modules to build"** + **"What's next" build order**.
- **`research_guide.md` = a routing index, NOT another doc to read:** three tiers (Tier 1 design
  intent read-once; Tier 2 consolidation SSOT read-before-deep-dive; Tier 3 per-regime deep dives
  opened only when implementing that regime) + a **task → doc lookup table**. Antidote to research
  overload: agents read only what the current task needs.

### Dev-skill naming & toolkit
- Dev skills named **`zodal-graphs-dev-<topic>`**, invoked `/zodal-graphs-dev-<topic>`; the four
  graphs ones: `-canonical-model`, `-monorepo`, `-registries`, `-research-lookup`. **Each skill
  routes its task-specific research docs into itself** — open the skill, not the whole tree.
  → zodal-settings: **`zodal-settings-dev-<topic>`** (likely `-settings-model`, `-secrets`,
  `-codecs`, `-monorepo`, `-registries`, `-research-lookup`).

---

## 7. Open questions / gaps the corpus flags (settings must respect)

From `07-open-questions.md`, `known-issues.md`, `ideas-and-future.md`, and the zodal-graphs
open-decisions sections. These are unresolved in zodal core; settings work inherits them.

### Inherited unresolved design questions (`07-open-questions.md`)
- **Inclusion vs. exclusion defaults:** all affordances on (OData-style) vs. opt-in. Proposed
  **middle ground: read affordances on by default, write affordances off by default** — *highly
  relevant to settings* (don't make every field editable by accident; secrets especially).
- **Metadata survival strategy:** "meta-last" convention vs. `affordanceRegistry.register` vs.
  hybrid (read `.meta()`, fall back to inference, override via config). Hybrid is the current lean
  but details are open — settings must use **register-before-wrap** for any wrapped/optional field.
- **`.meta()`-only vs. `defineCollection()`-only vs. both:** API surface for attaching affordances;
  precedence rules need specification. (Settings: `defineSettings(schema, config?)` mirrors this.)
- **Convention depth / name heuristics:** how aggressive should name heuristics be (`password`→
  password widget? `email`/`avatar`?). **Settings adds its own heuristics** (`*_secret`,
  `enableX`, `*_url`, `*_path`, `*_ms`/`*_seconds` durations) — keep aggressive **but always ship
  `explain()`** so users can see and override (see Name-Heuristics-Over-Infer known issue).
- **Create vs. edit schema differences:** required-on-read but optional-on-create (`id`,
  `createdAt`). Settings analogue: defaults supplied vs. user-required at first run; options are
  separate schemas, schema transforms (`.omit/.partial` — fragile, lose metadata), or
  metadata-driven `{ createMode: 'hidden'|'optional'|'required' }`.
- **Codec home & depth:** core vs. store; how much of dol's `wrap_kvs` to port; key vs. value
  codecs separate or unified (§5 above).
- **Server-vs-client operation declaration:** per-field `filterable:'server'|'client'` vs.
  provider-level. Settings: which settings are validated/applied server-side vs. client-side.
- **Capability discovery shape:** static constructor object vs. runtime `getCapabilities()` vs.
  convention-based. zodal's **novel contribution is runtime, dynamic, per-instance capability
  discovery** (`05-architecture-and-patterns.md` Pattern 5) — settings should keep it (e.g. a
  read-only config file vs. a writable one reported at runtime; **per-item/per-field capabilities**
  for "this user may change this setting but not that one", an explicit ideas-and-future item).
- **Escape hatches:** per-field component override vs. registry override vs. slot pattern — must
  exist so a settings UI can override one widget without ejecting (MBUID failure mode warning).

### Known issues to design around (`known-issues.md`)
- **Zod v4 `.meta()` does not survive wrapping** → use `affordanceRegistry` (WeakMap, no
  `clear()` — create a fresh registry via `createAffordanceRegistry()` for isolation).
- **`schema._zod.def` is undocumented/private** — isolate all introspection in helper functions.
- **Name heuristics may over-infer** (e.g. `status_code` number matching a `status` pattern) →
  `explain()` + config override are the mitigation.
- **No schema validation on `defineCollection`** — misspelled config field names are silently
  ignored; a `strict` mode is wanted. (Settings: validate that config keys match schema fields.)
- **ESM-only `.js` internal imports** is intentional.

### zodal-graphs open-decision discipline to copy
Mark **baked-in decisions with rationale** ("proceed unless owner overrides") vs. **open
decisions with a working default** ("default lets building proceed; owner's call to change").
Gate checkpoints on a flagship benchmark. Flag risks in a table with mitigation/gate.

### Forward-looking hooks already in the corpus that settings can leverage
- `toPrompt()` → **AI-consumable settings descriptions / tool-use schemas** (generate LLM tool
  schemas from operation definitions — ideas-and-future "AI agent integration").
- `subscribe?()` already in `DataProvider` → **live/reactive settings** (watch a config file,
  push changes); real-time is deferrable but the hook exists.
- **Schema diffing for migrations** (ideas-and-future) → **settings/config schema migration**
  ("field X added", "Y changed type") — directly useful for versioned config.
- **Saved views/filters & visual query builder** — less relevant to settings; note but deprioritize.

---

## Appendix — key file paths (all absolute, read-only references)

- Vision: `…/_zodals/zodal/docs/research/01-vision-and-scope.md`
- Affordance taxonomy (~50 affordances, 5 levels): `…/zodal/docs/research/04-affordance-taxonomy-summary.md`
- Architecture & 8 patterns: `…/zodal/docs/research/05-architecture-and-patterns.md`
- Prior art & landscape: `…/zodal/docs/research/06-prior-art-and-landscape.md`
- Open questions: `…/zodal/docs/research/07-open-questions.md`
- Tech research takeaways (16 reports): `…/zodal/docs/research/03-technology-research-takeaways.md`
- Bifurcation problem (foundational): `…/zodal/docs/research/The content-metadata bifurcation problem in software architecture.md`
- Bifurcation design / implementation / zodal-specific: `…/zodal/docs/research/bifurcation_design_notes.md`, `bifurcation_implementation_notes.md`, `bifurcation_research_for_zodal.md`
- zodal architecture (live SSOT): `…/zodal/docs/architecture.md`
- Ideas & known issues: `…/zodal/docs/ideas-and-future.md`, `…/zodal/docs/known-issues.md`
- zodal agent guide + rules: `…/zodal/.claude/CLAUDE.md`, `…/zodal/.claude/rules/{design-phase-constraints,..}.md`
- Skills: `…/zodal/.claude/skills/{zodal-dev,zodal-store-adapter,zodal-ui-renderer,zodal-collections,zodal-collection-ui,zodal-testing}/SKILL.md`, `…/zodal/.claude/skills/research-lookup.md`
- Workspace guide + ecosystem skill: `…/_zodals/.claude/CLAUDE.md`, `…/_zodals/.claude/rules/cross-package.md`, `…/_zodals/.claude/skills/zodal-ecosystem/SKILL.md`
- **zodal-graphs template:** `…/zodal-graphs/.claude/CLAUDE.md`, `…/zodal-graphs/docs/dev-plan.md`, `…/zodal-graphs/docs/zodal-graph-concept.md`, `…/zodal-graphs/docs/research_guide.md`, `…/zodal-graphs/docs/research/{README,_grounding-brief,_reconciliation}.md`, `…/zodal-graphs/skills/zodal-graphs-dev-*/SKILL.md`, root `package.json`/`pnpm-workspace.yaml`/`turbo.json`/`tsconfig.base.json`
- **Missing/absent:** `…/zodal/.claude/plans/stateless-beaming-feather.md` (referenced but does not exist)
