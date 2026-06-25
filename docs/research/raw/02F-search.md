# 02F — Search over Settings (dimension E)

Research on searching/filtering a declared settings surface: scoped keyword
filtering, fuzzy matching, how VSCode / JetBrains / Chrome implement settings
search, client-side search-index libraries (FlexSearch, MiniSearch, Fuse.js,
Orama), and the extension to semantic / embedding search and hybrid retrieval.
Concludes with a recommended architecture: a pluggable **search provider** over
a declared, **indexable metadata surface**.

---

## TL;DR

- Settings search is a **metadata-retrieval** problem, not a value problem. The
  searchable surface is the schema's *metadata* — key (dotted path), title,
  description, enum labels, facet/tag names, default value, group/section —
  exactly the affordance/uiSchema-equivalent layer zodal already declares.
- Production tools split search into two tiers. **VSCode** runs a *local
  keyword/fuzzy* matcher plus a *remote NLP/Bing-powered* natural-language tier,
  and supports `@`-prefixed **scoped filters** (`@modified`, `@id:`, `@ext:`,
  `@feature:`, `@lang:`) [1][2]. **JetBrains** Search Everywhere does substring
  "speed typing" + synonyms, with `/` to scope to settings [3]. Chrome's
  settings page does straightforward substring match over indexed metadata.
- For a headless TS library, the right primitive is a **pluggable
  `SearchProvider` interface** over a **declared indexable metadata surface**,
  with which fields are searched **configurable per provider**. Ship a
  zero-dependency default; allow swapping in MiniSearch/FlexSearch/Orama/Fuse.js.
- **Library pick (SYNTHESIS):** default to **MiniSearch** (tiny, typo-tolerant,
  field-boosting, AND/OR, no deps, good TS) for the built-in adapter; offer an
  **Orama** adapter for teams that want BM25 + facets + **hybrid vector** search
  in one engine [4][5][6]. Reserve **FlexSearch** for very large catalogs and
  **Fuse.js** only for tiny pure-fuzzy command-palette cases.
- **Semantic search** (find-the-setting-that-does-X) is *feasible fully
  in-browser* via **transformers.js** sentence embeddings + cosine similarity;
  best deployed as **hybrid lexical+semantic** with the embedding tier behind an
  optional, lazily-loaded provider [7][8]. KEEP as opt-in; AVOID making it a
  hard dependency.

---

## 1. What is actually searched: the indexable metadata surface

A "setting" search never queries values; it queries the *declaration*. The
canonical searchable fields, all derivable from a Zod v4 schema + `.meta()` +
external registry, are:

| Field | Source | Notes |
|---|---|---|
| `key` (dotted path) | schema structure | high-signal; substring match expected (`editor.` → all under it) [2] |
| `title` / label | `.meta({ title })` / name heuristic | highest boost |
| `description` | `.meta({ description })` | NL search target |
| `enum` value labels | Zod enum + `.meta()` | users search by the option, not the key |
| `facet` / `tag` names | grouping model | multi-membership; doubles as scoped filter |
| `default value` | schema | occasionally searched |
| `group`/`section` | facet projection | scope context |
| synonyms / keywords | `.meta({ keywords })` / registry | explicit alt-words escape hatch |

**Design consequence:** zodal-settings should emit a flat
`IndexableSetting[]` projection (one record per setting key, with the above
fields) as a first-class generator output — the same way it emits column/form
config. This decouples *what is searchable* from *which engine indexes it*.
**Which fields are searched** must be configurable (a `searchableFields` /
field-weights map), because teams differ on whether description/enum text should
count. This mirrors MiniSearch's `fields` + `boost` and Orama's schema. [4][5]

---

## 2. How production tools implement settings search

### 2.1 VSCode — two-tier (local fuzzy + remote NLP)

VSCode's Settings editor combines a **local** matcher with an optional
**remote, Bing-powered natural-language** tier [1].

- **Metadata pipeline:** on each build VSCode exports all configuration to JSON
  capturing "the name, description, type, default value" and enum options; Bing
  also crawls extension `package.json` for their `contributes.configuration`
  metadata. Index updates within minutes of release [1].
- **NLP enrichment (remote):** four pipelines — **alternative words**
  (update/upgrade), **stemmer & speller** (format/formatter/formatted, typos),
  **NLP** (parses "how to disable css validation"), and **feedback/ranking**
  (manual boosts) [1].
- **Quality measurement:** result quality is graded with **NDCG (Normalized
  Discounted Cumulative Gain)**; an automated harness synthesizes queries by
  applying typo/alt-term/NL transforms over every setting, run every 6 hours
  [1][9]. (Useful KEEP: a relevance test harness with graded judgments.)
- **Scoped filters (local):** `@`-prefixed filters compose — `@modified` (differs
  from default), `@id:<exact>`, `@ext:<extId>`, `@feature:<group>`,
  `@lang:<lang>` — and combine (`@modified @ext:vscode.git`). Note: even `@id:`
  does **fuzzy substring** narrowing when not an exact match [2].

**Takeaway:** the "search the metadata" + "scoped facet filters" + "optional
NL/semantic tier" decomposition is exactly the zodal-settings architecture, and
it validates putting NL/semantic behind a provider boundary (it's remote and
optional in VSCode).

### 2.2 JetBrains — Search Everywhere

Substring "speed typing" of fragments, progressive narrowing, and **synonyms**
(typing "toggle presentation mode" surfaces "Enter Presentation Mode"). Typing
`/` scopes results to **settings groups**; options can be toggled inline without
leaving the search popup [3]. Confirms: (a) synonym/alt-word mapping is a
recurring need (an explicit metadata escape hatch), and (b) a sigil to **scope**
the search namespace is a standard affordance.

### 2.3 Chrome

`chrome://settings` performs substring keyword match over its indexed
strings (titles/labels/sublabels) and highlights matches; it is a simpler,
local-only lexical model with no fuzzy/NLP tier. (HARD FACT that it is
substring/highlight based; SYNTHESIS on internals — Chromium source not read
here, flag as unverified at the code level.)

---

## 3. Client-side search-index libraries compared

All four are pure-JS, run in browser/Node, and index a metadata projection.
Numbers below are from a 2026 comparison plus each library's docs; treat the
exact ms/KB figures as indicative, not load-bearing [4][5][6][10].

| | Fuse.js | MiniSearch | FlexSearch | Orama |
|---|---|---|---|---|
| Algorithm | Bitap (approx string) | inverted index + TF/fuzzy | inverted index | BM25 + vector |
| Bundle (approx) | ~4 KB | small, 0 deps | ~6 KB | ~16–22 KB |
| Fuzzy / typo | ✅ core | ✅ (Levenshtein, abs or fractional) | ❌ (prefix/contextual) | ✅ tolerance param |
| Prefix | partial | ✅ (`prefix` bool/fn) | ✅ | ✅ |
| Full-text relevance | ❌ | ✅ (TF-IDF-ish) | ✅ (fastest) | ✅ BM25 |
| Field boosting | weights | ✅ `boost` map | ✅ | ✅ |
| AND/OR combine | n/a | ✅ `combineWith` AND/OR/AND_NOT | ✅ | ✅ |
| Facets/filters | ❌ | manual | ❌ | ✅ built-in |
| Vector/hybrid | ❌ | ❌ | ❌ | ✅ (full/vector/hybrid) |
| TypeScript | ✅ | ✅ | ⚠️ partial | ✅ first-class, schema-inferred |
| Best for | tiny pure-fuzzy / palette | **settings-scale metadata** | very large corpora | facets + hybrid in one |

- **MiniSearch** [4]: fuzzy is a boolean or number — `>=1` is an absolute
  Levenshtein max edit distance; `0<n<1` is a *fraction of term length*. Prefix
  match (`moto`→`motorcycle`), per-field `boost`, `combineWith: 'AND'|'OR'` and
  `AND_NOT`. No deps. Ideal fit for the hundreds-to-low-thousands settings range.
- **FlexSearch** [10]: inverted index, language stemming/stopwords, build-time
  index export; fastest at 100k+ docs but no native fuzzy/typo (uses
  tokenization/prefix). Overkill for typical settings counts; good for giant
  config catalogs.
- **Fuse.js** [6]: zero-config Bitap fuzzy, great for command-palette feel on
  <~10k items, but no real full-text relevance or facets.
- **Orama** [5][11]: schema-first with type inference, BM25, typo tolerance,
  **built-in facets/filters**, and **modes `fulltext` | `vector` | `hybrid`** in
  one engine — the only one of the four with native vector + hybrid.

---

## 4. Semantic / embedding search and hybrid retrieval

### 4.1 In-browser embeddings are viable

**transformers.js** runs sentence-transformer models (e.g.
`all-MiniLM-L6-v2`, 384-dim; or newer `EmbeddingGemma`) fully client-side via
WASM/WebGPU, producing embeddings with no server round-trip [7][8][12]. For a
settings corpus (tens–low-thousands of descriptions) you embed each setting's
`title + description (+ enum labels)` **once**, cache the vectors (localStorage
for small sets, IndexedDB/pglite+pgvector for larger), and at query time embed
the query and rank by **cosine similarity** [7][8]. Demonstrated workloads
(~23k embeddings searched in <2s in-browser) far exceed settings scale [7].

This directly enables the **"find the setting that does X"** use case:
natural-language queries like "stop the editor reformatting my file on save"
match `editor.formatOnSave` even with zero shared keywords — exactly VSCode's
remote NLP tier, but local and dependency-light.

### 4.2 Hybrid lexical + semantic

Pure semantic search underperforms on exact-token queries (a literal key like
`editor.fontSize`); pure lexical misses paraphrases. **Hybrid** runs both and
fuses scores. Orama's hybrid mode runs a full-text *and* a vector search and
exposes **`hybridWeights`** (e.g. `text: 0.7, vector: 0.3`) plus a vector
**`similarity`** threshold (default ~0.8) [5][13]. The generic recipe (engine-
agnostic): normalize each result set's scores, then combine via weighted sum or
**Reciprocal Rank Fusion** — keep this in zodal's own fusion layer so it works
even when the lexical and semantic providers are different engines.

### 4.3 RAG-style answer (out of scope for core, note as extension)

Beyond retrieval, an LLM can take the top-k retrieved settings + their schema
and answer "which setting and what value achieves X". That's a downstream
consumer of the same retrieval surface, not a search-library concern — keep it
as an example/recipe, not core.

---

## 5. Recommended architecture: pluggable SearchProvider over a declared surface

### 5.1 The indexable surface (generator output)

zodal-settings emits, from the schema/affordance layer, an
`IndexableSetting` record per key:

```ts
interface IndexableSetting {
  key: string;            // dotted path, SSOT id
  title?: string;
  description?: string;
  enumLabels?: string[];
  facets?: string[];      // tags — also drive scoped filters
  keywords?: string[];    // synonym/alt-word escape hatch (.meta)
  group?: string;
  defaultValue?: unknown;
}
```

This is the single source the search layer indexes; it is decoupled from any
engine (SSOT, open–closed). **Which fields are searchable and their weights** is
configuration, defaulting to `title`(high) > `key` > `keywords` > `enumLabels` >
`description`.

### 5.2 The provider interface

```ts
interface SearchProvider {
  index(settings: IndexableSetting[], opts?: IndexOptions): void | Promise<void>;
  search(query: string, opts?: QueryOptions): SearchHit[] | Promise<SearchHit[]>;
  capabilities(): {                  // honest capability reporting (zodal rule)
    fuzzy: boolean; prefix: boolean; semantic: boolean;
    hybrid: boolean; facets: boolean; async: boolean;
  };
}
interface SearchHit { key: string; score: number; matches?: FieldMatch[]; }
```

Mirrors zodal's existing factory + honest-capability pattern. Ship adapters:
`createSubstringProvider()` (zero-dep default), `createMiniSearchProvider()`,
`createFlexSearchProvider()`, `createOramaProvider()`, `createFuseProvider()`,
and `createSemanticProvider({ embedder })` (transformers.js). A
`createHybridProvider({ lexical, semantic, weights })` composes a lexical and a
semantic provider with RRF/weighted fusion.

### 5.3 Scoped filtering layer (engine-independent)

Parse `@`/`/`-style scoped filter tokens (`@modified`, `@facet:<tag>`,
`@scope:<name>`, `@managed`, `@dirty`, `@secret`, `@advanced`) **before** the
free-text reaches the provider, applying them as a predicate over the cascade's
effective values + provenance. This is zodal-domain logic (knows about scopes,
dirty state, provenance, sensitivity) and must not live in a generic search
engine — it composes *with* whatever provider is chosen. Facets/tags double as
both search fields and filter scopes (the canonical grouping model).

### 5.4 Async + lazy

The interface allows async `search`/`index` so semantic providers can lazily
load the embedding model in a Web Worker and cache vectors; the default
substring/MiniSearch path stays synchronous and instant. Semantic stays
**opt-in** — never a hard dependency.

---

## 6. KEEP vs AVOID for a schema-driven headless TS library

**KEEP**
- A declared `IndexableSetting[]` surface as a generator output (SSOT, engine-agnostic).
- A `SearchProvider` interface + factory adapters; default = zero-dep substring/MiniSearch.
- Configurable searchable fields + per-field weights (don't hardcode what's searched).
- Engine-independent scoped-filter layer (`@modified`, `@facet:`, `@scope:`, `@secret`…), reusing facets/tags.
- Optional in-browser semantic provider (transformers.js) behind lazy load; hybrid fusion (RRF/weighted) in zodal's own layer.
- An NDCG-style relevance test harness with graded query→setting judgments.

**AVOID**
- Hardcoding one engine into core, or making vector/embeddings a hard dependency.
- Searching setting *values* (search the declaration, not the data) — secrets/sensitivity must be excluded.
- Pure-semantic-only (loses exact-key/token queries) — always offer hybrid/lexical fallback.
- Putting domain filter logic (scopes/dirty/provenance) inside a generic search engine.
- FlexSearch as default (no native fuzzy; over-engineered for settings scale).
- Shipping embedding models eagerly in the main bundle.

---

## 7. Open questions / unverified

- Exact VSCode *local* fuzzy scorer internals (`settingMatches`/fuzzy scorer in
  microsoft/vscode) not read at source level — described from docs/blog only [1][2].
- Chrome settings-search internals are inferred (substring+highlight); Chromium
  source not inspected — flag as unverified.
- Best small embedding model + quantization for in-browser settings semantic
  search (MiniLM vs EmbeddingGemma vs bge-small) needs an empirical bench.
- Whether RRF or normalized weighted-sum fusion gives better NDCG on a settings
  corpus — needs measurement against the test harness.

---

## References

1. [Bing-powered settings search in VS Code (VS Code blog, 2018)](https://code.visualstudio.com/blogs/2018/04/25/bing-settings-search)
2. [User and workspace settings — @-filters (VS Code docs)](https://code.visualstudio.com/docs/configure/settings)
3. [Search Everywhere (IntelliJ IDEA documentation)](https://www.jetbrains.com/help/idea/searching-everywhere.html)
4. [MiniSearch SearchOptions — fuzzy, prefix, boost, combineWith (API docs)](https://lucaong.github.io/minisearch/types/MiniSearch.SearchOptions.html)
5. [Orama — full-text, vector & hybrid search engine (GitHub README)](https://github.com/oramasearch/orama)
6. [Fuse.js vs FlexSearch vs Orama: Client-Side Search 2026 (pkgpulse)](https://www.pkgpulse.com/blog/fusejs-vs-flexsearch-vs-orama-client-side-search-2026)
7. [SemanticFinder — frontend-only semantic search with transformers.js](https://geo.rocks/semanticfinder/ipcc/)
8. [Building Semantic Search with Transformers.js and Sentence Embeddings (MachineLearningMastery)](https://machinelearningmastery.com/building-semantic-search-with-transformers-js-and-sentence-embeddings/)
9. [Test: Settings editor search improvements (microsoft/vscode issue #238884)](https://github.com/microsoft/vscode/issues/238884)
10. [FlexSearch — next-generation full-text search (GitHub README)](https://github.com/nextapps-de/flexsearch)
11. [@orama/orama (npm)](https://www.npmjs.com/package/@orama/orama)
12. [In-browser semantic search with EmbeddingGemma (Guillaume Laforge)](https://glaforge.dev/posts/2025/09/08/in-browser-semantic-search-with-embeddinggemma/)
13. [SearchParamsHybrid.vector — @orama/orama (JSR API docs)](https://jsr.io/@orama/orama/doc/~/SearchParamsHybrid.vector)
