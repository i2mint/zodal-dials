/**
 * Emit a JSON Schema for a settings surface — point a settings file's `$schema` at it and any editor
 * gives autocomplete + validation (the VS Code `settings.json` experience). The schema describes the
 * FLAT dotted keyspace; `required` is dropped by default (a settings file is a sparse override, every
 * key optional) and secret defaults are redacted (the schema carries structure, not secret values).
 */

import { z } from 'zod';
import type { DialsDefinition } from '@zodal/dials-core';
import { describeForCodegen } from './introspect.js';

export interface ToJsonSchemaOptions {
  $id?: string;
  title?: string;
  /** Allow keys not in the schema. Default: false (flags typos in a settings file). */
  additionalProperties?: boolean;
  /** Keep `required` (default: false — settings overrides are all optional). */
  keepRequired?: boolean;
}

function fallbackSchema<T extends z.ZodObject<z.ZodRawShape>>(dials: DialsDefinition<T>): Record<string, unknown> {
  const properties: Record<string, Record<string, unknown>> = {};
  for (const field of describeForCodegen(dials)) {
    const prop: Record<string, unknown> = {};
    if (field.type === 'number' || field.type === 'boolean') prop.type = field.type;
    else if (field.type === 'enum') {
      prop.type = 'string';
      if (field.enumValues) prop.enum = field.enumValues;
    } else if (field.type === 'array') prop.type = 'array';
    else if (field.type === 'object') prop.type = 'object';
    else prop.type = 'string';
    if (field.default !== undefined) prop.default = field.default;
    if (field.description) prop.description = field.description;
    properties[field.key] = prop;
  }
  return { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties };
}

/** Build a JSON Schema describing the settings (for editor autocomplete/validation). */
export function toJsonSchema<T extends z.ZodObject<z.ZodRawShape>>(
  dials: DialsDefinition<T>,
  options: ToJsonSchemaOptions = {},
): Record<string, unknown> {
  let schema: Record<string, unknown>;
  try {
    // z.toJSONSchema throws on unrepresentable types — fall back to a hand-built schema.
    schema = z.toJSONSchema(dials.schema) as Record<string, unknown>;
  } catch {
    schema = fallbackSchema(dials);
  }

  if (!options.keepRequired) delete schema.required;
  schema.additionalProperties = options.additionalProperties ?? false;
  if (options.$id) schema.$id = options.$id;
  if (options.title) schema.title = options.title;

  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (properties) {
    // Redact ALL value-bearing keywords for secret keys — not just `default`, but `const`/`enum`/
    // `examples` too — so a secret's value (or value set) never appears in the emitted schema.
    for (const key of Object.keys(properties)) {
      if (dials.sensitivityFor(key) === 'secret') {
        const prop = properties[key];
        delete prop.default;
        delete prop.const;
        delete prop.enum;
        delete prop.examples;
      }
    }
    // Allow the conventional `"$schema": "…"` pointer the settings file carries, so the schema does
    // not reject the very file it is meant to validate under `additionalProperties: false`.
    if (schema.additionalProperties === false && !properties['$schema']) {
      properties['$schema'] = { type: 'string' };
    }
  }
  return schema;
}
