/** Search tests: indexable surface, substring provider, scoped @-filter parsing + application. */
import { describe, it, expect } from 'vitest';
import {
  toIndexableSettings,
  createSubstringSearchProvider,
  parseScopedQuery,
  applyScopedFilters,
  searchSettings,
} from '../src/search.js';
import { describeSettings } from '../src/introspect.js';
import { resolve } from '@zodal/dials-core';
import { makeDials } from './fixture.js';

const dials = makeDials();
const fields = describeSettings(dials);

describe('substring search provider', () => {
  const provider = createSubstringSearchProvider(toIndexableSettings(fields));

  it('matches on key/title/keywords and ranks title above description', () => {
    expect(provider.search('theme')).toContain('editor.theme');
    expect(provider.search('font')).toContain('editor.fontSize');
  });

  it('empty query returns all keys', () => {
    expect(provider.search('').length).toBe(fields.length);
  });

  it('no match returns empty', () => {
    expect(provider.search('zzzzz')).toEqual([]);
  });
});

describe('parseScopedQuery', () => {
  it('separates @-filters from free text', () => {
    const parsed = parseScopedQuery('@secret @facet:editor font size');
    expect(parsed.filters).toEqual([{ type: 'secret' }, { type: 'facet', value: 'editor' }]);
    expect(parsed.text).toBe('font size');
  });

  it('treats unrecognized @tokens as text', () => {
    expect(parseScopedQuery('@nope hello').text).toBe('@nope hello');
  });
});

describe('applyScopedFilters', () => {
  const allKeys = fields.map((f) => f.key);
  const result = resolve([
    { scope: 'default', layer: dials.defaults },
    { scope: 'user', layer: { 'editor.fontSize': 20 } },
  ]);

  it('@secret keeps only secret settings', () => {
    expect(applyScopedFilters(allKeys, [{ type: 'secret' }], { fields })).toEqual(['network.apiKey']);
  });

  it('@facet keeps only members of the facet', () => {
    expect(applyScopedFilters(allKeys, [{ type: 'facet', value: 'appearance' }], { fields })).toEqual(
      expect.arrayContaining(['editor.theme', 'ui.layout']),
    );
  });

  it('@modified uses provenance (non-default winning scope)', () => {
    expect(applyScopedFilters(allKeys, [{ type: 'modified' }], { fields, result })).toEqual(['editor.fontSize']);
  });
});

describe('searchSettings end-to-end', () => {
  it('intersects scoped filters with free-text ranking', () => {
    const provider = createSubstringSearchProvider(toIndexableSettings(fields));
    // free text "editor" matches several, @facet:editor narrows, result keeps text ranking order
    const out = searchSettings('@facet:editor editor', provider, { fields });
    expect(out).toEqual(expect.arrayContaining(['editor.fontSize', 'editor.theme', 'editor.wordWrap']));
    expect(out).not.toContain('ui.layout');
    expect(out).not.toContain('network.apiKey');
  });
});
