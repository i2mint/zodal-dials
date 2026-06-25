# zodal-dials Research — Index & Decision Table

This directory holds the research phase for **zodal-dials**: the settings / configuration /
preferences / parameterization specialization of zodal. The campaign ran in one pass —
**terminology → settings-UX → eight per-dimension deep dives (`02A`–`02H`) → four prior-art case
studies (`03A`–`03D`) → synthesis → ecosystem grounding (`05a`/`05b`)** — and converged in
[`raw/04-synthesis.md`](raw/04-synthesis.md), the consolidating SSOT and **arbiter**: where a
dimension report and the substrate notes disagree, the synthesis resolution supersedes both
(grounded-substrate wins on integration; a survey wins only on a concrete external fact). This
README is the **entry point and money summary** — the curated decision table plus a one-line
index of every file. For *routing a question to the one right file*, use
[`../research_guide.md`](../research_guide.md).

> **Dimension letters.** The decision table below uses the synthesis's **canonical A–P** letters
> (from `raw/04-synthesis.md` §2/§4). The raw filenames `02A`–`02H` use the *original prompt*
> letters and do **not** map 1:1 — always cross-reference via the synthesis letters.

---

## The consolidated KEEP vs AVOID decision table

The money summary — condensed faithfully from **[`raw/04-synthesis.md` §4](raw/04-synthesis.md)**
(read that section for the cited evidence behind each cell; per-dimension models are in §2).

| Dim | KEEP | AVOID |
|---|---|---|
| **A** Separation of concerns | Assertion/annotation split; a uiSchema-equivalent org layer keyed by key; config-as-data | Presentation baked into the data schema; config-as-code for the core |
| **B** Organization & faceting | Flat schema + facet layer; facets canonical, tree = projection; forward/inverse index; `order` w/ lexical tie-break; computed facets | A single mandatory tree; closure tables; encoding grouping in the schema; putting the router-vs-accordion gesture in the model |
| **C** Layering & merge | Sparse layers; RFC 7386 internal / RFC 6902 history; type-directed per-key strategy; one layer primitive | `null`-as-delete (use `UNSET`); deep-merging arrays by default; full snapshots; a hardcoded global "always deep-merge"; 3-way auto-merge for live config |
| **D** Scopes & precedence | Ordered scopes as **data**; object-merge/scalar-replace; policy band non-overridable; provenance + `explain()`; dotted-path per-leaf precedence | Hardcoded scope ladders; conflating profile with scope; opaque resolution; >7 bands |
| **E** Constraints & defaults | One relation primitive (validate/suggest); Zod `.refine` w/ field paths; `{assertion,message}` + warnings; derive-selector defaults w/ stickiness; solver-ready IR | Bundling a SAT solver; soft defaults in `.default()`; relying on Zod's "refine after object passes" for field UX |
| **F** Search | `IndexableSetting[]` + `SearchProvider`; MiniSearch default; engine-independent scoped filters; opt-in semantic/hybrid | Hardcoding one engine; searching values not declarations; pure-semantic-only; cloud dependency; eager embedding models |
| **G** Identity & lifecycle | Dotted key as identity; no-prefix rule; declarative `deprecated`/`renamedTo`; `schemaVersion` + lazy idempotent upcasters | Letting grouping change identity; imperative scattered migrations |
| **H** Change lifecycle | Per-setting `saveMode`/`requiresRestart`/`sensitivity`; dirty-guard; headless toast/undo events | A single global save model; boolean dirty divorced from provenance; toggles for non-binary/deferred settings |
| **I** Secrets | `sensitivity` storage-role; bifurcation routing; `SecretRef` masked reads; redact from layers/patches/logs | Secrets in the queryable store; secrets in any persisted layer/patch/audit log; uncoordinated two-store writes |
| **J** Type → widget | Format-driven specialized widgets; ranked testers; recurse closed objects (depth budget); terminal `rawJson` always-matches; discriminator-select-then-recurse | Flattening value-objects into the facet tree; silent drop/error on unsupported; per-type branching; unbounded recursion |
| **K** Docs & provenance | Short-label/long-help split; enum descriptions by key; provenance as first-class renderable output (`explain()`) | Parallel-array `enumDescriptions`; provenance as a debug afterthought |
| **L** Machine & round-trip | Value-layer ↔ format-writer separation; document-model edit scripts; codecs (field + provider); CLI `--show-origin`; one env mapping; emit JSON Schema | Patches as comment-preserving writers; `JSON.stringify`-overwrite; per-format ad-hoc env naming |
| **M** Reactivity | Zustand store of effective values; `subscribe?()` for live config; dependency-graph re-eval | Re-implementing state (reuse zodal's slices) |
| **N** Solving at scale | Solver-agnostic propositional IR; eager eval by default; optional solver adapter | A mandatory solver dependency |
| **O** a11y / i18n | i18n-resolvable label keys; emit a11y metadata in the field config | Hardcoded strings; renderer-specific a11y wiring |
| **P** Governance / policy | Managed/policy as the top scope-derived affordance; mandatory-vs-recommended; `roamingType` sync facet | Letting local layers override policy; secrets in telemetry |

**Best prior-art analog per dimension** (one each, from §2): A → RJSF `uiSchema` split + Spring
`hints` · B → VS Code Settings editor (one flat tagged registry, two projections) · C → NixOS
type-directed merge + ESLint flat-config extends · D → VS Code scoped settings + "Modified
elsewhere" / CFPreferences `Forced` · E → NixOS `assertions`/`warnings` + `default=f(config)`,
Zod `superRefine` runtime · F → VS Code two-tier search (ship local only) · G → VS Code
`deprecationMessage` + chained upcasters · H → .NET `IOptions*` + GitLab Pajamas · I → K8s Secret
vs ConfigMap + Vault, via zodal bifurcation · J → Home Assistant selectors + JSON Forms ranked
testers · K → zodal's own `explain()` + VS Code modified-bar · L → VS Code JSONC + `jsonc-parser`
+ config2py codec registry · M → zodal `createCollectionStore` Zustand slices + .NET
`IOptionsMonitor` · N → FeatureIDE/AAFM + `json-rules-engine` middle tier · O → VS Code nls
(`%key%`) · P → Chrome/Firefox enterprise policy.

---

## File index (18 files)

| File | One line |
|---|---|
| [`../research/00-research-plan.md`](00-research-plan.md) | The campaign plan: prompts, phase order, what each report was asked. |
| [`raw/00-terminology.md`](raw/00-terminology.md) | The settled field vocabulary (cascade, layer, scope, effective value, provenance, facet, …). |
| [`raw/01-settings-ux.md`](raw/01-settings-ux.md) | Settings UX & IA at scale: search-first, progressive disclosure as a facet, modified/reset indicators (B, H, K, O). |
| [`raw/02A-separation-of-concerns.md`](raw/02A-separation-of-concerns.md) | Schema / metadata / organization three-bucket split; config-as-data (A). |
| [`raw/02B-organization-faceting.md`](raw/02B-organization-faceting.md) | Faceting large flat keyspaces; facets canonical, tree = projection; facet index (B). |
| [`raw/02C-collections-layering-merge.md`](raw/02C-collections-layering-merge.md) | The cascade core: sparse layers, RFC 7386/6902, the `null` footgun → `UNSET`, type-directed merge (C). |
| [`raw/02D-scopes-precedence.md`](raw/02D-scopes-precedence.md) | Scopes & precedence; `resolveEffective`; policy non-overridable; profile ≠ scope (D). |
| [`raw/02E-validation-defaults-constraints.md`](raw/02E-validation-defaults-constraints.md) | Constraints + dependent defaults as one relation primitive; feature models / solver IR (E, N). |
| [`raw/02F-search.md`](raw/02F-search.md) | Pluggable `SearchProvider` over `IndexableSetting[]`; MiniSearch; scoped `@`-filters (F). |
| [`raw/02G-identity-versioning-machine.md`](raw/02G-identity-versioning-machine.md) | Dotted-key identity, deprecate/rename/upcast, comment-preserving round-trip, env, secrets (G, I, L). |
| [`raw/02H-types-to-widgets.md`](raw/02H-types-to-widgets.md) | Type→widget; organizational vs value nesting; terminal `rawJson` fallback (J). |
| [`raw/03A-vscode.md`](raw/03A-vscode.md) | VS Code deep-dive — the load-bearing precedent (registry, cascade, Settings editor) (A–P). |
| [`raw/03B-schema-driven-config.md`](raw/03B-schema-driven-config.md) | GSettings / NixOS / Spring / JSON Schema / .NET Options; type-directed merge + assertions (A, C, E). |
| [`raw/03C-cloud-native-layering.md`](raw/03C-cloud-native-layering.md) | Kustomize / Helm / Terraform / Ansible / Sourcegraph; converged deep-merge rule (C, D). |
| [`raw/03D-frontend-settings-and-tokens.md`](raw/03D-frontend-settings-and-tokens.md) | JetBrains / Chrome-Firefox policy / Figma modes / Storybook / Style Dictionary (B, H, J, P). |
| [`raw/04-synthesis.md`](raw/04-synthesis.md) | **THE ARBITER.** Vocabulary, per-dimension model + analog, architecture, KEEP/AVOID §4, open questions §5, name. |
| [`raw/05a-zodal-corpus-notes.md`](raw/05a-zodal-corpus-notes.md) | zodal substrate / reuse map: `defineCollection`, registry, bifurcation→secrets, codecs, `explain()`. |
| [`raw/05b-ecosystem-notes.md`](raw/05b-ecosystem-notes.md) | Python siblings: config2py cascade-of-sources, dol stores/codecs, i2 `Sig`, meshed. |

---

## Where decisions are recorded

- **The arbiter:** [`raw/04-synthesis.md`](raw/04-synthesis.md). It is the SSOT. On any conflict
  between two reports — or between a report and the substrate notes — **the synthesis wins.** Its
  §4 is the KEEP/AVOID table reproduced above; its §2 holds the per-dimension models and analogs;
  its §5 lists the open questions.
- **Baked-in vs open:** [`../dev-plan.md` §8](../dev-plan.md). It records which research decisions
  are **baked in** (proceed unless the owner overrides) and which are genuinely **open** — each
  with a working default so building is never blocked. The six open ones (flat keyspace,
  hard-constraint home, `UNSET` surface, secret backend contract, codec home, solver scope) map
  1:1 to synthesis §5.
- **Routing a question to a file:** [`../research_guide.md`](../research_guide.md) — the routing
  index with a "common questions → open this file" lookup. Start there, not by reading the tree.

*Maintenance: a research-backed decision changes here (`§4` of the synthesis is the source of
truth) and in `dev-plan.md §8` first; then the routing guide's affected row is fixed. This README
curates; the synthesis decides.*
