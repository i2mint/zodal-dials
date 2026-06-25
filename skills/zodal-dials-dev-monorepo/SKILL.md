---
name: zodal-dials-dev-monorepo
description: Use when working on the zodal-dials MONOREPO structure or its npm PUBLISH pipeline — adding a package, wiring package.json/tsup/tsconfig/exports map, pnpm-workspace + turbo config, peer-dependency ranges on @zodal/*, the .github/workflows/ci.yml validate+publish jobs, the [publish]/[force publish] commit-message release trigger, manual version bumping, or required CI secrets NPM_TOKEN/SSH_PRIVATE_KEY. Triggers on "add a package", "set up the build", "how do we publish", "release to npm", "wire CI", or any scaffolding/release task. Read BEFORE creating a package or touching CI — the publish flow is commit-message-gated and must be modeled exactly on zodal.
metadata:
  audience: developers
---

# zodal-dials · monorepo & publish

zodal-dials is **one monorepo of many lightweight, tree-shakeable packages**, published
as **separate npm packages under the `@zodal` org** (`@zodal/dials-*`) so consumers import
only what they use. The build/publish mechanism is modeled **exactly** on the `zodal` and
`zodal-graphs` monorepos. Do not invent a different release flow.

> **Hard rule from the project owner:** never `npm publish` from your machine. Publishing is
> CI-driven and gated on the owner's explicit approval for the first publish. Your job is to
> get the pipeline correct and commit; a human triggers the release.

**The 7 packages are built** (the initial build merged them in). The job now is *adding the
next* package or *changing the build/publish wiring* — not scaffolding from scratch. The map:

| Package | Role |
|---------|------|
| `@zodal/dials-core` | Canonical settings model + cascade engine — `defineDials`, resolve/provenance, layers, merge, constraints, dependent defaults, secrets. Depends only on `zod` + `@zodal/core` (both peers). |
| `@zodal/dials-ui` | Headless settings-UI layer — `toSettingsForm`, the settings renderer registry, facet grouping, search, change-lifecycle events. Adds `@zodal/ui` peer. |
| `@zodal/dials-codegen` | Machine-interface emit — JSON Schema (editor autocomplete), `toPrompt` (AI), CLI helpers. |
| `@zodal/dials-store-env` | Environment-variable `LayerStore` (high-precedence, read-mostly scope). Node-only. |
| `@zodal/dials-store-jsonc` | JSONC-file `LayerStore` with format-preserving writes (VS Code `settings.json` style). Node-only; carries a **real runtime `dependencies`** (`jsonc-parser`). |
| `@zodal/dials-ui-vanilla` | Vanilla HTML/JS reference renderer — no framework, produces DOM. jsdom tests. |
| `@zodal/dials-ui-shadcn` | React/shadcn renderer — settings-panel components. Externals `react`/`react-dom` (peers); jsdom + `@testing-library/react` tests. |

Patterns now in use (lean on the real packages as templates rather than the abstract template below):
- **Renderer with a framework** (`dials-ui-shadcn`): `react`/`react-dom` are peers (kept out of the
  bundle, externalized by tsup); `@testing-library/react` + `jsdom` drive the unit tests.
- **Framework-free renderer** (`dials-ui-vanilla`): no UI peer, but still `jsdom` for DOM tests.
- **Store adapter with a runtime dep** (`dials-store-jsonc`): a real `"dependencies"` block
  (`jsonc-parser`) — not every package is dependency-free. Node-only, so it carries
  `@types/node` and `"types": ["node"]` in its `tsconfig.json`.

## Repo layout

```
zodal-dials/
  package.json              # private:true, scripts delegate to turbo, packageManager pnpm@9.15.0
  pnpm-workspace.yaml       # packages: [ 'packages/*' ]
  turbo.json                # build dependsOn ['^build'] outputs ['dist/**']; test/typecheck dependsOn build/^build
  tsconfig.base.json        # ES2022, ESNext, moduleResolution bundler, strict, declaration+maps, isolatedModules, verbatimModuleSyntax
  tests/                    # cross-package integration tests (tests/vitest.config.ts) — present and CI-run
  .github/workflows/ci.yml  # validate + publish jobs (see below)
  packages/
    <pkg>/                  # one publishable @zodal/dials-* package each
      package.json
      tsup.config.ts
      tsconfig.json         # extends ../../tsconfig.base.json; sets outDir/rootDir/include
      vitest.config.ts
      src/index.ts          # barrel: value export + `export type` per module
      tests/
```

The root `package.json` is `private: true`; its scripts delegate to turbo:
`build` → `turbo build`, `test` → `turbo test`, `lint` → `turbo lint`,
`typecheck` → `turbo typecheck`, and `test:integration` → `vitest run --config tests/vitest.config.ts`
(the cross-package suite, distinct from per-package `turbo test`). Root devDependencies pin
`turbo`, `typescript`, `vitest`, and `zod` for the workspace.

Cross-package deps inside the monorepo use `"@zodal/dials-core": "workspace:*"` (pnpm
rewrites to the published version at `pnpm publish` time). A package's dependency on the
*external* zodal substrate (`@zodal/core`, `@zodal/store`, `@zodal/ui`) is a **peer
dependency** with a semver range, plus a dev dependency for local builds — exactly like the
satellite packages (`zodal-ui-shadcn`, `zodal-store-fs`).

## The dependency rule (inherited from the ecosystem)

```
@zodal/core  ←  @zodal/dials-core  ←  @zodal/dials-ui  ←  @zodal/dials-ui-* (renderers)
                       ↑
@zodal/store  ←  @zodal/dials-store-*
```

- **`dials-core`** depends only on `zod` + `@zodal/core` (both peers). **No renderer/store deps.**
- **`dials-ui`** depends on `@zodal/core` + `@zodal/dials-core` + the `@zodal/ui` peer. It is the
  headless UI layer.
- **renderer packages (`dials-ui-*`)** depend on `@zodal/dials-ui` **only** — never on another
  renderer.
- **store adapters (`dials-store-*`)** depend on `@zodal/store` + `@zodal/dials-core`.
- **Hard rule:** `dials-ui` and `dials-store-*` never depend on each other. Shared logic belongs
  in `@zodal/dials-core`.

## Per-package `package.json` template (model on the real packages, or `zodal-graphs/packages/graph-core`)

```jsonc
{
  "name": "@zodal/dials-core",
  "version": "0.1.0",
  "description": "Canonical settings model, cascade + provenance engine, and defineDials for zodal-dials",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts",  "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  },
  "publishConfig": { "access": "public" },
  "files": ["dist"],
  "scripts": { "build": "tsup", "prepublishOnly": "pnpm build", "test": "vitest run", "typecheck": "tsc --noEmit" },
  "peerDependencies": { "@zodal/core": "^0.1.0", "zod": ">=4.1.13" },
  "devDependencies": { "@zodal/core": "^0.1.2", "tsup": "^8.0.0", "typescript": "^5.7.0", "vitest": "^3.0.0", "zod": "^4.4.0" }
}
```

- **Types-first conditional exports**: every condition (`import`/`require`) nests `types` FIRST,
  then `default`. ESM gets `.d.ts`/`.js`; CJS gets `.d.cts`/`.cjs`. tsup emits both `.d.ts` and
  `.d.cts` because `format: ['cjs','esm']` + `dts: true`.
- **Peer deps** are always: `zod: ">=4.1.13"` + `@zodal/core`, plus **one** of —
  `@zodal/dials-core` (for `dials-ui`), `@zodal/store` + `@zodal/dials-core` (for store adapters),
  or `@zodal/dials-ui` (for renderers). Mirror each peer in `devDependencies` so local builds
  resolve. An **optional** peer (e.g. a renderer's UI framework) is declared in
  `peerDependenciesMeta` with `{ optional: true }`.
- A package may carry a **real `dependencies`** block — `dials-store-jsonc` ships `jsonc-parser`.
  Only put a runtime lib here; everything else stays a peer or dev dep.
- **Node-only packages** (the store adapters) declare `@types/node` in `devDependencies` and set
  `"types": ["node"]` in their `tsconfig.json` (`dials-store-jsonc` does both). A browser-targeting
  package does not.
- The **`exports` map must mirror tsup output.** Multi-entry packages (e.g. a `./node` subpath for
  Node-only file I/O in a store adapter) add the entry to `tsup.config.ts` AND a parallel subpath
  block here.
- Keep optional Node-only file I/O (`fs`) behind a separate `./node` entry with dynamic
  `await import('node:fs/promises')` rather than a top-level import — so a package meant to load in a
  browser doesn't break. (The store adapters are wholly Node-only, so this only matters for mixed
  packages.)

### Companion configs (uniform across packages)

```ts
// tsup.config.ts
export default defineConfig({
  entry: ['src/index.ts'],      // add more entries for subpath exports
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

```jsonc
// tsconfig.json
{ "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src"] }
```

```ts
// vitest.config.ts
export default defineConfig({ test: { globals: false } });
```

## The publish pipeline (`.github/workflows/ci.yml`)

Single workflow, **two jobs**, identical shape to zodal:

- **`validate`** (every push/PR to `main`, unless commit msg has `[skip ci]`):
  `checkout@v6` → `pnpm/action-setup@v5` → `setup-node@v6` (node 22, pnpm cache) →
  `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm build` → `pnpm test`
  → `pnpm test:integration`.
  - The **integration-test step is now ENABLED** in `ci.yml` (`pnpm test:integration`) — no longer
    commented out — since the packages and the root `tests/vitest.config.ts` exist. Keep it green; a
    new package that touches a cross-package contract should add to the root suite.
- **`publish`** (`needs: validate`; runs only when **all** of: `github.event_name == 'push'`,
  `github.ref == 'refs/heads/main'`, and the commit message contains `[publish]` or
  `[force publish]`; `permissions: contents: write`):
  `checkout@v6` with `fetch-depth: 0` → `setup-node` with
  `registry-url: https://registry.npmjs.org` → install → build →
  **publish step** (`env NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`):
  ```bash
  FORCE=""
  if [[ "<commit message>" == *"[force publish]"* ]]; then FORCE="--no-git-checks"; fi
  pnpm -r publish --access public $FORCE
  ```
  (recursive across all workspace packages; `pnpm -r publish` skips versions already on the
  registry **without erroring**, so a real failure — bad token, registry 5xx — is **not** swallowed
  and no tag is pushed for a release that never reached npm; `FORCE=--no-git-checks` only on
  `[force publish]`) → configure SSH from `secrets.SSH_PRIVATE_KEY`, `ssh-keyscan github.com`, set
  the `origin` remote to the SSH URL → **tag** `v${dials-core version}` and push the tag.

> **Tag is derived from `packages/dials-core`** — the lead package / version anchor:
> `VERSION=$(node -e "console.log(require('./packages/dials-core/package.json').version)")`.
> Once packages version independently, switch to per-package tags (e.g. `@zodal/dials-core@X`).
> See `docs/dev-plan.md`.

**Required secrets:** `NPM_TOKEN` (npm automation token with `@zodal` publish rights) and
`SSH_PRIVATE_KEY` (deploy key with push access for the tag). `GITHUB_TOKEN` is the default token
used for `checkout`.

## Versioning & releasing

- **No changesets, no semantic-release, no Lerna.** Versions are bumped **by hand** in each
  package's `package.json`.
- To cut a release: bump the relevant `version`(s), commit with **`[publish]`** in the message,
  push to `main`. CI validates then publishes. Use **`[force publish]`** only to bypass git checks.
  Use `[skip ci]` to skip validation on a no-op commit.
- A normal commit (no marker) just runs `validate` — safe to push freely. The `publish` job is
  present in `ci.yml` but **never triggers** without a `[publish]`/`[force publish]` marker, so it
  has stayed dormant through the whole build.
- **Nothing is published yet.** The 7 packages are built and CI-green but not on npm — the
  **first publish needs the owner's explicit approval.** Never publish from a laptop.

## How a package ships (the build loop)

Every one of the 7 packages went through the same loop, and a new package should too:
**build → adversarial critic (1–2 passes) → fix + regression test → CI-green PR → merge.** A
spawned critic agent reviews each package against its contract and the Zod v4 gotchas; its findings
are fixed with a regression test guarding each, and the per-package adversarial findings are recorded
in **`docs/lessons-from-the-build.md`** — read it before adding a package so you don't re-hit a known
trap.

## Conventions (from the zodal ecosystem)

- Factory functions, never classes. Headless: emit plain config objects, never DOM.
- Every module opens with a top-level docstring (auto-extracted for docs).
- ESM `.js` extensions on all internal imports; `import type` for type-only.
- Tests co-located per package in `tests/*.test.ts`; cross-package integration tests live in the
  root `tests/` (run via `pnpm test:integration`). Heavy/manual tests excluded from CI.

## Files routed into this skill (model on these)

- `zodal-dials/.github/workflows/ci.yml` — the validate+publish workflow as it stands on disk.
- `zodal-dials/package.json`, `…/pnpm-workspace.yaml`, `…/turbo.json`, `…/tsconfig.base.json` — root config.
- `zodal-dials/packages/dials-store-jsonc/` — the real Node-only store-adapter template (runtime
  `dependencies`, `@types/node`, `"types": ["node"]`).
- `zodal-dials/packages/dials-ui-shadcn/` — the real framework-renderer template (react/react-dom
  peers, `@testing-library/react` + jsdom tests).
- `zodal-graphs/packages/graph-core/{package.json,tsup.config.ts,tsconfig.json,vitest.config.ts}` —
  the per-package template trio (dual CJS/ESM, types-first conditional exports).
- `docs/lessons-from-the-build.md` — per-package adversarial findings; read before adding a package.
- `docs/dev-plan.md` §7 (CI/publish workstream) — the build order this serves.

## Maintenance

If the publish flow changes (e.g. the owner later adopts changesets or per-package tags), update
this skill and `docs/dev-plan.md` together. Keep the workflow snippet here matched to the actual
`ci.yml` on disk — especially the now-enabled integration-test step and the `dials-core`-derived tag.
