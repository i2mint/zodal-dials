# 02A — Separation of Concerns: Schema, Data, Behavior, Presentation for Configuration

**Research dimension A** for `zodal-settings`. Question: how do mature configuration systems separate the *schema* (declaration), the *data* (values), the *behavior* (validation, defaulting, reconciliation), and the *presentation* (grouping, widgets, ordering)? What belongs in the schema vs. a metadata layer vs. a separate organization layer? Should the schema be nested or flat?

---

## TL;DR

- **Universal pattern across every mature system surveyed**: a *declarative schema* carries **type + default + docs + constraints** and nothing about layout/grouping/widgets. Presentation is layered *separately and explicitly* — most cleanly in RJSF's `uiSchema` ("the JSON Schema says *what*, the uiSchema says *how*") [1] and in Spring's `hints` block [3].
- JSON Schema formalizes the split that everyone reinvents: **assertion keywords** (`type`, `enum`, `minimum`, `required`) *fail validation*; **annotation keywords** (`title`, `description`, `default`, `examples`) *never affect validity* and exist purely for "documentation generators or form generators" [5][6]. This is the single most important precedent for zodal-settings.
- Config-as-**data** (declare desired state, let a reconciler act) beats config-as-**code** (imperative steps) for surfaceability, diffability, and tooling — this is the explicit thesis behind Kubernetes' resource model [7][8] and the 12-Factor "config in the environment" rule [11].
- **Schema vs. metadata vs. organization layer** (the three-bucket model zodal-settings should adopt):
  - *Schema* = type, validation, constraints, default. SSOT for correctness.
  - *Metadata* = docs (summary/description/examples), affordance hints, sensitivity, lifecycle (live-apply vs restart) — travels *with* the key but is non-assertive.
  - *Organization layer* = grouping/facets, ordering, advanced-disclosure, widget overrides — lives *outside* the schema, keyed by setting key.
- **Flat schema as SSOT is well-supported and defensible** (project's preference). Hierarchical/dotted keys give the *navigation* benefits (logical grouping, prefix queries) without forcing structural nesting into the schema [9][10]. Keep the keyspace dotted-flat; project trees as one rendering of a facet.
- **AVOID** encoding presentation in the data schema (couples validation to UI, kills multi-rendering), and AVOID environment-named config bundles as the variability mechanism — they combinatorially explode [11].

Hard facts are cited. Recommendations for zodal-settings are explicitly labeled **[SYNTHESIS]**.

---

## 1. Config-as-data vs. config-as-code

**Config-as-code** expresses configuration through a general-purpose language (Python/Ruby) or a purpose-built one (HCL): you write *steps* or *programs* that produce config. **Config-as-data** expresses the *desired end-state* as inert, serializable data (YAML/JSON) and hands it to a reconciler that figures out how to achieve it [7][8].

Kubernetes is the canonical config-as-data system: every resource is "a YAML/JSON specification of an API object… you declare what you want the world to look like without specifying how" [8]. The control plane is "a document store" with asynchronous controllers reconciling it [8]. Google's framing: config-as-code "does not provide a contract between the developer's intent and runtime operation," whereas data does [7][8].

The **12-Factor App** makes the orthogonal but related cut: separate *config* (everything that varies between deploys) from *code* (which does not). Its litmus test — "could the codebase be made open source at any moment without compromising credentials?" — is a clean operational definition of the code/config boundary [11]. It also warns against *environment-named bundles* (dev/staging/prod/joes-staging) because they "scale [poorly]… resulting in a combinatorial explosion" [11] — directly relevant to zodal-settings' scope/layer model, which should be a *cascade of partial layers*, not a fixed set of named full environments.

**KEEP** for zodal-settings: config-as-data. Settings, layers, and patches are inert serializable data (JSON Merge Patch / JSON Patch), merged by a pure cascade function. The Zod schema is the *contract* between declared intent and runtime. **[SYNTHESIS]**

---

## 2. Declarative schema models: what they carry

Every surveyed system co-locates **type + default + human docs + constraints** in a declaration, and (crucially) keeps *grouping/layout* out. The differences are in *how much* metadata they smuggle in and *how* they keep presentation separate.

### GNOME GSettings (`.gschema.xml`)
A `<schema>` (with `id` + `path`) contains `<key>` elements, each with a `type` (GVariant code: `b`, `i`, `s`, …), a `<default>`, a `<summary>` (short) and a `<description>` (long) [2]. `<summary>`/`<description>` are gettext-translatable — i.e., explicitly *documentation*, not validation [2]. Constraints live in the type/range (`<range>`, `<choices>`). **No layout, no widget, no grouping** in the schema — the settings UI (dconf-editor, GNOME Settings panels) is a *separate* artifact. This is the cleanest classic example of schema = type+default+docs+constraint, presentation elsewhere.

### NixOS module options (`mkOption`)
`mkOption { type; default; example; description; }` — type is *mandatory for nixpkgs modules*; `default` is optional (omitting it forces the user to supply a value); `example` and `description` (Nixpkgs-flavored Markdown) are for the generated manual [4]. Modules *separate declaration from definition*: `options = {…}` declares; `config = {…}` defines values; `imports` composes [4]. This declaration/definition split is essentially zodal-settings' schema/layer split. Note NixOS schemas *are* nested (attribute paths), and the module system *merges* definitions across modules — a real-world cascade.

### Spring `spring-configuration-metadata.json`
JSON with three top-level arrays: `groups`, `properties`, `hints` [3]. A *property* has `name`, `type` (Java class), `sourceType`, `defaultValue`, and `description` (populated from the field's Javadoc by the annotation processor at compile time) [3]. **`hints` is the separation seam**: hints supply allowed-value lists + per-value descriptions purely so an IDE can offer autocompletion — explicitly *tooling/presentation* data kept in its own block, not mixed into the property definition [3]. This is a strong precedent for zodal-settings keeping affordance/widget hints in a sibling structure rather than inline.

### JSON Schema
The formal authority for the assertion/annotation split. **Assertion keywords** (`type`, `enum`, `minimum`, `maxLength`, `pattern`, `required`) produce pass/fail results. **Annotation keywords** (`title`, `description`, `default`, `examples`, `readOnly`, `deprecated`) "produce no assertion result and… are not considered during validation"; they exist so that "documentation generators or form generators may use [them] to give hints" [5][6]. Notably, `default` is **not** used to fill missing values during validation — it is advisory metadata [6]. JSON Schema also defines **`x-` extension keywords** and **custom vocabularies** (2019-09+) for tool-specific metadata; `x-` keywords are forward-compatible and "collected as annotations" without affecting validation [12]. This is exactly how a headless library should carry affordance hints: as non-assertive annotations.

### .NET Options pattern
Binds a config section to a strongly-typed `TOptions` POCO; validation via DataAnnotations or custom `IValidateOptions` [13]. The interesting bit for zodal-settings is *behavior separation by lifecycle*: `IOptions<T>` (singleton, read once — `requires-restart` semantics), `IOptionsSnapshot<T>` (scoped, re-read per request), `IOptionsMonitor<T>` (live change notifications — `live-apply` semantics) [13]. The *same schema/data* is consumed under three different *behavioral* contracts. zodal-settings' "live-apply vs requires-restart" flag is the same idea, but better modeled as schema metadata so the consumer can pick the contract.

### Kubernetes CRD OpenAPI v3 (structural schema)
A CRD ships a **structural schema**: root `type: object`, every property typed, every array `items` typed [14][15]. The schema does *validation* (admission-time), *defaulting* (`default` markers), *pruning* (drop unknown fields), and *documentation* (`description` → `kubectl explain`) — four behaviors driven off one declaration [14]. **`x-kubernetes-*` vendor extensions** (`x-kubernetes-preserve-unknown-fields`, `-int-or-string`, `-embedded-resource`, `-validations` for CEL rules) extend the schema with behavior the base OpenAPI subset can't express [14] — the CRD analogue of JSON Schema's `x-` escape hatch. Again: no presentation/grouping in the schema; that lives in dashboards/`kubectl` plugins.

**Cross-system synthesis**: type + default + constraint + docs is the irreducible schema payload. *Docs* sits at the boundary — present in the schema everywhere, but always flagged non-assertive (GSettings translatable strings, JSON Schema annotations, NixOS Markdown descriptions). **Presentation/grouping is consistently external** (Spring `hints`/`groups`, RJSF `uiSchema`, GSettings UI panels). **[FACT, multi-source]**

---

## 3. Keeping presentation OUT of the schema

The strongest articulation is **RJSF**: "A UI schema is basically an object literal providing information on how the form should be rendered, while the JSON schema tells what" [1]. The split:

- **JSON Schema (data/validation)**: `type`, `enum`, `default`, `pattern`, `required`, `minLength`, `maximum`, `properties`, `items` [1].
- **uiSchema (presentation/behavior)**: `ui:widget` (control selection), `ui:order` (field ordering), `ui:title`/`ui:description`/`ui:placeholder` (display overrides), `ui:options`, `ui:disabled`/`ui:readonly`, `ui:classNames`/`ui:style` [1].

uiSchema mirrors the *tree structure* of the data but is a distinct object. RJSF's rationale is precisely zodal's: **reusability** (one schema, many renderings), **maintainability** (validation independent of UI), **flexibility** (restyle without touching validation), **single responsibility** [1]. Because uiSchema can be "pure JSON, which can't carry functions," widgets are *referenced by identifier* from a registry [1] — exactly zodal's capability-ranked renderer registry pattern.

**KEEP**: zodal-settings should adopt a uiSchema-equivalent "presentation-hints layer" keyed by setting key, holding ordering, facet membership, widget override, advanced-disclosure flag — *separate* from the Zod schema. Widgets resolved through a registry by identifier, never embedded. **[SYNTHESIS, aligned with zodal's existing affordance/registry model]**

---

## 4. Flat schema + external organization vs. nested schema

The project prefers a **flat schema as SSOT**. The evidence supports this with a key nuance: **flat keyspace, hierarchical *naming*.**

- Hierarchical (dotted) key *names* give logical grouping, readability, and prefix queries ("retrieve only a portion of config") without requiring the *storage/declaration* to be structurally nested — Azure App Configuration explicitly treats keys as a flat store with delimiters as a *naming convention*, "delimiters… function as spaces in a sentence" [9].
- Nesting *in the schema* buys implicit grouping but couples the data shape to one organizational view and complicates merging, partial layers, and multi-membership grouping. Guidance: prefer nested subsections only with "clear logical grouping of 3+ related fields" and "distinct semantic meaning"; flat for simple/small sets [9][10].
- The cascade argument (decisive for zodal-settings) **[SYNTHESIS]**: a *flat dotted keyspace* makes **layers**, **patches** (JSON Merge Patch / JSON Patch operate on paths), **provenance** (per-key winning scope), and **multi-membership facets** trivial. Nested schemas force deep-merge semantics into the *structure* and make a setting belong to exactly one branch — directly at odds with the facet/tag model ("a setting may carry several [facets]; a tree is one rendered projection"). A facet is a *many-to-many tag*; a nested tree can only express one-to-one containment.

So: **flat (dotted) keyspace as SSOT; organization (trees/groups) is a projection layer over facets, computed, not stored in the schema.** This matches Spring (`groups` is a separate array from `properties` [3]) and RJSF (`ui:order` + nesting in uiSchema, not in the schema [1]).

**Caveat / unverified for zodal specifically**: Zod v4 schemas are naturally *nested* objects. A flat-key model requires either (a) flattening a Zod object schema to dotted keys, or (b) registering atomic settings against a flat registry and composing object views on demand. The zodal-graphs canonical-model approach (registry of field affordances) suggests (b) is the idiomatic path, but this should be confirmed against the core `defineCollection`/affordance machinery. **[FLAG: verify against zodal core]**

---

## 5. The three-bucket model for zodal-settings (recommendation)

**[SYNTHESIS]** Partition every concern into exactly one bucket:

| Bucket | Contents | Authority | Lives in |
|---|---|---|---|
| **Schema** (SSOT) | type, validation refinements, hard constraints, default | Zod v4 schema | the schema, assertive |
| **Metadata** | summary/description/examples, affordance hints, sensitivity/secret flag, lifecycle (live-apply vs restart), deprecated/managed | `.meta()` + external affordance registry | with the key, *non-assertive* |
| **Organization** | facet/tag membership, ordering, advanced disclosure, widget override, group titles | separate uiSchema-equivalent layer keyed by setting key | outside the schema entirely |

- The **schema/metadata** boundary follows JSON Schema's assertion/annotation line [5][6]: if removing it can never change validity, it is metadata, not schema.
- The **metadata/organization** boundary: metadata describes *one setting intrinsically* (this value is secret, this needs a restart); organization describes *relationships and layout across settings* (these belong to the "advanced" facet, render in this order). Spring draws the same line between `properties` and `groups`/`hints` [3].
- **Constraints (hard) live in the schema** (cross-field refinements). **Dependent defaults (soft) are behavior**, not schema — computed, overridable, and should be expressible such that they *could* be handed to a CSP/SAT solver (feature-model framing). Keep them out of `default` (which is a static annotation per JSON Schema [6]).

---

## KEEP

1. Assertion/annotation split (JSON Schema [5][6]): if it can't change validity, it's metadata, not schema.
2. uiSchema-equivalent presentation layer keyed by setting key; widgets via registry identifier, never inline (RJSF [1]).
3. Flat dotted keyspace as SSOT; trees/groups as computed projections of facets (Azure App Config [9]).
4. Config-as-data: inert serializable layers + pure cascade; schema is the intent↔runtime contract (Kubernetes [7][8]).
5. `x-`/`.meta()` non-assertive extension channel for affordance & tooling hints (JSON Schema `x-` [12]; K8s `x-kubernetes-*` [14]).
6. Lifecycle as schema metadata so consumers pick the read contract (.NET IOptions/Snapshot/Monitor [13]).

## AVOID

1. Encoding grouping/ordering/widgets in the data schema — couples validation to one UI, kills multi-rendering (RJSF rationale [1]).
2. Structural nesting as the *only* grouping mechanism — breaks multi-membership facets and complicates layer merging.
3. Environment-named full bundles as the variability model — combinatorial explosion (12-Factor [11]).
4. Putting soft/dependent defaults in `default` — `default` is a static, non-validating annotation [6].
5. Config-as-code (imperative steps) for the core model — loses diffability, provenance, and the intent contract.
6. Smuggling secrets/credentials into the committed schema or data layer (12-Factor litmus test [11]).

## Open questions

1. How to flatten Zod v4's naturally nested object schemas into a flat dotted keyspace (flatten an object schema vs. register atomic settings)? Verify against zodal core's affordance registry / `defineCollection`. **[FLAG]**
2. Should hard cross-field constraints live as Zod `.refine()` (schema) or in a separate constraint layer feedable to a CSP/SAT solver, or both (schema for validation, mirrored declarative form for solving)?
3. Is the presentation layer best expressed as a single RJSF-style `uiSchema` tree or as per-key entries in the affordance registry (zodal-graphs pattern)?
4. How does provenance interact with deep-merged object-valued settings — per-key provenance at the leaf, or per-object?

## Checkable claims

1. RJSF docs state verbatim that a uiSchema describes how a form is rendered "while the JSON schema tells what," with `ui:widget`/`ui:order`/`ui:options` in uiSchema and `type`/`enum`/validation in the JSON Schema [1].
2. JSON Schema annotation keywords (`title`, `description`, `default`, `examples`) "produce no assertion result" and `default` is "not used to fill in missing values during the validation process" [5][6].
3. Spring `spring-configuration-metadata.json` has exactly three top-level arrays — `groups`, `properties`, `hints` — and property `description` is populated from field Javadoc by the annotation processor [3].
4. Kubernetes structural schemas require root `type: object`, typed properties, and typed array `items`, and use `x-kubernetes-*` vendor extensions for behavior beyond the OpenAPI subset [14].

---

## References

1. [uiSchema — react-jsonschema-form documentation](https://rjsf-team.github.io/react-jsonschema-form/docs/api-reference/uiSchema/)
2. [HowDoI/GSettings — GNOME Wiki Archive](https://wiki.gnome.org/HowDoI/GSettings); see also [gsettings-desktop-schemas .gschema.xml source](https://github.com/GNOME/gsettings-desktop-schemas/blob/master/schemas/org.gnome.desktop.interface.gschema.xml.in)
3. [Configuration Metadata — Spring Boot Reference](https://docs.spring.io/spring-boot/docs/3.2.6/reference/html/configuration-metadata.html); [Metadata Format — Spring Boot specification](https://docs.spring.io/spring-boot/specification/configuration-metadata/format.html)
4. [Option Declarations / mkOption — nixpkgs manual](https://github.com/NixOS/nixpkgs/blob/nixos-23.11/nixos/doc/manual/development/option-declarations.section.md); [NixOS modules — NixOS Wiki](https://nixos.wiki/wiki/NixOS_modules)
5. [JSON Schema Validation draft 2020-12 — annotations vs assertions](https://json-schema.org/draft/2020-12/json-schema-validation)
6. [Annotations — Understanding JSON Schema](https://json-schema.org/understanding-json-schema/reference/annotations)
7. [Understanding Configuration as Data in Kubernetes — Google Cloud Blog](https://cloud.google.com/blog/products/containers-kubernetes/understanding-configuration-as-data-in-kubernetes)
8. [Declarative Management of Kubernetes Objects Using Configuration Files — Kubernetes docs](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/declarative-config/)
9. [Understand Azure App Configuration key-value store — Microsoft Learn](https://learn.microsoft.com/en-us/azure/azure-app-configuration/concept-key-value)
10. [Object-Oriented Configuration: flat vs nested tradeoffs — Agent CI Blog](https://agent-ci.com/blog/2025/10/15/object-oriented-configuration-why-toml-is-the-only-choice/)
11. [Store config in the environment — The Twelve-Factor App](https://12factor.net/config)
12. [Custom Annotations Will Continue — JSON Schema blog (x- prefix)](https://json-schema.org/blog/posts/custom-annotations-will-continue)
13. [Options pattern — .NET / Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/core/extensions/options)
14. [Extend the Kubernetes API with CustomResourceDefinitions — Kubernetes docs](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/); [Future of CRDs: Structural Schemas — Kubernetes blog](https://kubernetes.io/blog/2019/06/20/crd-structural-schema/)
15. [Kubernetes 1.27: Server-Side Field Validation and OpenAPI V3 move to GA — Kubernetes blog](https://kubernetes.io/blog/2023/04/24/openapi-v3-field-validation-ga/)
