/** describeSettings tests: widget classification, sensitivity/defaults/facets/bounds/enum extraction. */
import { describe, it, expect } from 'vitest';
import { describeSettings } from '../src/introspect.js';
import { makeDials } from './fixture.js';

describe('describeSettings', () => {
  const dials = makeDials();
  const fields = describeSettings(dials);
  const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));

  it('classifies widgets from type + bounds + sensitivity', () => {
    expect(byKey['editor.fontSize'].widget).toBe('slider'); // bounded 6..72
    expect(byKey['editor.theme'].widget).toBe('radio'); // 3-value enum
    expect(byKey['editor.wordWrap'].widget).toBe('switch');
    expect(byKey['network.apiKey'].widget).toBe('secret');
    expect(byKey['ui.layout'].widget).toBe('object');
  });

  it('carries sensitivity, defaults, facets, order, structured, enum, bounds', () => {
    expect(byKey['network.apiKey'].sensitivity).toBe('secret');
    expect(byKey['editor.fontSize'].defaultValue).toBe(14);
    expect(byKey['editor.fontSize'].facets).toEqual(['editor']);
    expect(byKey['editor.fontSize'].order).toBe(1);
    expect(byKey['editor.fontSize'].bounds).toEqual({ min: 6, max: 72 });
    expect(byKey['ui.layout'].isStructured).toBe(true);
    expect(byKey['editor.theme'].enumValues).toEqual(['light', 'dark', 'system']);
  });

  it('required is false for optional/defaulted fields', () => {
    expect(byKey['network.apiKey'].required).toBe(false);
    expect(byKey['editor.fontSize'].required).toBe(false);
  });

  it('merges external facet assignments with .meta facets', () => {
    const f = describeSettings(dials, { facets: { 'network.apiKey': ['security'] } });
    const apiKey = f.find((x) => x.key === 'network.apiKey');
    expect(apiKey?.facets).toEqual(expect.arrayContaining(['network', 'security']));
  });

  it('the advanced facet sets the advanced flag', () => {
    expect(byKey['editor.wordWrap'].advanced).toBe(true);
    expect(byKey['editor.fontSize'].advanced).toBe(false);
  });
});
