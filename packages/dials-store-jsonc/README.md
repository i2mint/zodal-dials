# @zodal/dials-store-jsonc

JSONC-file [`LayerStore`](https://github.com/i2mint/zodal-dials) for **zodal-dials** with **format-preserving** writes (VS Code `settings.json` style). **Node-only.**

```bash
npm i @zodal/dials-store-jsonc @zodal/dials-core
```

```ts
import { createJsoncStore } from '@zodal/dials-store-jsonc';

const store = createJsoncStore({ path: '~/.config/myapp/settings.jsonc' });
await store.load();                              // { 'editor.fontSize': 14, ... }
await store.save({ 'editor.fontSize': 16 });     // comments & key order preserved
```

The file is a **flat** map of dotted keys → values (`{"editor.fontSize": 14}`), comments allowed. Writes apply targeted `jsonc-parser` edits (comments/order/whitespace preserved), `mkdir` the parent, and write atomically (temp + rename). Saves on one store are **serialized**. The `UNSET` sentinel deletes a key; a plain `undefined` is skipped.

| Capability | |
|---|---|
| readable | ✅ |
| writable | ✅ |
| watchable | ❌ |

## Security

A settings file is plaintext. Either pass **`sensitivityFor`** so the store redacts `secret` keys on save (fail-closed, they never hit disk), or split secrets out yourself (dials-core's `splitBySensitivity`) **before** calling `save`.

```ts
createJsoncStore({ path, sensitivityFor: dials.sensitivityFor }); // secret keys never written
```

Part of the [zodal-dials](https://github.com/i2mint/zodal-dials) ecosystem.
