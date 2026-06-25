# 03A — VSCode Settings System (deep-dive from microsoft/vscode source + docs)

> Research input for **zodal-settings**. Focus: the configuration registry / `contributes.configuration` schema, the Settings editor UI, scope precedence and effective-value resolution, Settings Sync, and how grouping/order is declared. Extract concrete patterns and pitfalls.

## TL;DR

VSCode is the single most battle-tested precedent for "declare a typed, named parameter once, then surface it aggressively." Its model maps almost 1:1 onto zodal-settings' preferred vocabulary, with a few names changed:

- A **setting** is a dotted-key entry in a global **configuration registry** ([`configurationRegistry.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/platform/configuration/common/configurationRegistry.ts)). Each carries a JSON-Schema-ish descriptor: `type`, `default`, `enum` + `enumDescriptions`, `markdownDescription`, `scope`, `order`, `tags`, `deprecationMessage`, plus sync/policy/trust flags. This is exactly zodal's **schema-as-SSOT + .meta() affordance** idea, and it is the design to copy [1][2].
- **Scope** is an enum on each *setting definition* (`APPLICATION`, `MACHINE`, `WINDOW`, `RESOURCE`, `LANGUAGE_OVERRIDABLE`, `MACHINE_OVERRIDABLE`, `APPLICATION_MACHINE`) that constrains *which layers a setting may live in*. This is subtly different from zodal's **scope** (an ordered source of layers) — VSCode's "scope" is a per-setting *eligibility constraint*, and its **layers** are fixed (default → user → remote → workspace → folder → language-specific), with **policy** above all [1][3].
- The **cascade** is fixed-order, last-wins, with the critical rule: **scalars and arrays replace; objects deep-merge**. Language-specific overrides win over everything non-language-specific *even when the base setting has a narrower scope* [3].
- The **Settings editor** is the reference headless-config UI: a table-of-contents tree (from `title`/`order`/key-namespace), a search box with NL ranking, `@`-filters (`@modified`, `@tag:`, `@lang:`, `@feature:`, `@ext:`), split User/Workspace tabs, modified-bar provenance gutter, and an "Edit in settings.json" escape hatch for things the GUI can't render [2][4].
- **Settings Sync** excludes `machine`/`machine-overridable`-scoped settings by default and honors `settingsSync.ignoredSettings`; sensitivity/machine-locality is a *scope-derived* property, not a separate flag [5].

KEEP the registry+descriptor model, the per-setting scope-eligibility constraint, the object-merge/scalar-replace cascade rule, and the `@`-filter grammar. AVOID VSCode's flat dotted-key namespace as the *only* grouping mechanism, its Bing-cloud search dependency, and its overloaded use of the word "scope."

---

## 1. The configuration registry and `contributes.configuration`

VSCode has a single in-process **`IConfigurationRegistry`** singleton. Core and every extension register configuration *nodes* into it; the Settings editor, the `settings.json` IntelliSense, and the runtime `ConfigurationService` all read from this one registry. This is the literal embodiment of "declare once, project many ways" and is the structural template for zodal-settings [1].

### 1.1 The per-setting descriptor (`IConfigurationPropertySchema`)

Each setting key maps to a descriptor that is a superset of JSON Schema. Confirmed fields from source [1][2]:

| Field | Role | zodal mapping |
|---|---|---|
| `type` / `default` / `enum` | data shape + base value + closed value set | Zod type + `.default()` + `z.enum`/literal union |
| `enumDescriptions` / `markdownEnumDescriptions` | per-enum-option help text in the dropdown; array length must match `enum`; markdown variant takes precedence | per-option affordance metadata |
| `description` / `markdownDescription` | help text; markdown variant enables links, backticks, lists | `.describe()` / `.meta({ markdownDescription })` |
| `scope` | eligibility constraint — *which layers may set this* (see §2) | a new **affordance**, not zodal's "scope" |
| `order` | integer ordering within a category | presentation-hint (uiSchema-equivalent) |
| `tags` | grouping/search dimension; multi-membership; queried via `@tag:` | zodal **facet/tag** — direct match |
| `deprecationMessage` / `markdownDeprecationMessage` | renders a warning underline + message | deprecation affordance |
| `restricted` | value only honored from **trusted** sources (Workspace Trust) | trust/sensitivity affordance |
| `included` | when `false`, excluded from the registry (build/feature gating) | conditional inclusion |
| `ignoreSync` / `disallowSyncIgnore` | sync opt-out; the latter forbids the user re-enabling it | sync-policy affordance |
| `policy` / `policyReference` | this setting may be force-overridden by a system policy; a setting must **not** declare both | **managed/policy value** — direct match |
| `editPresentation` | `singlelineText` vs `multilineText` input hint | widget hint |

**Pattern to steal:** the descriptor is *flat metadata co-located with the type*, and every consumer (UI, JSON IntelliSense, sync, policy) reads the same record. zodal already does this via `.meta()` + the affordance registry — VSCode validates the approach at massive scale (thousands of settings, hundreds of extensions).

### 1.2 The extension contribution wrapper (`configurationEntrySchema`)

Extensions contribute via `contributes.configuration`, validated in [`configurationExtensionPoint.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/common/configurationExtensionPoint.ts) [2]. A contribution is a *category node*:

- `title` — subheading rendered in the Settings editor table of contents.
- `order` — integer ordering of the **category** relative to other categories.
- `properties` — map of dotted-key → descriptor (§1.1).

Validation rules worth copying [2]:

- Duplicate key across extensions is rejected: *"Cannot register '{0}'. This property is already registered."* — keys are a **global flat namespace**; first registration wins. (This is a pitfall: see §6.)
- Missing `scope` defaults to `WINDOW`.
- Extensions may only ship **defaults** for `machine-overridable`, `window`, `resource`, `language-overridable` scopes — never `application`/`machine`. Rationale: those scopes are user/admin-only territory. zodal analog: a **preset/default layer** must not be allowed to write values into scopes reserved for higher authority.

---

## 2. Scope as a per-setting eligibility constraint (vs zodal's "scope")

This is the single most important conceptual divergence to internalize. In VSCode, `ConfigurationScope` is an enum **on the setting definition** (string forms in parens are the `contributes.configuration` values) [1][2]:

| Enum (value) | string form | Configurable in |
|---|---|---|
| `APPLICATION` (1) | `application` | default-profile user settings only |
| `MACHINE` (2) | `machine` | local + remote user settings only |
| `APPLICATION_MACHINE` (3) | — | default-profile user + remote user |
| `WINDOW` (4) | `window` | user, remote, **or** workspace |
| `RESOURCE` (5) | `resource` | user, remote, workspace, **or** folder |
| `LANGUAGE_OVERRIDABLE` (6) | `language-overridable` | resource scopes **plus** language-specific blocks |
| `MACHINE_OVERRIDABLE` (7) | `machine-overridable` | machine-default, but overridable in workspace/folder |

So VSCode's "scope" answers *"in which layers is this setting even allowed to appear?"* — it is a **constraint on the layer set**, not the layers themselves. The actual ordered sources (default/user/remote/workspace/folder) are fixed framework concepts.

**zodal-settings recommendation (synthesis):** keep BOTH concepts but name them distinctly to avoid the overloading that even VSCode users find confusing:
- zodal **scope** = the ordered layer source (you already have this).
- Add a per-setting **affordance** — call it `writableScopes` / `layerEligibility` — that lists which scopes a given setting may be written in. This is what powers "Not all user settings are available as workspace settings" and the `application`/`machine` exclusion. It is a HARD constraint enforced at write/merge time, expressible as a Zod refinement or `.meta()` annotation.

---

## 3. Scope precedence and effective-value resolution (the cascade)

The cascade is **fixed-order, last-wins**, lowest→highest [3]:

1. Default settings (from the registry `default`s)
2. User settings
3. Remote settings
4. Workspace settings
5. Workspace Folder settings (multi-root only)
6. Language-specific variants of all of the above, in the same relative order
7. **Policy** settings (always win)

Two rules are load-bearing and should be copied verbatim into zodal's **merge-strategy** defaults:

- **Merge semantics (confirmed in source/docs):** *"Values with primitive types and Array types are overridden... values with Object types are merged."* [3]. So the default per-key **merge strategy** is: scalar → `replace`, array → `replace`, object → `deep-merge`. This is exactly zodal's stated cascade rule — VSCode is a primary-source confirmation that this is the sane default.
- **Language overrides outrank scope narrowness:** *"Language-specific editor settings always override non-language-specific editor settings, even if the non-language-specific setting has a narrower scope."* [3]. Translation for zodal: a **facet/dimension-targeted layer** (here: language) sits at a *higher precedence band* than ordinary scopes, independent of the eligibility constraint. Worth modeling explicitly so it's not a surprise.

Language-specific blocks use bracket-key syntax in the data file itself — `"[typescript]": { ... }`, and multi-language `"[javascript][typescript]": { ... }` [3]. This is a **scoped sub-layer expressed inline in the same JSON document** rather than a separate file — a neat trick: one physical layer file can carry multiple logical sub-layers keyed by a facet value.

**Provenance:** the Settings editor surfaces the winning layer via a colored gutter bar (the "modified" indicator) and the `@modified` filter; the gear menu exposes "Copy Setting as JSON" and reset-to-default. zodal's **effective value + provenance** pairing is the same idea — VSCode shows that provenance must be a first-class, *renderable* output of the cascade, not a debug afterthought.

---

## 4. The Settings editor UI (the reference headless-config renderer)

Concrete, copyable UI patterns [2][4]:

- **Table of contents tree** — left-rail tree built from category `title` + `order` and the dotted-key namespace (`editor.*`, `git.*`). Grouping is therefore *partly* by explicit category and *partly* by key-prefix convention. (Pitfall, §6.)
- **Split User / Workspace tabs** — same setting list, different target layer; the tab *is* the chosen write-scope. Settings ineligible for the workspace layer (per §2) are hidden or read-only on that tab.
- **Search box with `@`-filter grammar** — the most reusable artifact:
  - `@modified` — value differs from default *or* is explicitly present in a settings file.
  - `@tag:<tag>` — e.g. `@tag:experimental`, `@tag:accessibility`, `@tag:workspaceTrust` — driven by the descriptor `tags` field (zodal facets).
  - `@lang:<id>` — filter + retarget writes into the `[lang]` block.
  - `@feature:<subsystem>` and `@ext:<extensionId>` — group by owning component.
- **"Edit in settings.json" escape hatch** — settings whose value is too complex for a generated widget (e.g. `workbench.colorCustomizations`) render only a link to the raw JSON. This is the explicit *convention-over-configuration with escape hatch* pattern: the GUI handles the 90%, raw JSON handles the rest. zodal-settings should ship the same: a headless control descriptor can declare "no widget, edit raw."
- **Modified gutter + gear menu** — provenance bar; Reset to default; Copy Setting ID; Copy Setting as JSON; Copy settings URL.
- **Progressive disclosure** — modeled as a `@tag:advanced` facet, *not* a separate hidden screen. This is exactly zodal's stated stance (advanced = a facet, not a hidden page). VSCode confirms it works at scale.

### 4.1 Search ranking (KEEP the idea, AVOID the implementation)

Historically VSCode used a **Bing-backed cloud search**: config metadata is exported to JSON at build time, uploaded to Azure, enriched offline with synonyms/stemming/spelling/NLP, then queried online; results blended with local fuzzy matching [6][7]. Modern builds moved much of this to a local **TF-IDF** index over setting descriptions (and have known relevance bugs) [8].

**Takeaway:** rich natural-language search over settings is high-value but the cloud dependency is a liability. For a *library*, ship a **local, descriptor-text index** (TF-IDF or a small fuzzy matcher over `description`/`tags`/`enumDescriptions`) and leave a pluggable hook for a smarter backend. Do **not** require a network service.

---

## 5. Settings Sync — sensitivity & machine-locality as scope-derived properties

Settings Sync synchronizes settings, keybindings, snippets, tasks, UI state, extensions, and profiles across machines [5]. Relevant mechanics:

- **`machine` and `machine-overridable` scoped settings do not sync by default** — machine-locality is *derived from scope*, not a separate flag. This is elegant: "this value is specific to this machine" is the same fact as "this value can only live in machine layers."
- **`settingsSync.ignoredSettings`** — user-editable exclusion list (supports `-`-prefixed re-inclusion of defaults); **`settingsSync.ignoredExtensions`** for extensions; per-setting `ignoreSync` / `disallowSyncIgnore` descriptor flags let the *definition* opt out (and optionally forbid the user re-enabling).
- **Conflict handling:** Accept Local / Accept Remote / Show Conflicts (diff editor). First-machine merge offers Merge / Replace Local / Merge Manually.
- **Retention:** local backups deleted after 30 days; remote keeps latest 20 versions per resource.

**zodal-settings mapping:** sync-eligibility, **sensitivity/secret**, and **managed/policy** are all *affordances derived-from-or-adjacent-to scope*. Model them as descriptor flags (`syncable`, `sensitive`, `managedBy`) that a sync/secret-store adapter reads — the same headless-descriptor-drives-everything pattern.

---

## 6. Pitfalls observed (so zodal-settings can avoid them)

1. **Overloaded "scope" terminology.** VSCode's `scope` (per-setting eligibility) collides with the colloquial "scope = where settings live." Users routinely conflate them. zodal already separates *scope* (layer source) from *affordance* — keep that discipline; name the eligibility constraint something other than "scope."
2. **Flat global dotted-key namespace is the only hard identity.** Grouping via key-prefix + category `title` is convention, not structure, so two extensions can't share a prefix cleanly, duplicate keys are silently rejected (first-wins), and reorganization breaks keys. zodal should make **facets/tags the canonical grouping** (multi-membership) and keep the dotted key as a *stable identity only*, decoupled from grouping — VSCode's pain comes from coupling them.
3. **`order` is a manual integer.** Hand-assigned `order` ints across hundreds of contributors drift and collide. Prefer relative/declarative ordering or facet-driven sort with `order` only as a tie-breaker.
4. **Object deep-merge can't be turned off per key.** VSCode hard-codes object=merge / array=replace with no per-key override; users frequently want array-append or object-replace and can't get it. zodal's per-key **merge strategy** (replace/deep-merge/append/strategic) is a genuine improvement — expose it.
5. **`enumDescriptions` length-coupling.** The array must exactly match `enum` length; drift produces silently misaligned help. If zodal models enum options, bind description to option *by key*, not by parallel-array index.
6. **Cloud search dependency** (historical) — avoid; ship local.
7. **`application`/`machine` write-eligibility is enforced only loosely for defaults.** Enforce write-eligibility at *merge/write* time as a hard constraint, not just at registration.

---

## 7. Direct KEEP / AVOID for zodal-settings

**KEEP**
- Single registry of dotted-key settings, each with a co-located JSON-Schema-superset descriptor (= zodal schema + affordances). [1][2]
- Per-setting **eligibility constraint** governing which layers/scopes may write it. [1][2]
- Cascade default: scalar/array **replace**, object **deep-merge**; policy band always wins; facet-targeted (language) overrides sit in a higher band. [3]
- Provenance ("modified" bar + `@modified`) as a first-class renderable cascade output. [2][3]
- `@`-filter grammar (`@modified`, `@tag:`, `@lang:`, `@feature:`, `@ext:`) over descriptor fields. [4]
- "Edit raw" escape hatch for un-widgetable values; `editPresentation` widget hints. [2][4]
- Sensitivity/sync/policy as scope-derived descriptor flags. [5]

**AVOID**
- Overloading the word "scope" for two different concepts. [1][3]
- Coupling grouping to the key namespace — make facets canonical instead. [2]
- Hard-coded, non-overridable per-key merge semantics. [3]
- Parallel-array `enumDescriptions` (bind by key). [2]
- A network/cloud dependency for settings search. [6][8]
- Manual global `order` integers as the primary sort key. [2]

---

## Open questions / unverified

- Exact current source of the Settings editor TF-IDF index and how local vs (any remaining) remote ranking is blended — issue [8] confirms TF-IDF is in use but the precise file/algorithm wasn't read from source here.
- Whether `APPLICATION_MACHINE` (value 3) has user-facing surface or is internal-only — only the source comment was confirmed [1].
- Precise behavior of `restricted` (Workspace Trust) merge when an untrusted workspace tries to set a restricted key — docs describe the intent, exact fallback value not source-verified [1].

---

## References

1. [vscode/src/vs/platform/configuration/common/configurationRegistry.ts (microsoft/vscode, main)](https://github.com/microsoft/vscode/blob/main/src/vs/platform/configuration/common/configurationRegistry.ts)
2. [vscode/src/vs/workbench/api/common/configurationExtensionPoint.ts (microsoft/vscode, main)](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/common/configurationExtensionPoint.ts)
3. [User and workspace settings — settings precedence & merge semantics (code.visualstudio.com)](https://code.visualstudio.com/docs/configure/settings)
4. [User and workspace settings — Settings editor UI & filters (code.visualstudio.com)](https://code.visualstudio.com/docs/getstarted/settings)
5. [Settings Sync (code.visualstudio.com)](https://code.visualstudio.com/docs/configure/settings-sync)
6. [Bing-powered settings search in VS Code (code.visualstudio.com/blogs, 2018)](https://code.visualstudio.com/blogs/2018/04/25/bing-settings-search)
7. [Contribution Points — contributes.configuration reference (code.visualstudio.com)](https://code.visualstudio.com/api/references/contribution-points)
8. [TF-IDF in Settings editor search — issue #196374 (microsoft/vscode)](https://github.com/microsoft/vscode/issues/196374)
9. [Setting Descriptions — authoring guidance (microsoft/vscode Wiki)](https://github.com/microsoft/vscode/wiki/Setting-Descriptions)
