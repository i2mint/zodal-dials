# Terminology Map: Settings / Configuration / Preferences / Parameterization Management

*Research input for **zodal-settings** — a domain specialization of zodal for typed, named, surfaced parameters.*

## TL;DR — Decision-Relevant Takeaways

- **The layering mechanism that combines sources into a final value is called the *cascade* (CSS/W3C origin) or, in config tooling, *layered/hierarchical configuration* with *precedence* / *overriding*. The computed result is the *effective value* (VS Code's exact term) [1][2][9].** Recommend: adopt **"cascade"** for the algorithm and **"effective value"** for its output. These are the most recognizable, primary-sourced names.
- **Saved reusable bundles of values have three near-synonymous names by community: *preset* (CMake, Tailwind, slicers), *profile* (VS Code, browsers, IDEs), and *shareable config* (Renovate, ESLint) [10][11][12].** Recommend **"profile"** for the full named bundle a user selects, **"preset"** for a curated/shippable starting bundle.
- **A *partial* bundle that sets only some fields is an *override*, *overlay*, or *patch*; the operation that combines them is a *merge* with a defined *merge strategy* / *conflict-resolution* rule. Tailwind/Terraform/CMake call partials "overrides"; Kustomize calls them *overlays* applying *strategic merge patches* [10][13][7].** Recommend **"layer"** (a partial set of values) + **"merge strategy"** (how conflicts resolve).
- **Patch/merge wire formats are standardized: RFC 6902 *JSON Patch* (op list: add/remove/replace/move/copy/test), RFC 7386 *JSON Merge Patch* (mirror-shaped doc; `null` deletes), and Kubernetes *Strategic Merge Patch* (schema-aware, merge keys for lists) [3][4][5][13].** Recommend: model layers as **JSON-Merge-Patch-shaped** internally (ergonomic, schema-mirroring) and *publish* JSON Patch for audit/history.
- **Hard cross-field rules = *constraints* / *cross-tree constraints* / *cross-field validation*; soft rules = *dependent/derived defaults* or *recommendations*. The academic framing of valid option combinations is *feature modeling* / *variability modeling* / *product configuration*, reducible to *SAT* or *CSP* [6][14][8].**
- **Group membership: a *tree/taxonomy* gives single-path hierarchy; *faceted classification* (Ranganathan) allows multi-membership via independent dimensions/*facets* — i.e., tagging [15][16].** Recommend faceted/tag model so a setting can appear under multiple groups.
- **Headless config-to-UI mapping precedent: JSON Schema (the *what*) + a separate *uiSchema* / *widget* layer (the *how*), exactly as RJSF and JSONForms split them [17].** This validates zodal's headed/headless split.
- **Sensitive values are *secrets* and are conventionally separated from non-sensitive *config* (Kubernetes Secret vs ConfigMap; Vault) [18].** Treat sensitivity as a first-class field affordance.
- **Admin-enforced, non-overridable values are *managed policy* / *policy settings* (Chrome, VS Code "Policy Settings" sit at the top of the cascade) [1][20].**

---

## A. Separation of Concerns (config-as-data)

| Canonical name | Synonyms | Definition | Origin community | Cite |
|---|---|---|---|---|
| **Config-as-data / externalized config** | Twelve-factor config, config-from-code separation | Configuration is data that varies across deploys, kept strictly separate from code | Twelve-Factor App | [9] |
| **Declarative configuration** | Desired-state config | Config describes *what* the system should be, not *how* to reach it | Kubernetes / IaC | [13] |
| **Schema-first config** | Schema-driven | A schema is the single source of truth from which UI/validation/types are derived | JSON Schema / RJSF | [17] |

*Synthesis:* zodal-settings is squarely "schema-first config-as-data" — the Zod schema is the SSOT, config values are plain data layered on top.

## B. Organization & Disclosure

| Canonical name | Synonyms | Definition | Origin | Cite |
|---|---|---|---|---|
| **Progressive disclosure** | Advanced/expand toggle, "show advanced" | Defer rarely used options to a secondary view, showing only essentials first | Nielsen (1995), NN/g | [21] |
| **Grouping / sectioning** | Categories, settings pages | Organizing settings into named bundles for navigation | VS Code, OS settings | [1] |
| **Faceted classification** | Faceting, tagging, multi-label | Independent dimensions applied simultaneously; allows multi-membership | Ranganathan / IA | [15][16] |
| **Taxonomy / tree** | Hierarchy, nested categories | Single-path parent-child grouping | NN/g IA | [16] |

*Synthesis (G — group membership):* Use **facets/tags** (multi-membership) as the canonical model; render a tree as one *projection* of one facet. The project's thesis ("push as many parameters to the surface as possible") makes progressive disclosure a per-setting affordance (e.g. an `advanced` facet) rather than a hidden second screen.

## C. Collections of Settings (profiles / presets / composition)

| Canonical name | Synonyms | Definition | Origin | Cite |
|---|---|---|---|---|
| **Profile** | Workspace/user profile, environment | A complete named selection of settings a user activates | VS Code, browsers | [1] |
| **Preset** | Preset, template, starter config | A curated, shippable bundle used as a base | CMake Presets, Tailwind, PrusaSlicer | [11][10] |
| **Shareable config** | Extends, base config | A published config others extend/inherit | ESLint, Renovate | [12] |
| **Override (partial)** | Overlay, layer, patch, extension | A bundle that sets *only some* fields, merged onto a base | Terraform override files, Kustomize overlay, Tailwind | [10][13] |
| **Inheritance** | `inherits`, `extends` | A preset/profile derives fields from a parent, overriding selectively | CMake Presets, Maven | [11] |

*Hard facts:* CMake Presets: "inherit all of the fields from the `inherits` presets ... but can override them" [11]. Tailwind: "your own configuration acting as a set of overrides and extensions ... theme object merged shallowly" [10]. Terraform override files: "merges the override block contents into the existing object" argument-by-argument [10].

## D. Linked Validation & Smart Defaults

| Canonical name | Synonyms | Definition | Origin | Cite |
|---|---|---|---|---|
| **Cross-field validation (hard)** | Cross-tree constraint, co-constraint, invariant | A rule that makes certain *combinations* of values invalid | Feature models / form libs | [6][14] |
| **Dependent / derived default (soft)** | Recommendation, computed default, soft constraint | A default for one field that depends on another's value; advisory, not enforced | SPL "soft requirements" | [14] |
| **Conditional field** | Dependency, `dependentSchemas` | A field's presence/validity depends on another's value | JSON Schema | [17] |

*Hard fact:* SPL research distinguishes **hard vs soft requirements** when configuring feature models — hard requirements must be satisfied; soft requirements are preferences to optimize [14]. JSON Schema expresses dependencies via `dependentRequired`/`dependentSchemas` [17].

## E. Search

| Canonical name | Synonyms | Definition | Origin | Cite |
|---|---|---|---|---|
| **Settings search** | Filter, fuzzy find | Free-text matching over setting keys, titles, descriptions | VS Code Settings UI | [1] |
| **Faceted search** | Filter-by-facet | Narrowing by selecting facet values (e.g. "modified", "by extension") | IA / e-commerce | [15] |

*Synthesis:* VS Code's Settings editor combines a fuzzy text search with facet filters (`@modified`, `@ext:`, `@tag:`) — a direct precedent for combining E (search) with B (faceting).

## F. Identity / Versioning / Migration of Keys

| Canonical name | Synonyms | Definition | Origin | Cite |
|---|---|---|---|---|
| **Setting key / id** | Property path, dotted key | Stable identifier for a parameter (e.g. `editor.fontSize`) | VS Code | [1] |
| **Deprecation** | `deprecationMessage`, sunset | Marking a key obsolete while keeping it working transitionally | VS Code | [19] |
| **Migration / rename** | Key remap, alias, fallback | Moving a value from an old key to a new one | VS Code, Terraform | [19] |
| **Schema evolution** | Versioned schema | Managing schema changes over time with compatibility rules | Kafka / data systems | [19] |

*Hard fact:* VS Code has **no automatic migration API**; the documented pattern is: create new key, copy the old value, set `deprecationMessage`, fall back via `WorkspaceConfiguration.inspect()`, remove old key after a few releases [19].

## G. Scopes & Precedence / Effective-Value Resolution (THE CASCADE)

| Canonical name | Synonyms | Definition | Origin | Cite |
|---|---|---|---|---|
| **Cascade** | Cascade algorithm | The formal algorithm combining declarations from different sources into one value | CSS / W3C | [2] |
| **Precedence / override order** | Priority, specificity, layering | Which source wins when multiple set the same key | CSS, VS Code, 12-factor | [1][9] |
| **Scope** | Origin, level, tier | The named source a value comes from (user, workspace, folder, policy) | VS Code | [1] |
| **Effective value** | Computed value, resolved value, merged value | The final value after applying the cascade | VS Code | [1] |
| **Merge (objects) vs override (scalars)** | Deep merge, shallow merge | Object-typed settings merge across scopes; scalars/arrays are replaced | VS Code | [1] |

*Hard facts:* VS Code precedence, lowest→highest: **Default → User → Remote → Workspace → Workspace Folder → (language-specific variants) → Policy** [1]. "Values with primitive types and Array types are overridden ... values with Object types are merged" [1]. CSS cascade: "a formal algorithm that defines how to combine property values from different sources," resolved by **origin → importance → specificity → order** [2]. 12-factor / Spring: most-externalized level wins (hardcoded < properties file < JVM args < container env) [9].

*This is the single most important term to standardize.* **Recommend: "cascade" for the mechanism, "scope" for a source/level, "layer" for an individual partial set of values, "effective value" for the output.**

## H. Change Lifecycle

| Canonical name | Synonyms | Definition | Origin | Cite |
|---|---|---|---|---|
| **Live-apply** | Hot reload, reactive apply | Changes take effect immediately without restart | Browsers/IDEs | [1] |
| **Requires-restart** | Restart-to-apply, deferred | Change persisted but only effective after restart | Apps/servers | — (common) |
| **Dirty state** | `isDirty`, unsaved changes | Form/state differs from saved/default values | react-hook-form | [22] |
| **Reset to default** | Revert, restore defaults | Discard a value, fall back to the next cascade layer | VS Code, RHF | [1][22] |
| **Diff** | Change set | The set of keys differing between two states/layers | git / config tools | [13] |
| **Import / export** | Backup, settings sync | Serialize a profile to/from a file | VS Code | [1] |

*Hard fact:* `isDirty` "depends on whether the form's current values match its `defaultValues`"; resetting dirty without clearing content is done by re-baselining `defaultValues` via `reset(currentValues)` [22].

## I. Secrets / Sensitivity

| Canonical name | Synonyms | Definition | Origin | Cite |
|---|---|---|---|---|
| **Secret** | Credential, sensitive value | A value requiring confidential handling (masking, encryption, audit) | Kubernetes, Vault | [18] |
| **Config (non-sensitive)** | ConfigMap data | Ordinary non-confidential settings | Kubernetes | [18] |
| **Sensitivity / masked field** | Redacted, write-only | UI affordance hiding/obscuring a value | forms | — |

*Hard fact:* Kubernetes convention — "ConfigMap is for non-sensitive configuration ... Secret is for sensitive data such as credentials" [18]. Treat sensitivity as a schema-level affordance (mask in UI, never export to plain history, route to a secret store).

## J. Value-Type → Editor Mapping (incl. nested objects)

| Canonical name | Synonyms | Definition | Origin | Cite |
|---|---|---|---|---|
| **Widget** | Control, input, editor | The UI element that edits a given value type | RJSF | [17] |
| **uiSchema** | UI hints, presentation schema | A separate object describing *how* to render each field (the *what* is the data schema) | RJSF / JSONForms | [17] |
| **Field** | Form row | A wrapper around widget(s) handling label/state | RJSF | [17] |
| **Nested object editor** | Subform, object field | Editor for an irreducible structured (object/array) value | RJSF | [17] |

*Hard fact (validates zodal):* RJSF — "JSON Schema is limited for describing how a given data type should be rendered ... uiSchema ... provides information on how the form should be rendered, while the JSON schema tells what" and `ui:widget` selects the control [17]. This *is* zodal's headless split: schema = capability declaration, renderer registry = widget selection.

## K. Documentation & Provenance / Explainability

| Canonical name | Synonyms | Definition | Origin | Cite |
|---|---|---|---|---|
| **Description / help text** | `description`, markdownDescription | Human docs attached to a setting | VS Code / JSON Schema | [7][1] |
| **Provenance** | Source attribution, "set by" | Which scope/layer supplied the effective value | VS Code (modified indicator) | [1] |
| **Explainability** | Why this value | Surfacing the cascade decision to the user | synthesis | — |

*Synthesis (opinion):* zodal-settings should expose *provenance* as a first-class output of cascade resolution — for each effective value, report the winning scope and the shadowed layers. This is rare in existing tools and a differentiator.

## L. Machine Interfaces & File Round-Trip

| Canonical name | Synonyms | Definition | Origin | Cite |
|---|---|---|---|---|
| **Round-trip / format-preserving edit** | Comment preservation, lossless edit | Editing a config file while preserving comments, key order, formatting | ruamel.yaml | [23] |
| **JSON Schema (validation + publish)** | Contributed schema | Publishing a schema for editor validation/autocomplete | JSON Schema / VS Code | [7] |
| **Configuration formats** | JSON / JSONC / TOML / YAML | Serialization formats with differing comment/typing support | various | [23] |

*Hard fact:* ruamel.yaml "supports roundtrip preservation of comments, seq/map flow style, and map key order" [23]. VS Code defines settings via "a superset of JSON Schema," using `default`, `minimum`, `maximum`, `pattern`, `patternErrorMessage` [7]. *Flag:* native TOML comment-preserving round-trip is library-specific (no universal standard); verify per-language.

## M. Reactivity / Binding

| Canonical name | Synonyms | Definition | Origin | Cite |
|---|---|---|---|---|
| **Reactive binding** | Two-way binding, store subscription | Settings state propagates to consumers automatically on change | Zustand/forms | [22] |
| **Controlled value** | Bound input | UI input whose value is driven by state | React/RHF | [22] |

*Synthesis:* zodal already wraps Zustand for state; settings reactivity = a store of effective values that re-emits on any layer change.

## N. Constraint Solving at Scale

| Canonical name | Synonyms | Definition | Origin | Cite |
|---|---|---|---|---|
| **Feature model** | Variability model, feature diagram | A model of features + decomposition + cross-tree constraints defining valid configurations | SPL engineering | [6] |
| **Cross-tree constraint** | Requires/excludes, co-constraint | Dependencies between features beyond the tree (A requires B; A excludes C) | SPL | [6] |
| **Product configuration** | Configurator, configuration problem | Selecting a valid combination of options for a product | AI / config systems | [8] |
| **CSP / SAT** | Constraint satisfaction, Boolean SAT | Reducing valid-combination checking to a solver | SPL analysis | [6][8] |
| **Variability modeling** | Orthogonal Variability Model (OVM) | Modeling what varies across products independently of base | SPL | [6] |

*Hard fact:* "Feature configuration problems can be transformed into Constraint Satisfaction Problems (CSPs) ... or boolean satisfiability (SAT) problems ... and used SAT solvers to derive configurations" [6]. A feature model "represents the set of valid configurations" via "features, decomposition relations, and cross-tree constraints" [6].

*Synthesis:* zodal-settings need not embed a SAT solver, but should expose constraints in a form that *could* be handed to one (declare `requires`/`excludes`/arbitrary predicate refinements per Zod), so heavy parameter spaces remain analyzable.

## O. Accessibility / i18n

| Canonical name | Synonyms | Definition | Origin | Cite |
|---|---|---|---|---|
| **i18n / localization** | l10n, translatable labels | Externalized, translatable setting labels/descriptions | VS Code (`%key%` nls) | [1] |
| **Accessible form semantics** | a11y, ARIA labelling | Label/description/error wiring for assistive tech | WAI / forms | — |

*Synthesis:* keep labels/descriptions as keys resolvable through an i18n table; emit a11y metadata (label, describedby, invalid) as part of the headless field config so any renderer wires it correctly.

## P. Telemetry / Governance / Managed Policy

| Canonical name | Synonyms | Definition | Origin | Cite |
|---|---|---|---|---|
| **Managed policy** | Policy setting, admin-enforced, locked | Admin-set value that overrides all user scopes and cannot be changed locally | Chrome Enterprise, VS Code | [20][1] |
| **Governance** | Compliance, audit | Org-level control/audit of configuration | enterprise | [20] |
| **Telemetry** | Usage reporting | Reporting of config/usage to admins | Chrome Enterprise | [20] |

*Hard fact:* "If a setting is enforced by policy, users can't change it in Chrome settings" [20]; VS Code's **Policy Settings** sit at the very top of the precedence order [1].

---

## Standard Names — Direct Answers to the 7 Required Items

1. **Layering/precedence → effective value:** the **cascade** (CSS/W3C term [2]); in config tooling **layered/hierarchical configuration** with **precedence/override order**; output is the **effective value** (VS Code [1]).
2. **Saved reusable bundle of values:** **profile** (full user-selectable set) / **preset** (curated base) / **shareable config** (published, extendable) [10][11][12].
3. **Partial bundle + combine-with-conflict-resolution:** a **partial/override/overlay/layer**; combined via **merge** under a **merge strategy** (deep-merge objects, replace scalars; Kustomize **strategic merge** is schema-aware) [1][10][13].
4. **Cross-field rules:** **hard = constraints / cross-tree constraints / cross-field validation / invariants**; **soft = dependent (derived) defaults / recommendations / soft requirements** [6][14].
5. **Patch/merge wire formats:** **RFC 6902 JSON Patch** (op array), **RFC 7386 JSON Merge Patch** (mirror doc, `null` deletes), **Kubernetes Strategic Merge Patch** (schema-aware, list merge keys) [3][4][5][13].
6. **Academic framing of valid option combinations:** **feature models / variability modeling / product configuration**, analyzed as **CSP** or **SAT** [6][8].
7. **Which-field-belongs-to-which-group (esp. multi-membership):** **faceted classification / faceting / tagging** (multi-membership via independent dimensions) vs **taxonomy / tree** (single-path hierarchy) [15][16].

---

## Preferred Vocabulary for zodal-settings (use verbatim downstream)

- **Setting** — a typed, named parameter (the atomic unit). Identified by a stable **key** (dotted path).
- **Schema** — the Zod v4 declaration that is the SSOT for a setting's type, validation, constraints, and `.meta()` affordances.
- **Layer** — a (possibly partial) set of setting values from one source. Synonym of override/overlay; the unit that gets merged.
- **Scope** — a named, ordered source of layers (e.g. `default`, `preset`, `profile`, `workspace`, `policy`). Scopes define precedence.
- **Cascade** — the algorithm that merges layers across scopes (objects deep-merge, scalars/arrays replace, higher scope wins).
- **Effective value** — the resolved output of the cascade for a key. Always pair with **provenance** (winning scope + shadowed layers).
- **Profile** — a complete, user-selectable named bundle of values.
- **Preset** — a curated, shippable base bundle, intended to be extended/overridden.
- **Merge strategy** — the per-key rule for combining layers (replace / deep-merge / append / strategic).
- **Patch** — a serialized layer/delta in a standard format: **JSON Merge Patch** (preferred internal shape), **JSON Patch** (preferred for history/audit/undo).
- **Constraint (hard)** — a cross-field rule that makes a combination invalid (a refinement over multiple keys).
- **Dependent default (soft)** — an advisory computed default for one key derived from others; overridable.
- **Facet / tag** — a grouping dimension allowing multi-membership; a setting may carry several. Canonical grouping model. A **tree** is one rendered projection of a facet.
- **Affordance** — (zodal term, kept) the resolved capability of a field that drives widget selection.
- **Widget** — the renderer-side control chosen for a setting's value type (RJSF term).
- **uiSchema-equivalent** — the headless presentation hints layer, separate from the data schema.
- **Sensitivity / secret** — a field flag marking a value as confidential (masked, never plain-exported, routable to a secret store).
- **Managed / policy value** — a value enforced by an admin scope at the top of the cascade; non-overridable locally.
- **Dirty state** — current values differ from the active profile/defaults; gates save/discard.
- **Live-apply vs requires-restart** — whether a changed value takes effect immediately or after restart.
- **Progressive disclosure** — modeled as an `advanced`-style facet, not a hidden second screen.
- **Feature model / variability** — the academic framing for the space of valid setting combinations; constraints are expressed so they *could* be solved by a CSP/SAT engine.

*Synthesis/opinion (flagged):* prefer **"layer"** over "override/overlay" as the project's primary noun because it is source-neutral and composes naturally with "cascade"; reserve "override" for the *verb* (a higher layer overriding a lower one). Use **"effective value"** and **"provenance"** together — provenance/explainability is a deliberate differentiator. Treat **facets** (not trees) as the source of truth for grouping. **Could not fully verify:** a single cross-language standard for TOML comment-preserving round-trip (appears library-specific [23]); "requires-restart" has no single canonical primary source (it is ubiquitous folk terminology).

---

## References

1. [User and workspace settings — Visual Studio Code](https://code.visualstudio.com/docs/configure/settings)
2. [Introduction to the CSS cascade — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascade/Introduction); [CSS Cascading and Inheritance Level 4 — W3C](https://www.w3.org/TR/css-cascade-4/)
3. [RFC 6902 — JavaScript Object Notation (JSON) Patch — IETF](https://datatracker.ietf.org/doc/html/rfc6902)
4. [RFC 7386 — JSON Merge Patch — IETF](https://datatracker.ietf.org/doc/html/rfc7386)
5. [JSON Patch vs JSON Merge Patch — Zuplo](https://zuplo.com/learning-center/json-patch-vs-json-merge-patch)
6. [Conjunctive Query Based Constraint Solving for Feature Model Configuration — arXiv](https://arxiv.org/pdf/2304.13422); [Local Features: Enhancing Variability Modeling in SPLs — arXiv](https://arxiv.org/abs/2403.15821)
7. [Contribution Points (contributes.configuration) — VS Code Extension API](https://code.visualstudio.com/api/references/contribution-points)
8. [Modeling variability in product line engineering — Proceedings of the Design Society, Cambridge](https://www.cambridge.org/core/journals/proceedings-of-the-design-society/article/modeling-variability-in-product-line-engineering-ple-for-systems-engineering-se/68DD57950D266FDE54EACE689C885C2B)
9. [The Twelve-Factor App — Config](https://12factor.net/config)
10. [Presets — Tailwind CSS](https://v3.tailwindcss.com/docs/presets); [Override Files — Terraform](https://developer.hashicorp.com/terraform/language/files/override)
11. [cmake-presets(7) — CMake Documentation](https://cmake.org/cmake/help/latest/manual/cmake-presets.7.html)
12. [Shareable Config Presets — Renovate Docs](https://docs.renovatebot.com/config-presets/)
13. [Declarative Management of Kubernetes Objects Using Kustomize — kubernetes.io](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/)
14. [Configuring Software Product Line Feature Models Based on Stakeholders' Soft and Hard Requirements — Springer](https://link.springer.com/chapter/10.1007/978-3-642-15579-6_2)
15. [Faceted classification — Wikipedia](https://en.wikipedia.org/wiki/Faceted_classification); [Faceted Classification and Faceted Taxonomies — Hedden Information Management](https://www.hedden-information.com/faceted-classification-and-faceted-taxonomies/)
16. [Taxonomy 101: Definition, Best Practices — Nielsen Norman Group](https://www.nngroup.com/articles/taxonomy-101/)
17. [uiSchema — react-jsonschema-form docs](https://rjsf-team.github.io/react-jsonschema-form/docs/api-reference/uiSchema/); [Widgets — react-jsonschema-form docs](https://rjsf-team.github.io/react-jsonschema-form/docs/usage/widgets/)
18. [ConfigMaps and Secrets in Kubernetes — k8s.guide](https://www.k8s.guide/configuration/configmaps-secrets/); [HashiCorp Vault — Kubernetes secrets engine](https://developer.hashicorp.com/vault/docs/secrets/kubernetes)
19. [Migrating extension settings to a new structure — microsoft/vscode-discussions #862](https://github.com/microsoft/vscode-discussions/discussions/862)
20. [Set Chrome policies for users or browsers — Chrome Enterprise Help](https://support.google.com/chrome/a/answer/2657289); [Enterprise policies — Chromium Docs](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/enterprise/policies.md)
21. [Progressive Disclosure — Nielsen Norman Group](https://www.nngroup.com/articles/progressive-disclosure/)
22. [formState (isDirty) — React Hook Form](https://react-hook-form.com/docs/useform/formstate); [reset — React Hook Form](https://www.react-hook-form.com/api/useform/reset/)
23. [ruamel.yaml — PyPI](https://pypi.org/project/ruamel.yaml/)
