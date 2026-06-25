# 02D — Scopes, Precedence & Effective-Value Resolution

*Research dimension G. Focused study of **scoped** settings and effective-value
resolution as a phenomenon **distinct** from user-saved bundles (profiles/presets).
The goal is to extract a battle-tested model for a `resolveEffective(key) → { value, provenance }`
function for zodal-settings, and to know what to KEEP vs AVOID for a schema-driven,
headless TypeScript library.*

---

## TL;DR

- **Scopes are an ordered stack of partial layers; the cascade walks them and
  the highest-precedence layer that defines a key wins.** Every production
  system studied (VSCode, Sourcegraph, macOS CFPreferences, Spring, 12-factor)
  is a variation on this one algorithm. The differences are (a) how many scopes,
  (b) the merge rule per key, and (c) whether they expose **provenance**.
- **The near-universal merge rule: objects deep-merge, scalars and arrays
  replace wholesale.** VSCode states this explicitly; JSON Merge Patch (RFC 7386)
  formalizes it; Sourcegraph and CFPreferences behave the same. This is exactly
  zodal-settings' stated cascade rule — it is the industry consensus, KEEP it.
- **Policy/managed scope sits *above* the user at the top of the stack and is
  non-overridable.** VSCode "policy settings always override"; macOS "Forced"
  managed preferences with `CFPreferencesAppValueIsForced` telling the UI to
  disable the control. This maps directly to zodal's *managed/policy value*.
- **Provenance ("which scope set this, what did it shadow") is rare and valuable.**
  VSCode is the only one with real UI for it ("Modified elsewhere", reset-to-
  scope). This is precisely zodal's differentiator and ties to `explain()`. KEEP.
- **Scopes (positional, merged live) are categorically different from
  profiles/presets (named, complete, user-selected bundles).** A profile is a
  *value of* a scope-layer, not a scope. Conflating them is the main modeling
  trap. AVOID.

---

## 1. The shared model (synthesis across all five systems)

Strip the vocabularies away and every system reduces to the same three-part model:

1. **An ordered list of sources** (call them *scopes*), lowest-precedence first.
2. **Each source contributes a partial set of key→value pairs** (a *layer*).
3. **Resolution walks the stack; for each key the highest source that defines it
   wins, and per-key merge rules decide whether deeper layers contribute.**

This is exactly zodal-settings' *cascade* over *scopes*. The table below maps the
domain vocabulary onto each system before we go deep.

| zodal term        | VSCode                       | Sourcegraph      | CFPreferences (macOS)        | Spring Boot                | 12-factor      |
|-------------------|------------------------------|------------------|------------------------------|----------------------------|----------------|
| Scope             | default→user→remote→ws→folder→lang→policy | global→org→user | (app × user × host) triple | ~17 ordered PropertySources | env vars (flat) |
| Layer             | a `settings.json` file       | a settings blob  | one `.plist` domain          | one `PropertySource`       | the env itself |
| Cascade           | scoped config merge          | "settings cascade" | domain search path         | `Environment` resolution   | n/a (flat)     |
| Managed/policy    | policy settings (top)        | (none)           | "Forced" managed prefs       | (none formal)              | (none)         |
| Effective value   | resolved setting             | effective settings | `CFPreferencesCopyAppValue` result | `getProperty()`    | `getenv()`     |
| Provenance        | "Modified elsewhere" + reset | (not exposed)    | `…AppValueIsForced`          | (not exposed at runtime)   | (none)         |

---

## 2. VSCode — the gold standard for scoped settings + provenance UI

**Precedence (lowest→highest), verbatim from the docs** [1]:

1. Default settings
2. User settings (global)
3. Remote settings (per remote machine)
4. Workspace settings (the open folder/workspace)
5. Workspace Folder settings (a folder in a multi-root workspace)
6. Language-specific default settings (extension-contributed)
7. Language-specific user settings
8. Language-specific remote settings
9. Language-specific workspace settings
10. Language-specific workspace folder settings
11. **Policy settings — "set by the system administrator, these values always
    override other setting values."**

**HARD FACT — merge rule** [1]: *"Values with primitive types and Array types
are overridden"* (a higher scope's value replaces the lower one entirely);
*"values with Object types are merged."* So `editor.background` (user, blue) and
`editor.foreground` (workspace, red) compose into one object; conflicting keys
inside the object follow normal scope precedence.

**HARD FACT — language overrides are a second, orthogonal precedence axis** [1]:
language-specific settings (`"[python]": { … }`) form their own sub-stack that
sits *above* the non-language stack, and a single-language block beats a
multi-language block — *"applied before the normal setting scope precedence
rules."* This is a worked example of zodal's **facet** idea: "language" is a
grouping/qualifier dimension that re-projects the same key.

**HARD FACT — provenance UI** [1][2]: The Settings editor shows a colored bar on
the left for any setting modified away from default; the gear menu offers
**reset-this-setting** and copy. The dedicated **"Modified elsewhere"** indicator
[2] tells the user a value is also set in another scope/language — i.e. VSCode
surfaces *both* the winning layer and the shadowed ones. This is the single
strongest precedent for zodal's `explain()`.

**KEEP:** the explicit object-merge/scalar-replace rule; policy at the top;
a separate orthogonal qualifier axis (language ⇒ facet); the reset-to-scope and
"modified elsewhere" affordances.
**AVOID:** the 11-level hardcoded ladder — it is VSCode-specific and rigid. zodal
should make the scope list *configurable*, not baked in.

---

## 3. Sourcegraph — minimal three-tier cascade via JSON Schema

**HARD FACT** [3]: Three levels, lowest→highest: **global (site admin) →
organization → user**. *"A property defined in user settings overrides any
values for the property from organization or global settings."* Each extension
ships a **JSON Schema** for its config so editing any tier gets validation,
completion, docs and hovers [4] — the schema is the SSOT, and it is the *same*
schema regardless of tier. The cascade is computed by merging tiers; the docs do
**not** specify deep-vs-shallow merge and do **not** expose provenance to the
user [3] (flagged: *unverified merge depth*).

**Why it matters for zodal:** This is the cleanest demonstration of the zodal
thesis applied to scopes — **one schema, edited at N tiers, merged into an
effective value.** The simplicity (3 fixed tiers, no provenance UI) is also a
cautionary tale: it is *less* capable than VSCode precisely where zodal wants to
be strong (provenance, merge clarity).

**KEEP:** one schema validates every tier; a small default tier set
(global/org/user) is a sensible *preset* scope-stack.
**AVOID:** leaving merge depth unspecified, and shipping with no provenance —
the two gaps zodal explicitly closes.

---

## 4. macOS CFPreferences — the domain cascade & the "managed/forced" tier

CFPreferences models a preference as a **(application, user, host) triple** with
`Current`/`Any` qualifiers on each axis [5]. `CFPreferencesCopyAppValue`
*"traverses the search path … and returns the value from the most-specific
domain."* **HARD FACT — the search order** (Table 1, [5]):

1. Current User · Current App · Current Host
2. Current User · Current App · **Any Host**
3. Current User · Any App · Current Host
4. Current User · Any App · Any Host
5. Any User · Current App · Current Host
6. Any User · Current App · Any Host
7. Any User · Any App · Current Host
8. Any User · Any App · Any Host

Writes via `CFPreferencesSetAppValue` land in slot #2 (Current User, Any Host) [5].
On disk the layers are distinct files: `~/Library/Preferences/` (user/any-host),
`…/ByHost/` (host-specific), `/Library/Preferences/` (any-user) [search].

**HARD FACT — the managed/policy tier** [6][7]: macOS adds *managed preferences*
(MCX, now via MDM configuration profiles in `/Library/Managed Preferences/`). A
profile can apply a domain as **`Forced`** (always-enforced policy, non-
overridable) or **`Set-Once`/`Once`** (a *suggested default* the user may then
change). Crucially, **`CFPreferencesAppValueIsForced`** lets the app *query
provenance*: it tells the UI whether a key is administrator-imposed so it can
**disable the control** [7].

**Why it matters for zodal:** This is the model for **managed/policy values** and
for **dirty/editability**. The `Forced` vs `Set-Once` distinction is *exactly*
zodal's *managed (non-overridable)* vs *dependent/advisory default* split, and
`AppValueIsForced` is a provenance API that drives an *affordance* (control
enabled/disabled). The multi-axis domain triple is another concrete **facet**
precedent (host and user are orthogonal grouping dimensions).

**KEEP:** the forced-vs-suggested distinction surfaced through a provenance
predicate that drives the widget's editability; multi-axis qualifiers as facets.
**AVOID:** an 8-slot combinatorial fixed cascade — too rigid and largely a relic
of multi-user/multi-host Macs; zodal's scope list should be data, not constants.

---

## 5. Spring Boot — many ordered property sources, last-wins, no runtime provenance

**HARD FACT** [8]: Spring resolves config from a long, fixed-precedence list of
`PropertySource`s (roughly: command-line args > `SPRING_APPLICATION_JSON` > OS
env > Java system props > profile-specific files > application files > defaults),
designed *"to allow sensible overriding of values"* — **command-line properties
always take precedence.** Resolution is **first-match-wins per key** across an
ordered list — the same algorithm, flat (no deep object merge across sources at
the property level, since keys are dotted strings like `server.port`).

**Synthesis/opinion:** Spring confirms two design points: (a) **flattening nested
config to dotted keys** (`a.b.c`) makes precedence trivially per-key and dodges
deep-merge ambiguity entirely — this is the same dotted-path key model zodal
already uses for *Setting* identity; (b) Spring exposes the *list* of sources via
`Environment` but offers **no first-class "who set this key" provenance** at
runtime — a gap zodal should not replicate.

**KEEP:** dotted-path flattening so precedence is per-leaf; an explicit,
inspectable ordered source list.
**AVOID:** the runtime-opaque resolution (no easy "which source won").

---

## 6. 12-factor — config as flat env vars; the anti-pattern to learn from

**HARD FACT** [9]: 12-factor says *"store config in the environment"* as a flat
set of **granular env vars, each fully orthogonal to the others**, and explicitly
**rejects grouping config into named "environments"** (`dev`/`staging`/`prod`)
because they *"don't scale cleanly … as more deploys … are created."*

**Synthesis/opinion — the key lesson for zodal:** 12-factor's anti-pattern is the
exact distinction this dimension is about. A named **environment** (= a complete
named bundle) is a **profile/preset**, *not* a **scope**. 12-factor warns that
modeling variability as a fixed set of named bundles explodes combinatorially,
whereas orthogonal per-key layers compose. zodal-settings should therefore make
**scopes/layers the primary cascade primitive** and treat **profiles/presets as
*selectable values of* a layer** (e.g. "the active preset" is one source in the
stack), never as the scoping mechanism itself. (This is also why feature-model /
variability-modeling framing matters: orthogonal layers ≈ orthogonal features.)

**KEEP:** orthogonal per-key layers as the cascade primitive.
**AVOID:** named-bundle-as-scope; secrets in the same plaintext channel as
ordinary config (12-factor lumps them, but zodal's *sensitivity/secret* flag
should route secrets to a separate provider — see dimension on sensitivity).

---

## 7. The serialized-layer shape: JSON Merge Patch vs JSON Patch

A *layer* must be serializable (to ship a preset, store a profile, diff history).
**HARD FACT — RFC 7386 JSON Merge Patch** [10][11]: a patch is *"a recursive
merge"* — objects merge key-by-key, **non-object values (scalars, arrays) replace
wholesale**, and **`null` means delete the key.** This is *identical* to the
VSCode/CFPreferences merge rule, which makes JSON Merge Patch the natural on-the-
wire shape for a single layer/overlay in zodal. **Caveat (HARD FACT)** [10]: you
**cannot set a value *to* `null`** with Merge Patch (null is overloaded as
delete), and **arrays cannot be patched element-wise** — so for **audit/history/
undo**, JSON Patch (RFC 6902, ordered op list) is the better serialization. This
matches zodal's stated split: Merge Patch as the preferred *internal layer shape*,
JSON Patch for *history/audit/undo*.

**KEEP:** JSON Merge Patch as the canonical layer encoding (its semantics already
equal the cascade rule); JSON Patch for the audit log. **AVOID:** using Merge
Patch where `null`-as-value or array-element edits are needed.

---

## 8. Proposed model for zodal-settings (synthesis / opinion)

A headless, schema-driven resolver. Scopes are **data, not constants** (open-closed):

```ts
interface Scope { id: string; label: string; }            // e.g. "default","preset","profile","workspace","policy"
type Layer = JsonMergePatch;                                // RFC 7386-shaped partial values
interface ScopeStack { scopes: Scope[]; /* low→high */ layers: Map<scopeId, Layer>; }

interface Provenance {
  winningScope: string;                 // who set the effective value
  shadowed: { scope: string; value: unknown }[];  // lower layers that also set this key
  managed: boolean;                     // set by a policy scope ⇒ non-overridable (cf. AppValueIsForced)
  mergedFrom?: string[];                // for object keys, every scope that contributed a sub-key
}
interface Resolved<T> { key: string; value: T; provenance: Provenance; }

function resolveEffective<T>(key, stack): Resolved<T>   // walk high→low; object deep-merge, scalar/array replace
function explain(key, stack): Provenance                // the provenance half, standalone — ties to zodal explain()
```

Resolution algorithm (the consensus): walk scopes high→low; for a **scalar/array**
key, first defining scope wins (record the rest as `shadowed`); for an **object**
key, deep-merge all defining scopes top-down (record each as `mergedFrom`), with
higher scopes winning per leaf. A scope flagged `managed: true` (policy) short-
circuits editability: the resolved affordance is rendered **read-only** with a
"managed by policy" hint — directly analogous to `CFPreferencesAppValueIsForced`
disabling the control [7] and VSCode policy settings always winning [1].

**Design notes:**
- **Provenance is the differentiator.** Only VSCode exposes it in the UI;
  Sourcegraph/Spring/12-factor do not. `explain()` returning the winning scope +
  the shadowed stack is the headline feature for this dimension.
- **Keep scope ≠ profile.** A *profile* is a complete named value-set the user
  selects; in the cascade it is simply the contents of one layer (e.g. the
  "profile" scope). A *preset* is the curated base layer. The cascade does not
  care that a layer "is" a profile — it is just a layer. (12-factor's warning [9].)
- **Dotted-path keys + per-key merge strategy** (replace/deep-merge/append/
  strategic): default by Zod type (object⇒deep-merge, scalar/array⇒replace,
  matching the consensus), overridable per key via `.meta()` (an *affordance*),
  echoing Kubernetes strategic-merge for array-of-objects when needed.
- **Headless:** the resolver emits `Resolved<T>` config objects (value +
  provenance + editability), never DOM — renderers turn `managed`/`shadowed`
  into badges, lock icons, and "reset to <scope>" actions.

---

## KEEP / AVOID summary

**KEEP**
- Ordered scope-stack + walk-high-to-low first-match (universal algorithm).
- Object deep-merge / scalar & array replace (VSCode + RFC 7386 consensus).
- Policy/managed scope at the top, non-overridable, with a provenance predicate
  that drives control editability (CFPreferences `Forced` + `AppValueIsForced`).
- First-class **provenance / `explain()`** (winning scope + shadowed layers) —
  the differentiator; only VSCode does this today.
- JSON Merge Patch as the layer shape; JSON Patch for audit/undo.
- Dotted-path keys so precedence is per-leaf (Spring).

**AVOID**
- Hardcoded scope ladders (VSCode's 11 / CFPreferences' 8) — make scopes data.
- Conflating profiles/presets (named bundles) with scopes (positional layers).
- Leaving merge depth unspecified or provenance unexposed (Sourcegraph/Spring gap).
- Merge-Patch where `null`-as-value or array-element edits are required.
- Routing secrets through the same plaintext layer channel (12-factor lumps them).

---

## References

1. [VS Code — User and Workspace Settings (precedence, scopes, merge rules)](https://code.visualstudio.com/docs/configure/settings)
2. [microsoft/vscode #153351 — "Modified elsewhere" indicator in the Settings editor](https://github.com/microsoft/vscode/issues/153351)
3. [Sourcegraph docs — Settings (cascade: global → org → user)](https://docs.sourcegraph.com/admin/config/settings)
4. [Sourcegraph docs — Extension contribution points (per-tier JSON Schema config)](https://docs.sourcegraph.com/@v3.4.4/extensions/authoring/contributions)
5. [Apple — CFPreferences Preference Domains (domain triple & search order)](https://developer.apple.com/library/archive/documentation/CoreFoundation/Conceptual/CFPreferences/Concepts/PreferenceDomains.html)
6. [Apple — ManagedPreferences (Forced / Set-Once / Once payloads)](https://developer.apple.com/documentation/devicemanagement/managedpreferences)
7. [Apple — CFPreferences Best Practices (managed prefs, CFPreferencesAppValueIsForced)](https://developer.apple.com/library/archive/documentation/CoreFoundation/Conceptual/CFPreferences/Concepts/BestPractices.html)
8. [Spring Boot Reference — Externalized Configuration (PropertySource ordering)](https://docs.spring.io/spring-boot/reference/features/external-config.html)
9. [The Twelve-Factor App — III. Config](https://12factor.net/config)
10. [RFC 7386 — JSON Merge Patch](https://www.rfc-editor.org/rfc/rfc7386)
11. [RFC 6902 — JavaScript Object Notation (JSON) Patch](https://www.rfc-editor.org/rfc/rfc6902)
