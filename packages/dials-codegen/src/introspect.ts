/**
 * Internal per-key descriptor for codegen (type, default, enum values, description, sensitivity),
 * derived from a `DialsDefinition` via dials-core introspection + `@zodal/core` enum extraction.
 */

import type { z } from 'zod';
import { baseType, getObjectShape, readMeta } from '@zodal/dials-core';
import type { DialsDefinition, Sensitivity } from '@zodal/dials-core';
import { getEnumValues } from '@zodal/core';

export interface CodegenField {
  key: string;
  type: string;
  default: unknown;
  enumValues?: string[];
  description?: string;
  sensitivity: Sensitivity;
}

function safe<R>(fn: () => R): R | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/** Describe every setting for codegen consumers (schema/prompt/CLI). */
export function describeForCodegen<T extends z.ZodObject<z.ZodRawShape>>(dials: DialsDefinition<T>): CodegenField[] {
  const shape = getObjectShape(dials.schema);
  return dials.keys.map((key) => {
    const field = shape[key];
    const meta = field ? readMeta(field) : {};
    const enumValues = field ? safe(() => getEnumValues(field) as unknown as string[]) : undefined;
    return {
      key,
      type: field ? baseType(field) : 'unknown',
      default: dials.defaults[key],
      enumValues: enumValues && enumValues.length > 0 ? enumValues : undefined,
      description: typeof meta.description === 'string' ? meta.description : undefined,
      sensitivity: dials.sensitivityFor(key),
    };
  });
}
