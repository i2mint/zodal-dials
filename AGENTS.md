# zodal-dials — Agent Dev Guide

> **Stage:** **active development — Horizons 1–2 + first satellites built.** 7 packages on `main`,
> composing end-to-end (`tests/integration/`), ~265 tests, nothing published. Built: `@zodal/dials-core`
> (cascade keystone), `@zodal/dials-ui` (headless layer + reactive `createSettingsStore`),
> `@zodal/dials-ui-vanilla` + `@zodal/dials-ui-shadcn` (renderers), `@zodal/dials-store-env` +
> `@zodal/dials-store-jsonc` (stores), `@zodal/dials-codegen` (JSON Schema / `toPrompt` / CLI). Both
> flagship gates green. See [`docs/dev-plan.md`](docs/dev-plan.md) for status + far horizon, and
> **[`docs/lessons-from-the-build.md`](docs/lessons-from-the-build.md) for the gotchas the adversarial
> reviews caught — read it before touching secrets, patches, or the cascade.**

This file is the **index/map** for agents developing zodal-dials — it routes you to the skill or
doc you need. It is *not* the content store: behavioral rules live here and in skills; context and
decisions live in named docs referenced from them. (Placement test: *"if I deleted this sentence,
would behavior change? If not, it belongs in a file."*)

> **Why AGENTS.md + a pointer CLAUDE.md?** `AGENTS.md` is the agent-agnostic home for these
> instructions; [`.claude/CLAUDE.md`](.claude/CLAUDE.md) is a thin pointer to it so Claude Code picks
> it up too. Edit **this** file; never duplicate content into the pointer.

## What zodal-dials is

The **settings / configuration / preferences specialization of `zodal`**: declare a system's
parameters once (Zod v4), then map those affordances — many ways, against many targets — to a typed
**cascade** (effective value + provenance), validation, headless UI configuration, file round-trip,
and AI/codegen. Three layers: **Model → Affordances → Targets**. It **wraps** zodal and best-of-breed
tools (TanStack, Zustand, shadcn, MiniSearch, jsonc-parser); it rebuilds nothing. See
[`docs/zodal-dials-concept.md`](docs/zodal-dials-concept.md).

It is part of the `_zodals` ecosystem — read the workspace guide at `_zodals/.claude/CLAUDE.md`, the
zodal architecture at `_zodals/zodal/.claude/CLAUDE.md`, and the precedent specialization
`_zodals/zodal-graphs/` for the substrate this extends.

## Architecture you must respect (SSOT, open-closed)

1. **A settings document = a degenerate one-item zodal collection.** Reuse `defineCollection`'s
   6-layer inference, `.meta()` affordances, `explain()`, codecs, and the renderer registry — do not
   re-implement them. → skill `zodal-dials-dev-cascade`.
2. **The cascade is the keystone.** Ordered **scopes** (data, not constants) × sparse **layers**,
   merged by RFC 7386 semantics (objects deep-merge; scalars/arrays replace; `UNSET` deletes — never
   raw `null`); type-directed per-key merge strategy (NixOS model); the policy band always wins; and
   **every effective value is paired with provenance**. Provenance/`explain()` is the deliberate
   differentiator — never a debug afterthought. → skill `zodal-dials-dev-cascade`.
3. **Organization is faceted, not a tree.** Facets/tags are the canonical multi-membership grouping;
   a tree is one rendered projection. The gesture (open-a-panel vs expand-in-place) is **not** in the
   model — both are "reveal more/less of this group". → skill `zodal-dials-dev-ui`.
4. **Capability-ranked renderer selection with honest degradation.** Settings testers + PRIORITY
   bands pick a widget per setting; an irreducible nested-object value falls back to a **terminal
   `rawJson`** editor that says *why*. Distinguish *organizational* nesting (facets) from *value*
   nesting (sub-schemas). Mirrors zodal's `RendererRegistry` exactly. → skill `zodal-dials-dev-ui`.
5. **Secrets reuse the content/metadata bifurcation.** A `sensitivity` field role routes secret
   values to a separate secret backend via a `createBifurcatedProvider`-style composition, returning
   a masked **`SecretRef`**, never plaintext. → skill `zodal-dials-dev-cascade`.
6. **Monorepo, many lightweight packages.** Develop all in-house in one monorepo; publish each as a
   tree-shakeable `@zodal/dials-*` package. → skill `zodal-dials-dev-monorepo`.
7. **Wrap, don't rebuild.** The genuinely-new modules are the cascade/provenance engine and the
   constraint+dependent-default evaluator; everything else is configured zodal + best-of-breed libs.

## Zod v4 gotchas (apply everywhere)

- Pin **`zod` ≥ 4.1.13**. Use `z.discriminatedUnion` for tagged unions (→ `oneOf`).
- `z.toJSONSchema()` throws on unrepresentable types — keep emitted schemas in the representable subset.
- **Register-before-wrap:** `.meta()` returns a NEW instance; register on the inner schema via the
  affordance registry (WeakMap, object identity) before `.optional()/.array()/…`.
- Read internals via `schema._zod.def` (not `.shape`/`._def`). `.meta()` with no args reads metadata.

## Dev skills (read the one that matches your task)

Skills live in repo-root `skills/<name>/` and are symlinked into `.claude/skills/`. Invoke as
`/zodal-dials-dev-<name>`.

| Task | Skill |
|---|---|
| Core model / `defineDials` / **cascade / merge / provenance** / constraints / dependent defaults / secrets / lifecycle / codecs | `zodal-dials-dev-cascade` |
| Headless UI / settings renderer registry / testers + widgets / facet→group projection / **search** / dirty-save events | `zodal-dials-dev-ui` |
| Repo structure / adding a package / build / **npm publish & CI** | `zodal-dials-dev-monorepo` |
| Finding the right research doc / "what did we decide for X" | `zodal-dials-dev-research-lookup` |

Each skill **routes the task-specific research docs into itself** — open the skill, not the whole
`docs/research/` tree. The routing index is [`docs/research_guide.md`](docs/research_guide.md); the
consolidated decision table is [`docs/research/README.md`](docs/research/README.md).

## Agents (spawned roles)

Reusable subagent definitions live in [`.claude/agents/`](.claude/agents/). Use an **agent** (not a
skill) for a self-contained role you spawn repeatedly:

| Role | Agent | When |
|---|---|---|
| Adversarial checkpoint review | `dials-checkpoint-critic` | Before opening a PR for any Horizon checkpoint — it tries to break the cascade/provenance and secret-leak guarantees. |

## The skill-maintenance loop (keep doing this — skills & agents are DYNAMIC)

The dev toolkit is a set of **living artifacts**, not write-once docs. Every session that develops
zodal-dials keeps the toolkit in sync with the plan and the build:

- **Create** a new `zodal-dials-dev-<topic>` skill (or a `.claude/agents/<role>` agent) when a
  recurring task emerges that isn't covered above (author with `skill-creator`; follow
  `dev-skills-workflow`).
- **Revise** a skill/agent the moment the code it describes changes — in the *same* change. Toolkit
  hygiene is part of the work.
- **Prune** an obsolete skill with a reversible marker: add `metadata.delete-after: <milestone>` to
  its frontmatter, then remove it once the milestone passes (`rg -l 'delete-after:' -g SKILL.md`).
  Mark, don't hard-delete unilaterally.
- **Verify discoverability** after adding the first skill in a *new* `.claude/skills/` dir: it only
  becomes invocable as `/zodal-dials-dev-<name>` after a **session restart** (a newly created
  `.claude/skills/` isn't watched until restart; edits inside an already-watched dir hot-reload).
- Keep **this AGENTS.md** as the map: route new task-specific docs *into* the skill that needs them;
  add a row to the skills/agents tables for each new one; don't dump content here.

When the plan (`docs/dev-plan.md`) and the toolkit disagree, reconcile them — they evolve hand-in-hand.

## Working conventions (from the zodal ecosystem)

- **Factory functions, never classes.** Headless: emit plain config objects, never DOM.
- Every module opens with a top-level docstring (auto-extracted for docs).
- ESM `.js` extensions on all internal imports; `import type` for type-only.
- **Branch discipline:** work on a branch; report the current branch at the start of work; switch
  back to the original branch when done unless told otherwise. Use a worktree when parallelizing.
- **Never publish to npm from your machine.** Publishing is CI-driven (`[publish]` commit marker on
  `main`) and gated on the owner's explicit approval for the first publish.
- **Privacy:** never write absolute local paths, secrets, or machine names into committed files,
  issues, PRs, or commit messages.

## Key docs

- [`docs/dev-plan.md`](docs/dev-plan.md) — the phased, horizon-graded development plan (living).
- [`docs/lessons-from-the-build.md`](docs/lessons-from-the-build.md) — gotchas the adversarial reviews
  caught (secrets, patches, UI, store, codegen). **Read before re-touching those areas.**
- [`docs/zodal-dials-concept.md`](docs/zodal-dials-concept.md) — design intent & vocabulary.
- [`docs/research_guide.md`](docs/research_guide.md) — routing index for the research corpus.
- [`docs/research/README.md`](docs/research/README.md) — the consolidated KEEP/AVOID decision table.
- [`docs/research/raw/04-synthesis.md`](docs/research/raw/04-synthesis.md) — the full evidentiary synthesis.
