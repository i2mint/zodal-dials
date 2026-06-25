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

<SettingsPanel form={form} states={states} onChange={setValue} onReset={resetKey} />
```

- `SettingsPanel` (search + facet sections) and `SettingField` (one row, provenance badges + reset).
- `createShadcnSettingsRegistry()` — a per-widget React control registry with a terminal rawJson fallback; register a higher-priority control to override.
- Secrets render **masked** (write-only field, masked status) and never echo plaintext.

Part of the [zodal-dials](https://github.com/i2mint/zodal-dials) ecosystem.
