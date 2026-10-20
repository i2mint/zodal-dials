# @zodal/dials-ui-shadcn

React renderer for [`@zodal/dials-ui`](https://github.com/i2mint/zodal-dials) — settings panel components that consume the headless config. Plain elements with `zodal-dials-*` classes; swap in shadcn/ui primitives in a consumer.

```bash
npm i @zodal/dials-ui-shadcn @zodal/dials-core @zodal/dials-ui react react-dom
```

```tsx
import { SettingsPanel } from '@zodal/dials-ui-shadcn';
import { toSettingsForm, toFieldStates } from '@zodal/dials-ui';

const result = dials.resolve(layers, { maskSecrets: true });
const form = toSettingsForm(dials, { result });
const states = toFieldStates(form.fields, result, dirtyKeys);

import '@zodal/dials-ui-shadcn/styles.css'; // touch-sized defaults, themable via --zodal-dials-* tokens

<SettingsPanel
  form={form}
  states={states}
  onPreview={applyToView} // while a slider or colour moves
  onChange={setValue}     // once, on release
  onReset={resetKey}
/>
```

- `SettingsPanel`: a search box when the form has more than 15 settings (`search: 'auto'`; `searchThreshold`, or `true`/`false`), a section per facet for the essentials, and advanced settings after them behind one `<details>` that a search match opens (`advanced: 'inline'` opts out). `SettingField` is one row (provenance badges + reset).
- Presentation hooks: `format(field, value)` for a slider's readout and `aria-valuetext` (default: rounded to the step, plus the unit), and `decorateOption(field, value, label)` to render an enum chip's content.
- A colour setting is `<input type="color">`; a short enum is a row of chips; a number shows its unit beside the box.
- `createShadcnSettingsRegistry()` — a per-widget React control registry with a terminal rawJson fallback; register a higher-priority control to override.
- Secrets render **masked** (write-only field, masked status) and never echo plaintext.

Part of the [zodal-dials](https://github.com/i2mint/zodal-dials) ecosystem.
