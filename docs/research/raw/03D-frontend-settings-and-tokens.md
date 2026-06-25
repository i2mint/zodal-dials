# 03D — Front-End Settings/Preferences UIs & Their Data Models

Survey of how mature front-end products model and surface *settings* (typed,
named parameters), with an eye to what a **headless, schema-driven,
renderer-registry** library (`zodal-settings`) should KEEP vs AVOID. Targets:
JetBrains preferences, Chrome (`chrome://settings` + enterprise policy +
`chrome://flags`), Firefox (`about:config` + policy), Figma Variables/Modes,
Storybook args/controls, and Style Dictionary / design tokens.

Throughout I use the project's preferred vocabulary (Setting, Schema, Layer,
Scope, Cascade, Effective value + Provenance, Profile/Preset, Merge strategy,
Patch, Affordance/Widget, Managed/policy value, etc.).

---

## TL;DR

- **Storybook `argTypes` is the single strongest precedent for zodal-settings'
  inference + widget model.** It infers a *control* (the widget) from the arg's
  type/initial value via static analysis, lets you override per-field, supports
  enum→`select`/`radio`, number→`number`/`range`, object→`object` editor, and —
  crucially — a declarative **conditional-display** rule (`if: {arg, eq/neq/
  truthy/exists}`) that maps almost 1:1 to zodal's affordance + soft-dependency
  needs [1][2]. KEEP this shape wholesale.
- **Chrome and Firefox enterprise policy give a battle-tested *scope/cascade
  with provenance* model.** Both split values into **mandatory (enforced,
  non-overridable)** vs **recommended/`default` (overridable baseline)** — i.e.
  a *policy scope* sitting above a *user scope*. Firefox's `Preferences` policy
  uses an explicit per-key `Status` enum (`locked`/`default`/`user`/`clear`)
  that is exactly a per-setting **merge-strategy + managed-value flag** [3][4][5].
  KEEP the mandatory/recommended distinction as a first-class scope property.
- **Figma Variable Collections + Modes are the cleanest **layered-values /
  profiles** analog**: one collection holds N modes, each mode stores *one value
  per variable*; objects resolve by inheriting their parent's mode ("Auto"),
  falling back to the collection default — a literal cascade with inheritance.
  Aliasing (a variable referencing another) gives reference/semantic layering [6][7].
  KEEP modes-as-columns as the mental model for profiles/scopes.
- **Style Dictionary / DTCG tokens give the **reference + override-precedence**
  mechanics**: tokens are `{$value,$type,$description}`, reference each other via
  `{path.to.token}`, and themes are produced by **file collision** (later
  source files override earlier ones) over a 3-tier primitive→semantic→component
  hierarchy [8][9][10]. KEEP `$type`-drives-affordance and reference aliasing;
  AVOID build-time-only file-collision as the *runtime* cascade.
- **JetBrains contributes two ideas**: (a) a serialized **state POJO per
  settings component** (`@State`/`@Storage`) with a **`RoamingType`** flag
  (DEFAULT/PER_OS/LOCAL/DISABLED) — i.e. per-setting *sync/portability* metadata;
  and (b) project-level vs IDE(application)-level storage = a real two-scope
  cascade; plus the famous **searchable settings** UX [11][12]. KEEP roaming/sync
  as a per-setting facet; KEEP search as a built-in headless capability.
- **`chrome://flags` is the canonical "advanced/experimental" facet**:
  experimental settings live in a *separate, searchable, warning-bannered*
  surface, each with an enum of states (Default/Enabled/Disabled/variants) and a
  "requires relaunch" affordance — a clean model for *progressive disclosure* +
  *requires-restart* (SYNTHESIS) [13].

---

## 1. Storybook args / controls — the zodal-shaped one

**Names:** *args* (current values), *argTypes* (the per-field schema/uiSchema),
*controls* (the rendered widgets).

**Data model** [1][2]. Each `argType` is an object keyed by setting name:

- `control` — the **widget**. A string (`'boolean'`, `'number'`, `'range'`,
  `'text'`, `'color'`, `'date'`, `'select'`, `'multi-select'`, `'radio'`,
  `'inline-radio'`, `'check'`, `'inline-check'`, `'object'`, `'file'`) or an
  object `{ type, min, max, step, presetColors, accept, labels }`, or `false`
  to suppress rendering.
- `type` — the **semantic type** (`boolean|string|number|function|symbol` or
  `array|object|enum|union|intersection`). Drives both control inference and
  doc generation.
- `options` + `mapping` + `control.labels` — finite value set, with `mapping`
  turning option *strings* into real (non-serializable) values and `labels`
  giving display names. This is the zodal **enum→choices** path.
- `table` — pure presentation: `category`/`subcategory` (grouping!),
  `type.summary`, `defaultValue.summary`, `disable`, `readonly`.
- `if` — **conditional display**: `{ arg|global, exists|truthy|eq|neq }`.
- `name`, `description`, `defaultValue`.

**Inference** [1][2]. Default `control` is chosen from `type` (or the arg's
initial value), with `'select'` auto-selected when `options` exist, falling
back to `'object'`. Framework static-analysis tools (react-docgen,
vue-docgen-api, compodoc) auto-generate argTypes from component source; manual
argTypes override inferred ones. **This is exactly zodal's multi-layer
inference + explicit-override ordering** — Storybook validates the thesis.

**KEEP:** the whole `argType` shape — separate `control`(widget) from
`type`(semantic) from `table`(presentation); `options`+`mapping` for enums;
`if` conditional display (maps to soft dependent-defaults / advanced facet
visibility); `table.category`/`subcategory` as a grouping facet.
**KEEP:** the inference order (type → name regex → explicit override). Note
Storybook only does name-regex inference for `color`/`date` [1] — zodal can be
more ambitious here.
**AVOID:** Storybook's controls are dev-time-only and have **no cascade/
provenance, no scopes, no validation refinements, no secrets** — settings need
all of those. `argType.table.disable` hides from *docs* not *data*; keep
presentation-hide and data-presence orthogonal.

## 2. Chrome enterprise policy + `chrome://settings` + `chrome://flags`

**Policy data model** [4][5]. Each policy is defined in
`policy_templates.json` with attributes: `name`, `type`, `schema`,
`supported_on`, `caption`, `desc`, `items` (for enums), `example_value`, and a
`features` block including `dynamic_refresh`, `can_be_recommended`,
`can_be_mandatory`. Code, ADM/ADMX (Windows), Mac plist, and docs are all
**generated from this one definition file** — a SSOT codegen pattern directly
analogous to zodal generating UI/state/access/AI artifacts from one schema.

**Mandatory vs Recommended** [3][4]. A policy delivered as **mandatory** is
*enforced and not overridable*; delivered as **recommended** it is an
*overridable default/baseline*. On disk, Linux even splits these into
`managed/` (mandatory) and `recommended/` directories [3]. This is two scopes
(policy-mandatory > user > policy-recommended) — a cascade with provenance baked
into the platform.

**`dynamic_refresh`** [5]: when true, Chrome honors a changed policy at runtime
without restart (via `PrefChangeRegistrar`); when absent, it **requires
restart**. This is precisely zodal's **live-apply vs requires-restart** facet.

**`chrome://flags`** [13] (SYNTHESIS, well-known UX): a *separate searchable
surface* for experimental settings; each flag is an enum
(Default/Enabled/Disabled + named variants) with a "Relaunch" affordance and a
"these are experimental, may break things" warning banner. Clean model for the
**advanced/experimental facet** + **requires-restart** + risk annotation.

**KEEP:** mandatory/recommended as a per-scope (or per-layer) property →
`managed`/`policy` values that win the cascade and are non-overridable locally;
`dynamic_refresh` → per-setting `liveApply` boolean; `features.can_be_*` as
capability flags; `items` enums; the *generate-everything-from-one-definition*
ethos.
**AVOID:** Chrome's policy schema is JSON-Schema-flavored and verbose; zodal
should derive all of this from the Zod schema + `.meta()` rather than a parallel
definition file.

## 3. Firefox `about:config` + policy

**`Preferences` policy shape** [4][5]:

```json
{ "policies": { "Preferences": {
  "preference.name": { "Value": <value>, "Status": "default|locked|user|clear" }
}}}
```

The `Status` enum is a **per-key merge/enforcement strategy**:
- `locked` — set the value AND make it **read-only/enforced** (managed value,
  non-overridable; this is `lockPref`).
- `default` — set the **default/baseline**; user may still change it
  (overridable default → user scope sits above).
- `user` — set the current/initial user value (seed the user scope).
- `clear` — remove/reset the value.

`about:config` itself is the canonical **raw, searchable, key→typed-value
editor** with provenance shown (modified/default state, bold = user-set), and a
"this might void your warranty" gate — another *progressive-disclosure* pattern.

**KEEP:** the `Status`/per-key strategy enum — it's a compact, serializable way
to express "is this a locked managed value, an overridable default, or a seeded
user value", which maps onto zodal's `Layer` + `merge strategy` + `managed`
flag. KEEP `clear`/reset-to-default as a first-class operation (= remove the key
from a layer; let cascade re-resolve).
**AVOID:** Firefox flattens everything to dotted-string keys with weak typing
(`about:config` infers boolean/int/string) and no grouping — zodal's Zod schema
gives real types, nesting, and facets for free.

## 4. Figma Variables / Modes — the profiles & cascade analog

**Data model** [6][7]. A **Variable Collection** holds variables + **modes**;
"each mode stores one value per variable." Variable types: color, number,
string, boolean. **Resolution/cascade**: an object is in "Auto" mode by default,
inheriting its parent container's mode; if no ancestor sets one, it falls back
to the collection's **default mode** (left-most column). **Aliasing**: a
variable can reference another variable (incl. cross-collection, via
`com.figma.aliasData`), giving primitive→semantic indirection.

This is the *cleanest existing implementation of layered values with
inheritance*: modes == profiles/scopes (light/dark, mobile/desktop, brand-A/
brand-B); the per-mode column == a **Layer**; "Auto + parent inheritance +
collection default" == a **Cascade with provenance**; aliasing == reference
resolution / semantic layering.

**KEEP:** modes-as-columns / one-value-per-(setting,mode) as the canonical
mental model for **profiles** and **scopes**; the default-mode fallback as the
base of the cascade; aliasing as a way to express dependent values (a setting
whose value *is* another setting). Figma's "switch mode → everything updates"
is the live-apply demo to emulate.
**AVOID:** Figma's *spatial/DOM-tree* inheritance ("Auto from parent layer")
doesn't map to settings — zodal's cascade is over named scopes, not a render
tree. Treat mode-inheritance as inspiration, not spec.

## 5. Style Dictionary / DTCG design tokens

**Token shape** [8][9]. Original SD: `{ value, type, comment, name?,
attributes?, themeable? }`; **DTCG**: `{ $value, $type, $description }` (v4
supports both, not mixed). SD auto-adds `path`, `original`, `filePath`,
`isSource`. **References/aliases**: `"{size.font.medium}"` dot-path interpolation
[8]. **Three-tier architecture** (SYNTHESIS, widely documented [9][10]):
primitive/global → semantic/alias → component tokens. **Theming/modes** [8]:
produced by **file collision** — `include` files load first, then `source`
files in order; later definitions override earlier (a build-time cascade).
Transforms then adapt tokens per platform/target (CSS, iOS, Android…).

**KEEP:** `$type` drives the **affordance/widget** (color→color-picker,
dimension→number+unit, etc.) — same principle as zodal inferring widgets from
Zod type. KEEP token **references/aliases** for dependent-value modeling and the
primitive→semantic→component indirection (a reuse layer). KEEP the
*one-source-of-truth → many targets via transforms* architecture — it mirrors
zodal generating per-target artifacts.
**AVOID:** SD's cascade is **build-time, file-collision, write-only** (no live
provenance, no per-key strategy beyond last-wins, no validation). zodal's
cascade must be **runtime, queryable, provenance-bearing**. Also AVOID adopting
DTCG's `$`-prefix convention internally — derive from Zod instead, but DO offer
DTCG import/export as a target.

## 6. JetBrains preferences

**Component state model** [11]. A settings unit is a `PersistentStateComponent`
declaring `@State(name, storages=[@Storage(...)], category, reloadable)`; state
is a **serialized POJO** (public/@-annotated fields → XML; `@Transient`
excludes). `@Storage` carries `roamingType`: **DEFAULT** (sync across installs),
**PER_OS**, **LOCAL/DISABLED** (don't sync). Project-level settings live in
`.idea/*.xml`; application/IDE-level in the config dir — a genuine **two-scope
cascade** (project overrides IDE) [11][12]. Settings can be marked **Shared**
(committed to project meta, visible to the team) vs stored in `workspace.xml`
(user-only) [12] — i.e. per-setting *shareability*. Plus a Git-backed
**Settings Repository / Backup&Sync** for portable settings, and the celebrated
**searchable Settings dialog** (type to filter across all panes).

**KEEP:** `RoamingType` → a per-setting **sync/portability facet**
(synced/per-OS/local-only) — settings libraries often miss this. KEEP
project-vs-application as a concrete **scope** example. KEEP **searchable
settings** as a built-in headless capability (zodal already has the schema + key
+ description + facets to index — search should fall out for free). KEEP
**Shared vs user-private** as a scope/visibility property.
**AVOID:** JetBrains' XML-serialized-POJO + annotation machinery is heavyweight
and Java-centric; zodal expresses the same metadata via `.meta()` + the
external affordance registry.

---

## Synthesis — what zodal-settings should adopt

**Data model (KEEP):**
1. Per-setting record splitting **semantic type** (from Zod) / **affordance**
   (resolved capability) / **widget** (renderer choice) / **presentation hints**
   (uiSchema-equivalent) — exactly Storybook's `type`/`control`/`table` split.
2. **Scopes as ordered named sources of Layers**, each layer a partial map of
   key→value, with a per-scope **enforcement level** (mandatory/managed vs
   recommended/default) — fused from Chrome (mandatory/recommended) + Firefox
   (`Status`) + Figma (modes-as-columns).
3. **Effective value + provenance** computed by the cascade (Figma's
   default-mode fallback; Chrome's policy>user>recommended ordering).
4. **Per-key merge strategy + flags**: `replace`/`deep-merge`/`append`;
   `locked`/managed; `liveApply` (Chrome `dynamic_refresh`) vs requires-restart;
   `sensitivity/secret`; `roaming/sync`; `advanced` facet (chrome://flags).
5. **References/aliases** (Figma aliasing, SD `{token}` refs) for dependent
   defaults — a setting whose value derives from another.
6. **Patches as the serialized layer** (RFC 7386 merge-patch for layers, RFC
   6902 for history) — Firefox's per-key `Status` objects and SD file-collision
   are coarse approximations; zodal can do better with explicit patch types.

**UX patterns (KEEP):** built-in **search/findability** (JetBrains,
chrome://flags, about:config); **progressive disclosure via an `advanced` facet**
not a hidden screen (chrome://flags); **provenance display** (about:config bold
= user-set; Figma mode column); **reset-to-default** as remove-from-layer
(Firefox `clear`); **live mode-switch** preview (Figma).

**AVOID across the board:** build-time-only cascades (SD); parallel
definition files duplicating the schema (Chrome `policy_templates.json`,
JetBrains XML); flat weakly-typed key stores with no grouping (about:config);
treating presentation-visibility and data-presence as the same thing
(Storybook `table.disable`). All metadata should derive from the **one Zod
schema + `.meta()` + affordance registry**, with renderers selected by the
capability-ranked registry.

**Flagged / unverified:** the precise semantics of Firefox `Status: user` vs
`default` (overridable-default vs seed-user-value) are inferred from the policy
schema and the underlying `lockPref`/`pref`/`defaultPref` mechanics, not quoted
verbatim from the rendered docs page (the WebFetch returned the JSON shape but
not prose definitions) — verify against `about:policies#documentation` [5].
The chrome://flags state-enum and three-tier token architecture points are
labeled SYNTHESIS (widely documented convention, not a single primary spec).

---

## References

1. [Controls — Storybook docs](https://storybook.js.org/docs/essentials/controls)
2. [ArgTypes — Storybook docs](https://storybook.js.org/docs/api/arg-types)
3. [Set Chrome browser policies on managed PCs — Chrome Enterprise Help](https://support.google.com/chrome/a/answer/187202)
4. [Chrome Enterprise Policy List & Management](https://chromeenterprise.google/policies/)
5. [Policy Settings in Chrome / add_new_policy.md — Chromium Docs](https://chromium.googlesource.com/chromium/src/+/main/docs/enterprise/add_new_policy.md)
6. [Overview of variables, collections, and modes — Figma Learn](https://help.figma.com/hc/en-us/articles/14506821864087-Overview-of-variables-collections-and-modes)
7. [Modes for variables — Figma Learn](https://help.figma.com/hc/en-us/articles/15343816063383-Modes-for-variables)
8. [Design Tokens — Style Dictionary](https://styledictionary.com/info/tokens/)
9. [style-dictionary/style-dictionary — GitHub](https://github.com/style-dictionary/style-dictionary)
10. [Dark Mode with Style Dictionary — dbanks design](https://dbanks.design/blog/dark-mode-with-style-dictionary/)
11. [Persisting State of Components — IntelliJ Platform Plugin SDK](https://plugins.jetbrains.com/docs/intellij/persisting-state-of-components.html)
12. [IDE settings backup and sync — IntelliJ IDEA Documentation](https://www.jetbrains.com/help/idea/sharing-your-ide-settings.html)
13. [Customize Firefox using policies.json — Firefox for Enterprise Help](https://support.mozilla.org/en-US/kb/customizing-firefox-using-policiesjson) (and [Mozilla policy-templates](https://mozilla.github.io/policy-templates/))
