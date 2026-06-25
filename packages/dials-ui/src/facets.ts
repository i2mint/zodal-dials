/**
 * Faceted organization: project the flat settings surface into groups via a separate grouping layer
 * (facets are canonical; a tree is one projection). The forward index (facet -> keys) drives panels,
 * accordions, and bulk-operation scopes — the same model serves both the open-a-panel and the
 * expand-in-place gesture (the gesture is the renderer's choice, never encoded here). Computed
 * ("smart") groups are predicates over field config + resolution state. Pure.
 */

import type { EffectiveResult, SettingKey } from '@zodal/dials-core';
import type { SettingFieldConfig, SettingsGroup } from './types.js';

export interface FacetDef {
  id: string;
  title?: string;
  order?: number;
}

export interface GroupingOptions {
  /** Declared facet titles/order. Facets used by fields but not declared get a humanized default. */
  facetDefs?: FacetDef[];
  /** Include computed/"smart" groups (@secret, @advanced, @modified, @managed). Default: true. */
  computedGroups?: boolean;
  /** Title for the catch-all group of settings with no facet. Default: 'Other'. */
  ungroupedTitle?: string;
}

function humanize(id: string): string {
  return id.replace(/^@/, '').replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function computedGroups(fields: SettingFieldConfig[], result?: EffectiveResult): SettingsGroup[] {
  const out: SettingsGroup[] = [];
  const add = (id: string, title: string, keys: SettingKey[], order: number): void => {
    if (keys.length > 0) out.push({ id, title, order, settingKeys: keys, computed: true });
  };
  const fieldKeys = new Set(fields.map((f) => f.key));
  add('@secret', 'Secrets', fields.filter((f) => f.sensitivity === 'secret').map((f) => f.key), 2000);
  add('@advanced', 'Advanced', fields.filter((f) => f.advanced).map((f) => f.key), 2001);
  if (result) {
    const modified = Object.keys(result.provenance).filter((k) => fieldKeys.has(k) && result.provenance[k].winningScope !== 'default');
    const managed = Object.keys(result.provenance).filter((k) => fieldKeys.has(k) && result.provenance[k].managed);
    add('@modified', 'Modified', modified, 2002);
    add('@managed', 'Managed by policy', managed, 2003);
  }
  return out;
}

/** Project field configs (in their incoming order) into facet groups, sorted by order then title. */
export function toGroups(
  fields: SettingFieldConfig[],
  result?: EffectiveResult,
  options: GroupingOptions = {},
): SettingsGroup[] {
  const declared = new Map((options.facetDefs ?? []).map((f) => [f.id, f]));
  const forward = new Map<string, SettingKey[]>();
  for (const field of fields) {
    for (const facet of field.facets) {
      const list = forward.get(facet);
      if (list) list.push(field.key);
      else forward.set(facet, [field.key]);
    }
  }

  const groups: SettingsGroup[] = [];
  for (const [facet, keys] of forward) {
    const def = declared.get(facet);
    groups.push({ id: facet, title: def?.title ?? humanize(facet), order: def?.order ?? 100, settingKeys: keys, computed: false });
  }

  // Group ids must be unique (renderers key off them). A declared facet that collides with the
  // reserved catch-all (`_ungrouped`) or a computed id (`@…`) takes precedence; the reserved group
  // is then skipped rather than duplicated.
  const seenIds = new Set(groups.map((g) => g.id));
  const ungrouped = fields.filter((f) => f.facets.length === 0).map((f) => f.key);
  if (ungrouped.length > 0 && !seenIds.has('_ungrouped')) {
    groups.push({ id: '_ungrouped', title: options.ungroupedTitle ?? 'Other', order: 1000, settingKeys: ungrouped, computed: false });
    seenIds.add('_ungrouped');
  }

  if (options.computedGroups !== false) {
    for (const group of computedGroups(fields, result)) {
      if (!seenIds.has(group.id)) {
        groups.push(group);
        seenIds.add(group.id);
      }
    }
  }

  return groups.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}
