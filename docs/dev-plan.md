# zodal-dials — Development Plan

> **Living document, horizon-graded.** The near horizon is detailed (named packages, modules,
> functions, files, acceptance tests); the far horizon is deliberately coarse — we *learn as we
> build* and sharpen later horizons as earlier ones land. This plan co-evolves with the dev toolkit
> (`.claude/skills/zodal-dials-dev-*`) and the build: revise both whenever the work teaches us
> something.
>
> **Audience: AI agents.** Each near-term task is scoped so an agent can pick it up from an issue +
> the routed skill and execute largely independently. Decisions are pre-made with rationale; the few
> genuinely-open ones are flagged with a working default so building is never blocked.

**Status (2026-06-25):** Horizons 1–2 + first satellites **built and merged** — 6 packages on `main`,
composing end-to-end (a monorepo `tests/integration/` proves it), ~190 tests green, nothing published
(first npm publish gated on owner approval). Each shipped via build → adversarial critic (1–2 passes)
→ fix + regression test → CI-green PR → merge.

| Package | Role | PR |
|---|---|---|
| `@zodal/dials-core` | cascade keystone — `defineDials`, `resolve`/provenance, patches (RFC 7386/6902), constraints, dependent defaults, secrets, `LayerStore` | #6, #9 |
| `@zodal/dials-ui` | headless layer — `toSettingsForm`/`toFieldStates`, settings renderer registry, faceted `toGroups`, search, lifecycle | #7 |
| `@zodal/dials-ui-vanilla` | vanilla DOM reference renderer | #8 |
| `@zodal/dials-ui-shadcn` | React/shadcn renderer | #10 |
| `@zodal/dials-store-env` | env-var `LayerStore` (read-only scope) | #9 |
| `@zodal/dials-store-jsonc` | format-preserving JSONC file `LayerStore` | #9 |

**Both flagship benchmark gates green** (cascade+provenance round-trip #4; secret-never-leaks #5).
**Remaining (far horizon, no issues yet):** more renderers (`-cli`, `-web-components`), more stores
(`-toml`/`-yaml`/`-keychain`, reuse of zodal-store-* as config backends), codegen (JSON Schema emit,
`toPrompt`, CLI `get`/`set`/`list --show-origin`), the optional constraint-solver adapter, reactive
store wrapper, and refreshing the dev skills against the now-concrete APIs.

---

## 1. North star (one picture)

```
              Zod v4 schema  ──defineDials──▶  DialsDefinition
                    │                               │ getCapabilities()
   ┌────────────────┴───────────────┐               ▼
   │  MODEL                          │        DialsCapabilities
   │  • flat dotted keyspace         │               │
   │  • schema + affordances (Zod)   │     ranked SettingsRendererRegistry ◀── RendererCapabilities
   │  • cascade primitives           │               │   (honest degradation)
   │    (layers·scopes·merge)        │               ▼
   └───────────────┬─────────────────┘     pick & DEGRADE a widget per setting
        resolve(orderedLayers, policy)              │  (rawJson terminal fallback)
                   │                  ┌──────────────┼──────────────┐
       { effective, provenance,    vanilla        shadcn        cli / web-components
         conflicts, warnings }     (reference)     (React)       (+1–2 more)
                   │
        store/secret targets:  env · toml · yaml · jsonc · keychain/vault
        (DataProvider + codec compositions; secrets via bifurcation → SecretRef)
```

**Three layers, one registration API** (SSOT, open-closed): **Model → Affordances → Targets**.
In-house and third-party/agent-authored plugins (renderers, stores, codecs) register the same way
(factory + tester + PRIORITY band). **Wrap, don't rebuild** — reuse zodal's inference, registry,
bifurcation, codecs, Zustand store, and `explain()`.

---

## 2. Package map (monorepo → many tree-shakeable `@zodal/dials-*`)

Develop all in-house in one monorepo; publish each separately under the **`@zodal` npm org**. Names
are provisional until the first package lands.

| Package | Role | Depends on | Horizon |
|---|---|---|---|
| **`@zodal/dials-core`** | The MODEL + cascade. `defineDials(schema, config?)` (degenerate one-item `defineCollection`); `resolve()`/`resolveEffective()`; type-directed merge-strategy table; `Layer`/`Scope`/`Provenance`/`SecretRef` types; RFC 7386/6902 patch utils + `UNSET` sentinel; constraint + `warnings` evaluator; dependent-default `derive` selectors; lifecycle (`deprecated`/`renamedTo`/upcasters); settings affordance keys (`sensitivity`, `saveMode`, `requiresRestart`, `writableScopes`, `mergeStrategy`, facets, `order`); field-level codecs; `explain()`. **No renderer/store deps.** | `zod` (peer), `@zodal/core` (peer) | **1 (keystone)** |
| **`@zodal/dials-ui`** | The headless UI layer. `toSettingsForm()`; `createSettingsRendererRegistry()` (PRIORITY bands + composable testers `secretRoleIs`/`boundedNumber`/`isEnum`/`fieldNameMatches`/terminal `rawJson`); facet→group-descriptor projection (gesture-agnostic `revealed`+`reveal`); `IndexableSetting[]` surface + `SearchProvider` interface + scoped-filter parser; provenance→badge/lock/reset config; dirty/save/undo headless events. | `@zodal/core`, `@zodal/dials-core` (+ `@zodal/ui` peer when generators land) | **1** |
| **`@zodal/dials-ui-vanilla`** | Vanilla HTML/JS reference renderer (no framework). Proves the headless contract end-to-end. | `@zodal/dials-ui` | **1 (reference renderer)** |
| **`@zodal/dials-store-*`** | Persistence/secret adapters: `-env`, `-toml`, `-yaml`, `-jsonc` (format-preserving writers), `-keychain`/`-vault` (secret providers). Each a `DataProvider`/codec composition with honest `getCapabilities()`. | `@zodal/store`, `@zodal/dials-core` | **2** |
| **`@zodal/dials-ui-shadcn`** | shadcn/ui (React) renderer. | `@zodal/dials-ui` | **2** |
| **`@zodal/dials-ui-*`** (+1–2) | e.g. `-cli` (prompt renderer — settings are often set on the command line) and `-web-components` (framework-agnostic, embeddable panels) — the two judged most apt for the settings domain. | `@zodal/dials-ui` | **3** |
| **`@zodal/dials-codegen`** *(opt)* | JSON-Schema emit (+ `$schema` injection) so raw-file editors get the same IntelliSense as the UI; `toPrompt()` AI/tool-schema. May start as a `dials-core` submodule. | `@zodal/dials-core` | **3** |

**Hard rule (inherited):** a renderer package depends on `@zodal/dials-ui`, never on another
renderer; a store adapter depends on `@zodal/store` + `@zodal/dials-core`. Shared logic belongs in
`@zodal/dials-core`. `dials-ui` and `dials-store-*` never depend on each other.

---

## 3. Build order & why

**`@zodal/dials-core` is the keystone — the cascade unblocks everything**, so it is the entire
first checkpoint. The riskiest contract is **cascade + provenance fidelity** and **secret
non-leakage**; we prove those first, then build the headless UI on top, then a reference renderer to
prove the whole pipe, then satellites.

**dials-core → dials-ui → dials-ui-vanilla → (dials-store-* ‖ dials-ui-shadcn) → more renderers.**

---

## 4. Horizon 1 — THE FIRST CHECKPOINT (detailed) · `@zodal/dials-core` + monorepo

**Goal:** prove the riskiest contracts — (a) a multi-scope cascade resolves to correct **effective
values + provenance** and survives serialize→deserialize as RFC 7386 layers, and (b) a **secret
value never leaks** into the queryable store, any exported layer/patch, or the audit log. Stand up
the monorepo + CI so packages build (not publish).
**Owning skills:** `/zodal-dials-dev-cascade`, `/zodal-dials-dev-monorepo`.

### 4.1 Tasks (each ≈ one issue)

1. **`@zodal/dials-core` package skeleton.** `package.json` (`@zodal/dials-core`, dual CJS/ESM
   exports map, `peerDependencies.zod: ">=4.1.13"`, `@zodal/core` peer), `tsup.config.ts`,
   `tsconfig.json`, `vitest.config.ts`, `src/index.ts` barrel. *Model on:* `zodal-graphs/packages/graph-core`.
   *Acceptance:* `pnpm build` emits `dist/index.{js,cjs,d.ts}`; `pnpm typecheck` clean.
2. **Core model types** (`src/model.ts`): `SettingKey` (branded dotted path), `Layer`
   (`Partial<Record<SettingKey, Value | UNSET>>`), `Scope` (`{ id; order }`), `ScopedLayer`,
   `Provenance` (`{ key; winningScope; shadowed: Layer-ref[]; managed }`), `EffectiveResult`
   (`{ effective; provenance; conflicts; warnings }`), `SecretRef`. The `UNSET` sentinel
   (unique symbol or branded const) distinct from `null`/`undefined`. *Acceptance:* types compile;
   `UNSET` is not confusable with a legitimate `null` value.
3. **Patch utils** (`src/patch.ts`): RFC 7386 JSON Merge Patch apply (with `UNSET`→delete);
   RFC 6902 JSON Patch apply + inverse (for undo/history). **Unit-test against RFC 7386 §1 / RFC
   6902 appendix examples** — libraries diverge; pin behavior. *Acceptance:* the spec example tables
   pass verbatim.
4. **Merge-strategy table** (`src/merge.ts`): type-directed default per Zod type (object→deep-merge,
   array→replace, scalar→replace); `.meta({ mergeStrategy })` override (`replace`/`deep-merge`/
   `append`/`{ mergeByKey }`). *Acceptance:* the same layer stack resolves differently when a key's
   strategy is overridden.
5. **⛔ CASCADE + PROVENANCE BENCHMARK** (`tests/cascade.test.ts`) — **checkpoint gate.** Resolve a
   multi-scope stack (`default → preset → profile → workspace → user → policy`), mutate one layer,
   re-resolve; **provenance must correctly attribute every key** (winning scope + shadowed list),
   the policy band must be non-overridable, and the whole layer set must round-trip
   serialize→deserialize as RFC 7386 layers with zero drift. Any misattribution fails the build.
6. **`defineDials` skeleton** (`src/define-dials.ts`): `defineDials(schema, config?)` →
   `DialsDefinition` wrapping a degenerate one-item `defineCollection`; exposes `defaults`,
   `resolve()`, `resolveEffective(key, stack)`, `explain(key, stack)`, `getCapabilities()`.
   *Scope note:* flat-keyspace derivation from a (possibly nested) Zod object is **Open Decision 1**
   — ship the working default (flatten object schema to dotted keys) and leave the registration seam.
7. **Constraints + warnings** (`src/constraints.ts`): evaluate hard cross-field constraints (Zod
   `.superRefine` with field-`path` issues) over the *effective* set, plus a serializable
   `{ assertion, message }` + `warnings` list (the NixOS `assertions`/`warnings` shape), fail-fast at
   resolve time. *Acceptance:* a two-field invalid combination is reported with both field paths.
8. **Dependent defaults** (`src/derive.ts`): a `derive(values) → partialSuggestion` selector keyed
   by input dependencies, recomputed on dependency change **only while the target is non-dirty**
   (override-stickiness). *Acceptance:* a derived default updates until the user sets the target,
   then stops.
9. **Secrets seam** (`src/secrets.ts`): the `sensitivity` affordance (name heuristics + `.meta`
   override) and `SecretRef`; a `createSensitiveSettingsProvider()` shape specializing
   `createBifurcatedProvider`. *Scope note:* the reveal/authorization contract is **Open Decision 4**
   — ship masked reads + lazy reveal seam; defer per-field reveal auth.
10. **⛔ SECRET-NEVER-LEAKS BENCHMARK** (`tests/secrets.test.ts`) — **checkpoint gate.** A secret
    value must never appear in the queryable config store, any exported layer/patch, or the audit
    log; reads return a masked `SecretRef`. Any leak fails the build.
11. **Monorepo integration** (`tests/`): `tests/vitest.config.ts` + a first cross-package story;
    re-enable the integration step in `.github/workflows/ci.yml`. *Model on:* `zodal-store-fs`'s
    `describe.each` contract suite.

### 4.2 Checkpoint acceptance criteria

- [ ] Cascade + provenance benchmark green: every key correctly attributed; policy non-overridable;
      RFC 7386 layer round-trip with zero drift (incl. `UNSET`-delete and object deep-merge cases).
- [ ] Secret-never-leaks benchmark green across store / export / audit paths.
- [ ] Patch utils pass the RFC 7386 §1 and RFC 6902 example tables verbatim.
- [ ] `defineDials` returns honest `DialsCapabilities`; `explain(key, stack)` renders provenance.
- [ ] `pnpm build && pnpm typecheck && pnpm test` green; dual CJS/ESM + `.d.ts`/`.d.cts` emitted with
      a correct conditional `exports` map.
- [ ] CI `validate` job runs on PR (publish job present but **never triggered** — no `[publish]`).
- [ ] Adversarial critic pass applied (`/agents` → `dials-checkpoint-critic`); critical/high findings
      resolved.

### 4.3 Checkpoint exit → next

Once green, PR + merge (CI publishes **nothing** until the owner approves the first release). Then
re-open this plan: Horizon 2 (`dials-ui` + `dials-ui-vanilla`) tasks get detailed; toolkit skills
get revised against what the build taught us.

---

## 5. Horizon 2 — soon (named, medium detail)

- **`@zodal/dials-ui` — headless UI + settings renderer registry.** Port zodal's `RendererRegistry`
  to `createSettingsRendererRegistry`; settings testers + PRIORITY bands + the terminal `rawJson`
  always-match; `toSettingsForm()`; facet→group-descriptor projection (one model drives both
  open-a-panel and expand-in-place — the gesture is not in the model); the `IndexableSetting[]`
  surface + `SearchProvider` interface (zero-dep substring default) + the engine-independent
  scoped-filter parser (`@modified`/`@facet:`/`@scope:`/`@secret`/`@advanced`); provenance→badge/
  lock/reset config; dirty/save/undo events. → `/zodal-dials-dev-ui`.
- **`@zodal/dials-ui-vanilla` — reference renderer.** Prove the headless contract: scalar widgets,
  `objectRecurse` within a depth budget, and the `rawJson` fallback that says *why* it declined.
  Models on `zodal-ui-vanilla`. → `/zodal-dials-dev-ui`.
- **`@zodal/dials-store-env` / `-jsonc`.** First store adapters: env as a high-precedence
  read-mostly scope (one deterministic key↔env mapping); JSONC with a format-preserving writer
  (`jsonc-parser` `modify()`+`applyEdits()`, not `JSON.stringify`-overwrite). → `/zodal-dials-dev-monorepo`.

---

## 6. Horizon 3+ — later (coarse, sharpen when reached)

- **More renderers** — `@zodal/dials-ui-shadcn` (RHF + zodResolver + shadcn); `-cli` prompt
  renderer; `-web-components` embeddable panels. Search adapter packages (MiniSearch default; Orama
  for facet/semantic; opt-in transformers.js semantic provider behind the `SearchProvider` seam).
- **More stores** — `-toml`/`-yaml` format-preserving writers; `-keychain`/`-vault` secret backends;
  reuse `zodal-store-*` (fs/localStorage/S3/Supabase) as config backends.
- **Codegen** — emit JSON Schema (+ `$schema` injection); `toPrompt()`; CLI `get`/`set
  <key> [--scope]`/`list --show-origin` (provenance!).
- **Constraint solving** — an optional solver-adapter seam (`json-rules-engine` middle tier; a
  propositional IR exportable to SAT/CSP) for propagation / auto-disable / "complete me to a valid
  config". No bundled solver.

---

## 7. Cross-cutting workstreams (run alongside)

- **CI/publish** — `validate` + `publish` jobs scaffolded; `publish` stays dormant until the owner
  approves the first release (`[publish]` marker on `main`). Never publish from a laptop. →
  `/zodal-dials-dev-monorepo`.
- **Testing** — contract tests per package (mirror `zodal-store-fs`'s `describe.each`); the cascade +
  provenance and secret-never-leaks benchmarks are the flagships. → `/zodal-dials-dev-cascade`.
- **Work tracking** — one GitHub issue per near-term task; issues as the dev journal; design
  rationale → discussions; this plan + skills stay the durable map.
- **Docs** — keep `research_guide.md`, `research/README.md` (decision table), and this plan as the
  SSOT; update on every decision change.

---

## 8. Decisions — baked in vs. open

**Baked in (with rationale; proceed unless the owner overrides):**
- A settings document = a **degenerate one-item zodal collection**; reuse `defineCollection`,
  inference, registry, bifurcation, codecs, `explain()`. (Synthesis §3.)
- **Cascade**: ordered scopes (data, not constants) × sparse layers; RFC 7386 internal / RFC 6902
  history; `UNSET` sentinel (not `null`); type-directed per-key merge; provenance first-class.
- **Organization**: faceted (multi-membership), tree = projection; gesture (panel vs accordion) is
  not in the model.
- **Secrets**: a `sensitivity` storage-role routed via bifurcation → masked `SecretRef`.
- Monorepo + `pnpm -r publish`, `[publish]`-gated CI, **no changesets**, manual version bumps
  (modeled on zodal/zodal-graphs). Publish under the `@zodal` org; packages `@zodal/dials-*`.
- Recommended renderers beyond vanilla + shadcn: **`-cli`** and **`-web-components`** (most apt for
  the settings domain). Owner may redirect.

**Open — working default lets building proceed; owner's call to change** (full detail in
[`research/raw/04-synthesis.md` §5](research/raw/04-synthesis.md)):
1. **Flat keyspace from a nested Zod schema.** *Default:* flatten an object schema to dotted keys;
   leave a registration seam for atomic settings. Confirm against `defineCollection`/affordance
   machinery before committing.
2. **Hard-constraint home.** *Default:* author in Zod `.refine`/`.superRefine` (validation SSOT) and
   *emit* a serializable `{ assertion, message }` mirror for solver export. Decide sync direction.
3. **`UNSET` sentinel surface.** *Default:* a unique symbol internally; an explicit token in
   serialized layers / CLI / patch log, distinct from `null`. Unit-test the chosen merge-patch lib
   against RFC 7386 §1.
4. **Secret backend contract.** *Default:* `createSensitiveSettingsProvider` = `createBifurcatedProvider`
   specialized; masked reads + lazy reveal seam. Defer per-field reveal authorization/audit.
5. **Codec home & key codecs.** *Default:* field-level codecs in `dials-core`; `envCodec`/`tomlCodec`
   provider wrappers in `dials-store-*`. Decide whether key codecs (snake_case↔camelCase) unify with
   value codecs. Consider how much of dol's `wrap_kvs` to port.
6. **Solver/feature-model scope for v1.** *Default:* ship only the propositional-translatable
   constraint IR (door open); defer a reference `json-rules-engine`/`logic-solver` adapter.

---

## 9. Risks & gates

| Risk | Mitigation / gate |
|---|---|
| Cascade/provenance wrong → expensive rework | **Cascade + provenance benchmark is the checkpoint-1 gate.** Fix the model before building UI. |
| Secret leaks into store / export / log | **Secret-never-leaks benchmark is a checkpoint-1 gate.** |
| Merge-patch library diverges from RFC 7386 | Unit-test against the RFC §1 example table; pin/replace the lib if it disagrees. |
| `null` vs delete confusion | Explicit `UNSET` sentinel; never overload `null`. |
| Zod v4 codegen drops nested `.meta()` | Verify against zodal `codegen.ts`; register-before-wrap on the affordance registry. |
| Accidental npm publish | CI is `[publish]`-gated; never publish from a laptop; first publish needs owner approval. |
| Skill/plan drift | The skill-maintenance loop (AGENTS.md): revise the skill in the same change that alters the contract. |

---

## 10. How an agent executes a near-term task

1. Read the issue + open the routed `/zodal-dials-dev-<skill>` (it routes the research docs).
2. Branch (`feat/<task>`); report the starting branch.
3. Build to the task's acceptance criteria; write the benchmark/contract test first where one is
   specified.
4. Run `pnpm build && pnpm typecheck && pnpm test`.
5. For a checkpoint: spawn the `dials-checkpoint-critic` agent, apply fixes, open a PR, merge.
6. Update this plan + the affected skill if the work changed a contract. **Never** publish.
