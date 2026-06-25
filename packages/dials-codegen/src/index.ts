/**
 * @zodal/dials-codegen — machine-interface emit for zodal-dials.
 *
 * - `toJsonSchema(dials, options?)` — a JSON Schema for editor autocomplete/validation of a settings
 *   file (`$schema` target; flat dotted keyspace; secret defaults redacted).
 * - `toPrompt(dials, options?)` — an AI/LLM-consumable description of the settings.
 * - CLI helpers — `runCli`/`formatList`/`formatGet`/`coerceByType`: the logic behind a
 *   `dials get|set|list --show-origin|unset` command (provenance-aware, secrets masked, IO-free).
 */

export { toJsonSchema } from './json-schema.js';
export type { ToJsonSchemaOptions } from './json-schema.js';

export { toPrompt } from './prompt.js';
export type { ToPromptOptions } from './prompt.js';

export { runCli, formatList, formatGet, coerceByType } from './cli.js';
export type { CliContext, RunCliResult, ListOptions } from './cli.js';

export { describeForCodegen } from './introspect.js';
export type { CodegenField } from './introspect.js';
