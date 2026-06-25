# Research Plan — `zodal-settings` (working name)

> **Purpose of this file.** It lays out the deep-research campaign that precedes designing a
> zodal package for **settings / configuration / preferences / parametrization**. Each prompt is
> written to be handed to a research agent verbatim, with the context it needs (shared "grounding
> brief", zodal facts, and the outputs of earlier phases). Prompts are ordered: terminology first
> (so later prompts use the field's real vocabulary), then per-dimension deep dives, then
> open-source/tool case studies, then synthesis. This mirrors the `zodal-graphs/docs/research/`
> campaign structure (`_grounding-brief.md` → numbered reports → `_reconciliation.md` → decision table).

---

## 0. Shared Grounding Brief (prepended to EVERY research prompt)

> You are researching for **zodal-settings** (working name), a new TypeScript/JavaScript library in
> the **zodal** ecosystem. zodal's thesis: *declare a data shape + its capabilities once, as a Zod v4
> schema, then generate — many ways, against many targets — UI configuration, state, data access, and
> AI/codegen artifacts from that single declaration.* zodal is **headless-first** (it emits
> configuration objects, never DOM/React directly), uses **convention-over-configuration** with
> escape hatches, **multi-layer inference** (Zod type → refinements → name heuristics → `.meta()` →
> external registry → explicit config), and a **capability-ranked renderer registry** (composable
> testers + PRIORITY bands) so renderers degrade honestly. It **wraps best-of-breed tools** (TanStack
> Table, Zustand, shadcn/ui) rather than replacing them.
>
> zodal-settings will be a **domain specialization** of zodal — the way `zodal-graphs` specializes it
> for graphs. The domain is **settings**: typed, named parameters that tune a system, surfaced
> aggressively ("push parameters to the surface"). The target is a core model + a headless UI layer +
> several concrete renderers (vanilla, shadcn, and 1–2 more).
>
> Output requirements for every report:
> - **Vancouver-style numbered citations** `[1], [2], …` with a `## References` section; include
>   `[name](url)` hyperlinks. Prefer primary sources: standards/RFCs, source code, official docs,
>   peer-reviewed papers, and serious engineering blogs. Flag anything you could not verify.
> - Lead with a **TL;DR / decision-relevant takeaways** block, then detail.
> - When you describe a technique, give its **standard name(s)**, a crisp definition, where it is used
>   in practice, and **what to keep vs. avoid** for a schema-driven, headless TS library.
> - Distinguish **hard facts** (cite) from **your synthesis/opinion** (label it).

---

## Dimensions under study

The user named five (A–E). Research must also cover the additional dimensions (F–Q) below, which the
problem implies. The per-dimension prompts (Phase 2) map to these.

| ID | Dimension | One-line |
|----|-----------|----------|
| **A** | Separation of concerns | schema vs data vs behavior vs presentation; config-as-data |
| **B** | Organization & disclosure | grouping + multi-label/faceting; flat-schema + separate org layer; panels vs accordions from one model; progressive disclosure |
| **C** | Collections of settings | named/persisted/tagged (field,value) sets; **partial** settings; composition + conflict/priority; application model (over defaults / over current / merge) |
| **D** | Linked validation & smart defaults | hard cross-field constraints + soft/"rule-of-thumb" defaults; how expressed, how executed |
| **E** | Search | keyword filter scoped to chosen metadata; extension to semantic search |
| **F** | Identity, versioning & migration | key namespacing/dotted paths; stable IDs; deprecation/rename/migration of keys across versions |
| **G** | Scopes & precedence (cascade) | defaults < user < workspace < folder < env < runtime; "effective value" resolution; per-language/per-context overrides |
| **H** | Change lifecycle | live-apply vs save vs requires-restart; dirty state; reset-to-default; diff/preview; undo; import/export |
| **I** | Secrets & sensitivity | separating secrets from config; redaction; env injection (ties to zodal's content/metadata bifurcation) |
| **J** | Value types → editors | enum, range-number, bool, color, keybinding, path, duration, list, map, tagged union, **and nested-object values whose own schema is irreducible** (cannot be "flattened" like a group) |
| **K** | Documentation & explainability | per-setting docs/examples/markdown; provenance ("where did this value come from / which layer/profile") — ties to zodal `explain()` |
| **L** | Machine interfaces & round-trip | file-first (JSON/TOML/YAML) with comment preservation; CLI get/set; env binding; publishing JSON Schema for editor autocomplete |
| **M** | Reactivity & binding | settings → live app state; subscriptions; derived/computed settings |
| **N** | Constraint solving at scale | configurators / feature models / SAT-CSP when constraints get dense |
| **O** | Accessibility & i18n | of generated settings UIs |
| **P** | Telemetry/governance (scope check) | usage of settings, managed/locked settings, policy — decide in/out of scope |

---

## Phase 0 — Terminology & landscape grounding  *(run FIRST; its output rewrites later prompts)*

**Why first:** the user explicitly wants the field's real vocabulary established before deeper prompts,
so subsequent prompt engineering uses correct terms (e.g. "configuration cascade", "JSON Merge Patch",
"feature model cross-tree constraint", "dependent defaults", "effective settings").

**Prompt 0 — "The vocabulary of settings/configuration systems":**
> [GROUNDING BRIEF]
> Produce a **terminology map** of the entire field of *settings / configuration / preferences /
> parameterization* management, spanning desktop/IDE apps, cloud-native config, language frameworks,
> and academic configuration/variability research. For each concept give: canonical name, common
> synonyms, a one-sentence definition, the community/tool where the term originates, and one citation.
> Organize by the dimensions A–P above (list provided). Specifically nail down the standard names for:
> (1) the layering/precedence mechanism where multiple sources combine into an "effective" value;
> (2) saved reusable bundles of values (profiles? presets? schemes?);
> (3) **partial** bundles that only set some fields, and the operation of combining them with
>     conflict resolution;
> (4) cross-field rules that constrain valid combinations (hard) vs. recommend combinations (soft);
> (5) the patch/merge formats used to express overrides (RFC 6902, RFC 7386, strategic merge, etc.);
> (6) the academic framing of "valid combinations of options" (feature models, product configuration,
>     constraint satisfaction, variability modeling);
> (7) the data structures for "which fields belong to which group/category", esp. when an item can be
>     in many groups (faceting/tagging vs. tree).
> Deliver a glossary plus a short "preferred vocabulary for this project" recommendation. This glossary
> will be injected into all subsequent research prompts, so be precise and exhaustive.

**Consumes:** grounding brief only.
**Produces:** `raw/00-terminology.md` → a `GLOSSARY` block reused below.

---

## Phase 1 — Settings UX & information architecture  *(the "how good products do it" layer)*

**Prompt 1 — "Settings UX patterns & information architecture at scale":**
> [GROUNDING BRIEF] [GLOSSARY]
> Survey the **UX and information-architecture patterns** for settings screens that scale from a handful
> to thousands of parameters without overwhelming users. Cover: progressive disclosure (basic/advanced,
> "show modified only", expandable sections); grouping vs. tagging/faceting (an item in multiple
> categories); search-first vs. navigate-first settings; the "settings as a searchable database" model;
> in-place expand vs. dedicated panel/route (argue why both are the *same* "reveal more/less of this
> group" affordance and should be one model); inline help, examples, and defaults display; "modified
> elsewhere"/override indicators; reset-to-default; diffing and preview; requires-restart vs. live
> apply. Pull concrete patterns from NN/g, design systems (Material, Carbon, Fluent, shadcn), and
> writeups by teams who shipped large settings surfaces. Cover dimensions **B, H, K, O**.
> Give a checklist of patterns to adopt and anti-patterns to avoid for a headless, schema-driven lib.

**Consumes:** glossary. **Produces:** `raw/01-settings-ux.md`.

---

## Phase 2 — Per-dimension deep dives  *(run in parallel after Phase 0; each verified)*

Each prompt is self-contained: grounding brief + glossary + the dimension focus.

**Prompt 2A — Separation of concerns / config-as-data (A):**
> [GROUNDING BRIEF][GLOSSARY] Research the discipline of separating **schema, data, behavior, and
> presentation** for configuration. Cover: config-as-data vs config-as-code; declarative schema models
> that carry types + defaults + docs + constraints (GNOME GSettings schema XML, NixOS module options,
> Spring `spring-configuration-metadata.json`, JSON Schema, `.NET` Options pattern, Kubernetes CRD
> OpenAPI schemas); how presentation/grouping is kept *out* of the schema and layered separately; the
> tradeoffs of nesting structure in the schema vs. a flat schema + external organization layer (the
> user's stated preference). What belongs in schema vs. metadata vs. a separate org layer? Keep/avoid.

**Prompt 2B — Organization, grouping, faceting, disclosure (B):**
> [GROUNDING BRIEF][GLOSSARY] Deep dive on **organizing** large flat parameter sets: tree grouping vs.
> multi-membership tagging/faceting; data structures (adjacency, closure table, materialized path, tag
> index, facet maps); how VSCode's settings table-of-contents + `@tag:` filters + search work together;
> how to drive **both** an open-a-panel (router) gesture and an expand-in-place (accordion) gesture from
> **one** group model; ordering/weight; "smart groups"/saved views. Recommend a concrete data model
> (flat schema as SSOT + separate grouping/labeling layer mapping settings→0..n groups) and how it maps
> to presentation. Cover **B**, and the B×C interaction (groups as selection scopes for bulk operations).

**Prompt 2C — Collections of settings: profiles, presets, layering, partial settings, merge (C):**
> [GROUNDING BRIEF][GLOSSARY] The core of the project. Research **reusable bundles of settings** and
> their composition. Cover: profiles vs presets vs schemes; **partial/sparse** settings (only some
> fields set) and why they are more useful than full snapshots; **configuration cascade / layering /
> overlays** (defaults → base → profile(s) → current); **merge semantics** and conflict resolution —
> deep merge, last-write-wins, priority/precedence ordering, interactive conflict resolution, 3-way
> merge; the **patch/diff formats** (JSON Patch RFC 6902, JSON Merge Patch RFC 7386, Kustomize strategic
> merge, Helm value merge, Ansible's 22-level precedence, Spring profiles, NixOS module merge with
> type-directed combinators, CSS cascade/specificity, EditorConfig globbed overrides, design-token
> modes). Define a precise model for "apply bundle(s) over a background (defaults / current active),
> with a declared conflict policy" and what API shape expresses it. This is the most important report;
> be exhaustive. Cover **C, G**.

**Prompt 2D — Scopes & precedence / effective-value resolution (G):**
> [GROUNDING BRIEF][GLOSSARY] Focused study of **scoped settings & precedence resolution** distinct
> from user-saved bundles: VSCode user/remote/workspace/folder/language scopes and how the *effective*
> value is computed and shown; Sourcegraph cascading settings (global/org/user) via JSON Schema; macOS
> CFPreferences domain cascade; Spring property-source ordering; 12-factor env precedence. Model the
> "resolve effective value + explain its provenance" function (ties to zodal `explain()`). Keep/avoid.

**Prompt 2E — Linked validation & smart defaults / constraints (D, N):**
> [GROUNDING BRIEF][GLOSSARY] Research **inter-field constraints and dependent defaults**. Split into:
> (1) **Hard constraints** — cross-field validation: JSON Schema `dependentRequired`/`dependentSchemas`/
>     `if-then-else`/`allOf-anyOf-oneOf`; Zod `.superRefine`/`.refine`; Yup `.when`; reactive/dependent
>     form validation; co-occurrence/mutual-exclusion ("requires"/"excludes").
> (2) **Soft defaults** — "rule-of-thumb" / smart / dependent / computed / cascading defaults; how to
>     express "C is usually near f(A,B) but any C is valid"; default *functions* vs static defaults;
>     when defaults recompute; user-override stickiness.
> (3) **At scale** — feature models (FODA), software product lines, variability modeling, cross-tree
>     constraints, **constraint satisfaction / SAT solving**, product configurators; when a settings
>     system needs a real solver vs. simple rules; relevant JS/TS libraries.
> Give a single unifying model ("relations among field values, hard or soft, evaluated to validate or to
> suggest") with names, expression forms, and execution strategies. Cover **D, N**.

**Prompt 2F — Search over settings, keyword to semantic (E):**
> [GROUNDING BRIEF][GLOSSARY] Research **search for settings**: scoped keyword filtering (match on key,
> title, description, enum values, group, tags — configurable which metadata); fuzzy matching; how
> VSCode/JetBrains/Chrome implement settings search and "natural language" settings search; client-side
> indices (FlexSearch, MiniSearch, Fuse.js, Orama); extension to **semantic/embedding search** over
> setting descriptions (local/in-browser embedding models, vector search, hybrid lexical+semantic,
> RAG-style "find the setting that does X"). Recommend an architecture: pluggable search provider over a
> declared, indexable metadata surface. Cover **E**.

**Prompt 2G — Identity, versioning, migration, machine interfaces (F, L):**
> [GROUNDING BRIEF][GLOSSARY] Research the **lifecycle & machine side**: stable setting identity and
> dotted-path namespacing; deprecating/renaming/migrating setting keys across versions (VSCode setting
> deprecation, Chrome/Firefox pref migration, schema evolution); settings persisted as files (JSON with
> comments / JSONC, TOML, YAML) and **comment/format-preserving round-trip** edits; CLI get/set; env-var
> binding (12-factor, relaxed binding); **publishing JSON Schema** so external editors give
> autocomplete/validation (VSCode `contributes.configuration` → settings schema). Cover **F, L**, and
> the secrets/sensitivity angle **I** (separating secrets, redaction, env injection; relate to zodal's
> content-metadata bifurcation).

**Prompt 2H — Value types → editor widgets, incl. irreducible nested values (J):**
> [GROUNDING BRIEF][GLOSSARY] Research the **type→widget** mapping for settings specifically (beyond
> generic form generation): enums (select/radio/segmented), bounded numbers (slider/stepper),
> booleans (switch), color, keybinding capture, file/path picker, duration/size, lists (add/remove/
> reorder), maps/dictionaries, **discriminated/tagged unions**, and crucially **nested object values
> whose own sub-schema is irreducible** — i.e. a setting whose value is itself a structured object that
> cannot be "flattened" into the grouping layer the way categories can (the user's B-vs-value-nesting
> distinction). How do VSCode (`object`/`array` settings, "Edit in settings.json"), GSettings, and
> schema-form tools (RJSF, JSON Forms, uniforms, Storybook controls, Home Assistant voluptuous→form)
> handle complex/nested values and fall back to raw JSON editing? Recommend how zodal's renderer
> registry + affordance inference should treat scalar-leaf settings vs. sub-schema settings. Cover **J**.

**Verification (Phase 2):** each report's key claims (esp. RFC semantics, VSCode/GSettings/Nix behavior,
solver applicability) are adversarially checked by a second agent before synthesis.

---

## Phase 3 — Open-source & product case studies  *(dig into real code & docs)*

For each target: what problem it solves, its data model, its merge/precedence rules, its UI patterns,
its schema/metadata format, and **specific design ideas to keep vs. avoid**. Prefer reading actual
source where open.

**Prompt 3A — VSCode (primary case study, open source):**
> [GROUNDING BRIEF][GLOSSARY] Deep-dive **VSCode's settings system** from source (microsoft/vscode) and
> docs. Cover: `configurationRegistry` and `contributes.configuration` (schema with `type`, `default`,
> `enum`, `enumDescriptions`, `markdownDescription`, `scope`, `order`, `tags`, `deprecationMessage`);
> the **Settings editor** UI (table of contents, search, `@modified`/`@tag:` filters, split
> user/workspace, "Edit in settings.json"); scope precedence and effective-value resolution; Settings
> Sync; how grouping/order is declared. Extract concrete patterns + pitfalls for zodal-settings.

**Prompt 3B — Schema-driven config models (GSettings, NixOS modules, Spring metadata, JSON Schema, .NET Options):**
> [GROUNDING BRIEF][GLOSSARY] Comparative study of **declarative schema/metadata formats** that pair
> type + default + doc + constraints, and how UIs/tools are generated from them. GNOME **GSettings**
> schema XML (`<key>` type, range, default, summary/description) + dconf-editor; **NixOS module system**
> options (`mkOption` type/default/description, **type-directed merge** of multiple modules, assertions —
> a model for partial-settings merge + constraints); **Spring Boot** `spring-configuration-metadata.json`
> (groups, properties, hints, deprecation); **JSON Schema** (annotations, conditionals); **.NET** Options
> + validation. What each gets right about schema-as-SSOT and what to borrow. (NixOS merge + assertions
> is high-value for dimensions C & D.)

**Prompt 3C — Cloud-native layering (Kustomize, Helm, Terraform, Ansible) + cascading-settings products (Sourcegraph):**
> [GROUNDING BRIEF][GLOSSARY] Study production-grade **layering/merge/override** engines: Kustomize
> (bases + overlays + strategic-merge/JSON patch), Helm values merge + `--set`, Terraform variable
> precedence + `validation` blocks, Ansible variable precedence. Then **Sourcegraph cascading settings**
> (JSON Schema-driven, global→org→user merge, shown in-product) as the closest analog to an app-level
> settings cascade. Extract a precise, minimal merge/precedence model for zodal-settings. Cover **C, G**.

**Prompt 3D — UI-toolkit settings/preferences & design-token/theming systems (JetBrains, Chrome/Firefox, Figma, Storybook, Style Dictionary):**
> [GROUNDING BRIEF][GLOSSARY] Survey **front-end-facing** settings/preferences and parameter UIs:
> JetBrains preferences (searchable, scoped, shareable); Chrome `chrome://settings` + policy + `flags`;
> Firefox `about:config` + policy; **Figma variables/modes** (variable collections with **modes** =
> layered values + theming — a strong analog for C/profiles); **Storybook args/controls** (auto control
> UI from arg types — very zodal-like); **Style Dictionary / design tokens** (token layering, themes).
> What interaction patterns and data models to adopt for a headless renderer-registry design.

**Verification (Phase 3):** a skeptic agent re-checks each "keep/avoid" claim against the cited source.

---

## Phase 4 — Synthesis & design implications

**Prompt 4 — "Synthesis: design implications for zodal-settings":**
> [GROUNDING BRIEF][GLOSSARY] You are given all Phase 0–3 reports (attached). Produce a synthesis that:
> (1) settles the **preferred vocabulary** for the project;
> (2) for each dimension A–P, states the **recommended model** and the single best prior-art analog;
> (3) proposes the **layered architecture** (core model / headless UI / renderers) mapping each concern
>     to a package, consistent with zodal + zodal-graphs conventions;
> (4) lists **what to keep vs. avoid** as a decision table (like `zodal-graphs/docs/research/README.md`);
> (5) flags **open questions** for the design plan;
> (6) proposes **3–5 candidate names** for the package (zodal-{X}) with rationale, community
>     recognizability, and npm/GitHub availability notes — settling-the-name input for the user.

**Consumes:** all prior. **Produces:** `raw/04-synthesis.md` → folded into the design plan + repo docs.

---

## Phase 5 — Ecosystem grounding (zodal corpus + i2mint/Python ecosystem)

Done after web research so findings sharpen the search. Two parts:

**5a — zodal corpus pass:** read all `zodal/docs/research/*`, `zodal-graphs/docs/research/*`,
known-issues, ideas-and-future, and the affordance taxonomy; extract every note relevant to A–P
(esp. content-metadata **bifurcation** → secrets/sensitivity I; affordance taxonomy → J; registry →
renderers; codecs → file round-trip L). Capture the conventions the new package must obey.

**5b — broader ecosystem pass (lightweight):** survey the user's Python ecosystem for config/settings
prior art (e.g. `dol`, `config2py`, `i2`, `meshed`, any "settings/params" utilities) to learn the
**backend** shapes zodal-settings may interoperate with. This is mostly Python, so treat as
interoperability/inspiration, not implementation.

**Produces:** `raw/05-ecosystem-notes.md`.

---

## Execution order & dependencies

```
Phase 0 (terminology)  ──┐
                         ├─► rewrites glossary into all later prompts
Phase 1 (settings UX) ◄──┘
        │
        ▼
Phase 2 (A–J dimension deep dives, parallel) ──► adversarial verify
        │
        ▼
Phase 3 (open-source/product case studies, parallel) ──► adversarial verify
        │
        ▼
Phase 4 (synthesis + candidate names)
        │
        ▼
Phase 5 (zodal corpus + ecosystem grounding)
        │
        ▼
NAME DECISION (with user) → create i2mint repo → design plan + dev skills
```

## What each phase is given
- **Every prompt:** grounding brief (§0).
- **Phases 1–5:** + the Phase 0 glossary.
- **Phase 2 verifiers / Phase 3:** + the relevant Phase 1/2 reports they extend.
- **Phase 4:** + all Phase 0–3 reports.
- **Phase 5:** + Phase 4 synthesis (to know what to look for in the corpus).
