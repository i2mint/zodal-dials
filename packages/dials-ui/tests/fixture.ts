/** Shared test fixtures for the dials-ui suite (not a test file). */
import { z } from 'zod';
import { defineDials } from '@zodal/dials-core';
import type { ResolvedFieldAffordance } from '@zodal/core';

export function makeDials() {
  return defineDials(
    z.object({
      'editor.fontSize': z.number().min(6).max(72).default(14).meta({ facets: ['editor'], order: 1 }),
      'editor.theme': z.enum(['light', 'dark', 'system']).default('system').meta({ facets: ['editor', 'appearance'] }),
      'editor.wordWrap': z.boolean().default(false).meta({ facets: ['editor', 'advanced'] }),
      'network.apiKey': z.string().optional().meta({ facets: ['network'] }),
      'ui.layout': z
        .object({ sidebar: z.boolean(), width: z.number() })
        .default({ sidebar: true, width: 200 })
        .meta({ facets: ['appearance'] }),
    }),
  );
}

/** A minimal ResolvedFieldAffordance for registry/tester tests (testers read `zodType`). */
export function field(zodType: string, extra: Record<string, unknown> = {}): ResolvedFieldAffordance {
  return {
    zodType,
    sortable: true,
    filterable: true,
    searchable: true,
    groupable: true,
    editable: true,
    visible: true,
    title: 't',
    zodDef: {},
    storageRole: 'metadata',
    ...extra,
  } as unknown as ResolvedFieldAffordance;
}
