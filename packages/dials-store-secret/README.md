# @zodal/dials-store-secret

The secret side of [zodal-dials](https://github.com/i2mint/zodal-dials)' content/metadata **bifurcation** — route secret values to a separate backend, never the config store.

```bash
npm i @zodal/dials-store-secret @zodal/dials-core
```

```ts
import { createMemorySecretBackend, createSensitiveSettingsProvider, revealSetting } from '@zodal/dials-store-secret';
import { createJsoncStore } from '@zodal/dials-store-jsonc';

const secrets = createMemorySecretBackend();          // or an OS-keychain / Vault backend
const provider = createSensitiveSettingsProvider({
  config: createJsoncStore({ path: 'settings.jsonc' }),
  secrets,
  sensitivityFor: dials.sensitivityFor,
});

await provider.save(layer);   // non-secret -> config file; secret -> backend (JSON-encoded)
await provider.load();        // config values + a masked SecretRef per secret (never plaintext)
await revealSetting(secrets, 'network.apiKey'); // explicit, decoded reveal
```

- **`createMemorySecretBackend()`** — a reference `SecretBackend` (in-memory; dev/test). Real backends (keychain, Vault, encrypted file) implement the same interface.
- **`createSensitiveSettingsProvider`** — a bifurcated `LayerStore`: splits the layer on save (secrets → backend, JSON-encoded so object-valued secrets survive; config → config store), surfaces masked `SecretRef`s on load. Secrets-first writes; throws (not silently drops) on a read-only config; `UNSET` deletes a secret.

Part of the [zodal-dials](https://github.com/i2mint/zodal-dials) ecosystem.
