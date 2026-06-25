# 01 — Settings UX & Information Architecture Patterns

Research for **zodal-settings**: how settings surfaces scale from a handful to thousands of parameters without overwhelming users, and which patterns a *headless, schema-driven* TypeScript library should emit configuration for (vs. avoid).

---

## TL;DR

- **Scale is an IA problem, not a layout problem.** The surfaces that scale to thousands of parameters (VS Code is the canonical exemplar) win on **search-first discovery + a shallow table-of-contents tree + a JSON escape hatch**, not on prettier forms. zodal-settings should treat *search, filter, group, and reveal* as the four primitives and emit configuration for all four [1][5].
- **Progressive disclosure is the core lever.** Nielsen Norman Group (NN/G) frames it precisely: show the few most-important options first, defer the rest; never exceed ~2 disclosure levels. Model "advanced" as a **facet/tag**, not a hidden screen [1] — this matches zodal-settings' preferred vocabulary.
- **Grouping and faceting are different things.** A hierarchical tree picks *one* organizing dimension; faceted classification lets a setting belong to *many* groups (advanced × experimental × accessibility). Faceting is the canonical model; a tree is one *projection* of it [6][8][12]. This validates the "facet/tag is canonical, tree is a rendered projection" thesis.
- **In-place expand and dedicated panel/route are the SAME affordance** — "reveal more/less of this group" at different zoom levels. Both should be driven by one model node (a group with a `revealed` boolean and a `target`: inline vs. route), so a renderer can choose accordion *or* sub-page from identical config [2][9].
- **Save semantics belong in the model, per key.** Autosave/live-apply for reversible binaries; explicit save for sensitive/coordinated changes; `requires-restart` is a per-setting flag that drives a banner, not a separate UX [3][4]. The data schema cannot express this — it needs the uiSchema-equivalent presentation layer.
- **Modified/override indicators + reset-to-default are table stakes.** VS Code's left **colored bar** for modified values, gear menu → *Reset Setting*, and the `@modified` filter are the reference implementation; they map 1:1 to zodal-settings' *effective value + provenance + dirty state* concepts [5].

---

## 1. Search-first vs navigate-first — and "settings as a searchable database"

For a *handful* of settings, navigation (tabs / a short side-nav) is sufficient and search is overkill. Past roughly 30–50 parameters, **search becomes the primary entry point** and navigation degrades into a secondary "I want to browse this area" affordance. NN/G's IA-vs-navigation work is explicit that a search box "allows the user to jump out of categorical navigation and find pages" — search and browse are complementary, not exclusive [11].

**VS Code is the load-bearing exemplar** (thousands of settings, open-source, documented). Its Settings editor is *search-first*: a prominent search bar filters as you type, backed by an `@`-filter mini-query-language that turns the settings surface into a queryable database [5]:

| Filter | Meaning |
|---|---|
| `@modified` | only settings changed from default *or* explicitly set in the JSON layer |
| `@tag:advanced`, `@tag:experimental`, `@tag:accessibility`, `@tag:preview` | **facet/tag** filtering (multi-membership) |
| `@lang:typescript` | scope/context filter |
| `@ext:<id>`, `@feature:explorer` | provenance / source filter |
| `@id:<settingId>` | direct key lookup (dotted path) |
| `@haspolicy` | managed/policy values (admin scope) |

This is *settings-as-a-searchable-database* made concrete. **KEEP for zodal-settings:** because settings are declared once as a Zod schema with `.meta()` affordances, the library already has the structured metadata (key, type, tags, scope, sensitivity, modified-vs-default) needed to emit an identical filter/query model. The filter grammar should be part of the headless output, with renderers free to expose it as a search bar, a faceted sidebar, or both. **Synthesis/opinion:** the `@`-filter syntax is essentially a serialized `FilterExpression` over setting metadata — the same shape zodal's store layer already defines — so reusing that filter model rather than inventing a settings-specific one is the SSOT-correct move.

**AVOID:** search as an afterthought bolted onto a deep menu tree. Toptal/practitioner guidance warns that deep navigation with no search is the dominant "can't find it" failure mode, and that grouping search parameters into broad categories reduces reload churn [10][2].

---

## 2. Progressive disclosure (basic/advanced, show-modified-only, expandable sections)

NN/G's canonical definition: *initially show only the few most-important options; offer the larger specialized set on request; disclose secondary features only if asked* [1]. It improves three of the five usability components — **learnability, efficiency, error rate** — by keeping novices out of trouble and saving experts from scanning. Two structural variants [1]:

- **Progressive (hierarchical):** core → secondary, most users never descend. *This is "basic vs advanced."*
- **Staged (linear):** a sequence every user walks (a wizard). *Rarely right for settings* — settings are random-access, not sequential.

Hard rule from NN/G: **do not exceed two disclosure levels** — users get lost beyond that [1].

Three concrete progressive-disclosure mechanisms for settings, all of which should be *one model, many renderings*:

1. **Basic / Advanced** — model "advanced" as an `advanced` **facet/tag** on each setting, never as a hidden screen. The renderer decides whether advanced settings are a separate section, a toggle, or greyed-out-until-expanded.
2. **Show-modified-only** — VS Code's `@modified`. This is trivially derivable in zodal-settings: a setting is "modified" when its **effective value** differs from the default layer, or when any non-default scope contributes a layer for that key [5]. This is *provenance-driven*, free given the cascade.
3. **Expandable sections** — accordions / collapsible groups (Carbon, Setproduct) [7][2].

**KEEP:** emit an `advanced`/`experimental`/`preview` facet per setting; derive `isModified` from provenance; expose "show modified only" as a built-in filter. **AVOID:** hiding settings behind undiscoverable gestures, or three-plus nested disclosure levels.

---

## 3. Grouping vs tagging/faceting (an item in multiple categories)

This is the architectural crux. NN/G and faceted-classification theory draw the line clearly [6][8][12]:

- **Hierarchical taxonomy / tree:** one organizing principle, parent→child, *single membership*. "Easy to navigate but rigid; does not allow overlapping classification" [12].
- **Faceted classification:** multiple independent dimensions; an item carries values on several facets simultaneously and can be reached "along multiple paths corresponding to different orderings of the facets" [8][6]. Each facet considers one aspect, so combinations don't have to be pre-enumerated.

**The recommended real-world pattern is a hybrid** [12]: a hierarchy for the primary browse spine, facets/tags for filtering and cross-cutting concerns. NN/G lists faceted navigation, related-content linking, and search refinement as the downstream payoffs of a good taxonomy [9].

**This directly validates zodal-settings' thesis:** *facets/tags are canonical (multi-membership); a tree is one rendered projection of a facet.* A setting like `editor.fontSize` might be `{ category: "editor", facets: ["typography", "appearance"], advanced: false }`. The "category" projection yields a tree node; the "facets" projection yields filter chips. **KEEP:** store grouping as facet membership (a setting → set of tags), and *derive* any tree by projecting one facet into a parent/child path (dotted-path keys make this natural). **AVOID:** baking a single fixed tree into the schema as the only grouping model — it forces single-membership and prevents the "advanced × accessibility" intersections users actually search.

---

## 4. In-place expand vs dedicated panel/route — one affordance, one model

Practitioner surveys [2][9] enumerate the layout choices — tabs, side-nav + content pane (WordPress/VS Code), accordions, cards, sub-pages — but treat them as separate decisions. **Synthesis/opinion (the core argument for zodal-settings):** *in-place expand (accordion) and dedicated panel/route are the same logical operation — "reveal more / less of this group" — performed at different magnifications.* Both answer: "the user wants to focus on group G; everything else recedes."

Model them with **one node shape**:

```ts
type SettingsGroup = {
  key: string;            // dotted path, e.g. "editor.typography"
  facet: string;          // which facet this projection came from
  revealed: boolean;      // expanded / focused?
  reveal: "inline" | "route" | "panel"; // hint only; renderer may override
  members: SettingKey[];
};
```

A `revealed` toggle plus a `reveal` *hint* lets:
- a **vanilla** renderer render an accordion (`reveal: "inline"`),
- a **shadcn** renderer render a `Collapsible` or a routed sub-page (`reveal: "route"`),
- a **mobile** renderer always drill into a dedicated screen,

…all from the *identical* headless config. This is exactly zodal's headless-first / convention-over-config / capability-ranked-renderer ethos: the model expresses *intent* (focus this group), renderers express *capability* (can I do inline disclosure? a route? only a full screen?) and degrade honestly. **KEEP:** a single group node with `revealed` + a `reveal` capability hint, never two divergent config trees for "expander" vs "page." **AVOID:** modeling routes and accordions as different first-class concepts — it duplicates state and breaks the SSOT.

---

## 5. Inline help, examples, and defaults display

Practitioner consensus [2][3][10]:
- **Inline help / tooltips** beside each control — Zod's `.describe()` / `.meta({ description, examples })` is the natural source; emit it as a `help` field in the uiSchema-equivalent layer.
- **Show the default value** explicitly ("Default: 14") so users understand what "reset" returns to and what the baseline is. zodal-settings has this for free: the **default layer** is the bottom of the cascade, so the default for any key is always derivable.
- **Choose a sane default** aligned with the most common/recommended choice; "the best settings UX requires no interaction" [3]. This is convention-over-configuration applied to *values*.

**KEEP:** surface `description`, `examples`, and the resolved default in the headless field config; never require the renderer to fetch them separately. **AVOID:** help-as-modal-only (forces a context switch) and undocumented magic defaults.

---

## 6. Modified / override indicators, reset-to-default, diff & preview

VS Code is again the reference [5]:
- **Modified indicator:** a **colored bar on the left** of a setting, mirroring the editor's modified-line gutter — i.e., a *provenance signal* rendered as a visual affordance.
- **Reset:** hovering a setting reveals a **gear menu** with *Reset Setting*, plus copy-id / copy-JSON / copy-settings-URL (`vscode://settings/<id>`).
- **Scope tabs:** User vs Workspace — directly analogous to zodal-settings' **scopes** (default / preset / profile / workspace / policy).

These map cleanly onto zodal-settings' model: a setting's indicator state *is* its **provenance** (which scope won, which layers are shadowed); "reset to default" *is* removing this key's layer from the active scope so a lower scope (ultimately the default layer) takes over; "show modified" *is* a provenance filter. **Diff & preview** is the natural extension: because layers and patches are first-class (JSON Merge Patch RFC 7386 internally, JSON Patch RFC 6902 for history/undo), the library can compute and render a before/after diff of effective values for any candidate layer *without applying it* — a capability most hand-built settings UIs lack.

**KEEP:** drive all of {modified bar, reset, scope tabs, diff/preview} from provenance + the layer/patch model; expose them as headless state, not renderer-baked widgets. **AVOID:** boolean "dirty" flags divorced from provenance — they can't say *which* scope changed or render an honest diff. **Flag (unverified):** I did not find a major design system shipping a built-in *cross-scope cascade preview* component; this appears to be a genuine zodal-settings differentiator rather than a documented industry pattern.

---

## 7. Requires-restart vs live apply; save semantics

Save behavior is *per setting* and belongs in the presentation layer, not the data schema [3][4]:

- **Autosave / live-apply:** best for reversible binaries (toggles, checkboxes) where the change "is a complete action" and reversing it is one click [3]. Carbon restricts **toggles** strictly to binary actions applied *immediately*; anything non-binary or deferred should use a checkbox + Save button [7].
- **Explicit save:** GitLab Pajamas **defaults to manual saving** and reserves autosave for individual inputs / long forms; it *prohibits* autosave for "financial, security, or privacy-sensitive operations (password changes, confidentiality toggles)" and multi-field coordinated validation [4]. This is the **sensitivity/secret** flag driving save policy.
- **Dirty state + navigation guard:** Pajamas mandates a warn-on-leave modal ("Save changes" / "Discard changes and leave") when unsaved changes exist [4].
- **Feedback:** optimistic UI (50% opacity + spinner until confirmed) and toasts — "Saving…", "Change saved", "x changes saved", "Failed…" with retry — each success toast offering **undo** [4][3]. Undo maps to JSON Patch (RFC 6902) inverse operations.
- **Requires-restart:** a per-setting flag that surfaces a "restart to apply" banner rather than its own screen — analogous to live-apply being the absence of that flag.

**KEEP:** model `saveMode: "live" | "explicit"`, `requiresRestart: boolean`, and `sensitivity` as per-setting affordances; derive save UX and the dirty-state guard from them; emit toast/optimistic-UI state as headless events. **AVOID:** a single global save model for the whole surface (sensitive fields need explicit confirm even when the rest autosaves), and toggles for non-binary or deferred-effect settings [7].

---

## Adopt vs Avoid — checklist for a headless schema-driven settings lib

### ADOPT
1. **Search-first with an `@`-style filter grammar** over setting metadata (modified, tag, scope, sensitivity, id) — reuse zodal's `FilterExpression`, don't reinvent [5].
2. **Facets/tags as the canonical grouping model**; trees are *projections* of a chosen facet (multi-membership, advanced × accessibility intersections) [6][8][12].
3. **One group node (`revealed` + `reveal` capability hint)** so accordion vs sub-page/route is a renderer choice, not two configs [2][9].
4. **Progressive disclosure ≤ 2 levels**; "advanced/experimental/preview" as facets, never hidden screens [1].
5. **Provenance-driven indicators**: modified bar, scope tabs, reset-to-default, "show modified only" filter, and cross-scope diff/preview — all derived from the cascade + layer/patch model [5].
6. **Per-setting save semantics** (`saveMode`, `requiresRestart`, `sensitivity`) plus a dirty-state navigation guard and optimistic-UI/toast/undo state [3][4][7].

### AVOID
1. **Deep navigation tree with no search** — the dominant "can't find it" failure [10][2].
2. **A single fixed hierarchy as the only grouping** — forces single-membership, kills cross-cutting filters [12].
3. **More than ~4–5 top-level categories** or 3+ nested disclosure levels [10][1].
4. **Toggles for non-binary or deferred-effect settings**; autosave for sensitive/coordinated changes [7][4].
5. **Modeling routes and in-place expanders as separate concepts** — duplicated state, broken SSOT.
6. **Boolean dirty flags without provenance** — can't render honest diffs or say which scope changed [5][4].

---

## References

1. [Progressive Disclosure — Nielsen Norman Group](https://www.nngroup.com/articles/progressive-disclosure/)
2. [Settings UI design: Why users can't find what they need — Setproduct](https://www.setproduct.com/blog/settings-ui-design)
3. [How to Improve App Settings UX — Toptal](https://www.toptal.com/designers/ux/settings-ux)
4. [Saving and feedback — GitLab Pajamas Design System](https://design.gitlab.com/usability/saving-and-feedback)
5. [User and Workspace Settings — Visual Studio Code Docs](https://code.visualstudio.com/docs/configure/settings)
6. [Faceted classification — Wikipedia](https://en.wikipedia.org/wiki/Faceted_classification)
7. [Toggle (usage) — Carbon Design System](https://carbondesignsystem.com/components/toggle/usage/)
8. [Faceted Classification — The Discipline of Organizing (4th ed.)](https://berkeley.pressbooks.pub/tdo4p/chapter/faceted-classification/)
9. [Taxonomy 101: Definition, Best Practices — Nielsen Norman Group](https://www.nngroup.com/articles/taxonomy-101/)
10. [How To Improve App Settings UX — Netguru](https://www.netguru.com/blog/how-to-improve-app-settings-ux)
11. [The Difference Between Information Architecture (IA) and Navigation — Nielsen Norman Group](https://www.nngroup.com/articles/ia-vs-navigation/)
12. [Hierarchical vs Faceted Taxonomies: How to Choose — LinkedIn / practitioner](https://www.linkedin.com/advice/0/what-differences-between-hierarchical-56r2f)
