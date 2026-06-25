/** Facet -> group projection tests, including computed groups and ordering. */
import { describe, it, expect } from 'vitest';
import { toGroups } from '../src/facets.js';
import { describeSettings } from '../src/introspect.js';
import { resolve } from '@zodal/dials-core';
import { makeDials } from './fixture.js';

describe('toGroups', () => {
  const dials = makeDials();
  const fields = describeSettings(dials);

  it('builds a group per facet with multi-membership', () => {
    const groups = toGroups(fields, undefined, { computedGroups: false });
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
    expect(byId.editor.settingKeys).toEqual(expect.arrayContaining(['editor.fontSize', 'editor.theme', 'editor.wordWrap']));
    // editor.theme is in BOTH editor and appearance (faceting allows multi-membership)
    expect(byId.appearance.settingKeys).toEqual(expect.arrayContaining(['editor.theme', 'ui.layout']));
  });

  it('respects declared facet titles and order', () => {
    const groups = toGroups(fields, undefined, {
      facetDefs: [{ id: 'editor', title: 'Text Editor', order: 1 }],
      computedGroups: false,
    });
    const editor = groups.find((g) => g.id === 'editor');
    expect(editor?.title).toBe('Text Editor');
    expect(groups[0].id).toBe('editor'); // lowest order first
  });

  it('adds computed @secret and @advanced groups', () => {
    const groups = toGroups(fields);
    const ids = groups.map((g) => g.id);
    expect(ids).toContain('@secret');
    expect(ids).toContain('@advanced');
    expect(groups.find((g) => g.id === '@secret')?.settingKeys).toEqual(['network.apiKey']);
    expect(groups.find((g) => g.id === '@secret')?.computed).toBe(true);
  });

  it('adds @modified / @managed computed groups from a resolution', () => {
    const result = resolve([
      { scope: 'default', layer: dials.defaults },
      { scope: 'user', layer: { 'editor.fontSize': 20 } },
      { scope: 'policy', layer: { 'editor.theme': 'light' }, managed: true },
    ]);
    const groups = toGroups(fields, result);
    expect(groups.find((g) => g.id === '@modified')?.settingKeys).toContain('editor.fontSize');
    expect(groups.find((g) => g.id === '@managed')?.settingKeys).toEqual(['editor.theme']);
  });

  it('puts settings without a facet into an Other catch-all', () => {
    const noFacet = describeSettings(makeDials()).map((f) => ({ ...f, facets: [] as string[] }));
    const groups = toGroups(noFacet, undefined, { computedGroups: false });
    expect(groups.find((g) => g.id === '_ungrouped')?.title).toBe('Other');
  });
});
