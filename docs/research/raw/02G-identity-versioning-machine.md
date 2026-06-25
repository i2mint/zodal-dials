# 02G — Identity, Versioning & the Machine Side of Settings

Research for **zodal-settings**: stable setting identity, key lifecycle (deprecate/rename/migrate), file persistence with comment/format-preserving round-trips, CLI get/set, env-var binding, JSON-Schema publishing for external editors, and secrets/sensitivity separation. Covers dimensions **F** (file/format), **L** (lifecycle), **I** (identity/machine).

---

## TL;DR

- **Identity is a dotted-path string key** (`section.subsection.leaf`), borrowed from git config and VSCode `contributes.configuration`. zodal already uses dotted paths for keys — adopt the same model, but enforce VSCode's one hard rule: *a setting ID must never be a complete prefix of another setting ID* [1][7], or object-vs-scalar ambiguity arises in the cascade.
- **There is no automatic key-migration API in the wild** (VSCode, Chrome, Firefox all migrate by hand). The dominant pattern is **declare-old-as-deprecated + read-both + write-new**: keep a `deprecationMessage`/`markdownDeprecationMessage` on the old key, copy its value into the new key on load, hide the old key from UI, remove after N releases [1][3]. zodal-settings should make this *declarative* in the schema (a first-class `deprecated`/`renamedTo` affordance) rather than imperative.
- **Document evolution = embed a `schemaVersion` + a chain of pure upcaster functions, run lazily on read** (migrate-on-access), idempotent by filtering on source version; expand/contract (Parallel Change) for breaking shape changes [9]. This is the same chained-migration idea behind store adapters.
- **Comment/format-preserving round-trips need a document model, not parse→mutate→serialize.** Use `jsonc-parser` `modify()`+`applyEdits()` for JSONC (the VSCode settings model) [10]; the analogous tools are `tomlkit` (TOML) and `ruamel.yaml` (YAML) [11]. KEEP the edit-script model; AVOID re-emitting the whole file.
- **Patches:** RFC 7386 JSON Merge Patch is the human-readable internal layer shape; RFC 6902 JSON Patch is the op-log for history/undo. **Neither preserves textual representation** (whitespace/comments/order) — by spec [4][8]. So patches model *values*; the comment-preserving step is a *separate file-writer concern*.
- **Env binding** is a lossy-name problem solved by *relaxed binding* (Spring) and `__`→`:` (.NET): dots/dashes/case all normalize to an env name; nesting via a separator [5][13]. KEEP a documented, deterministic key↔env mapping.
- **Publish a JSON Schema** (via `$schema` URL + SchemaStore `fileMatch`) so any editor gives autocomplete/validation for free [12]. zodal-settings can emit this from the Zod schema — a natural codegen target.
- **Secrets ≠ config.** 12-factor stores config in env [2]; secrets get a *sensitivity flag*, are masked/redacted, never plain-exported, and routed to a secret store / injected at runtime [6]. Maps cleanly onto zodal's content-vs-metadata bifurcation.

---

## 1. Stable identity & dotted-path namespacing (dimension I)

**Convention (HARD FACT).** Both git and VSCode key settings by a dot-delimited string. In `git config`, the name is *section + key separated by a dot*; "the fully qualified variable name … is the last dot-separated segment and the section name is everything before"; names are case-insensitive, alphanumeric + `-`, must start with a letter [14]. VSCode setting IDs are dotted paths like `gitMagic.blame.dateFormat`, and the schema is used *both* for editor IntelliSense in the JSON file and for the Settings UI [7].

**The one constraint that bites (HARD FACT).** VSCode: *"A setting ID cannot be a complete prefix of another setting ID."* [7] If `editor.font` exists as a leaf, `editor.font.size` cannot — because the path can't be simultaneously a scalar and an object. This is exactly the deep-merge collision in the cascade. **KEEP** this as a validation rule in zodal-settings' schema compiler.

**SYNTHESIS.** zodal-settings should treat the dotted key as the *stable, serialization-independent identity* — the thing that survives renames of UI labels, regroupings into facets, and storage backend swaps. The key is the join point between schema, layers, patches, env vars, and CLI. Facets/tags (the canonical grouping model) are orthogonal projections over keys, never the identity.

---

## 2. Lifecycle: deprecate / rename / migrate keys across versions (dimension L)

### 2a. The VSCode pattern (HARD FACT)
- Setting `deprecationMessage` / `markdownDeprecationMessage`: the setting gets a warning underline; it is **hidden from the Settings UI unless the user has configured it** [1]. `markdownDeprecationMessage` can link to the replacement setting via `#target.setting.id#` syntax [1].
- **There is no built-in/automatic migration API in VSCode** [1]. The community-recommended migration recipe (from VSCode discussion #862): create the new setting, copy the old value into it on activation, mark the old one deprecated, and *remove it after a few releases* [3].

### 2b. Browsers (HARD FACT, lighter)
- Firefox stores user-changed prefs in `prefs.js` (and `user.js` for portable defaults). **Deprecated prefs are not auto-removed** — they linger in `about:config` after Firefox stops reading them [15]. Migration is manual/code-driven inside Firefox; the file format has no rename mechanism.
- Chrome similarly migrates prefs in C++ on startup (no declarative rename in the file). *(Search returned mostly Firefox; Chrome's `PrefService`/migration code is C++-side — flagged as UNVERIFIED for exact APIs, but the manual-migration-on-load shape is the same.)*

### 2c. Schema/document evolution (HARD FACT)
The robust, widely-used pattern [9]:
1. **Embed `schemaVersion`** in every persisted document at write time.
2. On read, compare to current; run a **chain of migration (upcaster) functions** keyed by version to walk to the target.
3. **Lazy / migrate-on-access**: transform on read, optionally write back — avoids big-bang migrations [9].
4. **Idempotent**: filter only docs at the source version before transforming, so re-runs skip migrated docs [9].
5. **Expand/Contract (a.k.a. Parallel Change)**: add new key, dual-write/dual-read, switch readers, then remove old key — safest default for breaking changes [9].

### 2d. Synthesis for zodal-settings
**KEEP a declarative lifecycle model in the schema.** Rather than the imperative VSCode recipe, express on the field/affordance:
- `deprecated: true` + message (drives UI + warnings + "advanced/hidden" facet),
- `renamedTo: "new.key"` + optional value transform (drives automatic read-time copy),
- per-document `schemaVersion` + an ordered registry of pure `(layer) → layer` upcasters run lazily during the cascade load.

This makes renames a *data declaration* the headless layer can execute, the UI can surface, and codegen can emit — squarely zodal's "declare once, generate many" thesis. **AVOID** scattering migration logic imperatively across load sites.

---

## 3. File persistence + comment/format-preserving round-trips (dimension F)

### 3a. Formats
- **JSONC** (JSON-with-comments): JSON + `//` and `/* */`; the format of VSCode `settings.json`/`tasks.json` [16]. Parsed by Microsoft's `jsonc-parser` (fault-tolerant scanner) [10][16].
- **JSON5**: superset adding trailing commas, unquoted keys, etc. [16].
- **TOML** / **YAML**: common human-edited config formats with native comments.

### 3b. The round-trip problem (HARD FACT)
Comment/format preservation requires a **document model** that retains tokens, not a plain parse→object→serialize cycle (which discards comments, whitespace, key order):
- **`jsonc-parser`**: `modify()` computes an *edit script* (insert/remove/replace a property); `applyEdits()` applies it, **preserving surrounding comments and structure**; `format()` computes formatting edits [10]. This is the canonical model — edits, not rewrites.
- **`tomlkit`**: built for Poetry's `pyproject.toml`; "preserves all comments, indentations, whitespace and internal element ordering" via custom TOML-type objects [11].
- **`ruamel.yaml`**: round-trip mode preserves comments, flow/block style, and map key order; nodes carry `.lc` line/column info [11].

### 3c. Patches vs textual preservation (HARD FACT — important nuance)
RFC 7386 **JSON Merge Patch** explicitly: *"operate[s] at the level of data items, not … textual representation, with no expectation that [it] will preserve features … such as white space, member ordering, number precision."* [8] RFC 6902 **JSON Patch** is an ordered op-array (`add/remove/replace/move/copy/test`) — also value-level [4]. **Therefore patches model values; they cannot be the comment-preserving writer.**

### 3d. Synthesis
- **KEEP** the bifurcation: (a) a *value layer* model (Merge Patch internally, JSON Patch for history/undo) and (b) a *format-preserving file writer* that, given a value diff, computes a minimal edit script against the existing on-disk document via a jsonc-parser-style API. Headless library emits the diff; a format adapter (JSONC/TOML/YAML) applies it.
- **AVOID** "load → set → `JSON.stringify` → overwrite" — it nukes comments and reorders keys, which destroys hand-curated config files.

---

## 4. CLI get/set, env-var binding, and JSON-Schema publishing (dimension I/F)

### 4a. CLI get/set (HARD FACT)
`git config` is the archetype: `git config get/set section.key value`, dotted addressing, optional file scope (`--global`/`--local`/`--file`) [14]. **KEEP** a thin CLI surface: `get <key>`, `set <key> <value> [--scope ...]`, `list [--show-origin]` (provenance!), driven entirely by the same dotted-key + cascade model. The scope flag maps to zodal-settings *scopes* (default/preset/profile/workspace/policy).

### 4b. Env-var binding (HARD FACT)
- **12-factor**: store config (esp. per-deploy values, credentials, resource handles) in env vars — language/OS-agnostic, hard to commit accidentally; litmus test: could the repo go open-source without leaking creds? [2]
- **Spring relaxed binding**: dots→underscores, drop dashes, uppercase; `spring.main.log-startup-info` → `SPRING_MAIN_LOGSTARTUPINFO`; dots and dashes treated equivalently; canonical form is lowercase kebab [5].
- **.NET**: `__` (double underscore) → `:` hierarchy separator, chosen because `:` isn't valid in Bash and `__` works on all platforms; e.g. `Logging__LogLevel__System` → `Logging:LogLevel:System` [13].

**Synthesis.** zodal-settings needs **one documented, deterministic key↔env mapping** (recommend dotted-key → `PREFIX_` + path with `__` between segments, uppercased) plus relaxed *reading* (accept dot/dash/case variants). This is a renderer-like concern: env is just another *layer source* (a scope) feeding the cascade. **KEEP** env as a read-mostly layer near the top of precedence (12-factor) but below admin/policy.

### 4c. Publishing JSON Schema for external editors (HARD FACT)
A JSON config file gains autocomplete/validation in VSCode and JetBrains IDEs by either (a) an in-file `"$schema": "https://…"` pointer, or (b) a SchemaStore catalog entry mapping a `fileMatch` glob to a schema URL [12]. VSCode uses the schema's `description` for hover/autocomplete docs [12].

**Synthesis.** This is a *first-class codegen target* for zodal-settings: compile the Zod v4 schema (+ `.meta()` affordances → `description`, `enum`, `deprecationMessage`) into a JSON Schema, publish it, and inject `$schema` into emitted config files. Users editing the raw file get the same IntelliSense as the generated UI — true "declare once, surface many ways." **KEEP** as an output adapter alongside UI/state/data-access generators.

---

## 5. Secrets & sensitivity; relation to zodal content/metadata bifurcation (dimension I)

### HARD FACTS
- 12-factor: credentials belong in env, never as code constants [2].
- `.env` files must be gitignored; ship a `.env.example` with dummy values; never commit real secrets [searched; standard dotenv practice].
- Vault-style best practice: a single source of truth with access control, rotation, audit; inject secrets at runtime as env vars/files rather than baking them into config; Terraform explicitly *cannot* redact secrets in state — so keep secrets out of config/state where possible [6].

### SYNTHESIS — map to zodal's content/metadata split
zodal bifurcates *content* (the heavy/sensitive payload) from *metadata* (the describable, indexable, UI-surfaceable part). Settings have the same split:
- A **`sensitivity`/`secret` affordance** on a field marks a value as confidential. The *metadata* (key, type, label, that-it-exists, validation) stays in the schema and UI; the *content* (the secret value) is handled separately — masked in UI, **never plain-exported**, redacted in logs/serialized layers, and routable to a secret store or env-injection rather than the JSONC/TOML file.
- A **`managed`/`policy` flag** marks values enforced by an admin scope atop the cascade, non-overridable locally (Vault/MDM-style).

**KEEP**: secret values live in a separate scope/sink (env/secret store), the schema only declares *that a field is secret*; effective-value resolution returns a masked placeholder + provenance, with the real value fetched on demand through a pluggable secret provider (Dependency Injection). **AVOID** writing secrets into any persisted layer file or any patch/op-log used for history.

---

## KEEP / AVOID summary (for a schema-driven headless TS library)

**KEEP**
- Dotted-path key as stable identity; enforce the "no key is a prefix of another" rule [7].
- Declarative deprecation/rename affordances (`deprecated`, `renamedTo`, message) in the schema [1][3].
- `schemaVersion` + chained, lazy, idempotent upcasters; expand/contract for breaking changes [9].
- Edit-script (document-model) file writers per format: jsonc-parser / tomlkit / ruamel.yaml [10][11].
- Merge Patch (RFC 7386) as internal layer shape; JSON Patch (RFC 6902) for history/undo [4][8].
- Deterministic, documented key↔env mapping with relaxed reading; env as a high-precedence scope [5][13][2].
- Emit JSON Schema (+ `$schema` injection) as a codegen output for editor autocomplete [12].
- `sensitivity`/`managed` affordances; secrets routed to env/secret store, masked + redacted [2][6].

**AVOID**
- Treating value-level patches as comment-preserving file writers — they aren't, by spec [8].
- `JSON.stringify`-and-overwrite persistence (destroys comments/order).
- Imperative, scattered migration code instead of a declarative lifecycle model.
- Writing secrets into layer files, patches, or audit logs [6].
- Per-format ad-hoc env naming (use one canonical mapping).
- Letting facet/grouping changes alter the stable key identity.

---

## Open questions / flags
- Exact Chrome `PrefService` migration API names are **UNVERIFIED** (C++-side, not surfaced in searches); the manual-migration-on-load *shape* is confirmed via the Firefox analog [15].
- "Double-underscore for nested env keys" is firmly attested in .NET [13]; dotenv libraries don't standardize nesting — zodal-settings should pick and document its own (recommend `__`).
- Whether to support JSON5 in addition to JSONC/TOML/YAML is a scope decision, not a research blocker.

---

## References

1. [Visual Studio Code — Contribution Points (`contributes.configuration`, deprecationMessage)](https://code.visualstudio.com/api/references/contribution-points)
2. [The Twelve-Factor App — III. Config (store config in the environment)](https://12factor.net/config)
3. [microsoft/vscode-discussions #862 — migrating extension settings to a new structure](https://github.com/microsoft/vscode-discussions/discussions/862)
4. [erosb — JSON Patch and JSON Merge Patch compared](https://erosb.github.io/json-patch-vs-merge-patch/)
5. [Spring Boot — Externalized Configuration / Relaxed Binding](https://docs.spring.io/spring-boot/reference/features/external-config.html)
6. [HashiCorp — Vault Agent Injector examples (secret injection as env vars)](https://developer.hashicorp.com/vault/docs/deploy/kubernetes/injector/examples)
7. [microsoft/vscode-docs — Settings and Configuration (setting ID rules)](https://github.com/Microsoft/vscode-docs/blob/main/api/references/contribution-points.md)
8. [RFC 7396 — JSON Merge Patch (textual-representation caveat)](https://datatracker.ietf.org/doc/html/rfc7396)
9. [JSON Schema Migration Strategy — Versioning & Transforms](https://jsonic.io/guides/json-migrations)
10. [microsoft/node-jsonc-parser — scanner/parser with modify() + applyEdits()](https://github.com/microsoft/node-jsonc-parser)
11. [tomlkit documentation (comment/format-preserving TOML)](https://tomlkit.readthedocs.io/) and [ruamel.yaml (round-trip YAML)](https://yaml.dev/doc/ruamel.yaml/detail/)
12. [JSON Schema Store (`$schema`, fileMatch, editor autocomplete)](https://www.schemastore.org/) and [Editing JSON with Visual Studio Code](https://code.visualstudio.com/docs/languages/json)
13. [Configuration in ASP.NET Core — `__` → `:` hierarchical env keys](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/configuration/)
14. [Git — git-config Documentation (section.key dotted addressing)](https://git-scm.com/docs/git-config)
15. [Mozilla Support — Deprecated preferences still show in about:config](https://support.mozilla.org/en-US/questions/1248495)
16. [JSONC specification](https://jsonc.org/) and [Changelog — JSONC superset of JSON with comments](https://changelog.com/news/jsonc-is-a-superset-of-json-which-supports-comments-6LwR)
