# Research Guide — when to read what

**Purpose.** This is a *routing index* for the zodal-dials design corpus (~400 KB across 18
files). It tells an agent (or human) **which one document to open for a given question** — and,
just as importantly, which to skip — so you never read the whole `docs/research/` tree to settle
one decision. Each row is `file → what it answers → dimension(s) → owning dev skill`.

> **If you read only one thing:** [`docs/research/raw/04-synthesis.md`](research/raw/04-synthesis.md)
> — the consolidating SSOT and **arbiter**. It settles the vocabulary, gives a recommended model +
> best prior-art analog per dimension A–P, the package architecture, the **KEEP/AVOID decision
> table** (§4), and the open questions (§5). The curated decision table also lives in
> [`docs/research/README.md`](research/README.md). Come back *here* to find the *deep* doc behind any
> single decision.

## How the corpus is organized

The campaign ran **terminology → settings-UX → eight per-dimension deep dives → four prior-art
case studies → synthesis → ecosystem grounding** (the plan: [`docs/research/00-research-plan.md`](research/00-research-plan.md)).
Three layers:

1. **Vocabulary + UX** (`00-terminology`, `01-settings-ux`) — the field's real names and the
   information-architecture patterns. Read once to orient.
2. **Dimension reports** (`02A`–`02H`) and **prior-art case studies** (`03A`–`03D`) — the deep
   evidence, consulted per-concern when building.
3. **Consolidation** (`04-synthesis`) + **ecosystem grounding** (`05a` zodal substrate, `05b`
   Python siblings) — the merged, fleet-wide decisions and the reuse map. The SSOT.

> **Dimension-letter caveat.** The synthesis uses the *canonical* dimension letters **A–P** (see
> its §2 / §4). The raw report filenames `02A`–`02H` use the *original* prompt letters, which do
> **not** line up 1:1 with the synthesis letters (the dimensions were re-lettered during synthesis).
> The "Dimension(s)" column below gives the **synthesis A–P** letters; trust those when cross-
> referencing the decision table.

> **Arbiter rule.** Where a dimension report and the substrate notes (`05a`) disagree, **`04-synthesis.md`
> supersedes both** (grounded-substrate wins on integration; a survey wins only on a concrete
> external fact it verified). `dev-plan.md` §8 records which decisions are **baked in** vs **open**.

---

## File index — `file → what it answers → dimension(s) → owning skill`

`cascade` = `/zodal-dials-dev-cascade` (model/merge/provenance/constraints/secrets/codecs) ·
`ui` = `/zodal-dials-dev-ui` (renderer registry/widgets/facets/search/dirty-save) ·
`monorepo` = `/zodal-dials-dev-monorepo` (packages/build/publish/CI). Store-adapter concerns
(env/toml/yaml/jsonc/keychain) are `cascade`+`monorepo` until a dedicated store skill exists.

| File | What it answers | Dim(s) A–P | Owning skill |
|---|---|---|---|
| [`00-research-plan.md`](research/00-research-plan.md) | The campaign: prompts, phase order, what each report was asked. Use to know *what question a report answered*. | all | (meta) |
| [`raw/00-terminology.md`](research/raw/00-terminology.md) | The settled **vocabulary** (cascade, layer, scope, effective value, provenance, profile/preset, merge strategy, patch, constraint, dependent default, facet, affordance, widget, sensitivity, managed). Names, synonyms, origins. | all | cascade |
| [`raw/01-settings-ux.md`](research/raw/01-settings-ux.md) | Settings **UX & information architecture** at scale: search-first, progressive disclosure as a facet, in-place-expand vs panel as one affordance, modified/reset indicators. | B, H, K, O | ui |
| [`raw/02A-separation-of-concerns.md`](research/raw/02A-separation-of-concerns.md) | The **three-bucket split** (schema / metadata / organization); config-as-data; assertion-vs-annotation line; flat schema as SSOT. | A | cascade |
| [`raw/02B-organization-faceting.md`](research/raw/02B-organization-faceting.md) | **Faceting** of large flat keyspaces: facets canonical, tree = projection; forward/inverse facet index; `order` + lexical tie-break; computed/smart facets; facets as bulk-op scopes (B×C). | B | ui |
| [`raw/02C-collections-layering-merge.md`](research/raw/02C-collections-layering-merge.md) | The **cascade core**: sparse layers vs snapshots; profile/preset/shareable as *roles* of a layer; RFC 7386 internal / RFC 6902 history; the `null`-as-delete footgun → `UNSET`; per-key type-directed merge. | C | cascade |
| [`raw/02D-scopes-precedence.md`](research/raw/02D-scopes-precedence.md) | **Scopes & precedence**: `resolveEffective(key, stack) → {value, provenance}`; ≤7 ordered bands as *data*; policy/managed band non-overridable; profile ≠ scope. | D | cascade |
| [`raw/02E-validation-defaults-constraints.md`](research/raw/02E-validation-defaults-constraints.md) | **Constraints & dependent defaults** as one relation primitive (validate/suggest); Zod `.superRefine` w/ field paths; `{assertion,message}`+warnings (NixOS); derive-selector defaults w/ stickiness; feature-model/solver IR. | E, N | cascade |
| [`raw/02F-search.md`](research/raw/02F-search.md) | **Search**: pluggable `SearchProvider` over `IndexableSetting[]`; engine-independent `@`-scoped-filter parser; **MiniSearch default**, Orama for facet/semantic, opt-in transformers.js. | F | ui |
| [`raw/02G-identity-versioning-machine.md`](research/raw/02G-identity-versioning-machine.md) | **Identity/lifecycle/machine + secrets**: dotted-key identity + no-prefix rule; declarative `deprecated`/`renamedTo`/upcasters; comment-preserving writers (jsonc-parser); env mapping; emit JSON Schema; **`sensitivity` → SecretRef** routing. | G, I, L | cascade (+ store) |
| [`raw/02H-types-to-widgets.md`](research/raw/02H-types-to-widgets.md) | **Type→widget**: organizational vs value nesting; scalar widget map; `objectRecurse` within a depth budget; **terminal `rawJson` always-matches**; renderers declare *why* they declined. | J | ui |
| [`raw/03A-vscode.md`](research/raw/03A-vscode.md) | **VS Code** (the load-bearing precedent): configuration registry/descriptor; per-setting scope-eligibility vs zodal scope; object-merge/scalar-replace cascade; Settings-editor `@`-filters; deprecation; policy. | A–P (prior art) | cascade + ui |
| [`raw/03B-schema-driven-config.md`](research/raw/03B-schema-driven-config.md) | **Schema-driven formats** (GSettings, NixOS, Spring, JSON Schema, .NET Options): NixOS type-directed merge + priority + `assertions`/`warnings`; Spring `hints`; `ValidateOnStart`. | A, C, E | cascade |
| [`raw/03C-cloud-native-layering.md`](research/raw/03C-cloud-native-layering.md) | **Cloud-native layering** (Kustomize, Helm, Terraform, Ansible, Sourcegraph): converged deep-merge-objects / replace-arrays-and-scalars / `null`-deletes; arrays are the pain point; two-patch split. | C, D | cascade |
| [`raw/03D-frontend-settings-and-tokens.md`](research/raw/03D-frontend-settings-and-tokens.md) | **Front-end settings & design tokens** (JetBrains, Chrome/Firefox policy, Figma modes, Storybook controls, Style Dictionary): mandatory-vs-recommended policy; modes-as-profiles; Storybook conditional-display; `$type`-drives-widget; `RoamingType`. | B, H, J, P | ui |
| [`raw/04-synthesis.md`](research/raw/04-synthesis.md) | **THE ARBITER.** Settled vocabulary (§1); per-dimension model + best analog A–P (§2); package architecture + reuse map (§3); **KEEP/AVOID decision table (§4)**; open questions (§5); name (§6–7). | all | all |
| [`raw/05a-zodal-corpus-notes.md`](research/raw/05a-zodal-corpus-notes.md) | **zodal substrate / reuse map**: `defineCollection`, 6-layer inference, `.meta()` affordances, `RendererRegistry`/PRIORITY bands, **bifurcation** (`createBifurcatedProvider`/`ContentRef`/`storageRoleIs`) → secrets, codecs/`wrapProvider`, `explain()`, Zustand store, conventions. | all (esp. I, J, L, M) | monorepo + cascade |
| [`raw/05b-ecosystem-notes.md`](research/raw/05b-ecosystem-notes.md) | **Python siblings** (config2py = cascade-of-sources, dol stores/codecs, i2 `Sig`, meshed): the backend shapes dials should feel consistent with; codec-by-extension; DI ergonomics. | C, L, M | monorepo (+ store) |

---

## Common questions → open this file

| If your question is… | Open (in order) |
|---|---|
| "What's the right word for X?" (cascade/layer/scope/provenance/profile/preset/facet) | `raw/00-terminology.md` → synthesis §1 |
| "What did we decide for dimension X?" | `raw/04-synthesis.md` §4 (KEEP/AVOID) → §2 (the model) → the dimension's raw report only for depth |
| **How do partial layers merge?** | `raw/02C` → synthesis §C (type-directed, RFC 7386 objects-recurse / scalars+arrays-replace) |
| **How is "reset to lower scope" / deletion represented?** | `raw/02C §2` (the `null` footgun → `UNSET` sentinel) → synthesis §C + dev-plan §8 open-decision 3 |
| **How is the effective value resolved + provenance attributed?** | `raw/02D` → synthesis §D (`resolveEffective`, policy non-overridable, profile ≠ scope) |
| **Which scope ladder / how many bands?** | `raw/02D` (≤7; `defaults→preset→profile→workspace→user→policy`) → `raw/03C` (Helm/Kustomize corroboration) |
| **RFC 7386 vs RFC 6902 — which for what?** | `raw/00-terminology` + `raw/02C` (7386 = internal layers; 6902 = history/undo) → synthesis §C |
| **How are secrets handled?** | `raw/02G §I` + `raw/05a §3` (bifurcation) → synthesis §I (`sensitivity` role → bifurcation → masked `SecretRef`; never in store/patch/log) |
| **Which search engine?** | `raw/02F` (MiniSearch default; Orama for facet/semantic; scoped-`@`-filter parser is zodal logic, not engine logic) → synthesis §F |
| **How do constraints + dependent defaults work?** | `raw/02E` → synthesis §E (one relation primitive; Zod `.superRefine` field-paths; NixOS `assertions`/`warnings`; derive-selector w/ stickiness) |
| **Do we ship a SAT/CSP solver?** | `raw/02E §3` + synthesis §N (no — ship solver-agnostic propositional IR, expose adapter seam) → dev-plan §8 open-decision 6 |
| **How is the keyspace organized (facets vs tree)?** | `raw/02B` → synthesis §B (facets canonical, tree = projection; gesture not in the model) |
| **Panel vs accordion — where does that live?** | `raw/01 §`/`raw/02B` (both are "reveal more/less of this group"; gesture is a renderer choice) → synthesis §B |
| **How do nested-object values get a widget?** | `raw/02H` → synthesis §J (`objectRecurse` w/ depth budget; terminal `rawJson` says *why*; organizational vs value nesting) |
| **How do keys stay stable / get renamed / migrated?** | `raw/02G §1–2` → synthesis §G (dotted key = identity; no-prefix rule; `deprecated`/`renamedTo`; `schemaVersion` + lazy upcasters) |
| **How are config files round-tripped without clobbering comments?** | `raw/02G §L` (jsonc-parser `modify()`+`applyEdits()`; patches model *values*, writer is separate) → synthesis §L |
| **Env-var binding?** | `raw/02G` (relaxed binding; one deterministic `PREFIX_`+`__` mapping) → synthesis §L |
| **How does this map onto the zodal substrate (what to reuse)?** | `raw/05a` → synthesis §3 reuse map (`defineCollection`→`defineDials`, registry, bifurcation, codecs, `explain()`) |
| **How does it stay consistent with config2py / the Python side?** | `raw/05b` → synthesis §3 (config2py = ordered-sources cascade; codec-by-extension) |
| **What did VS Code actually do?** | `raw/03A` (the primary case study; §1 registry, §2 cascade, Settings-editor UI) |
| **Why this name (`dials`)?** | `raw/04-synthesis.md` §6–7 |
| "Is this already decided, or still open?" | `dev-plan.md` §8 (baked-in vs open, each with a working default) → synthesis §5 |

---

## Decisions still open (working default lets building proceed)

These six are flagged as **the owner's call**; until resolved the dev plan proceeds on the noted
default. Full detail in [`raw/04-synthesis.md` §5](research/raw/04-synthesis.md) and
[`dev-plan.md` §8](dev-plan.md).

1. **Flat keyspace from a nested Zod schema** — *default:* flatten object schema to dotted keys.
2. **Hard-constraint home** — *default:* author in Zod `.refine`/`.superRefine`, emit a serializable mirror.
3. **`UNSET` sentinel surface** — *default:* unique symbol internally, explicit token in serialized layers/CLI/patch log.
4. **Secret backend contract** — *default:* `createSensitiveSettingsProvider` = `createBifurcatedProvider` specialized; masked reads + lazy reveal seam.
5. **Codec home & key codecs** — *default:* field codecs in `dials-core`, provider codecs in `dials-store-*`.
6. **Solver/feature-model scope for v1** — *default:* ship only the propositional-translatable IR; defer a reference solver adapter.

---

*Maintenance: when a research-backed decision changes, update `raw/04-synthesis.md` §4 (the
arbiter) and `research/README.md` (the curated table) first, then fix the affected row here. This
guide indexes; it does not duplicate the decisions.*
