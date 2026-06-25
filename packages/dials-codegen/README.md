# @zodal/dials-codegen

Machine-interface emit for [zodal-dials](https://github.com/i2mint/zodal-dials): a **JSON Schema** (editor autocomplete/validation for the settings file), an **AI prompt**, and **CLI helpers**.

```bash
npm i @zodal/dials-codegen @zodal/dials-core
```

```ts
import { toJsonSchema, toPrompt, runCli } from '@zodal/dials-codegen';

// 1. JSON Schema — point a settings file's "$schema" at it for autocomplete (flat dotted keyspace,
//    secret values redacted, $schema pointer allowed):
writeFile('dials.schema.json', JSON.stringify(toJsonSchema(dials, { $id: 'https://x/dials.schema.json' })));

// 2. AI prompt — let an assistant help the user configure:
toPrompt(dials); // "# Settings\n- `editor.theme` (enum: light | dark | system, default "system") — …"

// 3. CLI — get/set/list with provenance, secrets masked:
runCli(['list', '--show-origin'], { dials, stack, layer });
// editor.fontSize = 16   (user)
// editor.theme = "dark"  (workspace)
runCli(['set', 'editor.fontSize', '18'], ctx); // validates against the field; returns a new layer
```

- **`toJsonSchema`** — secret defaults/enums/consts redacted; `required` dropped (overrides are optional); a `$schema` property added so the file's own pointer validates.
- **`toPrompt`** — secrets marked `[secret]`, never carrying their value.
- **CLI** (`runCli`/`formatList`/`formatGet`/`coerceByType`) — pure & IO-free; `list --show-origin` surfaces cascade provenance (à la `git config --show-origin`); `set` validates and never echoes a secret; secrets always masked.

Part of the [zodal-dials](https://github.com/i2mint/zodal-dials) ecosystem.
