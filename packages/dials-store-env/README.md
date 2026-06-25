# @zodal/dials-store-env

Environment-variable [`LayerStore`](https://github.com/i2mint/zodal-dials) for **zodal-dials** — a high-precedence, **read-only** scope.

```bash
npm i @zodal/dials-store-env @zodal/dials-core
```

```ts
import { createEnvStore } from '@zodal/dials-store-env';

const env = createEnvStore({
  prefix: 'MYAPP',
  keys: ['editor.fontSize', 'flags.beta'], // env is key-driven
});
// process.env.MYAPP_EDITOR__FONT_SIZE = "18", MYAPP_FLAGS__BETA = "true"
await env.load(); // → { 'editor.fontSize': 18, 'flags.beta': true }
```

| Capability | |
|---|---|
| readable | ✅ |
| writable | ❌ (read-only) |
| watchable | ❌ |

- **Key → env var**: `editor.fontSize` (prefix `MYAPP`) → `MYAPP_EDITOR__FONT_SIZE` (`.`/`-`/`/` → `__`, camelCase → `_`, uppercased). The mapping is **not invertible**; the store throws at construction if two keys collide on one var.
- **Coercion** (`defaultCoerce`) is **lossy-safe**: `true`/`false`, round-trippable numbers, and JSON objects/arrays are parsed; leading-zero / big-int / signed-zero strings are kept as strings. Override per use via `coerce`.

Part of the [zodal-dials](https://github.com/i2mint/zodal-dials) ecosystem.
