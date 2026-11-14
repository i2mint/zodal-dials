import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineDials, mountSection, sectionOf, readMeta } from '../src/index.js';

const naming = z.object({
  mode: z.enum(['short', 'long']).default('short').meta({ title: 'Mode', facets: ['style'] }),
  maxWords: z.number().int().min(1).default(4).optional(),
});

describe('mountSection / sectionOf (#36)', () => {
  it('prefixes keys and adds the section facet first, keeping the field meta', () => {
    const shape = mountSection('naming', naming, { facet: 'Song titles' });
    expect(Object.keys(shape)).toEqual(['naming.mode', 'naming.maxWords']);
    expect(readMeta(shape['naming.mode']!)).toMatchObject({ title: 'Mode', facets: ['Song titles', 'style'] });
    expect(readMeta(mountSection('n', naming, { facet: 'S', facets: 'replace' })['n.mode']!).facets).toEqual(['S']);
    expect(readMeta(naming.shape.mode).facets).toEqual(['style']); // the component's schema is untouched
  });
  it('hands the component its own keys, defaults filled, invalid values dropped', () => {
    const dials = defineDials(z.object({ theme: z.string().default('x'), ...mountSection('naming', naming, { facet: 'T' }) }));
    const r = dials.resolve([{ scope: 'user', layer: { 'naming.mode': 'long', 'naming.maxWords': 0 } }]);
    expect(sectionOf(r, 'naming', naming)).toEqual({ mode: 'long', maxWords: 4 });
    expect(sectionOf(r.effective, 'naming', naming).mode).toBe('long');
    expect(sectionOf({ getState: () => r }, 'naming', naming).mode).toBe('long');
  });
  it('names fields with no value and no default', () => {
    expect(() => sectionOf({}, 'p', z.object({ need: z.string() }))).toThrow(/need/);
    expect(() => mountSection('', naming)).toThrow(/prefix/);
  });
});
