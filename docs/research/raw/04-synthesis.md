# 04 — zodal-settings Synthesis

> **Purpose.** The single consolidating SSOT for the `zodal-settings` research corpus. It
> fuses the terminology study (`00`), the zodal substrate notes (`05a`), the Python-ecosystem
> notes (`05b`), the settings-UX survey (`01`), and the eight dimension reports (`02A–02H`) plus
> the four prior-art deep-dives (`03A` VS Code, `03B` schema-driven config, `03C` cloud-native
> layering, `03D` front-end settings & tokens) into one document that (1) settles the preferred
> vocabulary, (2) gives a recommended model + best prior-art analog per dimension A–P, (3)
> proposes the layered package architecture, (4) presents a KEEP/AVOID decision table, (5) lists
> open questions, and (6) recommends a name.
>
> **Convention.** HARD FACTS carry Vancouver citations `[n]` resolving to the `## References`
> section. **[SYNTHESIS]** marks design opinion. **[FLAG]** marks unverified claims. This doc is
> the arbiter: where a dimension report and the substrate notes disagree, the resolution here
> supersedes both (the zodal-graphs `_reconciliation` arbitration rule — grounded-substrate wins
> on integration, the survey wins only on concrete external facts) [21].

---

## TL;DR

- **zodal-settings is a domain specialization of zodal for the settings/configuration/
  preferences/parameterization domain**, built the way zodal-graphs specializes zodal for graphs:
  one canonical Zod-v4 model, a declared affordance/capability layer, and pluggable targets
  (renderers, stores, codegen) selected by a capability-ranked registry that degrades honestly
  [21]. A **settings document is modeled as a degenerate one-item zodal collection**, so it reuses
  `defineCollection`'s 6-layer inference, `.meta()` affordances, `explain()`, the codec machinery,
  and the renderer registry rather than re-implementing them [21].
- **The vocabulary is settled** (Setting / Schema / Layer / Scope / Cascade / Effective value +
  Provenance / Profile / Preset / Merge strategy / Patch / Constraint / Dependent default / Facet
  / Affordance / Widget / Sensitivity / Managed value / Dirty / live-apply / progressive
  disclosure / feature model). These map almost 1:1 onto VS Code's configuration registry, which
  is the single most battle-tested precedent [1][10].
- **The keystone reuse is the cascade**: an ordered list of named **scopes**, each holding a
  **sparse layer**, merged by RFC 7386 semantics (objects deep-merge, scalars + arrays replace,
  an explicit `UNSET` sentinel deletes — *not* raw `null`), policy/managed band always wins, and
  **every effective value is paired with provenance** (winning scope + shadowed layers). This is
  the industry consensus (VS Code, NixOS, Helm, CSS, Spring) and provenance is the deliberate
  differentiator [1][3][4][6][7][8][14].
- **Merge is type-directed, not globally hardcoded** (the NixOS model): the Zod type picks the
  default strategy (object→deep-merge, array→replace, scalar→replace), overridable per key via
  `.meta({ mergeStrategy })` [13][14].
- **Organization is faceted, not a tree**: facets/tags are the canonical multi-membership grouping
  model; a tree is one rendered projection of a facet (VS Code's ToC tree and `@tag:` filters are
  two projections of one flat tagged registry) [9][12][16].
- **Secrets reuse the content/metadata bifurcation machinery**: a `sensitivity` field-storage-role
  routes secret values to a separate secret provider via a `createBifurcatedProvider`-style
  composition, returning a masked `SecretRef` instead of plaintext [22].
- **Architecture**: one `zodal-settings/` monorepo publishing `@zodal/settings-core`,
  `@zodal/settings-ui`, satellite `@zodal/settings-store-*` (env/toml/yaml/keychain) and
  `@zodal/settings-ui-*` (vanilla, shadcn, +1–2 more) — mirroring zodal-graphs exactly [21].
- **Recommended name: `dials`** → `@zodal/dials`. Short, lowercase, npm-friendly, instantly reads
  as "tunable parameters", improves on the generic field, and is free under the `@zodal` scope and
  as `i2mint/zodal-dials` on GitHub.

---

## 1. Preferred Vocabulary (settled)

These terms are canonical for all downstream `zodal-settings` work. They reconcile the
terminology study [0] with what the dimension reports actually found in primary sources; where a
dimension report proposed a near-synonym, the term below wins.

| Term | Definition | Primary-source anchor |
|---|---|---|
| **Setting** | A typed, named parameter — the atomic unit. Identified by a stable **key**. | VS Code setting id [1][10] |
| **Key** | Stable, serialization-independent **dotted-path** identity (`editor.fontSize`). Survives label/grouping/storage changes. Hard rule: *no key may be a complete prefix of another key.* | VS Code / git config [1][10][2G:7] |
| **Schema** | The Zod v4 declaration; SSOT for type, validation, hard constraints, `.meta()` affordances. | zodal core [21] |
| **Layer** | A **partial/sparse** set of `key→value` from one source. The unit that gets merged. (Primary noun; "override/overlay/patch" are roles or wire-shapes of a layer.) | RFC 7386 / VS Code / Kustomize [3][1] |
| **Scope** | A named, *ordered* source of layers (`default`, `preset`, `profile`, `workspace`, `policy`). Scopes define precedence; **scopes are data, not constants.** | VS Code / Sourcegraph / CFPreferences [1][2D:3][2D:5] |
| **Cascade** | The algorithm that merges layers across scopes (objects deep-merge; scalars/arrays replace; higher scope wins). | CSS / VS Code / NixOS [2][1][14] |
| **Effective value** | The resolved output of the cascade for a key. **Always paired with provenance.** | VS Code "resolved setting" [1] |
| **Provenance** | Winning scope + ordered shadowed layers + `managed` flag for a key. The cascade's first-class, renderable output (the `explain()` differentiator). | VS Code "Modified elsewhere"; CFPreferences `AppValueIsForced` [1][2D:2][2D:7] |
| **Profile** | A complete, user-selectable named bundle of values. (A *value of* a scope-layer, not a scope.) | VS Code / Spring profile [1][5] |
| **Preset** | A curated, shippable base bundle, extended/overridden. | CMake Presets / Tailwind / ESLint [11][10:tw][9eslint] |
| **Merge strategy** | The per-key rule for combining layers: `replace` / `deep-merge` / `append` / `strategic`. Type-directed by default, `.meta()`-overridable. | NixOS type-directed merge; Kustomize `patchStrategy` [13][14][3] |
| **Patch** | A serialized layer/delta. **JSON Merge Patch (RFC 7386)** = preferred internal layer shape; **JSON Patch (RFC 6902)** = history/audit/undo. | RFC 7386 / RFC 6902 [3][4] |
| **Constraint (hard)** | A cross-field rule making a *combination* invalid (a refinement over ≥2 keys). | JSON Schema / Zod / NixOS `assertions` [2E:1][2E:4][13] |
| **Dependent default (soft)** | An advisory computed default for one key derived from others; overridable, sticky once dirty. | NixOS `default=f(config)`; GitLab cascading settings [13][2E:10] |
| **Facet / tag** | A grouping dimension allowing **multi-membership**; the canonical grouping model. A **tree** is one rendered projection of a facet. | Faceted classification (Ranganathan) / VS Code `@tag:` [9][12][16] |
| **Affordance** | (zodal term, kept.) The resolved capability of a field that drives widget selection. | zodal core; RJSF widget split [21][17] |
| **Widget** | (RJSF term.) The renderer-side control. Distinct from affordance (capability) and from semantic type. | RJSF / Storybook control [17][3D:1] |
| **uiSchema-equivalent** | The headless presentation-hints layer (grouping/order/widget-override/disclosure), keyed by setting key, **separate from the data schema**. | RJSF uiSchema; Spring `hints` [17][2A:3] |
| **Sensitivity / secret** | A field flag marking a value confidential (masked, never plain-exported, routable to a secret store). | Kubernetes Secret vs ConfigMap; Vault [18][2G:6] |
| **Managed / policy value** | Enforced by an admin scope atop the cascade; non-overridable locally. | VS Code Policy; Chrome mandatory; CFPreferences `Forced` [1][20][2D:7] |
| **Dirty state** | Current values differ from active profile/defaults; gates save/discard. | react-hook-form `isDirty` [22rhf] |
| **live-apply vs requires-restart** | Whether a changed value takes effect immediately or after restart. | .NET `IOptions`/`IOptionsMonitor`; Chrome `dynamic_refresh` [13dotnet][3D:5] |
| **Progressive disclosure** | Modeled as an `advanced`-style **facet**, not a hidden screen; ≤2 disclosure levels. | NN/g; VS Code `@tag:advanced`; chrome://flags [1nng][1] |
| **Feature model / variability** | The academic framing of the space of valid combinations; constraints expressed so they *could* be handed to a CSP/SAT solver. | FODA / AAFM [2E:11][2E:13] |

**[SYNTHESIS] — terminology arbitration decisions:**
- Prefer **"layer"** as the primary noun (source-neutral, composes with "cascade"); reserve
  "override" for the verb. "Overlay"/"patch" are wire-shapes a layer takes.
- Keep **"effective value" + "provenance"** always paired — provenance/explainability is the
  differentiator and must never be a debug afterthought.
- **Two collisions to defuse from VS Code** [10][3A]: (a) VS Code overloads "scope" to mean
  *per-setting layer-eligibility*; we keep **scope = the ordered layer source** and add a separate
  per-setting affordance — call it **`writableScopes`** (a.k.a. layer-eligibility) — for "which
  layers may set this." (b) VS Code couples grouping to the dotted-key namespace; we keep the key
  as **identity only** and make **facets canonical** for grouping.

---

## 2. Per-Dimension Recommended Model + Best Prior-Art Analog

Each dimension states the **recommended model** and the **single best prior-art analog**.

### A. Separation of concerns (schema / data / behavior / presentation)
**Model — the three-bucket split.** Every concern goes in exactly one bucket [2A]:
- **Schema** (SSOT, assertive): type, validation refinements, hard constraints, default — the Zod
  v4 schema. JSON Schema's assertion-vs-annotation line is the boundary: *if removing it can never
  change validity, it is not schema* [2A:5][2A:6].
- **Metadata** (with the key, non-assertive): summary/description/examples, affordance hints,
  sensitivity, lifecycle (live-apply vs restart), deprecation, managed — via `.meta()` + the
  external affordance registry.
- **Organization** (outside the schema entirely): facet membership, ordering, advanced disclosure,
  widget override, group titles — a uiSchema-equivalent layer keyed by setting key.

Config-as-**data** (inert serializable layers + a pure cascade), never config-as-code [2A:7][2A:8].
**Best analog: RJSF's JSON-Schema-says-*what* / uiSchema-says-*how* split** [17][2A:1], with Spring
Boot's separate `groups`/`properties`/`hints` arrays as the strongest "metadata sidecar" precedent
[2A:3][3B].

### B. Organization & faceting (large flat parameter sets)
**Model — flat schema + a separate grouping layer; facets are canonical, the tree is a
projection.** Keep the keyspace flat (dotted names give grouping/prefix-query benefits without
structural nesting). Map each key to 0..n facets (multi-membership). Build two indexes once: a
**forward** `Map<FacetId, SettingKey[]>` (drives tree children, chips, bulk-op scopes) and an
**inverse** `Map<SettingKey, FacetId[]>` (drives row chips + facet counts). Hierarchical facets
stored as **materialized path** (cheap reads, static trees; avoid closure tables). Ordering = VS
Code's spec literally: optional integer `order`, lower wins, unordered after ordered,
lexicographic tie-break [9:5]. **Computed facets** (smart groups: `@modified`, `@managed`,
`@secrets`, `@advanced`, `@invalid`) are serializable predicates over (key, schema, effective
value, provenance) [9:16][9:17]. The **B×C primitive**: `(facetSelector) → keySet → JSON Merge
Patch` unifies "reset all `@tag:experimental`", "export only `network`", "diff over `advanced`".
**Best analog: VS Code's Settings editor** — one flat tagged registry projected as both a ToC tree
and combinable `@`-filters [9][3A].

### C. Collections, layering & merge (profiles / presets / cascade)
**Model — one primitive (the sparse layer); profile/preset/shareable-config are roles it plays in
the scope ordering.** Sparse beats snapshots (intent-preserving, composable, auditable; a layer
*is* the diff) [2C]. Internal layer shape = **RFC 7386 Merge Patch** (objects recurse,
scalars/arrays replace); history/undo = **RFC 6902 JSON Patch** (ordered, reversible, `test`
guards) [3][4]. Deletion uses an explicit **`UNSET` sentinel**, never raw `null` (avoids the RFC
7386 / Helm `null` footgun) [2C:1][3C]. Merge strategy is **per-key, type-directed** (NixOS), with
`.meta({ mergeStrategy: 'append' | { mergeByKey } })` as the escape hatch [13][14]. Core operation:
`resolve(background, orderedLayers, policy) → { effective, provenance, conflicts }`.
**Best analog: NixOS module system** (type-directed merge + numeric priority bands `mkDefault`/
`mkForce`) for the merge engine [13][14]; **ESLint flat config** for preset-extends-and-override
ergonomics [9eslint].

### D. Scopes & precedence / effective-value resolution (the cascade proper)
**Model — `resolveEffective(key, scopeStack) → { value, provenance }`; scopes are data, not
constants.** Recommended ladder (low→high): `defaults → preset → profile(s) → workspace →
user/active → policy(managed)`; ≤7 named bands (Ansible's 22 is the cautionary tale) [2D:12][3C].
Merge rule = object deep-merge, scalar/array replace (VS Code + RFC 7386 consensus) [1][3]. Policy
band is non-overridable and surfaces a provenance predicate (`managed: true`) that drives control
editability — exactly CFPreferences `AppValueIsForced` disabling the control [2D:7]. **Profile ≠
scope**: a profile is the *contents of* a layer the user selects, never the scoping mechanism (the
12-factor named-environment anti-pattern) [2D:9]. Provenance returns winning scope + shadowed
layers + (for object keys) `mergedFrom`.
**Best analog: VS Code scoped settings + "Modified elsewhere"** — the only surveyed system with
real provenance UI [1][2D:2]; CFPreferences `Forced`/`Set-Once` for the managed split [2D:6][2D:7].

### E. Validation, defaults & constraints
**Model — one primitive: a relation over setting keys, evaluated to VALIDATE or SUGGEST.** Hard
constraint and dependent default are the same thing differing only in mode/bindingness [2E].
Author hard constraints in **Zod** (`.refine`/`.superRefine` with field-`path` issues, prefer
`z.discriminatedUnion` for branchy shapes), able to **emit** JSON-Schema-shaped constraints for
interchange [2E:4][2E:1]. Resolve the cascade → produce the effective set → evaluate a serializable
**`{ assertion, message }` constraint list + `warnings` list** (the NixOS `assertions`/`warnings`
shape, *fail-fast at resolve time* per .NET `ValidateOnStart`) [13][3B]. **Dependent defaults live
outside the per-field schema**: a `derive(values) → partialSuggestion` selector keyed by its input
dependencies, recomputed on dependency change *only while the target is non-dirty*
(override-stickiness; <5% of users change defaults so silent clobbering is a real harm)
[2E:9][2E:10]. At scale the relation set *is* a feature model exportable to SAT/CSP — ship eager
rule evaluation by default, expose an optional solver adapter; do **not** bundle a solver [2E:13].
**Best analog: NixOS `assertions`/`warnings` + `default = f(config)`** [13][3B], with Zod
`superRefine` as the runtime.

### F. Search over the settings surface
**Model — a pluggable `SearchProvider` over a declared, engine-agnostic `IndexableSetting[]`
surface** (key, title, description, enumLabels, facets, keywords, group, default). Which fields are
searched + weights = configuration. Ship a zero-dep substring default; default rich adapter =
**MiniSearch** (tiny, typo-tolerant, field-boosting, AND/OR); offer **Orama** (BM25 + facets +
hybrid vector) for large/semantic needs; **FlexSearch** only for giant catalogs, **Fuse.js** only
for palette-style fuzzy [2F:4][2F:5]. An engine-independent **scoped-filter layer** parses
`@modified`/`@facet:`/`@scope:`/`@secret`/`@advanced` tokens against effective values + provenance
*before* free text reaches the provider (this is zodal-domain logic, not engine logic). Optional
in-browser **semantic** provider (transformers.js embeddings, lazy-loaded) + **hybrid** fusion
(RRF/weighted) behind a provider boundary — never a hard dependency [2F:7][2F:8].
**Best analog: VS Code's two-tier search** (local fuzzy + scoped `@`-filters, with NL/semantic
behind a remote/optional boundary) — but ship local, no cloud dependency [2F:1][3A].

### G. Identity, versioning & key lifecycle
**Model — dotted-path key as stable identity; declarative lifecycle in the schema.** Enforce VS
Code's "no key is a complete prefix of another" rule at compile time [2G:7]. Replace the imperative
deprecate-and-migrate recipe with first-class affordances: `deprecated` + message (+ link to
replacement), `renamedTo: "new.key"` (+ optional value transform → automatic read-time copy), and a
per-document `schemaVersion` + an ordered registry of **pure, lazy, idempotent `(layer)→layer`
upcasters** run during cascade load (expand/contract for breaking shape changes) [2G:1][2G:3][2G:9].
**Best analog: VS Code `deprecationMessage`/`markdownDeprecationMessage`** (the documented manual
pattern, made declarative) + the chained-upcaster schema-evolution pattern [2G:1][2G:9].

### H. Change lifecycle (save / dirty / live-apply / restart)
**Model — per-setting save semantics + provenance-driven dirty state.** `saveMode: 'live' |
'explicit'`, `requiresRestart: boolean`, `sensitivity` as per-setting affordances; derive save UX
and the dirty-navigation-guard from them; emit toast/optimistic-UI/undo as headless **events**, not
baked widgets. `isDirty` = current ≠ active profile/defaults; "reset to default" = remove this
key's layer so a lower scope re-wins; undo = inverse RFC 6902 ops [01:7][22rhf]. AVOID a single
global save model (sensitive fields need explicit confirm even when the rest autosaves), and AVOID
boolean dirty flags divorced from provenance (can't render an honest cross-scope diff).
**Best analog: .NET `IOptions`/`IOptionsSnapshot`/`IOptionsMonitor`** for the lifecycle contract
[13dotnet][3B] + GitLab Pajamas for save/feedback/guard UX [01:4].

### I. Secrets & sensitivity
**Model — a `sensitivity: 'public' | 'sensitive' | 'secret'` field-storage-role, classified by the
same 6-layer cascade and routed by a bifurcation-style provider.** Reuse zodal's content/metadata
bifurcation verbatim: name heuristics (`*_secret`, `*_token`, `*_key`, `password`, `apiKey`,
`credential`) at Layer 3, `.meta({ secret: true })` override at Layer 4 [22]. A
`createSensitiveSettingsProvider()` = `createBifurcatedProvider` specialized to a secret backend
(OS keychain/Vault/`.env`/encrypted store) as the "content provider"; ordinary settings go to the
queryable config store. List/read returns a **`SecretRef`** (mirroring `ContentRef`) — a masked
"•••• (set)" / "not set" reference, never plaintext; explicit lazy reveal via a `getContent`-style
call. Cascade implies `searchable/filterable: false` + masked render. Never write secrets into any
persisted layer file, patch, or audit log [2G:6][22].
**Best analog: Kubernetes Secret vs ConfigMap + Vault injection** [18][2G:6], realized through
zodal's bifurcation machinery [22].

### J. Type → widget mapping (incl. nested objects)
**Model — classify each field as scalar-leaf vs sub-schema value; select widgets via the
capability-ranked registry; guarantee a terminal raw fallback.** Separate two nestings:
*organizational* nesting (dotted keys → facet tree, never a widget) vs *value* nesting (the value
*is* an object/array → recurse or raw-edit) [2H]. Scalar map: bool→switch, enum→radio/select,
bounded-number→slider, unbounded→stepper, string→text, format-tagged→specialized picker
(color/date/file/duration/keybinding). Structural renderers: `objectRecurse` (closed objects within
a depth/field budget), `arrayList`, `unionCombinator` (discriminator-select-then-recurse). A
**low/terminal `rawJson` renderer whose tester always matches** guarantees total coverage and
honest degradation — VS Code's "Edit in settings.json", GSettings' GVariant text field, Storybook's
JSON editor, HA's unstructured `object` selector, unified. Renderers declare *why* they declined
(open object / depth exceeded / unknown type) so the UI shows "rendered as raw JSON because…"
[2H][17].
**Best analog: Home Assistant selectors** (one `object` selector that is either a recursive
structured form or a raw YAML editor depending on whether a sub-schema is supplied) [2H:6], with
**JSON Forms ranked testers** as the selection model (which zodal already has) [2H:9].

### K. Documentation, provenance & explainability
**Model — short-label/long-help split + first-class provenance output.** Two-field doc affordance
(`summary`/`title` vs `description`, GSettings `<summary>`/`<description>`); enumerated candidates
as `{ value, description }` bound *by key* not parallel-array index (avoid VS Code's
`enumDescriptions` length-coupling footgun) [3A:5][2A]. **Provenance/explainability is the
headline differentiator**: for each effective value report the winning scope, shadowed layers, and
managed flag — directly reusing zodal's `explain()` (the layer-by-layer `InferenceTrace`) as the
"why is this setting hidden / read-only / set to X?" affordance [21][2D].
**Best analog: zodal's own `explain()`** [21] + VS Code's modified-bar/"Modified elsewhere" [1][2D:2].

### L. Machine interfaces & file round-trip
**Model — keep value-layers and the format-preserving writer separate.** Patches model *values*
(RFC 7386/6902 explicitly do not preserve whitespace/comments/order) [2G:8]. The format-preserving
step is a separate file-writer concern: a **document-model / edit-script** writer per format
(`jsonc-parser` `modify()`+`applyEdits()` for JSONC; `tomlkit`/`ruamel.yaml` analogues), never
`JSON.stringify`-and-overwrite [2G:10][2G:11]. Realized as **codecs** at two levels (zodal's
existing pattern): field-level `Codec<TEncoded,TDecoded>` (`"30s"↔30000`, `"a,b,c"↔[...]`) and
provider-level `wrapProvider(provider, envCodec()/tomlCodec())` for file↔object [21:codecs].
**Key codecs** map config-file snake_case/dotted keys ↔ app camelCase names. **CLI** = git-config
archetype (`get`/`set <key> <value> [--scope]`/`list --show-origin` (provenance!)) [2G:14]. **Env**
= a high-precedence read-mostly scope with one documented deterministic key↔env mapping (`PREFIX_` +
`__`-joined uppercased path) + relaxed reading (Spring/.NET) [2G:5][2G:13]. **Emit JSON Schema**
(+ `$schema` injection) as a codegen target so raw-file editors get the same IntelliSense as the UI
[2G:12].
**Best analog: VS Code JSONC + `jsonc-parser`** for round-trip [2G:10] + config2py's
extension-keyed codec registry for the Python-sibling consistency [05b].

### M. Reactivity / binding
**Model — a store of effective values that re-emits on any layer change.** Reuse zodal's Zustand
wrapping: `createSettingsStore(settings, provider?)` over the existing slice pattern; the
`DataProvider.subscribe?()` hook already present enables live/reactive settings (watch a config
file, push changes) [21][05a]. Dependent-default re-derivation and constraint re-evaluation walk a
dependency graph on change (the Yup `.when()`/reactive-trigger lesson) [2E:6].
**Best analog: zodal's existing `createCollectionStore` + Zustand slices** [21]; .NET
`IOptionsMonitor` change-notification for the live-apply contract [13dotnet].

### N. Constraint solving at scale
**Model — keep the constraint IR solver-agnostic and propositional-translatable; ship eager
evaluation, expose an optional solver adapter.** A settings space *is* a feature model (FODA:
mandatory/optional/alternative/or-group + cross-tree requires/excludes), reducible to SAT/CSP/BDD
for consistency, dead-option, validity, completion, and #SAT queries [2E:11][2E:13][9:20]. Most
settings UIs need only local eager rule evaluation; a real solver is justified only for
propagation/auto-disable, consistency proofs, or "complete me to a valid config". Express hard
constraints as boolean predicates over keys (a CSP/SAT clause) so the door stays open without a
mandatory dependency [2E:13][2E:15].
**Best analog: FeatureIDE / AAFM** (feature model → propositional formula → Sat4j/MiniSat) [2E:11];
`json-rules-engine` as the lightweight middle tier [2E:15].

### O. Accessibility / i18n
**Model — labels/descriptions as i18n-resolvable keys; emit a11y metadata in the headless field
config.** Keep labels/descriptions resolvable through an i18n table (VS Code `%key%` nls pattern);
emit `label`/`describedby`/`invalid` as part of the headless field config so any renderer wires
assistive-tech semantics correctly [0:O][1]. **[FLAG]** No single primary a11y-for-settings spec
surfaced; treat as standard WAI/ARIA form semantics applied to the emitted field config.
**Best analog: VS Code nls (`%key%`) externalized strings** [1].

### P. Telemetry / governance / managed policy
**Model — managed/policy as a scope-derived affordance at the top of the cascade.** `managedBy`,
`syncable`/`roamingType`, `restricted` (trust) as descriptor flags a sync/secret/policy adapter
reads. Policy band always wins and is non-overridable locally (VS Code Policy, Chrome mandatory vs
recommended split, Firefox `Status: locked|default|user|clear`, CFPreferences `Forced`)
[20][1][3D:3][3D:5][2D:7]. JetBrains `RoamingType` (DEFAULT/PER_OS/LOCAL/DISABLED) → a per-setting
sync/portability facet [3D:11]. Telemetry/audit reuse the RFC 6902 history log (secrets excluded).
**Best analog: Chrome/Firefox enterprise policy** (mandatory vs recommended = two scopes with
provenance baked in) [20][3D:3][3D:5].

---

## 3. Layered Architecture (package map)

**[SYNTHESIS, grounded in the zodal + zodal-graphs conventions [21].]** One private monorepo
`zodal-settings/` → many tree-shakeable packages published under the **`@zodal` scope**
(`@zodal/settings-*`). Folder/GitHub names stay unscoped. Build tooling identical to the fleet:
tsup (dual CJS/ESM + `.d.ts`), vitest, TS strict, pnpm workspaces + Turborepo; Zod v4 as a peer
(`>=4.1.13`); `.js` ESM internal imports; `types`-first exports map. Hard rule inherited:
`core ← store`, `core ← ui`; ui and store never depend on each other; satellites depend on one side
only [21][cross-package].

### Three-layer framing (Model → Affordances → Targets), per zodal-graphs
1. **Model** — the settings schema (Zod v4, flat dotted keyspace) + the cascade primitives.
2. **Affordances** — the declared capability layer: read/write/reset, validate, import/export,
   reveal-secret, group-by-facet, conditional-visibility, view-as-form/JSON/CLI, deprecate/migrate.
3. **Targets** — pluggable renderers, store/secret adapters, and codegen, selected by a
   capability-ranked registry that degrades honestly.

### Package map

| Package | Role | Depends on | Horizon |
|---|---|---|---|
| **`@zodal/settings-core`** | Canonical settings model + cascade. `defineSettings(schema, config?)` (a degenerate one-item `defineCollection`); the `resolve()`/`resolveEffective()` cascade engine; type-directed merge-strategy table; `Layer`/`Scope`/`Provenance`/`SecretRef` types; RFC 7386/6902 patch utils + `UNSET` sentinel; constraint+warnings evaluator; dependent-default `derive` selectors; lifecycle (`deprecated`/`renamedTo`/upcasters); settings-specific affordance keys (`sensitivity`, `saveMode`, `requiresRestart`, `writableScopes`, `mergeStrategy`, facets, `order`) via the `[key]: unknown` extension hook; field-level codecs; `explain()`. | `@zodal/core` (peer) | **H1 (keystone)** |
| **`@zodal/settings-ui`** | Headless UI layer. `toSettingsForm()` generator; the **settings renderer registry** (`createSettingsRendererRegistry()`) with PRIORITY bands + composable testers (`secretRoleIs`, `boundedNumber`, `isEnum`, `fieldNameMatches`, terminal `rawJson`); facet→group-descriptor projection (gesture-agnostic `revealed`+`reveal` hint); the `IndexableSetting[]` surface + `SearchProvider` interface + scoped-filter parser; provenance→badge/lock/reset config; dirty/save/undo headless events. | `@zodal/core`, `@zodal/settings-core` | **H1** |
| **`@zodal/settings-store-*`** | Satellite store/secret adapters: `-env`, `-toml`, `-yaml`, `-jsonc` (format-preserving writers), `-keychain`/`-vault` (secret providers). Each a `DataProvider`/codec composition with honest `getCapabilities()`. | `@zodal/store`, `@zodal/settings-core` | H2 |
| **`@zodal/settings-ui-vanilla`** | Vanilla HTML/JS renderer (no framework). | `@zodal/settings-ui` | **H1 (reference renderer)** |
| **`@zodal/settings-ui-shadcn`** | shadcn/ui (React) renderer. | `@zodal/settings-ui` | H2 |
| **`@zodal/settings-ui-*`** | +1–2 more (e.g. `-cli` prompt renderer, `-mui` or `-web-components`). | `@zodal/settings-ui` | H3 |
| **`@zodal/settings-codegen`** *(opt)* | JSON-Schema emit (+`$schema` injection), `toPrompt()` AI/tool-schema, DTCG import/export. May start as a `settings-core` submodule. | `@zodal/settings-core` | H3 |

**Reuse-from-zodal map (the "wrap, don't rebuild" commitment):** `defineCollection`→`defineSettings`;
6-layer inference + name heuristics (add settings heuristics) reused; `ResolvedFieldAffordance`'s
`[key]: unknown` hook for new keys; `RendererRegistry` + PRIORITY bands +
`createRendererRegistry`→`createSettingsRendererRegistry`; bifurcation
(`createBifurcatedProvider`/`ContentRef`/`storageRoleIs`)→
(`createSensitiveSettingsProvider`/`SecretRef`/`secretRoleIs`); codecs + `wrapProvider`;
`createCollectionStore` Zustand slices; `explain()`; `DataProvider.subscribe?()` for live settings;
existing fs/localStorage/S3/Supabase adapters as config backends [21][22].

**Flagship checkpoint benchmarks** (build fails if violated, per the zodal-graphs gate discipline):
(1) **cascade round-trip + provenance fidelity** — resolve a multi-scope stack, mutate one layer,
re-resolve; provenance must correctly attribute every key and survive serialize→deserialize as
RFC 7386 layers; (2) **secret-never-leaks** — a secret value must never appear in the queryable
config store, any exported layer/patch, or the audit log.

**Python-sibling consistency (config2py).** zodal-settings should *feel like* config2py to the
user [05b]: the cascade = config2py's ordered-sources `get_config` (first/highest hit wins, with
per-source validity + a final default); a store = a Mapping over a pluggable backend (dol); format
= a codec keyed by extension/type; parameters+defaults as introspectable, mergeable data (i2 `Sig`).
Mirror its DI ergonomics: ship a zero-config getter AND expose the scope list / store factory for
full control. **[SYNTHESIS]** This argues for a name that reads as "the parameterization layer" and
sits comfortably beside config2py without colliding with the bare word "config".

---

## 4. KEEP vs AVOID decision table (across dimensions)

| Dim | KEEP | AVOID |
|---|---|---|
| **A** Sep. of concerns | Assertion/annotation split; uiSchema-equivalent layer keyed by key; config-as-data | Presentation in the data schema; config-as-code for the core |
| **B** Organization | Flat schema + facet layer; facets canonical, tree = projection; forward/inverse index; `order` w/ lexical tie-break; computed facets | A single mandatory tree; closure tables; encoding grouping in the schema; router-vs-accordion choice in the model |
| **C** Layering/merge | Sparse layers; RFC 7386 internal / RFC 6902 history; type-directed per-key strategy; one layer primitive | `null`-as-delete (use `UNSET`); deep-merging arrays by default; full snapshots; hardcoded global "always deep-merge"; 3-way auto-merge for live config |
| **D** Scopes/precedence | Ordered scopes as **data**; object-merge/scalar-replace; policy band non-overridable; provenance + `explain()`; dotted-path per-leaf precedence | Hardcoded scope ladders; conflating profile with scope; opaque resolution; >7 bands |
| **E** Constraints/defaults | One relation primitive (validate/suggest); Zod refine w/ field paths; `{assertion,message}`+warnings; derive-selector defaults w/ stickiness; solver-ready IR | Bundling a SAT solver; soft defaults in `.default()`; relying on Zod's "refine after object passes" for field UX |
| **F** Search | `IndexableSetting[]` + `SearchProvider`; MiniSearch default; engine-independent scoped filters; opt-in semantic/hybrid | Hardcoding one engine; searching values not declarations; pure-semantic-only; cloud dependency; eager embedding models |
| **G** Identity/lifecycle | Dotted key as identity; no-prefix rule; declarative `deprecated`/`renamedTo`; `schemaVersion`+lazy idempotent upcasters | Letting grouping change identity; imperative scattered migrations |
| **H** Change lifecycle | Per-setting `saveMode`/`requiresRestart`/`sensitivity`; dirty-guard; headless toast/undo events | Single global save model; boolean dirty without provenance; toggles for non-binary/deferred settings |
| **I** Secrets | `sensitivity` storage-role; bifurcation routing; `SecretRef` masked reads; redact from layers/patches/logs | Secrets in queryable store; secrets in any persisted layer/patch/audit log; uncoordinated two-store writes |
| **J** Type→widget | Format-driven specialized widgets; ranked testers; recurse closed objects (depth budget); terminal `rawJson` always-matches; discriminator-select-then-recurse | Flattening value-objects into the facet tree; silent drop/error on unsupported; per-type branching; unbounded recursion |
| **K** Docs/provenance | Short-label/long-help split; enum descriptions by key; provenance as first-class renderable output (`explain()`) | Parallel-array `enumDescriptions`; provenance as debug afterthought |
| **L** Machine/round-trip | Value-layer ↔ format-writer separation; document-model edit scripts; codecs (field + provider); CLI `--show-origin`; one env mapping; emit JSON Schema | Patches as comment-preserving writers; `JSON.stringify`-overwrite; per-format ad-hoc env naming |
| **M** Reactivity | Zustand store of effective values; `subscribe?()` for live config; dependency-graph re-eval | Re-implementing state (reuse zodal's slices) |
| **N** Solving | Solver-agnostic propositional IR; eager eval default; optional solver adapter | Mandatory solver dependency |
| **O** a11y/i18n | i18n-resolvable label keys; emit a11y metadata in field config | Hardcoded strings; renderer-specific a11y wiring |
| **P** Governance | Managed/policy as top scope-derived affordance; mandatory-vs-recommended; `roamingType` sync facet | Letting local layers override policy; secrets in telemetry |

---

## 5. Open Questions (for the design plan)

1. **Flat keyspace from a nested Zod schema** — flatten an object schema to dotted keys vs. register
   atomic settings against a flat registry and compose object views on demand? The zodal-graphs
   registry-of-affordances precedent leans toward registration; confirm against `defineCollection`/
   affordance machinery before committing. [2A:open][05a]
2. **Hard-constraint home** — author hard cross-field constraints as Zod `.refine()` only, as a
   separate serializable `{assertion,message}` list only, or both (schema for validation + mirrored
   declarative form for solver export)? Decide the SSOT and the sync direction. [2E][3B]
3. **`UNSET` sentinel surface** — how is "reset to lower scope" represented in serialized layers,
   the CLI, the patch log, and the public TS API, distinct from a legitimate `null` value? Unit-test
   any chosen merge-patch library against RFC 7386 §1 examples (libraries diverge). [2C:1][3C]
4. **Secret backend contract** — is `createSensitiveSettingsProvider` strictly
   `createBifurcatedProvider` specialized, or does a `SecretRef` reveal need a distinct
   capability/permission model (per-field reveal authorization, audit)? [22][2G:6]
5. **Codec home & key codecs** — field-level codecs in `settings-core` vs the `envCodec`/`tomlCodec`
   provider wrappers in `settings-store-*`; key codecs (path remap snake_case↔camelCase) unified
   with value codecs or separate? How much of dol's `wrap_kvs` to port? [05a:codecs][2G]
6. **Solver/feature-model scope for v1** — ship only the propositional-translatable constraint IR
   (door open), or also a reference `json-rules-engine`/`logic-solver` adapter for
   propagation/completion? [2E:13]

---

## 6. Candidate Names

All checked **2026-06**. Under the `@zodal` org scope every name is available (404) since the org
controls the whole scope; the meaningful differentiators are the **unscoped** name (used for
community `zodal-<name>` packages and as the GitHub folder/repo `i2mint/zodal-<name>`) and the
recognizability fit. Verified: unscoped `dials` (npm, "config library for node", v0.0.1 — squatter),
`knobs` (npm, "feature toggles", v0.0.2), `cascade` (npm, UI library, v0.7.11) are **taken** as bare
words; `tuners` unscoped is **available**; `@zodal/dials`, `@zodal/knobs`, `@zodal/cascade`,
`@zodal/tune`, `@zodal/prefs`, `@zodal/config`, `@zodal/presets`, `@zodal/controls`, `@zodal/tuners`
are all **available (404)**; `i2mint/zodal-dials` GitHub repo and unscoped `zodal-dials` npm are
**both available**.

| Name (X) | `@zodal/X` | `zodal-X` (unscoped npm) | `i2mint/zodal-X` (GitHub) | Verdict |
|---|---|---|---|---|
| **dials** | free | free | free | **PREFERRED** |
| tune | free | not checked | likely free | strong |
| prefs | free | not checked | likely free | strong |
| knobs | free | bare `knobs` taken (feature-toggles) | likely free | viable |
| presets | free | not checked | likely free | viable but narrow |
| tuners | free | free | likely free | viable |
| cascade | free | bare `cascade` taken (UI lib) | likely free | risky (overloaded) |

**Brainstormed and improved on the brief's seeds** (config, conf, params, prefs, knobs, dials, tune,
presets, profile, options, controls, panel, cfg): the strongest cluster is the **tuning/control
metaphor** (`dials`, `knobs`, `tune`, `tuners`) because it (a) reads instantly to the JS/TS + config
community as "the layer where you turn the parameters of a system", (b) is short/lowercase/
npm-friendly, (c) avoids the bare-`settings`/`config` collision and the genericness the brief asks
to beat, and (d) is consistent with config2py's "tune a system via a cascade of sources" framing
without reusing "config". `prefs` is the safe literal pick; `presets`/`profile` name a *part* of the
domain (bundles) rather than the whole; `options`/`controls`/`panel`/`cfg` are too generic or
UI-flavored.

**Preferred: `dials` → `@zodal/dials`.** Rationale below.

---

## 7. Recommendation

**`zodal-dials`** (published `@zodal/dials`, satellites `@zodal/dials-core`, `@zodal/dials-ui`,
`@zodal/dials-store-*`, `@zodal/dials-ui-*`).

- **Reads as the domain instantly.** A "dial" is the canonical metaphor for a single tunable,
  surfaced parameter — exactly the project's thesis ("typed, named parameters that tune a system,
  surfaced aggressively"). It pairs naturally with the vocabulary (a Setting *is* a dial; the UI is
  a panel of dials) and with config2py's "tune a system" framing, without colliding with the bare
  words `settings`/`config`/`prefs`.
- **Short, lowercase, npm-friendly, memorable**, and distinctive in the `@zodal/*` family
  (`@zodal/graph-*`, `@zodal/dials-*`).
- **Available** where it counts: `@zodal/dials` (404), `zodal-dials` unscoped npm (404),
  `i2mint/zodal-dials` GitHub (404). The bare `dials` squatter (a dead v0.0.1 "config library")
  never collides because official packages are scoped and community/folder names are `zodal-dials`.
- **Honest caveat:** the bare-word `dials` being a (dead) config library is mild thematic overlap,
  not a namespace conflict. If a more literal name is preferred, **`prefs`** is the safe fallback;
  if the tuning metaphor is liked but a freer bare word is wanted, **`tuners`** is fully open.

---

## References

0. [00-terminology.md — Terminology Map (this corpus)] · 01–02H, 03A–03D, 05a, 05b — sibling files in `docs/research/raw/`.
1. [User and workspace settings — Visual Studio Code](https://code.visualstudio.com/docs/configure/settings)
2. [Introduction to the CSS cascade — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascade/Cascade); [CSS Cascading & Inheritance Level 4 — W3C](https://www.w3.org/TR/css-cascade-4/)
3. [RFC 7386 — JSON Merge Patch — IETF](https://www.rfc-editor.org/rfc/rfc7386)
4. [RFC 6902 — JSON Patch — IETF](https://datatracker.ietf.org/doc/html/rfc6902)
5. [Spring Boot — Externalized Configuration & Profiles](https://docs.spring.io/spring-boot/reference/features/external-config.html)
6. [Declarative Management of Kubernetes Objects Using Kustomize](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/)
7. [Values Files & merging behavior — Helm](https://helm.sh/docs/chart_template_guide/values_files/)
8. [Input variables (precedence + validation) — Terraform](https://developer.hashicorp.com/terraform/language/values/variables)
9. [Faceted classification — Wikipedia](https://en.wikipedia.org/wiki/Faceted_classification); [Contribution Points: configuration — VS Code Extension API](https://code.visualstudio.com/api/references/contribution-points)
10. [vscode configurationRegistry.ts — microsoft/vscode](https://github.com/microsoft/vscode/blob/main/src/vs/platform/configuration/common/configurationRegistry.ts); [configurationExtensionPoint.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/common/configurationExtensionPoint.ts)
11. [cmake-presets(7) — CMake](https://cmake.org/cmake/help/latest/manual/cmake-presets.7.html)
12. [Faceted Classification and Faceted Taxonomies — Hedden Information Management](https://www.hedden-information.com/faceted-classification-and-faceted-taxonomies/); [Taxonomy 101 — Nielsen Norman Group](https://www.nngroup.com/articles/taxonomy-101/)
13. [Warnings and Assertions — NixOS Manual](https://nlewo.github.io/nixos-manual-sphinx/development/assertions.xml.html); [Option Declarations / mkOption — nixpkgs](https://github.com/NixOS/nixpkgs/blob/master/lib/options.nix); [Options pattern — .NET / Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/core/extensions/options)
14. [nixpkgs/lib/modules.nix (type-directed merge engine) — GitHub](https://github.com/NixOS/nixpkgs/blob/master/lib/modules.nix)
15. [Sourcegraph — Settings cascade](https://sourcegraph.com/docs/admin/config/settings-cascade)
16. [The Discipline of Organizing — Faceted Classification](https://berkeley.pressbooks.pub/tdo4p/chapter/faceted-classification/)
17. [uiSchema — react-jsonschema-form](https://rjsf-team.github.io/react-jsonschema-form/docs/api-reference/uiSchema/); [Widgets — RJSF](https://rjsf-team.github.io/react-jsonschema-form/docs/usage/widgets/)
18. [ConfigMaps and Secrets in Kubernetes — k8s.guide](https://www.k8s.guide/configuration/configmaps-secrets/); [HashiCorp Vault — Kubernetes secrets engine](https://developer.hashicorp.com/vault/docs/secrets/kubernetes)
19. [microsoft/vscode-discussions #862 — migrating extension settings](https://github.com/microsoft/vscode-discussions/discussions/862)
20. [Set Chrome policies — Chrome Enterprise Help](https://support.google.com/chrome/a/answer/2657289); [Customize Firefox using policies.json — Firefox for Enterprise](https://support.mozilla.org/en-US/kb/customizing-firefox-using-policiesjson)
21. [zodal corpus notes (05a) — substrate, architecture, zodal-graphs template; `defineCollection`, 6-layer inference, RendererRegistry/PRIORITY bands, `explain()`, codecs] (this corpus)
22. [zodal bifurcation design — content/metadata split, `createBifurcatedProvider`, `ContentRef`, `storageRoleIs`] (this corpus, via 05a §3)
23. [config2py / dol / i2 — Python cascade-of-sources sibling (05b)] (this corpus); [RFC 7386 §1 examples](https://www.rfc-editor.org/rfc/rfc7386); [react-hook-form formState (isDirty)](https://react-hook-form.com/docs/useform/formstate); [FODA feasibility study — Kang et al., SEI 1990](https://www.researchgate.net/publication/215588323_Feature-Oriented_Domain_Analysis_FODA_feasibility_study); [Automated Analysis of Feature Models 20 Years Later — Benavides et al.](https://www.sciencedirect.com/science/article/abs/pii/S0306437910000025)
