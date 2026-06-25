# instruments-demo

A runnable demo: a **thoremin-derived settings surface** powered by **zodal-dials**, rendered two
ways you can toggle, with **save/load named "instruments"**.

It shows the whole stack on one real schema:
- **One headless definition** (`src/schema.ts`) — `defineDials` over a flat dotted keyspace (master /
  two voices / face / overlay), grouped by facet, with a cross-field constraint and a soft warning.
- **Two renderers, one toggle** — the React/shadcn `SettingsPanel` vs. the framework-free vanilla-DOM
  `renderSettingsPanel`, both driven by the *same* `createSettingsStore` and the same `toSettingsForm`
  output. This is the point of zodal-dials: swap the renderer, keep everything else.
- **Instruments** — name the current settings and **Save**; **Load**/**Delete** saved ones. Persisted
  to `localStorage` via `createProfileStore` (an "instrument" is a profile = a named sparse layer).
- **Live cascade** — provenance badges (which scope set a value), reset-to-default, a dirty counter,
  validation errors/warnings, and a "current patch" view of the effective values.

## Run

From the monorepo root, build the packages once, then start the dev server:

```bash
pnpm build                       # build the @zodal/dials-* packages the demo imports
pnpm --filter instruments-demo dev
```

Then open the printed URL. Toggle **React / shadcn** ↔ **Vanilla DOM** to compare renderings; tune the
controls, name an instrument, and Save.

> Styling lives in `src/styles.css` — both renderers emit the same `zodal-dials-*` class names, so one
> stylesheet themes both. A real thoremin integration would wire `store`'s effective values to the
> Web Audio engine instead of the "current patch" preview.
