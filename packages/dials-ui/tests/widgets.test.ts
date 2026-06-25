/** Type -> widget classification tests. */
import { describe, it, expect } from 'vitest';
import { widgetKindFor } from '../src/widgets.js';

describe('widgetKindFor', () => {
  it('maps scalar types to widgets', () => {
    expect(widgetKindFor({ zodType: 'boolean', sensitivity: 'public' })).toBe('switch');
    expect(widgetKindFor({ zodType: 'string', sensitivity: 'public' })).toBe('text');
    expect(widgetKindFor({ zodType: 'number', sensitivity: 'public' })).toBe('number');
  });

  it('uses a slider only when the number is bounded on both ends', () => {
    expect(widgetKindFor({ zodType: 'number', sensitivity: 'public', bounds: { min: 0, max: 10 } })).toBe('slider');
    expect(widgetKindFor({ zodType: 'number', sensitivity: 'public', bounds: { min: 0 } })).toBe('number');
  });

  it('uses radio for small enums, select for large', () => {
    expect(widgetKindFor({ zodType: 'enum', sensitivity: 'public', enumValues: ['a', 'b', 'c'] })).toBe('radio');
    expect(widgetKindFor({ zodType: 'enum', sensitivity: 'public', enumValues: ['a', 'b', 'c', 'd', 'e'] })).toBe('select');
  });

  it('a secret always maps to the secret widget regardless of type', () => {
    expect(widgetKindFor({ zodType: 'string', sensitivity: 'secret' })).toBe('secret');
    expect(widgetKindFor({ zodType: 'object', sensitivity: 'secret' })).toBe('secret');
  });

  it('structured values map to object/array; unknown falls back to rawJson', () => {
    expect(widgetKindFor({ zodType: 'object', sensitivity: 'public' })).toBe('object');
    expect(widgetKindFor({ zodType: 'array', sensitivity: 'public' })).toBe('array');
    expect(widgetKindFor({ zodType: 'weird', sensitivity: 'public' })).toBe('rawJson');
  });

  it('an explicit editWidget meta override wins (when a known kind)', () => {
    expect(widgetKindFor({ zodType: 'string', sensitivity: 'public', metaWidget: 'textarea' })).toBe('textarea');
    expect(widgetKindFor({ zodType: 'string', sensitivity: 'public', metaWidget: 'bogus' })).toBe('text');
  });
});
