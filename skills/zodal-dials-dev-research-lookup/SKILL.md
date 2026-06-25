---
name: zodal-dials-dev-research-lookup
description: Use when you need to find WHICH zodal-dials research doc answers a question, or what was already decided for a settings concern — before reading or re-litigating a decision. Triggers on "what did we pick for X", "which research doc covers Y", "why did we choose Z", "is this decided", and on merge/cascade/provenance/scopes/facets/search/secrets/constraints/widgets/migration/codecs questions. Triggers on "where is this in the research", "did we already decide". Points to research_guide.md and the decision table so you open the one right doc, not all of them.
metadata:
  audience: developers
---

# zodal-dials · research lookup

The design corpus is large (~400 KB across 18 files: terminology + UX + eight dimension reports +
four prior-art case studies + the synthesis + two grounding docs). **Don't read it all.** This
skill routes you to the one right document.

The project has moved from design phase to active development (Horizons 1–2 built, packages merged
on `main`), so the research corpus is now the **rationale behind shipped code** — and increasingly
"what did we decide for X?" means a *build lesson*, recorded in
[`docs/lessons-from-the-build.md`](../../docs/lessons-from-the-build.md), not just a research finding.

## Three entry points (use these first)

1. **[`docs/research_guide.md`](../../docs/research_guide.md)** — the routing index: `file → what
   it answers → dimension(s) A–P → owning skill`, plus a **"common questions → open this file"**
   lookup and the list of decisions still open. **This is your map.**
2. **[`docs/research/README.md`](../../docs/research/README.md)** — the **money summary**: the
   consolidated **KEEP/AVOID decision table** across dimensions A–P, the best prior-art analog per
   dimension, and a one-line index of every file. Answers "what did we decide for X?" at a glance.
3. **[`docs/research/raw/04-synthesis.md`](../../docs/research/raw/04-synthesis.md)** — **THE
   ARBITER.** The consolidating SSOT (vocabulary §1, per-dimension model + analog §2, architecture
   §3, KEEP/AVOID §4, open questions §5). Open it when the table/guide isn't deep enough.
4. **[`docs/dev-plan.md`](../../docs/dev-plan.md) §Status** — **what is BUILT vs far-horizon.** The
   project is in active development (Horizons 1–2 + first satellites merged); open this to know
   whether a concern is already shipped, in flight, or still on the far horizon.
5. **[`docs/lessons-from-the-build.md`](../../docs/lessons-from-the-build.md)** — **the gotchas &
   decisions the adversarial reviews settled during the build.** A secrets/merge/UI/provenance
   "what did we decide for X?" increasingly has its answer here (a build lesson + its regression
   test), not only in the research.

## The 30-second crosswalk

| Question | File |
|---|---|
| How do partial layers merge? | `raw/02C` + synthesis §C |
| Reset-to-lower-scope / deletion (`UNSET`)? | `raw/02C §2` + synthesis §C + dev-plan §8(3) |
| Effective value + provenance resolution? | `raw/02D` + synthesis §D |
| How are secrets handled? | `raw/02G §I` + `raw/05a §3` + synthesis §I |
| Which search engine? | `raw/02F` + synthesis §F |
| Constraints + dependent defaults? | `raw/02E` + synthesis §E |
| Facets vs tree / panel vs accordion? | `raw/02B` (+ `raw/01`) + synthesis §B |
| Nested-object value → widget? | `raw/02H` + synthesis §J |
| Key identity / rename / migrate? | `raw/02G §1–2` + synthesis §G |
| File round-trip / env / JSON Schema? | `raw/02G §L` + synthesis §L |
| What to reuse from zodal? | `raw/05a` + synthesis §3 |

## The rules of the corpus

- **The synthesis is the arbiter.** Where a dimension report (`02*`/`03*`) and the substrate notes
  (`05a`) conflict, **`raw/04-synthesis.md` supersedes both** — grounded-substrate wins on
  integration, a survey wins only on a concrete external fact. Don't re-derive a decision from a
  single report when the synthesis has ruled.
- **Dimension letters differ.** The synthesis uses canonical **A–P** letters; the raw `02A`–`02H`
  filenames use the *original prompt* letters and do **not** line up 1:1. Trust the A–P letters in
  the guide/README when cross-referencing.
- **`dev-plan.md §8` records baked-in vs open.** If the table names a decision, it's decided —
  build on it. The only genuinely open choices (flat keyspace, hard-constraint home, `UNSET`
  surface, secret backend, codec home, solver scope) are listed there with a working default, so
  building is never blocked. Everything else: proceed.

## Maintenance

This skill is a thin pointer — it should rarely change. If the *set* of research docs changes,
update the crosswalk here, the index in `docs/research_guide.md`, and the file index in
`docs/research/README.md` together.
