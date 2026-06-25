/**
 * Search over the settings surface: a declared, engine-agnostic `IndexableSetting[]` projection, a
 * pluggable `SearchProvider` (zero-dependency substring default; richer engines like MiniSearch or
 * a semantic provider plug in behind the same interface), and an engine-independent scoped `@`-filter
 * parser (`@modified`/`@managed`/`@secret`/`@advanced`/`@facet:<id>`/`@scope:<id>`) that narrows by
 * effective-value/provenance state BEFORE free text reaches the provider. Pure.
 */

import type { EffectiveResult, SettingKey } from '@zodal/dials-core';
import type { IndexableSetting, SearchProvider, SettingFieldConfig } from './types.js';

/** Project field configs into the engine-agnostic indexable surface. */
export function toIndexableSettings(fields: SettingFieldConfig[]): IndexableSetting[] {
  return fields.map((f) => ({
    key: f.key,
    title: f.label,
    description: f.description ?? '',
    enumLabels: f.enumValues ?? [],
    facets: f.facets,
    keywords: [f.key, ...f.key.split(/[._\-/]/).filter(Boolean)],
  }));
}

/** Which indexable text fields the substring provider searches (and their relative weight). */
export type IndexField = 'title' | 'description' | 'enumLabels' | 'facets' | 'keywords';

export interface SubstringSearchOptions {
  /** Which fields to match (default: all). */
  fields?: IndexField[];
}

/**
 * Zero-dependency substring search provider (the default). Lowercased-substring match over the
 * selected fields; title/keyword hits rank above description/facet/enum hits. Empty query returns all.
 */
export function createSubstringSearchProvider(
  settings: IndexableSetting[],
  options: SubstringSearchOptions = {},
): SearchProvider {
  const fields: IndexField[] = options.fields ?? ['title', 'description', 'enumLabels', 'facets', 'keywords'];
  const haystacks = settings.map((s) => ({
    key: s.key,
    parts: {
      title: s.title.toLowerCase(),
      description: s.description.toLowerCase(),
      enumLabels: s.enumLabels.join(' ').toLowerCase(),
      facets: s.facets.join(' ').toLowerCase(),
      keywords: s.keywords.join(' ').toLowerCase(),
    } as Record<IndexField, string>,
  }));
  return {
    search(query: string): SettingKey[] {
      const q = query.trim().toLowerCase();
      if (!q) return settings.map((s) => s.key);
      const scored: Array<{ key: SettingKey; score: number }> = [];
      for (const h of haystacks) {
        let score = 0;
        for (const f of fields) {
          if (h.parts[f].includes(q)) score += f === 'title' || f === 'keywords' ? 3 : 1;
        }
        if (score > 0) scored.push({ key: h.key, score });
      }
      scored.sort((a, b) => b.score - a.score);
      return scored.map((s) => s.key);
    },
  };
}

// ---------------------------------------------------------------------------
// Scoped @-filters (engine-independent)
// ---------------------------------------------------------------------------

export type ScopeFilter =
  | { type: 'modified' }
  | { type: 'managed' }
  | { type: 'secret' }
  | { type: 'advanced' }
  | { type: 'facet'; value: string }
  | { type: 'scope'; value: string };

export interface ParsedQuery {
  filters: ScopeFilter[];
  text: string;
}

/** Parse a settings query into scoped `@`-filters + the residual free text. Unrecognized `@tokens`
 *  fall back to free text. */
export function parseScopedQuery(query: string): ParsedQuery {
  const tokens = query.split(/\s+/).filter(Boolean);
  const filters: ScopeFilter[] = [];
  const text: string[] = [];
  for (const tok of tokens) {
    const m = /^@([a-z]+)(?::(.+))?$/i.exec(tok);
    if (!m) {
      text.push(tok);
      continue;
    }
    const name = m[1].toLowerCase();
    const value = m[2];
    if (name === 'modified') filters.push({ type: 'modified' });
    else if (name === 'managed') filters.push({ type: 'managed' });
    else if (name === 'secret') filters.push({ type: 'secret' });
    else if (name === 'advanced') filters.push({ type: 'advanced' });
    else if (name === 'facet' && value) filters.push({ type: 'facet', value });
    else if (name === 'scope' && value) filters.push({ type: 'scope', value });
    else text.push(tok);
  }
  return { filters, text: text.join(' ') };
}

export interface FilterContext {
  fields: SettingFieldConfig[];
  result?: EffectiveResult;
}

/** Apply scoped filters to a key set (keys must satisfy ALL filters), using field config + state. */
export function applyScopedFilters(keys: SettingKey[], filters: ScopeFilter[], context: FilterContext): SettingKey[] {
  if (filters.length === 0) return keys;
  const byKey = new Map(context.fields.map((f) => [f.key, f]));
  const prov = context.result?.provenance ?? {};
  return keys.filter((key) =>
    filters.every((filter) => {
      const f = byKey.get(key);
      switch (filter.type) {
        case 'secret':
          return f?.sensitivity === 'secret';
        case 'advanced':
          return f?.advanced === true;
        case 'facet':
          return f?.facets.includes(filter.value) ?? false;
        case 'modified':
          return prov[key] ? prov[key].winningScope !== 'default' : false;
        case 'managed':
          return prov[key]?.managed === true;
        case 'scope':
          return prov[key]?.winningScope === filter.value;
        default:
          return true;
      }
    }),
  );
}

/** End-to-end: parse a query, apply scoped filters, then free-text search the survivors (keeping the
 *  provider's ranking order). */
export function searchSettings(query: string, provider: SearchProvider, context: FilterContext): SettingKey[] {
  const { filters, text } = parseScopedQuery(query);
  const allKeys = context.fields.map((f) => f.key);
  const filtered = new Set(applyScopedFilters(allKeys, filters, context));
  const ranked = text ? provider.search(text) : allKeys;
  return ranked.filter((k) => filtered.has(k));
}
