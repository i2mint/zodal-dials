---
name: settings-ux
description: Use to answer questions about BEST PRACTICES and STATE-OF-THE-ART for COMPLEX SETTINGS / configuration / preferences UX — how to keep large settings surfaces from overwhelming users; how to organize (grouping vs faceting/tagging, trees as projections), disclose progressively, search (scoped + semantic), show provenance ("where did this value come from"), support reusable profiles/presets, validate cross-field combinations, and handle live-apply vs requires-restart. Triggers on "best practice for settings UX", "how do other apps / VS Code / Figma handle settings", "state of the art for complex settings/preferences", "how should I organize hundreds of settings", "settings search / faceting / progressive disclosure / provenance / presets". Grounds answers in the zodal-dials research corpus (cited); points to the dials-ux-advisor agent for deep/fresh research.
metadata:
  audience: developers
---

# settings-ux · best practices & state of the art for complex settings UX

A curated, cited advisor for designing settings/configuration/preferences surfaces that scale from a
handful to thousands of parameters. Grounded in the zodal-dials research corpus (`docs/research/`) —
open the cited file for the primary sources. For a deep or *fresh* (current SOTA) answer, spawn the
**`dials-ux-advisor`** agent (`.claude/agents/dials-ux-advisor.md`); it reads the corpus + does new
web research and replies with Vancouver citations.

> **How to use:** when asked a settings-UX question, answer from the patterns below, cite the corpus
> file, and — if the question needs depth, current tools, or sources beyond the corpus — delegate to
> `dials-ux-advisor`.

## The corpus (where the cited evidence lives)
- `docs/research/raw/01-settings-ux.md` — the settings-UX survey (disclosure, faceting, search, modified/reset/diff, restart) · NN/g, Material/Carbon/Fluent, VS Code.
- `docs/research/raw/02B-organization-faceting.md` — organization: tree vs facets, multi-membership.
- `docs/research/raw/02F-search.md` — settings search (scoped keyword → semantic).
- `docs/research/raw/02E-validation-defaults-constraints.md` — cross-field constraints + smart defaults.
- `docs/research/raw/03A-vscode.md` · `03B`(GSettings/NixOS/Spring) · `03C`(Kustomize/Helm/Sourcegraph) · `03D`(JetBrains/Chrome/Firefox/Figma/Storybook) — case studies.
- `docs/research/raw/04-synthesis.md` — per-dimension recommended model + the single best prior-art analog (the arbiter).
- `docs/research/raw/00-terminology.md` — cited vocabulary; `docs/research_guide.md` — the routing index.

## Best practices, by the question a designer actually asks

**"How do I keep a large settings surface from overwhelming users?"**
Progressive disclosure (NN/g): show essentials first, defer the rest — but model "advanced" as a
*facet/tag*, not a hidden second screen, so it can still be searched and surfaced. Two disclosure
levels max. Treat settings as a *searchable database*, not a long scroll. → `01-settings-ux.md`.

**"How do I organize them?"**
Prefer **faceted classification** (multi-membership tags) over a single tree — a setting can belong
to several groups; a tree is just one *projection* of a facet. Keep the keyspace flat (dotted keys)
and the grouping in a *separate* layer, so reorganizing never touches the schema. The same group
model should drive *both* "open a panel" (router) and "expand in place" (accordion) — both are the
one affordance "reveal more/less of this group". Best exemplar: VS Code's flat tagged registry
projected as a ToC tree **and** `@`-filters. → `02B`, `04-synthesis §B`, `03A`.

**"How do users find a setting?"**
Two-tier search (VS Code): fuzzy free-text over a declared indexable surface (key/title/description/
enum labels/tags) **plus** scoped `@`-filters (`@modified`, `@tag:`, …). Make *which* metadata is
searched configurable. Extend to semantic/embedding search behind a pluggable provider — never a hard
dependency, never cloud-only. → `02F`, `04-synthesis §F`.

**"How do I show users where a value came from?"**
Provenance/explainability is the deliberate state-of-the-art differentiator — almost no app does it
well. For each effective value show the winning scope + what it shadowed + a managed/policy lock
(VS Code's "Modified elsewhere"; CFPreferences `Forced`; `git config --show-origin`). → `04-synthesis §D/§K`.

**"How do I let users save & reuse configurations?"**
Named **profiles** (full, user-selectable) and **presets** (curated, shippable bases), as **sparse**
overrides (a profile *is* a diff), composed by a cascade with a declared merge strategy. Sparse beats
full snapshots (intent-preserving, auditable, composable). Exemplars: CMake presets, ESLint extends,
Figma variable *modes*, NixOS module merge. → `04-synthesis §C`, `03D`.

**"How do I express rules between settings (valid combinations, smart defaults)?"**
One model — a *relation over fields*, evaluated either to VALIDATE (hard constraint) or SUGGEST
(soft/dependent default). Show errors at the field with both keys highlighted (NixOS
`assertions`/`warnings`). Soft defaults are advisory and *sticky* once the user overrides them.
Beyond simple rules it's a feature model (CSP/SAT) — keep the door open, don't bundle a solver.
→ `02E`, `04-synthesis §E/§N`.

**"Apply immediately, or on save / restart?"**
Per-setting `saveMode: live | explicit` + `requiresRestart`; derive the save UX and the
dirty-navigation guard from those. Surface dirty state, reset-to-default (remove the override so a
lower scope re-wins), and a diff/preview. Sensitive fields confirm even when the rest autosaves.
→ `01-settings-ux.md §H`, `04-synthesis §H`.

**"Type → control?"**
Map by semantic type (bool→switch, enum→radio/select, bounded number→slider, color/keybinding/path→
specialized), distinguish *organizational* nesting (facets) from *value* nesting (an irreducible
object → recurse or a raw-JSON fallback that says *why*). Exemplar: RJSF/JSON Forms uiSchema split,
Home Assistant selectors. → `02H-types-to-widgets.md`, `04-synthesis §J`.

## Anti-patterns (avoid)
A single mandatory tree; encoding grouping in the schema; a long unsearchable scroll; provenance as a
debug afterthought; full-snapshot presets; `null`-as-delete; one global save model; toggles for
non-binary/deferred settings; secrets shown or persisted in plaintext; a hidden "advanced" screen
search can't reach. → decision table in `docs/research/README.md`.

## When to escalate to the `dials-ux-advisor` agent
Spawn it for: a deep/structured answer; *current* SOTA or tools beyond the corpus (it does fresh web
research); a comparison across several products; or a cited write-up. It returns Vancouver-style
references with hyperlinks.
