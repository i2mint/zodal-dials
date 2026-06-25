# 02C — Collections, Layering & Merge: Reusable Setting Bundles and the Cascade

**Scope (dimensions C, G):** how reusable bundles of settings (profiles/presets) compose through an ordered cascade of partial layers; merge semantics and conflict resolution; the wire formats (patch/diff) that serialize layers; and a precise model + API shape for "apply layer(s) over a background with a declared conflict policy."

---

## TL;DR

- A **layer** is a *partial/sparse* map of `key -> value` from one source. **Sparse beats snapshots**: a partial layer expresses *intent* ("set theme=dark; touch nothing else"), survives upstream changes, and merges cleanly; a full snapshot freezes everything and silently resurrects stale defaults. This is the single most important design choice. *(Synthesis, but near-universal across the systems surveyed.)*
- The dominant industrial pattern is **ordered, priority-ranked layering**: an ordered list of named scopes (defaults → preset → profile → workspace → policy), where higher scope wins per key. CSS, NixOS, Ansible, Spring, Helm, VS Code, ESLint all instantiate this.
- For the **internal layer shape**, prefer **JSON Merge Patch (RFC 7386)** semantics: object members recurse, `null` deletes, and any non-object (scalar/array) **replaces wholesale** [1]. For **history/audit/undo**, prefer **JSON Patch (RFC 6902)** — an ordered, reversible, testable op-list applied all-or-nothing [2].
- The hard, recurring decision is **per-key/per-type merge strategy** (replace vs deep-merge vs append). Make the *type* (or an explicit `.meta()` strategy) decide — this is exactly NixOS's type-directed merge — never hardcode "always deep-merge."
- **KEEP**: ordered scopes, sparse layers, RFC 7386 internal shape, type-directed strategy table, provenance on every effective value, RFC 6902 for history. **AVOID**: `null`-as-delete ambiguity, silent array merging, three-way auto-merge for live config, deep-merging arrays by default.

---

## 1. Profiles vs. Presets vs. Shareable Configs

These three are the *bundle* abstractions. They differ in **completeness** and **authorship**, not mechanism — all three resolve through the same cascade.

| Term | Definition | Completeness | Authored by | Analogue |
|---|---|---|---|---|
| **Preset** | A curated, shippable *base* bundle meant to be **extended/overridden** | Usually fuller; a foundation | Library/vendor | ESLint `js.configs.recommended` [9]; Helm chart `values.yaml` [4] |
| **Profile** | A complete, user-selectable named bundle the user **switches between** | Complete enough to stand alone | End user / org | Spring profile (`application-prod.yml`) [5]; Firefox profile |
| **Shareable config** | A *distributable* layer (npm package, file) others import | Partial or full | Third party | ESLint shareable config [9]; design-token theme file [8] |

**Key insight (synthesis):** the distinction is presentational/authorial. Internally they are all **layers**. A "profile" is just a layer (or named ordered set of layers) the UI lets the user pick; a "preset" is a layer shipped at a low scope so user layers override it. zodal-settings should model **one primitive (the layer)** and treat profile/preset/shareable-config as roles a layer plays in the scope ordering. This avoids three parallel code paths.

ESLint flat config is the cleanest modern reference: configs merge top-to-bottom with deep merge and **last-wins** on conflict; `extends` pulls in a shareable preset, and you override by placing your object *after* it [9]. Spring is the cleanest *profile* reference: a profile-specific document is only folded into the final merge if its profile is active, and external/CLI sources sit at higher precedence than packaged ones [5].

---

## 2. Partial/Sparse Layers vs. Full Snapshots

A **sparse layer** sets only the keys it cares about; absent keys mean "defer to lower scopes," *not* "set to default."

Why sparse wins (the recurring industrial verdict):

1. **Intent preservation.** A profile that says only `{editor.theme: "dark"}` keeps tracking upstream changes to every other setting. A snapshot pins all of them, so a later default improvement never reaches that user.
2. **Composability.** Sparse layers stack: `defaults ⊕ preset ⊕ profile ⊕ workspace`. Each contributes only its deltas, so merge conflicts are localized to genuinely overlapping keys.
3. **Smaller, auditable diffs.** A layer *is* the diff. This is exactly why VS Code stores `settings.json` as the deltas over defaults, not a full settings dump [7], and why Kubernetes overlays (Kustomize) patch a base rather than copy it [3].
4. **The "merge-key" problem only exists for arrays.** Objects merge structurally; the hard cases are lists (append? replace? merge-by-id?) — see §4.

**The null/absence ambiguity (HARD FACT, must design around).** RFC 7386 makes `null` mean *delete*, which means **you cannot set a value to `null`** via merge patch [1]. Helm inherited a worse variant: in Helm ≥2.12 a `null` override behaves "the same as if absent," so it selects a *lower-precedence* value instead of forcing deletion [4]. zodal-settings must pick an explicit sentinel for "unset/reset to lower scope" (e.g. an `UNSET` symbol) distinct from a legitimate `null` value, or it will reproduce these bugs. *(Synthesis grounded in [1],[4].)*

---

## 3. Layering / Overlays: The Ordered-Scope Model

Every surveyed system is an **ordered precedence chain**; they differ only in how many bands and whether priority is positional or explicit.

- **CSS cascade** — the canonical multi-stage resolver. Order of operations: (1) relevance/filter, (2) **origin & importance** (user-agent < user < author, with `!important` inverting), (3) **cascade layers** within an origin, (4) **specificity**, (5) **order of appearance** as the final tiebreaker [6]. The lesson: importance/origin is decided *before* specificity — a coarse band always beats a fine one. A settings "policy" scope is the direct analogue of `!important` user-agent rules.
- **NixOS module system** — *explicit numeric priorities*: `mkOptionDefault` = 1500, `mkDefault` = 1000, `mkForce` = 50, `mkVMOverride` = 10 (lower number = higher priority). The engine gathers all definitions, keeps only those at the lowest numeric priority, and merges *those* via a **type-directed merge function** [10],[11]. `mkMerge` combines definition sets; `mkBefore`/`mkAfter` control list order. This is the gold standard for "let the type decide how to merge" (§4).
- **Ansible** — a **22-level** positional precedence list, extra-vars (`-e`) at the top overriding everything, role `defaults/` at the bottom [12]. Demonstrates the cost of too many bands: the list is famously hard to reason about. *Lesson: keep scopes to ~5-7 named bands.*
- **Spring Boot** — ordered `PropertySource`s: CLI args > system props > env vars > profile-specific external > profile-specific packaged > plain external > plain packaged [5].
- **Helm** — `values.yaml` < parent-chart values < user `-f` file < `--set`; maps deep-merge, scalars replace [4].
- **VS Code** — Default < User < Workspace < Workspace-Folder < Language-specific < **Policy** (admin, always wins). Critically: **primitives and arrays are replaced; objects are merged** [7]. This split is the right default for zodal-settings.
- **EditorConfig** — directory cascade: search upward, nearest file wins, `root = true` stops the search; globbed sections within a file layer too [13].

**Synthesis — recommended scope ladder for zodal-settings** (low → high precedence): `defaults → preset → profile(s) → workspace → user/current-active → policy(managed)`. `policy` is non-overridable (the CSS `!important`/VS Code Policy analogue, mapping to the *Managed/policy value* vocabulary term). Keep it small (≤7 bands) per the Ansible cautionary tale.

---

## 4. Merge Semantics & Conflict Resolution

There is no single correct merge; there is a **per-key strategy** chosen by type or annotation.

**The four base strategies (vocabulary: *merge strategy*):**

1. **Replace (last-write-wins).** Higher scope's value wins outright. The correct default for **scalars** (and, per VS Code [7] and RFC 7386 [1], for **arrays**).
2. **Deep-merge.** Recurse into objects, union keys, recurse on shared keys. Correct default for **plain objects/maps** (VS Code [7], Helm maps [4], RFC 7386 objects [1]).
3. **Append / concat (with order control).** For lists where layers *accumulate* (e.g. plugin lists, allowlists). NixOS exposes this via `mkBefore`/`mkAfter` to control ordering [10].
4. **Strategic merge (merge-by-key).** Kubernetes SMP merges list elements by a declared **merge key** (e.g. container `name`) instead of by index, and supports `$patch: merge|replace|delete` directives per node [3]. This is the most powerful and the most complex; Kustomize itself has known gaps (e.g. only one delete-directive patch per object) [3].

**Type-directed dispatch (the NixOS pattern, strongly recommended).** Each option *type* carries its own merge function: `bool`/`int`/`str` → replace; `attrsOf`/submodule → recurse; `listOf` → concat; `lines` → newline-join [10],[11]. zodal-settings already has a Zod schema as SSOT, so the **Zod type + `.meta()` affordance** can drive a strategy table — no per-field config needed for the common cases, with `.meta({ mergeStrategy: 'append' })` as the escape hatch. This is convention-over-configuration applied to merging.

**Conflict resolution modes:**

- **Priority/precedence (automatic).** The default everywhere: higher scope silently wins. Pair with **provenance** so "silent" becomes "inspectable."
- **Interactive.** Surface overlapping keys to the user (a *conflict report*) and let them choose. Appropriate when importing/applying a profile over a dirty current state.
- **Three-way merge.** Use `base` (common ancestor) + `ours` + `theirs`; non-overlapping changes auto-merge, overlapping changes conflict. The `diff3` heritage of the "ours/theirs/base" terms [14]. **AVOID as the default for live config** — settings rarely have a meaningful common ancestor at apply-time, and false conflicts are costly; reserve it for *reconciling two independently-edited profiles*, where a base genuinely exists [14].

---

## 5. Patch / Diff Formats (Wire Shapes for Layers)

| Format | Shape | Strengths | Weaknesses | Role in zodal-settings |
|---|---|---|---|---|
| **JSON Merge Patch (RFC 7386)** | A document *mirroring* the target; `null` = delete; non-objects replace [1] | Human-readable; *is* the sparse layer; trivial to author | Can't set `null`; can't partially edit arrays; not reversible [1] | **Preferred internal layer shape** |
| **JSON Patch (RFC 6902)** | Ordered op array: `add/remove/replace/move/copy/test`, applied **all-or-nothing** [2] | Precise; reversible (with inverse ops); `test` guards; explicit array index ops [2] | Verbose; order-sensitive; not human-mergeable | **History / audit / undo-redo** |
| **Kustomize Strategic Merge Patch** | Resource-shaped patch + `$patch` directives + merge-by-key lists [3] | Smart list merging by key | k8s-specific; incomplete (multi-delete gaps) [3] | Inspiration for the **merge-by-key list strategy** |
| **Helm value merge** | YAML overlay; maps deep-merge, scalars replace; `null` quirk [4] | Familiar overlay model | `null`/bool merge footguns [4] | Cautionary reference |
| **W3C Design Tokens / Resolver** | `$value` + alias refs (`{token}`); **modes** (light/dark) + `$extends` group inheritance; a Resolver module composes contexts [8] | Standardized; *modes are exactly named layers*; alias = dependent default | Young spec (first stable 2025.10) [8] | Model for **modes/themes** and **alias-as-dependent-default** |

**Synthesis:** RFC 7386 ⇄ RFC 6902 are complementary, not competing. A layer *applied* is a Merge Patch; the *record of what changed* (for undo/audit) is a JSON Patch (which is reversible because `replace`/`add`/`remove` have inverses). Store layers as 7386; emit 6902 into the history log on each apply. The DTCG "mode" concept [8] confirms that **theme/mode switching is just selecting which layer is active** — no special machinery.

---

## 6. A Precise Model: "Apply Layer(s) Over a Background With a Conflict Policy"

**Core operation.** `resolve(background, layers, policy) -> { effective, provenance, conflicts }`, where:

- `background`: the lowest scope — either **defaults** or the **current active state** (the two canonical backgrounds named in the task).
- `layers`: an **ordered list** of `(scope, sparseLayer)` pairs, low → high precedence.
- `policy`: the per-key/per-type **strategy resolver** + a **conflict mode** (auto / interactive / three-way).

**Algorithm (synthesis, folding in RFC 7386 + NixOS type-direction + CSS banding):**

```
resolve(background, orderedLayers, policy):
  effective   = clone(background)
  provenance  = {}                      # key -> { winning: scope, shadowed: [scope...] }
  conflicts   = []
  for (scope, layer) in orderedLayers:  # low -> high precedence
    for (key, value) in walk(layer):    # sparse: only present keys
      if value is UNSET_SENTINEL:       # explicit reset (NOT raw null)
        deleteAt(effective, key); recordProvenance(key, scope, reset=true)
        continue
      strategy = policy.strategyFor(key, typeOf(key))   # type-directed
      prior    = getAt(effective, key)
      if prior exists and conflictMode == interactive and overlaps(prior, value):
        conflicts.push({ key, prior, incoming: value, scope })
        if not user_resolves: continue
      effective[key] = applyStrategy(strategy, prior, value)   # replace|deepMerge|append|mergeByKey
      provenance[key] = { winning: scope, shadowed: priorScopesFor(key) }
  return { effective, provenance, conflicts }
```

`walk` yields leaf keys by **dotted path** (matching the vocabulary's stable-key model). `policy.strategyFor` defaults: scalar→replace, array→replace, object→deep-merge (the VS Code [7] / RFC 7386 [1] defaults), overridable by `.meta({ mergeStrategy })`.

**API shape (TypeScript, headless — emits config objects, never DOM):**

```ts
type MergeStrategy = 'replace' | 'deepMerge' | 'append' | { mergeByKey: string };
type ConflictMode  = 'priority' | 'interactive' | 'threeWay';

interface Layer {
  scope: string;                         // 'preset' | 'profile' | 'workspace' | ...
  values: MergePatch;                    // RFC 7386 sparse doc; UNSET sentinel, not null
  meta?: { label?: string; source?: string };
}

interface Provenance {
  winningScope: string;
  shadowed: Array<{ scope: string; value: unknown }>;  // honest, inspectable
  reset?: boolean;
}

interface ResolveResult {
  effective: Record<string, unknown>;
  provenance: Record<string /*dotted key*/, Provenance>;
  conflicts: Array<{ key: string; prior: unknown; incoming: unknown; scope: string }>;
}

interface ResolveOptions {
  scopeOrder: string[];                  // low -> high precedence (the ordered scope list)
  strategyFor?: (key: string, zType: unknown) => MergeStrategy;  // type-directed override
  conflictMode?: ConflictMode;
  managedScopes?: string[];              // non-overridable (policy/!important analogue)
}

declare function resolve(
  background: Record<string, unknown>,   // defaults OR current active state
  layers: Layer[],
  options: ResolveOptions,
): ResolveResult;

// Companion: serialize a delta for history/undo as RFC 6902
declare function diffToJsonPatch(before: object, after: object): JsonPatchOp[];
```

**Why this shape (synthesis):**
- **Sparse `MergePatch` layers** (RFC 7386 [1]) keep layers as intent, not snapshots (§2).
- **Ordered `scopeOrder` + `managedScopes`** reproduces CSS origin/importance banding [6] and VS Code Policy [7] without per-key precedence sprawl.
- **`strategyFor(key, zType)`** is the NixOS type-directed merge [10] expressed against the Zod SSOT — convention-over-configuration with a `.meta()` escape hatch.
- **`provenance` on every effective value** ("winning scope + shadowed layers") is the *effective value + provenance* vocabulary pairing, and turns silent precedence into an inspectable, debuggable, UI-renderable artifact (the "why is this value X?" affordance).
- **`conflicts` report + `conflictMode`** covers automatic (priority), interactive, and (reserved) three-way [14] resolution.
- **`diffToJsonPatch`** keeps the reversible audit/undo trail in RFC 6902 [2], separate from the applied layer.

---

## 7. KEEP vs AVOID (for a schema-driven headless TS library)

**KEEP**
1. One primitive — the **sparse layer** — with profile/preset/shareable-config as *roles* in scope ordering.
2. **RFC 7386** semantics as the internal layer shape (recurse objects, replace scalars/arrays) [1].
3. **Type-directed merge strategy** table driven by Zod type + `.meta()` (NixOS pattern) [10].
4. **Ordered, named scopes (≤7 bands)** with a non-overridable `policy`/managed band [6],[7].
5. **Provenance** (winning + shadowed) attached to every effective value [7].
6. **RFC 6902** patches for history/audit/undo, generated as a diff on apply [2].

**AVOID**
1. **`null`-as-delete ambiguity** — use an explicit `UNSET` sentinel (avoid the RFC 7386 [1] / Helm [4] footgun).
2. **Deep-merging arrays by default** — replace them (VS Code [7] / RFC 7386 [1] behavior); opt into `append`/`mergeByKey`.
3. **Full snapshots as the layer unit** — they freeze upstream defaults (§2).
4. **Three-way auto-merge as the default** for live config — false conflicts; reserve for profile reconciliation [14].
5. **Too many precedence bands** (Ansible's 22) — unreasonable to predict [12].
6. **Hardcoding "always deep-merge"** — strategy must be per-key/per-type.

---

## Open / Unverified

- DTCG Resolver Module is a **2025.10 draft**; the `$extends`/mode-composition details should be re-checked before depending on them [8].
- Exact `null` behavior of any chosen JS merge-patch library should be unit-tested against RFC 7386 §1 examples [1] (libraries diverge).

---

## References

1. [RFC 7386 — JSON Merge Patch (IETF)](https://www.rfc-editor.org/rfc/rfc7386)
2. [RFC 6902 — JavaScript Object Notation (JSON) Patch (IETF)](https://datatracker.ietf.org/doc/html/rfc6902)
3. [Kustomize — patchesStrategicMerge / Strategic Merge Patch (SIG CLI docs)](https://kubectl.docs.kubernetes.io/references/kustomize/kustomization/patchesstrategicmerge/) and [kustomize inlinePatch example (source)](https://github.com/kubernetes-sigs/kustomize/blob/master/examples/inlinePatch.md)
4. [Helm — Values Files & merging behavior (official docs)](https://helm.sh/docs/chart_template_guide/values_files/) and [helm/helm issue #5274 — null override merge](https://github.com/helm/helm/issues/5274)
5. [Spring Boot — Externalized Configuration & Profiles (official reference)](https://docs.spring.io/spring-boot/docs/1.5.22.RELEASE/reference/html/boot-features-external-config.html)
6. [MDN — Introduction to the CSS cascade](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascade/Cascade)
7. [VS Code — User and workspace settings (precedence, object vs array merge)](https://code.visualstudio.com/docs/configure/settings)
8. [W3C Design Tokens Format Module 2025.10](https://www.designtokens.org/tr/drafts/format/) and [Design Tokens Resolver Module](https://www.designtokens.org/tr/drafts/resolver/)
9. [ESLint — Configuration Files (flat config, last-wins, extends)](https://eslint.org/docs/latest/use/configure/configuration-files) and [Share Configurations](https://eslint.org/docs/latest/extend/shareable-configs)
10. [NixOS Manual — Option Definitions (mkDefault/mkForce/mkMerge, priorities)](https://nlewo.github.io/nixos-manual-sphinx/development/option-def.xml.html)
11. [nixpkgs/lib/modules.nix (source — type-directed merge engine)](https://github.com/NixOS/nixpkgs/blob/master/lib/modules.nix)
12. [Ansible — Understanding variable precedence (official docs)](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_variables.html)
13. [EditorConfig Specification 0.17.2](https://spec.editorconfig.org/index.html)
14. [Git — merge-strategies (three-way / ours / theirs / base)](https://git-scm.com/docs/merge-strategies) and [Git's diff3 conflict style](https://medium.com/codex/gits-diff3-conflict-style-and-how-to-use-it-91132a040837)
