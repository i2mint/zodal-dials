# 03B — Schema-Driven Config: Declarative Schema/Metadata Formats

**Scope.** A comparative study of declarative formats that pair *type + default + doc + constraints* in one declaration and drive UI/tool generation from it: GNOME **GSettings** schema XML [1][2][9], the **NixOS module system** (`mkOption`, type-directed merge, assertions) [3][4][5][6][7], **Spring Boot** `spring-configuration-metadata.json` [8], **JSON Schema** annotations + conditionals [10][11], and **.NET Options** + validation [12][13]. Goal: extract what each gets right about *schema-as-SSOT* and what `zodal-settings` should borrow for a headless TS library whose SSOT is a Zod v4 schema.

This maps directly onto two zodal-settings design dimensions: **C** (cascade / partial-layer merge) and **D** (constraints / dependent defaults). NixOS is the strongest single model for both and is analyzed in depth.

---

## TL;DR

- **Schema-as-SSOT is the universal pattern**, but each ecosystem chose a different *transport*: GSettings = compiled XML; NixOS = Nix expression language; Spring = JSON sidecar *generated from Java annotations*; JSON Schema = self-describing JSON; .NET = annotated POCO classes. zodal's choice (Zod v4 schema + `.meta()`) is the TS-native analogue and is the right call — it keeps type, validation, and presentation hints colocated.
- **NixOS is the gold standard for partial-layer merge (dim C)**: merge behavior is **type-directed** — the *type* carries its own `merge` function, so `attrsOf` deep-merges, `listOf` concatenates, scalars/enums refuse to merge (last-defined wins via priority). This is exactly zodal-settings' "objects deep-merge, scalars/arrays replace" cascade rule, formalized. **BORROW the model: attach a per-type/per-key merge strategy to the schema, don't hardcode one global rule.**
- **NixOS priority system (dim C precedence)**: `mkOverride <int>`, with `mkDefault = 1000`, plain value `= 100`, `mkForce = 50`; **lower number = higher precedence**. This is a clean, total ordering for scope precedence + a "managed/policy value" mechanism (force). **BORROW** as the precedence model for scopes.
- **NixOS assertions (dim D)**: `config.assertions = [{ assertion = bool; message = str; }]` and `config.warnings = [str]`, aggregated across all modules and evaluated *after* the cascade resolves but *before* build. This is the cleanest cross-field hard-constraint model surveyed. **BORROW** the shape verbatim (it's a renderer-agnostic constraint list).
- **Spring** nails the *generated metadata sidecar* with `groups`/`properties`/`hints`/`deprecation` — especially **`hints` (enumerated values + descriptions + value-providers)** and **first-class deprecation with `replacement`/`since`/`level`**. **BORROW** hints-as-affordance and deprecation-as-metadata.
- **GSettings** nails *compiled, range-checked, enum/choice-constrained, documented* keys with `<summary>`/`<description>` (the affordance/doc split) and **vendor override files** (`.gschema.override`) — a real-world "preset/policy layer." **BORROW** range/choice/enum as schema-level affordances; note its weakness: no cross-field constraints, no merge model.
- **JSON Schema** gives the portable interchange + `if/then/else`/`dependentSchemas` conditionals, but its conditionals are *validation* logic, awkward as UI/dependent-default sources. **KEEP** as an export target; **AVOID** authoring constraints primarily in it.
- **.NET Options** contributes `ValidateOnStart` (fail fast at load, not at use) and the `IValidateOptions<T>` strategy split (decouple validation from the model). **BORROW** fail-fast-on-load and pluggable validators.

---

## 1. GNOME GSettings schema XML

**What it is.** A settings database whose schema is an XML file (`*.gschema.xml`) compiled by `glib-compile-schemas` into a binary for fast runtime lookup [1][2][9]. Each `<schema id="org.example.app" path="/org/example/app/">` contains `<key name="..." type="...">` elements; `type` is a **GVariant type string** (`b` bool, `i` int32, `s` string, `as` array-of-string, etc.) [2]. Each key carries `<default>`, `<summary>` (one-line), and `<description>` (multi-line) [1][2].

**Constraints (HARD FACT).** Numeric keys support `<range min="..." max="..."/>`; string keys support `<choices><choice value="..."/></choices>` and `<aliases>` (map deprecated values → current); enumerated keys reference a top-level `<enum>`/`<flags>` whose `<value nick="..." value="..."/>` children define the symbolic set [9]. So per-key constraints (range, enum, choice) are *declared in schema*, and `dconf-editor` reads exactly these to render an editor and show description/type/default [1].

**Layering (HARD FACT).** Vendor **override files** end in `.gschema.override`, conventionally prefixed `00`–`99` for ordering; they are key-files keyed by schema id whose values are serialized GVariant — i.e. a *precedence-ordered layer of default overrides* shipped by a distributor [9]. Actual user edits live in **dconf** (the backend), conceptually a layer above schema defaults [2].

**KEEP for zodal-settings:** range / enum / choice as *schema-level affordances*; the `<summary>`/`<description>` split (short label vs. long help) maps cleanly to the uiSchema-equivalent presentation layer; the override-file pattern is a real precedent for a **preset/policy scope**. **AVOID:** XML transport; *no cross-field constraints, no merge algorithm* — GSettings is per-key only. (SYNTHESIS: GSettings is "settings done right at the key level, ignored at the system level.")

---

## 2. NixOS module system — *the high-value model for dims C & D*

**What it is.** A purely-functional configuration system where each *option* is declared with `mkOption { type; default; description; example; }` [3][4]. Crucially, the **whole system config is the fixed point of merging many partial modules**, which is precisely zodal-settings' "layers across scopes" cascade.

### 2.1 Type-directed merge (dim C — strongest borrow)

In NixOS the **type carries its own `merge` function** (and `check`) [4][5]. When the same option is defined in multiple modules, the type decides how to combine them [5]:

- `types.listOf t` → **list concatenation**.
- `types.attrsOf t` / `lazyAttrsOf t` → **joined attribute set** (deep-merge of keys; values merged by `t`'s merge).
- `types.nullOr t` → merge per inner type `t`.
- `types.str`, `types.int`, `types.enum`, `types.either`/`oneOf` → **cannot be merged**; a single winning definition is selected by priority (see 2.2). `types.lines` concatenates with newlines, `types.commas` with commas, `types.envVar` with colons — i.e. *append-style merge strategies live in the type system* [5].
- `types.submodule` → recurse into a sub-schema, enabling nested merge [5].

If a type defines no merge, `mergeDefaultOption` applies (errors on conflicting non-equal definitions) [4].

> **This is the single most important takeaway.** zodal-settings' cascade rule ("objects deep-merge, scalars/arrays replace, higher scope wins") should not be a hardcoded global rule. NixOS shows the right factoring: **a per-key merge strategy attached to the schema**, defaulting from the Zod type (object→deep-merge, array→replace *or* append depending on a declared strategy, scalar→replace) but overridable per key. This is exactly zodal's "merge strategy: replace / deep-merge / append / strategic." (SYNTHESIS, grounded in [4][5].)

### 2.2 Priority / override (dim C — precedence model)

Definitions carry a **numeric priority** via `mkOverride n` where **lower = higher precedence** [6][7]. Standard bands [6][7]:

| Helper | Priority | Meaning |
|---|---|---|
| `mkOptionDefault` | 1500 | weakest |
| `mkDefault` | 1000 | module-supplied default |
| *(plain value)* | 100 | normal user definition |
| `mkForce` | 50 | force / override |

`mkIf cond defs` conditionally includes a block (the canonical way to write conditional layers) [6]. `mkMerge [ ... ]` combines several definition blocks.

> **BORROW:** This is a complete, total-ordering precedence model. Map zodal **scopes** (default < preset < profile < workspace < policy) onto priority bands; `mkForce`-equivalent = the **managed/policy (non-overridable) value**; `mkDefault`-equivalent = soft default. The numeric-band approach (not arbitrary ints) matches zodal's renderer `PRIORITY` bands philosophy.

### 2.3 Assertions & warnings (dim D — strongest borrow for hard constraints)

NixOS exposes two well-known options [7]:

```nix
assertions = [ { assertion = !(cfg.a && cfg.b); message = "a and b are mutually exclusive"; } ];
warnings   = [ "feature X is experimental" ];
```

`assertions` is a **`listOf` of `{ assertion = bool; message = str; }`** and `warnings` a `listOf str`; because they're ordinary options they are **aggregated across every module by the same merge machinery**, then checked *after* the config fixed point is computed but *before* the system is built — a build fails with the message if any `assertion` is false [7]. This cleanly separates **hard constraints** (assertions → block) from **soft advisories** (warnings → notify), and both are *data*, not imperative code embedded in a renderer.

> **BORROW the shape verbatim.** zodal-settings should resolve the cascade → produce the **effective value** set → then evaluate a `constraints` list (`{ assertion: (effective) => boolean, message }`) and a `warnings` list. This is renderer-agnostic (headless), serializable, and — because constraints are expressed as boolean predicates over the resolved space — it is the bridge to the *feature-model / CSP-SAT* framing: each assertion is a clause over the variable space. (SYNTHESIS: NixOS doesn't itself hand assertions to a SAT solver, but the data shape is solver-ready.)

**Dependent defaults (soft).** NixOS expresses these as `default = lib.mkIf ... ` / `default = config.other.value` — defaults *computed from other resolved options* (the config argument is the fixed point) [3]. This is exactly zodal's "dependent default (advisory, overridable)": a default is a function of the rest of the effective config, and a user layer at higher priority overrides it.

**AVOID:** the Nix language itself; lazy-evaluation footguns (`lazyAttrsOf` + `mkIf` has documented merge limitations [5]); the all-or-nothing build-fails-on-assertion ergonomics (a UI wants to *surface* violations live, not crash).

---

## 3. Spring Boot `spring-configuration-metadata.json`

**What it is.** A JSON sidecar at `META-INF/spring-configuration-metadata.json`, **generated at compile time** from `@ConfigurationProperties`-annotated Java classes (or hand-authored to augment), consumed by IDEs for autocomplete/validation [8]. Four top-level arrays: `groups`, `properties`, `hints`, `ignored` [8].

- **`properties`**: `name` (dotted, lower-case), `type` (FQ Java type, generics included), `description`, `sourceType`, `defaultValue`, `deprecation` [8].
- **`groups`**: contextual containers (`name`, `type`, `description`, `sourceType`, `sourceMethod`) — no value of their own; the *facet/grouping projection* [8].
- **`hints`** (the affordance layer): `name` (the property, or `prop.keys` / `prop.values` for maps), `values` (array of `{ value, description }` — enumerated candidates), and `providers` (array of `{ name, parameters }` value-providers like `class-reference`, `handle-as`, `logger-name`) [8]. Hints drive autocomplete and *dynamic* value sourcing.
- **`deprecation`**: first-class object with `level` (`warning` = still binds; `error` = no longer bound), `reason`, `replacement`, `since` [8].

**KEEP / BORROW:**
- **Hints as a separate affordance layer** keyed by setting key, carrying *enumerated values with descriptions* AND *dynamic providers* — this is the cleanest "where do dropdown options come from" model surveyed, and it cleanly separates the data type from the UI candidate-set (matching zodal's affordance→widget split). Borrow `{ value, description }` and the *provider* indirection (a hook that supplies candidates at runtime).
- **Deprecation as structured metadata** (`replacement` + `since` + `level`) is directly applicable: settings churn, and a renderer can show "deprecated, use X since v2.1." zodal `.meta()` should carry this.
- **Generated-from-source** validates zodal's stance: you don't author the metadata sidecar by hand; you *derive* it from the SSOT (here Java annotations; for zodal, the Zod schema).

**AVOID:** the metadata is *advisory for tooling only* — Spring does **not** enforce hints/constraints at bind time (validation is separate, via `@Validated`/JSR-380). zodal should keep affordance metadata and *enforced* validation unified in the Zod schema rather than split as Spring does.

---

## 4. JSON Schema (annotations + conditionals)

**What it is.** A self-describing JSON meta-schema. Relevant pieces: annotation keywords `title`, `description`, `default`, `examples` (pure doc, no validation effect); and conditional applicators **`if`/`then`/`else`** and **`dependentSchemas`** (apply a subschema when a property is present) and `dependentRequired` [10][11].

- `if/then/else`: if the `if` subschema validates, `then` must; else `else` must [10][11].
- `dependentSchemas`: applies like `allOf` — **schemas are not merged**, both apply independently [10].

**KEEP:** JSON Schema is the **lingua franca interchange/export target** — zodal can *emit* JSON Schema from the Zod SSOT for tools that speak it (and indeed `zod-to-json-schema` exists). `title`/`description`/`default`/`examples` map directly to zodal affordances.

**AVOID (authoring constraints in it):** `if/then/else` expresses cross-field rules but is **validation-shaped, not UI-shaped** — it tells you a combination is invalid, not *why* (no message), not which field to highlight, and `dependentSchemas` explicitly doesn't merge, so it's a poor partial-layer/cascade model. (SYNTHESIS: use JSON Schema as an export/interchange format, *not* as the home for zodal's hard-constraint or dependent-default model — NixOS-style `{assertion,message}` is strictly more UI-friendly.)

---

## 5. .NET Options pattern + validation

**What it is.** Bind a config section to a strongly-typed POCO (`IOptions<T>`/`IOptionsSnapshot<T>`/`IOptionsMonitor<T>`), with validation attached at registration [12][13].

- **Validation strategies:** DataAnnotations on the POCO (`.ValidateDataAnnotations()`), recursing into nested objects only via `ValidateObjectMembersAttribute` / `ValidateEnumeratedItemsAttribute`; OR `IValidateOptions<T>` for **decoupled, DI-injected, cross-field validation logic** [12][13].
- **`ValidateOnStart()`**: run validation at app startup and **fail fast**, rather than lazily on first access [12][13].
- **`IOptionsMonitor<T>`**: supports runtime reload / change notification (live-apply); `IOptions<T>` is static (requires-restart equivalent) [12].
- A **source generator** can produce compile-time validation for AOT/perf [12].

**BORROW:**
- **Fail-fast-on-load (`ValidateOnStart`)** maps to validating the *effective* config the moment a layer set resolves, not at point-of-use — good default for a settings system (surface errors immediately, per zodal's "immediate error feedback").
- **`IValidateOptions<T>` = pluggable validator strategy** decoupled from the model — analogous to zodal's composable testers; cross-field rules live outside the type. Reinforces the NixOS-assertions-as-separate-list decision.
- **`IOptions` vs `IOptionsMonitor`** is the literal **live-apply vs requires-restart** distinction zodal models — borrow the *flag on the setting* idea (a key declares whether changes apply live or require restart).

**AVOID:** the C#-attribute transport and the DataAnnotations *non-recursive-by-default* footgun (zodal/Zod recurses naturally).

---

## 6. Cross-cutting synthesis for zodal-settings

| Concern | Best model | Borrow |
|---|---|---|
| SSOT colocating type+default+doc+constraint | all of them | Zod schema + `.meta()` is the TS-native equivalent — confirmed direction |
| Short label vs long help | GSettings `<summary>`/`<description>` | two-field doc affordance |
| Enumerated candidate values + descriptions | Spring `hints.values`, GSettings `<choices>`/`<enum>` | `{ value, description }` + dynamic *provider* |
| **Partial-layer merge (dim C)** | **NixOS type-directed merge** | per-key merge strategy defaulted from Zod type, overridable |
| **Scope precedence + policy/managed (dim C)** | **NixOS `mkOverride` bands** | numeric priority bands; `mkForce`=policy, `mkDefault`=soft |
| **Hard cross-field constraints (dim D)** | **NixOS `assertions`** | `[{assertion, message}]` evaluated over the *effective* value set |
| Soft/dependent defaults (dim D) | NixOS `default = f(config)` | default-as-function-of-resolved-config |
| Deprecation/migration | Spring `deprecation` | `{replacement, since, level}` in `.meta()` |
| Fail-fast validation | .NET `ValidateOnStart` | validate effective config at resolve time |
| Live-apply vs restart | .NET `IOptions`/`IOptionsMonitor` | per-setting flag |
| Interchange / export | JSON Schema | emit, don't author-in |
| Solver-ready constraints | NixOS assertions → CSP framing | boolean predicates over the variable space |

**Headline recommendation (SYNTHESIS).** Model the cascade after NixOS: every setting key resolves through (a) a **type-directed, per-key-overridable merge strategy** and (b) a **numeric priority** carried by each layer's scope; after resolution, evaluate a **serializable `{assertion, message}` constraint list** plus a **warnings list**, and compute **dependent defaults as functions of the resolved config**. Borrow Spring's *hints* and *deprecation* for the affordance/metadata layer, GSettings' range/enum/choice as schema-level affordances, and .NET's fail-fast + pluggable-validator ergonomics. Treat JSON Schema purely as an export target. None of the surveyed systems combine *all* of headless rendering + type-directed merge + serializable constraints + provenance — that gap is zodal-settings' opportunity.

**UNVERIFIED / to confirm in code:** exact current Nix priority constant for `mkOptionDefault` (1500) and that plain definitions sit at 100 (stated in community docs [6][7]; confirm against `lib/modules.nix` source); whether `lazyAttrsOf`+`mkIf` limitation still holds in current nixpkgs.

---

## References

1. [HowDoI/GSettings — GNOME Wiki Archive](https://wiki.gnome.org/HowDoI/GSettings)
2. [GSettings — GIO Reference Manual](https://gnome.pages.gitlab.gnome.org/libsoup/gio/GSettings.html)
3. [Option Declarations — NixOS Manual](https://nlewo.github.io/nixos-manual-sphinx/development/option-declarations.xml.html)
4. [nixpkgs/lib/options.nix (mkOption) — GitHub](https://github.com/NixOS/nixpkgs/blob/master/lib/options.nix)
5. [Option Types — NixOS Manual](https://nlewo.github.io/nixos-manual-sphinx/development/option-types.xml.html)
6. [What does mkDefault do exactly? — NixOS Discourse](https://discourse.nixos.org/t/what-does-mkdefault-do-exactly/9028)
7. [Warnings and Assertions — NixOS Manual](https://nlewo.github.io/nixos-manual-sphinx/development/assertions.xml.html)
8. [Configuration Metadata Format — Spring Boot Reference](https://docs.spring.io/spring-boot/specification/configuration-metadata/format.html)
9. [glib-compile-schemas (gschema enum/range/choices/override) — Ubuntu Manpage](https://manpages.ubuntu.com/manpages/trusty/en/man1/glib-compile-schemas.1.html)
10. [JSON Schema — Conditional schema validation](https://json-schema.org/understanding-json-schema/reference/conditionals)
11. [if (2020-12) — Learn JSON Schema](https://www.learnjsonschema.com/2020-12/applicator/if/)
12. [Options pattern in ASP.NET Core — Microsoft Learn](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/configuration/options)
13. [Options pattern — .NET — Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/core/extensions/options)
