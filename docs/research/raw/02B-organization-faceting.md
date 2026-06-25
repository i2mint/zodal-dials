# 02B — Organizing Large Flat Parameter Sets: Tree Grouping vs Multi-Membership Faceting

*Research dimension B (organization/faceting) for **zodal-settings**, a domain specialization of zodal for the settings/configuration/preferences domain.*

## TL;DR

- **Keep the schema flat and treat grouping as a separate, additive layer.** The Zod v4 schema is the SSOT for type/validation/affordance; *organization* (groups, labels, ordering, advanced-ness) is presentation metadata that must live in a sibling **grouping layer** keyed by setting key. This mirrors zodal's existing "uiSchema-equivalent" separation of data schema from presentation hints.
- **Facets (multi-membership tags), not a single tree, are the canonical grouping model.** A tree is *one rendered projection* of a facet — faceted classification is multi-dimensional and lets a setting belong to several groups at once [1][2]. VSCode itself proves this: its **table-of-contents tree** and its **`@tag:` filters** are two projections over the same flat registry [3][4].
- **VSCode is the reference implementation to copy.** Each setting carries `order` (int), `tags` (string[]), `scope`, plus description metadata; categories also carry `order`. The Settings editor renders a ToC tree by category, supports `@tag:`, `@modified`, `@ext:`, `@feature:`, `@lang:`, `@id:`, `@haspolicy` filters, and a "Commonly Used" pseudo-group — all from this metadata [5][6].
- **One group model can drive both gestures.** A facet node can be rendered as *router/open-a-panel* (deep-link, one section at a time) OR *accordion/expand-in-place* — the model just needs a stable group id + label + order + member keys; the gesture is a renderer choice, not a model property.
- **Data structure recommendation:** flat schema + a **facet index** (`Map<facetId, Setting[]>` plus `Map<settingKey, facetId[]>`), with hierarchical facets stored as **materialized path** strings (cheap reads, no joins, trees are static in settings). Avoid closure tables (overkill; settings trees rarely re-parent at runtime).
- **B×C interaction (facets as bulk-op scopes):** a selected facet *is* a query that resolves to a set of keys — feed that set straight into cascade/reset/export/diff operations. "Reset all @tag:experimental", "export only the `network` facet", "diff this profile over the `advanced` facet."

---

## 1. The core decision: tree vs facet, and why facet wins

**Hierarchical/enumerative taxonomy** forces each item into exactly one position in one tree. **Faceted (analytico-synthetic) classification** — Ranganathan's colon classification, PMEST — treats a subject as having *multiple orthogonal aspects* and lets items be classified along several dimensions simultaneously, navigable "along multiple paths corresponding to different orderings of the facets" [1][2]. Crucially, **a tree is just one projection of a faceted model**: fix which facet sorts outermost and you get a hierarchy; reorder the facets and you get a different hierarchy from the same underlying data [1].

For settings this matters because real settings resist a single tree. A `network.proxy.timeout` setting is simultaneously *Network*, *Advanced*, *Performance*, and *requires-restart*. A pure tree forces an arbitrary primary parent and orphans the other relationships; tags let all four coexist [2]. This is the dominant pattern in e-commerce/digital-library IA precisely because it handles "rapidly changing and dynamic information" and multi-membership cleanly [1][2].

**SYNTHESIS/OPINION:** zodal-settings should make **facets the canonical model** and offer trees as a derived view. This is consistent with the prompt's preferred vocabulary ("Facet/tag... allowing MULTI-membership... the canonical grouping model. A tree is one rendered projection of a facet").

## 2. How VSCode does it (the reference design)

VSCode's Settings editor is the best-engineered open example of "huge flat keyspace, surfaced aggressively." Its mechanics, all driven from declarative metadata on each setting [5][6][7]:

**Per-setting metadata** (`configuration` contribution point): `type`, `default`, `description`/`markdownDescription`, `enum`/`enumDescriptions`/`enumItemLabels`, `deprecationMessage`, **`order`** (integer, within-category sort), **`tags`** (string array — "a list of categories under which to place the setting," searchable via `@tag:`), and **`scope`** (`application`, `machine`, `machine-overridable`, `window`, `resource`, `language-overridable`) [5][7].

**Per-category metadata:** `title`, **`order`** (integer). Ordering rule (verbatim from the API docs): *if two categories have `order` properties, the lower number comes first; a category without `order` appears after those that have one; ties are broken by lexicographical order* — and the identical rule applies to settings within a category [5]. This is a clean, copyable ordering spec.

**Two projections over one registry:**
1. **Table-of-contents tree** — settings grouped by feature area into a navigable left-hand tree, with a synthetic **"Commonly Used"** group pinned at top [4][6].
2. **`@`-filters in the search box** — a faceted query language: `@tag:<x>` (e.g. `@tag:experimental`, `@tag:accessibility`, `@tag:advanced`), `@modified` (dirty/overridden), `@ext:<id>` (provenance by contributor), `@feature:<x>`, `@lang:<x>`, `@id:<settingId>`, `@haspolicy` (managed/policy values) [4][6]. Free-text search runs *alongside* these and filters the same set.

The takeaway: **search, ToC tree, and tag-filters are not three features — they are three renderers over one flat, tagged registry.** That is exactly the architecture zodal-settings should adopt. The `@modified` and `@haspolicy` filters also show that *state-derived* and *provenance-derived* facets (dirty, managed) belong in the same facet space as authored tags — they're just computed facets.

## 3. Recommended data model

### 3.1 Two layers: flat schema (SSOT) + grouping layer

```
Schema (Zod v4, flat)          →  type, validation, constraints, .meta() affordances   [SSOT]
Grouping layer (separate)      →  { [settingKey]: { facets: FacetRef[], order?, label?, advanced?, ... } }
Facet registry (separate)      →  { [facetId]: { label, parent?, order?, kind: 'tree'|'tag'|'computed' } }
```

The grouping layer maps each setting to **0..n facets** (multi-membership), never the reverse-coupled tree-in-schema. This keeps the schema reusable for non-UI targets (codegen, AI, validation) and lets organization evolve independently — the open/closed principle applied to IA. It is the settings-domain instance of zodal's "uiSchema-equivalent... headless presentation-hints layer, separate from the data schema."

Facets may carry annotations *inline* in Zod via `.meta({ facets: ['network','advanced'], order: 10 })` for ergonomics (convention-over-config), with the external facet registry as the escape hatch / override and the home for computed facets. Note the Zod v4 gotcha (from the ecosystem CLAUDE.md): `.meta()` returns a *new* instance, so register facet metadata on the inner schema before wrapping.

### 3.2 Index structures (the runtime shape)

Build two indexes once from the grouping layer (this is the "facet map" / "tag index"):

- **Forward (facet → members):** `Map<FacetId, SettingKey[]>` — drives a tree node's children, a tag-chip's contents, a bulk-op scope.
- **Inverse (member → facets):** `Map<SettingKey, FacetId[]>` — drives "which chips show on this row," and the inverted-index style **facet counts** ("Network (12)") that faceted-search UIs display [8][9]. Counts are computed in the same pass that filters, exactly as inverted-index facet counting does in Algolia/Solr/ParadeDB [8][9].

**For hierarchical facets** (when a facet genuinely nests, e.g. `editor / editor.cursor / editor.cursor.blink`), store the hierarchy as a **materialized path** string (`"editor.cursor.blink"`). Tradeoffs across the three classic models [10][11][12]:

| Model | Descendant query | Re-parent cost | Notes |
|---|---|---|---|
| **Adjacency list** (parentId) | needs recursion | trivial | simple; weak for "all descendants" |
| **Materialized path** (delimited string) | prefix/`LIKE` match, no joins/recursion | rewrite affected paths | best for read-heavy, mostly-static trees |
| **Closure table** (all ancestor↔descendant pairs) | optimal | slow/costly, can't sort by hierarchy | space grows fast per level |

**Recommendation:** **materialized path** for facet hierarchy. Settings facet trees are authored, small, and effectively static at runtime; re-parenting (the materialized-path weakness) essentially never happens live. We avoid closure tables — their re-parent cost and per-level space blowup buy us nothing here, and they can't sort by hierarchy [10][11][12]. Adjacency list is fine as the *authoring* shape (it's how `.meta({parent})` reads) and can be flattened to materialized paths at index time.

### 3.3 Ordering / weight

Adopt VSCode's spec literally: optional integer **`order`** at both facet level and per-setting-within-facet; lower wins; unordered items sort after ordered ones; **lexicographical tie-break** [5]. This is deterministic, sparse-friendly (you only weight the few things you care about), and free of magic numbers when exposed as an optional keyword field.

## 4. One group model, two gestures (router vs accordion)

The prompt's key UX requirement: drive **open-a-panel (router)** AND **expand-in-place (accordion)** from one model. These are well-understood as two faces of *progressive disclosure* — accordions present "the what as a heading and the how/why in a hidden panel," good for limited space and "letting the visitor decide what to click," whereas separate pages/router suit "deep hierarchy with multiple sublevels" and comparing sections [13][14][15].

**SYNTHESIS — the unifying abstraction:** a facet node is a *group descriptor* — `{ id, label, order, memberKeys, childFacetIds? }` — and **nothing in it commits to a gesture.** The renderer chooses:

- **Accordion renderer:** maps each top-level facet to a `<disclosure>`; `expanded` state is local; multiple-open allowed; great default for medium sets and embedded settings.
- **Router renderer:** maps each facet `id` to a route segment (`/settings/network`); selecting a ToC node *navigates*; one panel visible; deep-linkable (`@id:` / `#network.proxy` style), good for large sets and full-screen settings apps.

Both consume the identical forward index. The only addition the model needs is a **stable, URL-safe facet id** (so router deep-links work) and the `order`. zodal's headless-first stance fits perfectly: zodal-settings emits the *group descriptor tree* as a config object; the gesture lives entirely in the concrete renderer (vanilla/shadcn). This means the same settings declaration powers an embedded accordion in one app and a routed preferences screen in another — the multi-target thesis applied to navigation.

## 5. Smart groups / saved views

Beyond authored facets, support **computed facets** defined by a predicate over (key, schema, effective value, provenance) — the settings analogue of **smart playlists / saved searches**: "a stored, named [group] where the content is generated at runtime from criteria, not stored as a fixed list," re-evaluated against current state, with match-all/match-any rule logic [16][17]. Examples: "Modified" (`provenance.scope !== 'default'` — VSCode's `@modified`), "Managed" (`@haspolicy`), "Secrets" (`schema.meta.sensitive`), "Advanced" (`facets.includes('advanced')`), "Invalid" (fails a hard constraint). Serialize a saved view as a small predicate/rule object (mirroring smart-playlist JSON), so user-defined views persist and travel. This makes `@modified` not a special case but the first built-in computed facet, and gives users their own saved filters.

## 6. The B×C interaction: facets as selection scopes for bulk operations

This is where faceting pays its rent. **A facet (authored, hierarchical, or computed) resolves — via the forward index — to a set of setting keys, and that set is exactly the scope for a bulk operation** against the cascade/scopes layer (dimension C). Concretely:

- **Reset:** "Reset all `@tag:experimental` to default" → resolve facet → emit a JSON Merge Patch [18] setting each key to `null` in the active layer (null = "remove/revert" per RFC 7386 semantics) [18][19].
- **Export / import a slice:** "Export only the `network` facet" → resolve facet → emit a partial **Layer** (a JSON Merge Patch) containing just those keys [18]. Pairs with the prompt's "Patch = serialized layer/delta."
- **Diff / provenance over a facet:** show, for the selected facet only, which keys are overridden and by which scope (effective value + provenance), driving a focused "what's customized in Advanced?" view.
- **Apply a preset to a facet:** overlay a preset's values but scoped to one facet's keys — useful for "apply the 'low-bandwidth' preset to just Network."
- **Sensitivity/policy gating:** bulk export can intersect with the `secrets` computed facet to *exclude* sensitive keys from plain export, and with `managed` to *skip* policy-locked keys (non-overridable locally).

**SYNTHESIS:** model a bulk operation as `(facetSelector) → keySet → patch`. The facet selector is composable (intersection/union of facets = AND/OR of tag filters, exactly VSCode's combinable `@`-filters [4][6]), keySet is the resolved scope, and the patch is a serialized layer fed to the cascade. This unifies organization (B) and cascade (C) under one operation: **select-by-facet, act-by-patch.**

## 7. Feature models / variability modeling (academic framing)

The space of *valid* setting combinations is, in academic terms, a **feature model / variability model** — a tree of features with **cross-tree constraints** (requires/excludes) that can be compiled to SAT/BDD for automated analysis of validity, dead features, and configuration completion [20][21][22]. zodal-settings need not embed a solver, but it should **express constraints in a solver-amenable shape**: hard constraints as boolean predicates over keys (a CSP/SAT clause), keeping the door open to validity-checking and "auto-complete a valid config." Faceting and the feature model are orthogonal: facets organize *for humans*; the feature model constrains *for correctness*. A facet with low "interdependency" (few cross-facet constraints) is what the SPL literature calls *orthogonal* — analyzable locally [20].

## 8. KEEP / AVOID for a schema-driven headless TS library

**KEEP**
- Flat schema as SSOT + **separate grouping layer** mapping each key to 0..n facets [1][2].
- **Facets as canonical model; tree = one projection** (render-time, from forward index) [1][2].
- VSCode's metadata surface: per-item `tags`, `order`, `scope` + per-category `order`; combinable `@`-filters [4][5][6].
- **Materialized path** for (static) hierarchical facets; dual forward/inverse index with facet counts [8][10].
- **Computed facets** (smart groups) via serializable predicates; `@modified`/`@managed`/`@secrets` as built-ins [16][17].
- **`(facetSelector) → keySet → JSON Merge Patch`** as the one bulk-op primitive (B×C) [18].

**AVOID**
- Encoding grouping *inside* the data schema (couples IA to validation; breaks non-UI targets).
- A single mandatory tree as the primary model (forces arbitrary parents, kills multi-membership) [1].
- **Closure tables** for facet hierarchy (re-parent cost, space blowup, can't sort by hierarchy — no payoff for static settings trees) [10][12].
- Putting the router-vs-accordion choice in the model (it's a renderer concern; keep group descriptors gesture-agnostic) [13][14].
- Magic numbers for ordering — use sparse optional integer `order` with lexicographical tie-break [5].
- Hand-rolling filtering/counting per renderer — compute once in the facet index, hand config objects out (headless-first).

## Open questions / unverified

- Exact VSCode tie-break and "Commonly Used" membership are documented behaviorally [4][5][6]; the precise `tags` array values and scoring weights live in `configurationRegistry`/`configurationExtensionPoint.ts` and were not line-read here — verify against source if copying scoring exactly [7].
- Whether to expose the feature-model/SAT layer in v1 or defer (the prompt asks only that constraints *could* be handed to a solver) — a scoping decision.

## References

1. [Faceted classification — Wikipedia](https://en.wikipedia.org/wiki/Faceted_classification)
2. [Faceted Classification and Faceted Taxonomies — Hedden Information Management](https://www.hedden-information.com/faceted-classification-and-faceted-taxonomies/)
3. [User and workspace settings — Visual Studio Code](https://code.visualstudio.com/docs/getstarted/settings)
4. [vscode-docs: settings.md (Settings editor filters & ToC)](https://github.com/microsoft/vscode-docs/blob/main/docs/configure/settings.md)
5. [Contribution Points: configuration — Visual Studio Code Extension API](https://code.visualstudio.com/api/references/contribution-points)
6. [User and workspace settings — @-filters and Commonly Used](https://code.visualstudio.com/docs/getstarted/settings)
7. [microsoft/vscode: configurationExtensionPoint.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/common/configurationExtensionPoint.ts)
8. [Faceted search, where every JSON attribute counts — Algolia Engineering](https://www.algolia.com/blog/engineering/facets-and-faceted-search-making-every-attribute-count)
9. [What is Faceted Search? — ParadeDB](https://www.paradedb.com/learn/search-concepts/faceting)
10. [Storing hierarchical data: Materialized Path — Bojan Živanović](https://bojanz.wordpress.com/2014/04/25/storing-hierarchical-data-materialized-path/)
11. [Hierarchical models in PostgreSQL — Ackee blog](https://www.ackee.agency/blog/hierarchical-models-in-postgresql)
12. [How to store hierarchical data in a DB — bool.dev](https://bool.dev/blog/detail/how-to-store-hierarchical-data-in-db)
13. [Accordions on Desktop: When and How to Use — Nielsen Norman Group](https://www.nngroup.com/articles/accordions-on-desktop/)
14. [Progressive disclosure in UX design: types and use cases — LogRocket](https://blog.logrocket.com/ux-design/progressive-disclosure-ux-types-use-cases/)
15. [What is Progressive Disclosure? — Interaction Design Foundation](https://www.interaction-design.org/literature/topics/progressive-disclosure)
16. [Create, edit, and delete Smart Playlists in Music on Mac — Apple Support](https://support.apple.com/guide/music/create-edit-and-delete-smart-playlists-mus1712973f4/mac)
17. [Smart Playlists — Music Assistant (criteria-based dynamic groups)](https://www.music-assistant.io/plugins/smart_playlist/)
18. [RFC 7386: JSON Merge Patch — RFC Editor](https://www.rfc-editor.org/rfc/rfc7386.html)
19. [What is JSON Merge Patch? — Zuplo](https://zuplo.com/learning-center/what-is-json-merge-patch)
20. [Applications of #SAT Solvers on Feature Models — Sundermann (VaMoS 2021)](https://www.uni-ulm.de/fileadmin/website_uni_ulm/iui.inst.170/publications/2021-VaMoS-Sundermann.pdf)
21. [SAT-based analysis of feature models is easy — Mendonça et al.](https://www.researchgate.net/publication/220789506_SAT-based_analysis_of_feature_models_is_easy)
22. [Variability Model — overview (ScienceDirect Topics)](https://www.sciencedirect.com/topics/computer-science/variability-model)
