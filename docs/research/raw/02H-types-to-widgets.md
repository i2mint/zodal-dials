# 02H — Type-to-Widget Mapping for Settings (dimension J)

> Research for **zodal-settings**. How established settings/config/form systems map a
> declared *type* to a UI *control* (a "widget" in RJSF terms; an "affordance →
> widget" in zodal terms), and — crucially — how they handle **value-nesting**:
> settings whose value is itself an irreducible structured object that cannot be
> dissolved into the grouping layer. Concludes with a recommendation for how the
> zodal renderer registry + affordance inference should treat **scalar-leaf** vs
> **sub-schema** settings.

---

## TL;DR

- **Two orthogonal kinds of nesting must be separated.** *Organizational nesting*
  (`editor.fontSize`, `editor.fontFamily` — dotted keys that form a tree purely for
  grouping) collapses into the facet/grouping layer and never becomes a widget. *Value
  nesting* (a setting whose value **is** an object/array, e.g. `files.exclude`,
  `launch.configurations`) is an irreducible structured value and demands either a
  recursive sub-form or a raw-text fallback. zodal must make this distinction a
  first-class affordance signal, not an implementation accident.
- **Every mature system converges on the same pattern**: rich inline widgets for
  scalar leaves (bool→switch, enum→select/radio, bounded number→slider, format→
  specialized picker), a **recursive descent** for *simple, closed* object/array
  values, and an **honest raw-text fallback** (JSON/YAML editor, or VSCode's literal
  "Edit in settings.json" link) the moment the value is open-ended, deeply nested, or
  type-mismatched. This is exactly zodal's "renderers degrade honestly" thesis.
- **Selection is done by ranked, composable testers** (JSON Forms) or by
  type+format+name inference (RJSF, Storybook, uniforms). zodal already has the
  better machinery (capability-ranked registry); the contribution here is the
  *settings-specific affordance vocabulary* and a default low-priority `rawJson`
  renderer that always matches, guaranteeing total coverage.
- **KEEP**: format-driven specialized widgets, ranked-tester selection, recursive
  descent for closed objects, a guaranteed raw-JSON terminal fallback, an explicit
  "open in source" escape hatch. **AVOID**: silently dropping unsupported values,
  flattening value-objects into the grouping tree, hand-rolling per-type control
  logic instead of registry entries.

---

## 1. The core distinction: organizational vs value nesting

A dotted key like `editor.cursorBlinking` is *organizational* nesting. VSCode, GSettings
and others treat the dotted path purely as a grouping/namespacing device — the leaf is a
scalar enum, and the tree is one rendered projection of that grouping (exactly the
facet→tree relationship in zodal's vocabulary). The settings UI never renders an
"editor" object widget; it renders the leaf.

By contrast `files.exclude` (`{ "**/.git": true, ... }`) or
`launch.configurations` (an array of objects) is *value* nesting: the **value of one
key is itself a structured object/array**. There is no grouping interpretation — the
object is the datum. This is the irreducible case. Mapping it requires either (a)
recursive descent into a sub-form, or (b) a raw structured-text editor. The literature
is unanimous that the fallback path is mandatory, because object/array values are
open-ended and the UI cannot enumerate their shape ahead of time.

zodal must encode this as an affordance: a field is either a **scalar leaf** (its Zod
node is a primitive/enum/bounded-number) or a **sub-schema value** (object/array/record/
union). The grouping layer consumes organizational structure; the renderer registry
consumes value structure.

---

## 2. Scalar-leaf type→widget map (the easy, well-trodden part)

Cross-referencing RJSF [1], Storybook controls [4], Home Assistant selectors [6],
GSettings ranges [7], and VSCode, the consensus scalar map is:

| Declared shape | Canonical widget(s) | Sources |
|---|---|---|
| boolean | switch / checkbox (RJSF default checkbox; radio or select alt) | RJSF [1], HA boolean [6] |
| enum (string union, small N) | radio / segmented (≤~5) → select (more); GSettings `enum` range | RJSF [1], GSettings [7] |
| enum + multi-membership | multi-select / checkboxes; GSettings `flags` range | GSettings [7], Storybook `check` [4] |
| bounded number (min+max known) | slider/range; HA `number` slider-vs-box mode; GSettings `range` | RJSF `range` [1], HA [6], GSettings [7] |
| unbounded number | stepper / number input (`updown`) | RJSF [1] |
| string (free) | text / textarea / password | RJSF [1] |
| `format: color` | color picker (`input[type=color]`); HA `color_rgb`→`[r,g,b]` | RJSF [1], HA [6] |
| `format: date`/`date-time`/`time` | native date/datetime/time pickers | RJSF [1], HA [6] |
| `format: data-url` | file picker (`input[type=file]`, arrays→multi) | RJSF [1] |
| duration / size | composite numeric+unit (HA `duration`) | HA [6] |
| keybinding | **custom capture control** ("Record Keys" in VSCode) | VSCode [8] |

**Inference-source ordering matters.** RJSF/uniforms/Storybook infer widget from
*type → format → name heuristic*, then allow explicit override (RJSF `ui:widget`,
Storybook `argTypes`, uniforms component prop). Storybook only auto-infers two by
*name* regex — color and date pickers [4]. This validates zodal's multi-layer inference
ordering (Zod type → refinements → name heuristics → `.meta()` → registry → explicit).
Bounded-number detection should read Zod `.min()/.max()` refinements; enum from
`z.enum`/`z.literal` unions; color/duration/keybinding/file from `.meta()` affordance
tags or `format`, since Zod has no native "color" type.

**Keybinding** is notable: no schema system infers it; VSCode ships a *bespoke* capture
widget that listens for live keypresses and supports chords [8]. In zodal this is a
`.meta({ affordance: 'keybinding' })`-tagged string with a custom renderer — a clean
demonstration of the escape-hatch + registry model.

---

## 3. Value-nesting: how each system handles irreducible structured values

### VSCode — recursive-for-simple, "Edit in settings.json" otherwise

VSCode's Settings Editor is the most instructive case because it is *settings-native*
(not a generic form lib). Its documented rule: "Other types, such as object and array,
aren't exposed directly in the settings UI, and can only be modified by editing the
JSON directly" [3][5]. In practice this is now *partially* relaxed: the editor renders
**simple objects** — a flat `{ string: string|bool|enum }` map — as inline key/value
widget rows, and renders **string arrays** as add/remove list rows. But the moment a
value contains **non-string enum values, nested objects, or mixed types**, it falls
back, and historically even valid boolean/number enum values inside objects triggered
type-mismatch errors [2]. For genuinely complex settings (`workbench.colorCustomizations`,
`launch.configurations`) the UI shows a literal **"Edit in settings.json" link** —
an explicit, honest escape hatch to the raw source [5]. The boundary VSCode draws is:
*flat + closed + homogeneous-scalar → inline; everything else → raw JSON*.

### GSettings / dconf-editor — type-driven, GVariant-as-fallback

GSettings keys carry a GVariant type string and an optional *range* descriptor
(`g_settings_get_range` returns `(sv)` where the string is `'type'`, `'enum'`,
`'flags'`, or `'range'`) [7]. `enum`→ fixed dropdown, `flags`→ multi-check, `range`→
bounded slider/spin, plain `'type'`→ type-appropriate scalar editor. Complex GVariant
values (arrays, dicts, tuples — `a{sv}`, `(ii)`) have **no graphical widget**; dconf-editor
exposes them as a **raw GVariant text field** the user types into, with type validation
on commit. Same shape as VSCode: enumerated scalar metadata drives rich widgets;
structured variants fall to typed text.

### Schema-form libraries — recursive descent + combinator/fallback

- **RJSF**: objects → recursive `ObjectField` rendering one sub-field per property;
  arrays → `ArrayField` with add/remove/reorder, falling back to `SchemaField` per item
  [1]. For *unsupported / unknown* types RJSF added an **opt-in `FallbackField`**
  (`useFallbackUiForUnsupportedType`) that lets the user pick a JSON primitive type and
  edit matching data; it was extended to cover `object` and `array` [RJSF docs]. So RJSF
  descends when the schema is closed, and offers a generic typed-value fallback when it
  is not.
- **JSON Forms**: the cleanest model and the closest cousin to zodal. Selection is via
  **ranked testers** — every renderer registers a tester `(uischema, schema) => number`;
  `-1`/`NOT_APPLICABLE` means "can't", higher number wins; default renderer set ranks
  at **2**, so a custom renderer ranks ≥3–5 to override [JF renderer-sets/custom].
  Objects render via a layout renderer descending into properties; arrays via an array
  layout renderer (add/remove/expand). Testers compose with `and`/`or` predicates over
  schema shape. **anyOf/oneOf combinators** get a dedicated combinator renderer (tab/
  select-the-variant UI) — directly relevant to discriminated unions [JF combinators].
- **uniforms**: `AutoField` picks the component by schema type via a `bridge`; objects
  recurse (`NestField`), arrays via `ListField` with add/remove/reorder; any node can be
  overridden by passing an explicit component [uniforms].
- **Storybook controls**: infers from arg type; **object and array both render a JSON
  editor by default** [4] — i.e. Storybook *always* uses the raw-text fallback for
  structured values and never auto-descends (the `storybook-addon-deep-controls`
  community addon adds descent). A pragmatic data point: for many tools, raw-JSON is the
  *only* structured-value strategy.

### Home Assistant (voluptuous + selectors) — typed selectors + `object` YAML fallback

HA config/options flows declare schema with voluptuous + a **selector** vocabulary that
is almost exactly a settings widget map: `boolean`, `number` (min/max/step/unit, mode
slider|box), `select`, `entity`, `color_rgb`, `time`, `duration`, `date`, `text`
(single/multi-line) [6]. For structured values it has an **`object` selector**: in
*unstructured* mode it's a raw YAML/JSON editor accepting arbitrary YAML; in *structured*
mode you pass `fields` (child selector schemas) and it renders a **recursive sub-form**,
with `multiple: true` giving an add/remove list and `label_field`/`description_field`
controlling list display [6]. This is the single best template for zodal-settings: one
selector that is *either* a recursive structured form *or* a raw editor, chosen by
whether a sub-schema is supplied.

---

## 4. Discriminated / tagged unions

A discriminated union (Zod `z.discriminatedUnion`, JSON Schema `oneOf` + discriminator)
is a *value*-nested case with a twist: the variant is chosen by a tag field. The
established UI is **pick-the-variant-then-render-its-fields**: JSON Forms' combinator
renderer (tabs or a variant select) [JF combinators]; RJSF renders `oneOf`/`anyOf` as a
variant selector but is known to mishandle union-with-null edge cases [RJSF #4380].
Recommendation: zodal should treat a discriminated union as a sub-schema value whose
renderer first surfaces a segmented/select control bound to the discriminator key, then
recursively renders the selected branch's fields. The discriminator's `z.literal`
options give the select options for free.

---

## 5. Recommendation for zodal-settings

**Model two affordance classes explicitly.** During affordance inference, classify each
field's Zod node:

1. **Scalar-leaf affordance** — primitive / enum / literal-union / bounded-number /
   format-tagged string. Resolve to a concrete widget via the scalar map in §2, driven
   by type → refinement (`.min/.max`) → name heuristic → `.meta()` → registry → explicit.
2. **Sub-schema affordance** — object / record / array / tuple / union. Carries a
   *nested sub-schema* (or, for record/open objects, an *open* flag) and a chosen
   strategy: **recurse**, **list** (array add/remove/reorder), **combinator** (union),
   or **raw**.

**Renderer-registry treatment (ranked, à la JSON Forms / zodal's existing bands):**

- High band: specialized scalar widgets (color, slider, keybinding, duration, file…)
  matched by affordance tag/format.
- Mid band: structural renderers — `objectRecurse` (matches *closed* objects: fixed,
  known properties, bounded depth), `arrayList`, `unionCombinator`.
- **Low/terminal band: a `rawJson` (or `rawYaml`) renderer with a tester that ALWAYS
  matches.** This guarantees total coverage and *honest degradation*: any value the
  richer renderers decline still gets an editable, validated control. This is VSCode's
  "Edit in settings.json", GSettings' GVariant text field, Storybook's JSON editor, and
  HA's unstructured `object` selector, unified into one terminal fallback.

**The descent boundary** (when to recurse vs fall to raw) should mirror VSCode/GSettings:
recurse only when the object is **closed** (all properties known, types resolvable) and
within a configurable **max depth / field-count budget**; otherwise (open record,
`additionalProperties`, deeply nested, mixed-type, or `z.any`/`z.unknown`) drop to raw.
Make the budget a keyword-only config with a sensible default — open-closed, no magic
numbers baked in.

**Always provide the explicit escape hatch.** Independent of which structural renderer
wins, expose an "edit as JSON/source" affordance (the VSCode pattern) so power users can
bypass the generated form for any sub-schema value. This composes with provenance/patch
machinery: a raw edit is just another layer/patch.

**Honest capability reporting** (zodal store-adapter ethos applied to renderers): each
renderer's tester should declare *why* it declined (open object, depth exceeded,
unknown type) so the UI can show "rendered as raw JSON because the value is an open
dictionary" rather than silently degrading — matching zodal's "degrade honestly"
principle.

### KEEP
- Format/refinement-driven specialized scalar widgets (color, slider, file, duration, keybinding).
- Ranked composable testers for renderer selection (JSON Forms model — already zodal's design).
- Recursive descent for *closed, bounded* object/array/union values.
- A guaranteed terminal `rawJson`/`rawYaml` renderer + explicit "edit as source" escape hatch.
- Discriminator-select-then-recurse for tagged unions.

### AVOID
- Flattening value-objects into the organizational grouping/facet tree.
- Silently dropping or erroring on unsupported values (VSCode's old non-string-enum bug [2]).
- Hand-coded per-type branching instead of registry entries.
- Unbounded recursion into open records / `additionalProperties` (no depth budget).
- Assuming raw-JSON is *only* a last resort — for some teams it is the *primary* structured editor (Storybook), so make it first-class, not punitive.

---

## 6. Open questions / unverified

- **Synthesis/opinion**, not cited: the exact closed-vs-open descent budget defaults
  (max depth, field count) — these are design choices, to be tuned empirically.
- VSCode's *precise* current inline-object support (which shapes render vs fall back) is
  reconstructed from docs + issues [2][3][5]; the authoritative rule lives in the
  `settingsEditor`/`settingsWidgets` source and was not read line-by-line here. Flag as
  partially verified.
- Whether to prefer JSON Merge Patch vs full-value replacement when a raw-JSON edit
  touches a sub-schema value interacts with the cascade/patch design (dimension on
  patches) — out of scope here.

---

## References

1. [RJSF — Widgets (built-in type/format → widget map)](https://rjsf-team.github.io/react-jsonschema-form/docs/usage/widgets/)
2. [microsoft/vscode #113587 — Objects with numeric/boolean enum values don't render in the Settings editor](https://github.com/microsoft/vscode/issues/113587)
3. [VSCode — User and workspace settings (object/array not exposed directly; Edit in settings.json)](https://code.visualstudio.com/docs/getstarted/settings)
4. [Storybook — Controls & ArgTypes (control inference; object/array → JSON editor)](https://storybook.js.org/docs/essentials/controls)
5. [VSCode docs — Editing settings; "Edit in settings.json" link for complex settings](https://code.visualstudio.com/docs/getstarted/settings)
6. [Home Assistant — Selectors (boolean, number slider/box, select, entity, color_rgb, duration, object structured/unstructured)](https://www.home-assistant.io/docs/blueprint/selectors/)
7. [GLib/Gio — GSettings reference (g_settings_get_range: type/enum/flags/range; GVariant complex types)](https://docs.gtk.org/gio/class.Settings.html)
8. [VSCode — Keyboard shortcuts (Record Keys capture widget, chord support)](https://code.visualstudio.com/docs/getstarted/keybindings)
9. [JSON Forms — Renderer sets & ranked testers (rank values, default rank 2, NOT_APPLICABLE)](https://jsonforms.io/docs/renderer-sets)
10. [JSON Forms — Custom renderers & testers (rankWith, and/or predicate composition)](https://jsonforms.io/docs/tutorial/custom-renderers)
11. [JSON Forms — Combinators example (anyOf/oneOf variant rendering)](https://jsonforms.io/examples/combinators)
12. [RJSF — Custom widgets & fields incl. FallbackField for unsupported object/array types](https://rjsf-team.github.io/react-jsonschema-form/docs/advanced-customization/custom-widgets-fields/)
13. [uniforms — AutoField / schema bridge automatic field detection](https://uniforms.tools/)
14. [rjsf-team/react-jsonschema-form #4380 — anyOf/oneOf discriminated union + null rendering bug](https://github.com/rjsf-team/react-jsonschema-form/issues/4380)
