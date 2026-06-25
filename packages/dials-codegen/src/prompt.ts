/**
 * Emit an AI/LLM-consumable description of a settings surface — so an assistant can help a user
 * configure the system ("set the editor theme to dark", "what controls connection pooling?"). Lists
 * each setting with its type, allowed values, default, and description. Secrets are marked `[secret]`
 * and never carry their default value.
 */

import type { z } from 'zod';
import type { DialsDefinition } from '@zodal/dials-core';
import { describeForCodegen } from './introspect.js';

export interface ToPromptOptions {
  /** A heading for the settings block. Default: 'Settings'. */
  title?: string;
}

/** Build an LLM-consumable description of the settings. */
export function toPrompt<T extends z.ZodObject<z.ZodRawShape>>(dials: DialsDefinition<T>, options: ToPromptOptions = {}): string {
  const fields = describeForCodegen(dials);
  const lines: string[] = [];
  lines.push(`# ${options.title ?? 'Settings'}`);
  lines.push('');
  lines.push(
    `This system exposes ${fields.length} settings. Each is a typed, named parameter identified by a dotted key. ` +
      'To change one, supply its key and a value of the stated type (for enums, one of the listed values).',
  );
  lines.push('');
  for (const field of fields) {
    let line = `- \`${field.key}\` (${field.type}`;
    if (field.enumValues) line += `: ${field.enumValues.join(' | ')}`;
    if (field.sensitivity !== 'secret' && field.default !== undefined) line += `, default ${JSON.stringify(field.default)}`;
    line += ')';
    if (field.sensitivity === 'secret') line += ' [secret]';
    if (field.description) line += ` — ${field.description}`;
    lines.push(line);
  }
  return lines.join('\n');
}
