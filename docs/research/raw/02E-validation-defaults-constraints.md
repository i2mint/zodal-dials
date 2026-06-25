# 02E — Inter-Field Constraints & Dependent Defaults

Research for **zodal-settings**. Scope: cross-field (hard) validation, dependent/soft defaults, and scaling to configurator-grade variability via feature models / constraint solving. Concludes with **one unifying model**: *relations among field values — hard or soft — evaluated either to VALIDATE or to SUGGEST*.

Terminology follows the project glossary (Setting, Schema, Constraint (hard), Dependent default (soft), Effective value, Cascade, Affordance).

---

## TL;DR

- A **hard constraint** is a cross-field rule that makes a *combination* invalid; a **dependent (soft) default** is an advisory computed value derived from other fields that the user may override. They are the same primitive — a *relation over field values* — differing only in **outcome** (reject vs. suggest) and **bindingness**.
- Three industry idioms encode hard constraints declaratively: **JSON Schema** (`dependentRequired`, `dependentSchemas`, `if`/`then`/`else`, `allOf`/`anyOf`/`oneOf`) [1][2][3]; **Zod** (`.refine`/`.superRefine`/`.check`, optionally over `z.discriminatedUnion`) [4][5]; **Yup** (`.when(...)` with `is`/`then`/`otherwise`) [6]. RJSF/JSON Forms layer reactive re-validation on top [7].
- For **defaults**, Zod v4 cleanly separates `.default()` (post-parse, output-typed, short-circuits) from `.prefault()` (pre-parse, input-typed, runs the pipeline) [4][8]. Neither is a *function of other fields* — dependent defaults need a **derive step** outside the per-field schema, run on dependency change, with **override stickiness** (don't clobber user edits) [9][10].
- At scale, settings spaces become **feature models** (FODA) with mandatory/optional/alternative/or groups plus **cross-tree constraints** (`requires`/`excludes`) reducible to propositional logic and handed to **SAT/CSP/BDD solvers** for consistency, dead-feature, and "valid?"/"complete me" queries [11][12][13][14]. JS options exist (`logic-solver`/MiniSat, `json-rules-engine`, `csp.js`) but a solver is overkill until constraints become a genuine combinatorial web [15][16].
- **KEEP**: a declarative relation IR (predicate + scope + severity + target), Zod refinements as the runtime, discriminated unions for branchy shapes, `.prefault`/`.default` for static defaults, a separate derive layer for dependent defaults, honest "could be solver-fed" constraint export. **AVOID**: shipping a SAT solver by default, encoding soft defaults as hard `default()`, relying on Zod's "refine runs only after object passes" ordering for field-level UX.

---

## Part 1 — Hard constraints (cross-field validation)

A hard constraint is a predicate over **two or more** setting values whose failure marks the *combination* invalid (glossary: *Constraint (hard)*). The recurring sub-patterns are **co-occurrence / requires** (A present ⇒ B required), **mutual exclusion / excludes** (A ⇒ not B), **conditional shape** (if A=x then B must match subschema), and **comparison** (start ≤ end, sum ≤ budget).

### JSON Schema — the canonical declarative vocabulary

JSON Schema (Draft 2019-09+/2020-12) is the most widely-deployed *declarative* form of cross-field rules and is worth mirroring conceptually [1][3]:

- **`dependentRequired`**: maps a property to an array of properties that become **required** when it is present — e.g. `{ "dependentRequired": { "credit_card": ["billing_address"] } }`. Dependencies are **unidirectional** [1][2]. This is exactly *co-occurrence / requires*.
- **`dependentSchemas`**: applies a whole subschema when a property is present, "in the same way `allOf` applies schemas" [3]. More expressive than `dependentRequired`.
- **`if` / `then` / `else`**: if `if` validates, `then` must validate; else `else` must validate [1]. The classic example switches `postal_code` pattern on `country`. To scale past two branches, wrap pairs in `allOf` [1].
- **`allOf` / `anyOf` / `oneOf`**: boolean composition; `oneOf` = exactly-one (mutual exclusion), `anyOf` = at-least-one, `allOf` = conjunction.
- Pre-Draft-7, all of this was the single `dependencies` keyword, split into `dependentRequired`/`dependentSchemas` in 2019-09 [1]. **Implication** `A → B` is encoded as `!A ∨ B` via `anyOf`+`not` [1] — the same propositional shape used by feature-model solvers (Part 3), which is the bridge between the validation and variability worlds.

*Synthesis:* JSON Schema is the right **mental model / interchange target** for zodal-settings' constraint IR (it's solver-translatable and tool-ubiquitous), but its conditional keywords are clumsy to author and read by hand — confirmed by recurring community confusion about `if`/`then` + `required` [7]. zodal already treats Zod as SSOT, so the recommendation is to *author* in Zod and be able to *emit* JSON-Schema-shaped constraints.

### Zod — the runtime mechanism (zodal's SSOT)

Zod v4 provides three escalating tools [4][5]:

- **`.refine(pred, opts)`** — one custom issue; good for simple binary checks (`data.end >= data.start`).
- **`.superRefine((val, ctx) => …)`** — multiple issues, arbitrary `ctx.addIssue({ code, path, message })`; **attach the error to a specific field** via `path`, which matters for settings UIs that highlight the offending control [4][5].
- **`.check(...)`** — lower-level, performance-oriented successor in v4 [4].

**Continuability:** by default refinements are *continuable* — Zod runs all checks and surfaces every error; mark one `abort: true` to stop the chain [4]. Useful so one violated constraint doesn't suppress others in a settings panel.

**Critical ordering gotcha:** object-level `.refine`/`.superRefine` run **only after the inner `z.object()` fields validate** [5][17]. For a settings form this means a cross-field error can be *invisible* until unrelated required fields are filled — bad UX. Documented workarounds: (a) put the constrained fields in their own `z.object()` and `intersection`/merge with the refined object [5]; (b) prefer **`z.discriminatedUnion('mode', [...])`** when a discriminator field branches the whole shape — this validates all branches "simultaneously" with better type-narrowing than chained refines [17].

### Yup — `.when()` and reactive triggering

Yup expresses dependencies with **`.when(dep, { is, then, otherwise })`**, switching a field's schema on another field's value [6]. Two operational notes transferable to zodal: **reactive forms must re-trigger** dependent fields when the dependency changes (RHF `trigger`) [6], and **circular** `.when` chains require `Yup.lazy()` to defer schema construction [6]. The reactive-trigger requirement is the key headless lesson: a constraint graph implies a *dependency graph* that the state layer must walk on change.

### Reactive / dependent form validation (RJSF, JSON Forms)

RJSF builds forms from JSON Schema and supports **dependencies** (still honoring the removed `dependencies` keyword) plus `oneOf`-driven follow-up questions; **uiSchema** is the separate presentation-hints layer (zodal's *uiSchema-equivalent*) — "JSON Schema controls *what*, uiSchema controls *how*" [7]. The reusable idea: **schema → live form with re-validation on dependency change**, presentation kept orthogonal — directly aligned with zodal's headless/affordance split.

---

## Part 2 — Soft / dependent defaults

Glossary: a **dependent default (soft)** is "an advisory computed default derived from other fields, overridable." The canonical phrasing — *"C is usually near f(A,B) but any C is still valid"* — is precisely a **default**, not a constraint: it changes the *suggested* effective value, never *validity*.

### Static defaults: `.default()` vs `.prefault()` (Zod v4)

Zod v4 cleanly distinguishes two static-default semantics [4][8]:

- **`.default(value)`** — short-circuits: if input is `undefined`, returns `value` immediately; `value` must match the **output** type [4].
- **`.prefault(value)`** — does **not** short-circuit: runs `value` *through* the schema pipeline (transforms, checks); must match the **input** type [4][8]. (There is a known wrinkle: `.prefault()` + `.check()` behave inconsistently once wrapped in `z.object()` — flag/verify before relying on it [8].)

`.catch(value)` is the sibling for "on validation error, fall back to this" [8]. None of these is a *function of other fields*.

### Why dependent defaults live outside the per-field schema

Zod defaults are evaluated per-field with no access to sibling values, so **dependent defaults must be a separate derive step** — a pure function `derive(currentValues) -> partialSuggestion` run by the state/UI layer whenever a dependency changes. *Synthesis / design stance:*

1. **Default FUNCTION vs static default.** Model a dependent default as a `derive` callback keyed by its **input dependencies** (so the state layer knows when to recompute) — analogous to a memoized selector. A static default is the degenerate case (no dependencies). This keeps Zod the type SSOT while the *value-suggestion* logic is a sibling concern.
2. **When defaults recompute.** Recompute on change of any dependency **only while the target is non-dirty** (still at its suggested value). This is the **override-stickiness** rule (glossary: *dirty state*).
3. **Override stickiness.** UX research: <5% of users change defaults, so a default that silently overwrites an edit is a serious violation [9]. A higher-priority overlay's non-NULL value overrides; NULL/absent leaves the prior value intact [10] — the same precedence logic as zodal's **cascade** (a soft default is just the lowest-precedence *suggested* layer). Always provide a visible "reset to suggested/default" affordance [9].
4. **Provenance.** A suggested value should carry provenance ("suggested, derived from A,B") so the UI can show it as advisory and distinguish it from an explicit user choice — mirroring zodal-settings' *effective value + provenance* pairing.

This maps the soft-default problem onto machinery zodal-settings *already needs*: the cascade, dirty tracking, and provenance. A dependent default is "a derived candidate layer that sits below the user layer and is shadowed the moment the user edits."

### Hard vs soft, restated

- **Hard / constraint** → `Zod refine/superRefine` (or JSON-Schema-shaped IR) → outcome = **reject + error on a field path** (glossary *Constraint*).
- **Soft / dependent default** → `derive(values)` selector + cascade overlay → outcome = **non-binding suggestion**, overridable, sticky once dirty (glossary *Dependent default*).

There is a useful middle band — **advisory validations / warnings** (valid but discouraged: "C far from f(A,B)") — emit as `superRefine` issues at a *warning* severity rather than blocking submit.

---

## Part 3 — At scale: feature models, variability, solvers

When inter-setting relations form a **combinatorial web** (dozens of interacting toggles, alternatives, requires/excludes), ad-hoc `refine` chains stop scaling and the academic frame is **feature modeling / variability modeling** (glossary: *Feature model / variability modeling*).

### Feature models (FODA) and cross-tree constraints

Introduced by Kang et al. in the 1990 SEI **Feature-Oriented Domain Analysis (FODA)** report, a **feature model** is a tree of features with relations **mandatory / optional / alternative (XOR) / or-group (OR)**, plus **cross-tree constraints** — primarily **`requires`** and **`excludes`**, or arbitrary boolean expressions over features [11][12]. This is the *exact* vocabulary of a settings space: alternative = "exactly one of," or-group = "one or more of," requires/excludes = co-occurrence/mutual-exclusion (Part 1). A **tree is one rendered projection** of the underlying model — matching zodal's *facet/tag* stance that a tree is a projection of a multi-membership grouping.

### From model to solver: propositional logic

A feature model translates to a **propositional formula**; **automated analysis of feature models (AAFM)** then answers: *Is the model consistent? Is any feature dead (never selectable)? Is this configuration valid? How many valid products exist (#SAT)? Given partial choices, complete/propagate.* Benavides, Segura & Ruiz-Cortés's 2010 survey "Automated Analysis of Feature Models 20 Years Later" catalogs these and the three solver families — **SAT, CSP, and BDD** [13][14]. Empirically: **BDDs** can blow up in memory on large models; **SAT** gives strong runtime; **CSP** handles richer attributes/numerics [13][14]. **FeatureIDE** ships this in practice, translating models to logic and using **Sat4j** / a JS-compiled **MiniSat** for (de)activation propagation and config counting [11]. **Product configurators** (e.g. constraint-based interactive configurators) are the commercial incarnation of the same idea — interactive propagation of `requires`/`excludes` as the user selects [16].

### When a settings system actually needs a solver

*Synthesis / decision rule:*

- **Simple rules suffice** when constraints are local, few, and mostly independent — i.e. expressible as a handful of `requires`/`excludes`/comparison predicates with no deep ripple. Evaluate eagerly per change. **This is the default for most settings UIs.**
- **A rules engine** (declarative, persistable, shareable) fits when business logic is volatile and authored by non-devs: **`json-rules-engine`** (facts + nested `all`/`any` conditions + operators + prioritized events; ~17 kB, no `eval`, isomorphic) [15], or **JSON Logic / json-logic-engine** (lisp-ish, compilable, front/back-end shareable) [15]. These **evaluate** rules; they do **not** *solve* (no propagation/consistency proofs).
- **A real solver** is justified only when you need **propagation** ("user picked A, auto-disable incompatible B/C"), **consistency/dead-option detection**, or **completion** ("fill remaining settings to a valid combination"). Then translate constraints to propositional/CSP form and use a JS solver — **`logic-solver`** (MiniSat-in-JS, Boolean SAT), **`csp.js`** (general CSP with solve-process hooks) [15][16].

### Practical recommendation for zodal-settings

Keep the **constraint IR solver-agnostic and propositional-translatable** (mirroring how JSON Schema implication = `!A ∨ B` lines up with feature-model clauses [1][11]). Ship eager rule evaluation by default; expose an **optional adapter** that exports the constraint set to a solver. This realizes the glossary directive: *"express constraints so they COULD be handed to a CSP/SAT solver"* without forcing the dependency on every consumer — true to zodal's *capability-ranked, honest-degradation* philosophy.

---

## The unifying model

> **A relation `R` over a set of setting keys, evaluated to either VALIDATE or SUGGEST.**

| Dimension | Values |
|---|---|
| **Targets** | the dependent key(s) the relation reads from / writes to (its dependency set) |
| **Predicate / expression** | a pure fn of the named values: comparison, `requires`, `excludes`, conditional-shape, or `f(A,B,…)→value` |
| **Mode** | **VALIDATE** (hard / advisory-warn) or **SUGGEST** (dependent default) |
| **Severity / bindingness** | hard error (blocks) · warning (allows) · suggestion (overridable, sticky) |
| **Expression form** | Zod `refine`/`superRefine`/`check`; JSON-Schema `if`/`then`/`dependent*`; rules-engine JSON; feature-model `requires`/`excludes`; derive selector |
| **Execution strategy** | eager per-change (re-validate / re-derive along the dependency graph) · lazy on submit · solver-propagated (consistency/completion) |
| **On result** | VALIDATE → issue at field `path` (block or warn) · SUGGEST → write candidate into the cascade as a shadowable overlay, honoring dirty/stickiness |

The same authored relation thus drives both behaviors: `requires(A,B)` *validates* as a hard constraint and could *suggest* enabling B when A turns on; `f(A,B)` *suggests* a dependent default and could *warn* when the user's value diverges. Hard vs soft is a **mode flag on one primitive**, not two subsystems — and at scale the whole relation set is exactly a feature model exportable to a solver.

---

## References

1. [JSON Schema — Conditional schema validation (if/then/else, dependentRequired, dependentSchemas)](https://json-schema.org/understanding-json-schema/reference/conditionals)
2. [dependentRequired (2020-12) — Learn JSON Schema](https://www.learnjsonschema.com/2020-12/validation/dependentrequired/)
3. [dependentSchemas (2020-12) — Learn JSON Schema](https://www.learnjsonschema.com/2020-12/applicator/dependentschemas/)
4. [Defining schemas — Zod (refine, superRefine, check, default, prefault, abort)](https://zod.dev/api)
5. [Validating Dependent Fields with zod and react-hook-form — Tim James](https://timjames.dev/blog/validating-dependent-fields-with-zod-and-react-hook-form-2fa9)
6. [Conditional validation of form fields using Yup (.when / is / then / otherwise)](https://dev.to/atosh502/conditional-validation-of-form-fields-using-yup-393j)
7. [Dependencies — react-jsonschema-form (RJSF) docs](https://rjsf-team.github.io/react-jsonschema-form/docs/usage/dependencies/)
8. [Default and Prefault Values — colinhacks/zod (DeepWiki)](https://deepwiki.com/colinhacks/zod/4.5-default-and-prefault-values)
9. [The UX of default settings in a product — UX Magazine](https://uxmag.com/articles/the-ux-of-default-settings-in-a-product)
10. [Cascading Settings — GitLab Docs](https://docs.gitlab.com/development/cascading_settings/)
11. [feature-configurator — FeatureIDE models via Logic Solver / MiniSat-JS (GitHub)](https://github.com/ekuiter/feature-configurator)
12. [Feature-Oriented Domain Analysis (FODA) feasibility study — Kang et al., SEI 1990](https://www.researchgate.net/publication/215588323_Feature-Oriented_Domain_Analysis_FODA_feasibility_study)
13. [Automated analysis of feature models 20 years later: A literature review — Benavides, Segura, Ruiz-Cortés](https://www.sciencedirect.com/science/article/abs/pii/S0306437910000025)
14. [Applications of #SAT Solvers on Feature Models — Sundermann (PDF)](https://www.uni-ulm.de/fileadmin/website_uni_ulm/iui.inst.170/publications/2021-VaMoS-Sundermann.pdf)
15. [json-rules-engine — npm](https://www.npmjs.com/package/json-rules-engine)
16. [csp.js — constraint satisfaction problem solver for JS](http://prajitr.github.io/jusCSP/)
17. [How to validate a field conditionally based on another field — colinhacks/zod Discussion #3268](https://github.com/colinhacks/zod/discussions/3268)
