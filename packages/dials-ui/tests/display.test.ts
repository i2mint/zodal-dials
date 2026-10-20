/** The renderer-neutral display rules both settings renderers share (display.ts). */
import { describe, it, expect } from 'vitest';
import { formatValue, optionLabel, toHexColor, sliderFraction, showsSearch, DEFAULT_SEARCH_THRESHOLD } from '../src/index.js';
import type { SettingFieldConfig } from '../src/index.js';

const field = (over: Partial<SettingFieldConfig> = {}): SettingFieldConfig =>
  ({ key: 'k', label: 'K', widget: 'slider', zodType: 'number', facets: [], ...over }) as SettingFieldConfig;

describe('display rules', () => {
  it('formatValue rounds to the step and appends the unit', () => {
    expect(formatValue(field({ step: 0.05 }), 0.30000000000000004)).toBe('0.3');
    expect(formatValue(field({ step: 1, unit: 'px' }), 14)).toBe('14px');
    expect(formatValue(field(), 'x')).toBe('x');
  });

  it('optionLabel and toHexColor', () => {
    expect(optionLabel(field({ enumLabels: { a: 'Alpha' } }), 'a')).toBe('Alpha');
    expect(optionLabel(field(), 'b')).toBe('b');
    expect(toHexColor('#ABC')).toBe('#aabbcc');
    expect(toHexColor('red')).toBeUndefined();
  });

  it('sliderFraction places a value along the bounds, clamped', () => {
    const f = field({ bounds: { min: 10, max: 20 } });
    expect(sliderFraction(f, 10)).toBe(0);
    expect(sliderFraction(f, 15)).toBe(0.5);
    expect(sliderFraction(f, 20)).toBe(1);
    expect(sliderFraction(f, 99)).toBe(1);
    expect(sliderFraction(f, -5)).toBe(0);
    expect(sliderFraction(f, 'x')).toBeUndefined();
    expect(sliderFraction(field(), 5)).toBeUndefined();
    expect(sliderFraction(field({ bounds: { min: 3, max: 3 } }), 3)).toBeUndefined();
  });

  it('showsSearch: auto by default, threshold, and overrides', () => {
    expect(showsSearch(DEFAULT_SEARCH_THRESHOLD)).toBe(false);
    expect(showsSearch(DEFAULT_SEARCH_THRESHOLD + 1)).toBe(true);
    expect(showsSearch(4, { searchThreshold: 3 })).toBe(true);
    expect(showsSearch(4, { searchThreshold: Number.NaN })).toBe(false);
    expect(showsSearch(1, { search: true })).toBe(true);
    expect(showsSearch(100, { search: false })).toBe(false);
  });
});
