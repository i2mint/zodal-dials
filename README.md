# zodal-dials

**Schema-driven settings, configuration & preferences for the [zodal](https://github.com/i2mint/zodal) ecosystem.** Declare your parameters once as a Zod v4 schema; get a typed cascade (defaults → presets → profiles → workspace → user → policy) that resolves an **effective value with provenance**, plus headless UI configuration that any renderer (vanilla, shadcn, …) turns into a settings panel.

> A *setting* is a **dial**: a typed, named parameter you surface and tune. `zodal-dials` is the layer that models a system's dials, merges them across sources, validates the combinations, and renders the panel.

```ts
import { z } from 'zod';
import { defineDials } from '@zodal/dials-core';

const dials = defineDials(
  z.object({
    'editor.fontSize': z.number().min(6).max(72).default(14),
    'editor.theme': z.enum(['light', 'dark', 'system']).default('system'),
    'network.apiKey': z.string().meta({ secret: true }).optional(),
  }),
);

// Resolve across an ordered stack of (possibly partial) layers:
const { effective, provenance } = dials.resolve([
  { scope: 'default', layer: dials.defaults },
  { scope: 'profile', layer: { 'editor.theme': 'dark' } },
  { scope: 'user', layer: { 'editor.fontSize': 16 } },
]);
// effective['editor.theme'] === 'dark'   (provenance: set by 'profile')
// effective['editor.fontSize'] === 16     (provenance: set by 'user', shadows default)
// network.apiKey → masked SecretRef, never plaintext in the queryable store
```

## Why

As an app pushes more parameters to the surface, ad-hoc settings screens collapse under their own weight — inconsistent presentation, no reuse of tuned bundles, no cross-field validation, no way to tell *where a value came from*. `zodal-dials` is the disciplined answer, built on the zodal thesis (**declare once, render anywhere**):

- **Separation of concerns** — the Zod schema is the single source of truth for *what* a setting is; organization (facets/groups) and presentation (widgets) are separate layers, never baked into the schema.
- **The cascade** — an ordered list of named **scopes**, each holding a (possibly partial) **layer**, merged into an **effective value** paired with **provenance** (which scope won, what it shadowed). Reusable bundles are **profiles** and **presets**; partial bundles compose with declared merge strategies.
- **Linked validation & smart defaults** — hard cross-field **constraints** and soft **dependent defaults** as one model of relations over fields, evaluated to *validate* or to *suggest*.
- **Faceted organization & search** — settings carry multiple facet tags (multi-membership); a tree is just one projection. Scoped keyword search (and optional semantic search) over a declared, indexable metadata surface.
- **Secrets** — a `sensitivity` field role routes secret values to a separate secret backend, returning a masked reference, never plaintext.

It **wraps, it doesn't rebuild**: a settings document is modeled as a degenerate one-item zodal collection, reusing zodal's affordance inference, renderer registry, codecs, `explain()`, and content/metadata bifurcation.

## Packages (monorepo → tree-shakeable `@zodal/dials-*`)

| Package | Role |
|---|---|
| `@zodal/dials-core` | The settings model + **cascade engine**: `defineDials`, `resolve()`/provenance, type-directed merge, layers (RFC 7386) + history (RFC 6902), constraints + dependent defaults, lifecycle/migration, `SecretRef`, codecs, `explain()`. |
| `@zodal/dials-ui` | Headless UI layer: `toSettingsForm()`, a capability-ranked settings renderer registry, facet→group projection, the indexable-search surface + pluggable `SearchProvider`, provenance/dirty/save events. |
| `@zodal/dials-store-*` | Persistence/secret adapters (`-env`, `-toml`, `-yaml`, `-jsonc`, `-keychain`, …) as `DataProvider` + codec compositions. |
| `@zodal/dials-ui-vanilla` · `@zodal/dials-ui-shadcn` · … | Concrete renderers (vanilla reference + shadcn + 1–2 more). |

See [`docs/dev-plan.md`](docs/dev-plan.md) for the phased, horizon-graded plan and [`docs/zodal-dials-concept.md`](docs/zodal-dials-concept.md) for the design intent.

## A settings sheet on a phone (`@zodal/dials-ui-vanilla`)

The schema says what each control needs; the vanilla renderer draws it, and an optional stylesheet sizes it for touch (44px targets, a 28px slider thumb, inputs at 16px or more) while inheriting the host's fonts.

```ts
import { toSettingsForm, toFieldStates } from '@zodal/dials-ui';
import { renderSettingsPanel } from '@zodal/dials-ui-vanilla';
import '@zodal/dials-ui-vanilla/styles.css'; // or <link rel="stylesheet"> to the file

const look = defineDials(z.object({
  placement: z.enum(['above', 'inline']).default('above')
    .meta({ enumLabels: { above: 'Above the line', inline: 'In the line' } }),   // chips show labels
  opacity: z.number().min(0.1).max(1).multipleOf(0.05).default(0.8),            // step 0.05
  chordSize: z.number().min(8).max(32).default(14).meta({ step: 1, unit: 'px' }), // readout "14px"
  ink: z.string().default('#222222').meta({ editWidget: 'color' }),              // <input type="color">
  lineSpacing: z.number().min(1).max(2).default(1.2).meta({ advanced: true }),    // behind "Advanced"
}));

const result = look.resolve([{ scope: 'user', layer: savedLayer }]);
const form = toSettingsForm(look, { result });
const states = toFieldStates(form.fields, result);
const panel = renderSettingsPanel(form, states, {
  onPreview: (key, value) => applyToView(key, value), // while a slider or colour moves
  onChange: (key, value) => store.set(key, value),     // once, on release
  format: (field, v) => (field.key === 'opacity' ? `${Math.round(Number(v) * 100)}%` : undefined),
});
```

The search box appears only when the form has more than 15 settings (`search: 'auto'`, the default; tune with `searchThreshold`, or force it with `search: true` / `false`).

A value that depends on another value (ink colour per paper, say) is best modelled as one setting per case (`ink.light`, `ink.dark`) with the host showing the one that applies, or as a scope the host pushes onto the cascade; the renderer does not key one setting by another.

## Status

**Design phase.** This repo currently holds the research corpus ([`docs/research/`](docs/research/)), the design plan, and the agent dev toolkit. No package code yet — the first build checkpoint is `@zodal/dials-core` (the cascade keystone). Nothing is published to npm.

## Part of the zodal ecosystem

`zodal-dials` is the **settings/configuration specialization** of zodal, built the way [`zodal-graphs`](https://github.com/i2mint/zodal-graphs) specializes it for graphs: one canonical Zod model, a declared affordance layer, and pluggable targets selected by a capability-ranked registry. See the [zodal monorepo](https://github.com/i2mint/zodal).

## License

MIT
