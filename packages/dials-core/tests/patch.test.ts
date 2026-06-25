/** Tests for the patch utilities: RFC 7386 §1 example table, RFC 6902 Appendix A, lossless layer
 *  round-trip (UNSET kept distinct from null), and diff/invert round-trips for undo. */
import { describe, it, expect } from 'vitest';
import {
  applyMergePatch,
  serializeLayer,
  deserializeLayer,
  layerToMergePatch,
  applyJsonPatch,
  diffJsonPatch,
  invertJsonPatch,
} from '../src/patch.js';
import { UNSET, isUnset } from '../src/model.js';
import type { Layer } from '../src/model.js';

describe('RFC 7386 JSON Merge Patch — §1 example table', () => {
  const cases: Array<[unknown, unknown, unknown]> = [
    [{ a: 'b' }, { a: 'c' }, { a: 'c' }],
    [{ a: 'b' }, { b: 'c' }, { a: 'b', b: 'c' }],
    [{ a: 'b' }, { a: null }, {}],
    [{ a: 'b', b: 'c' }, { a: null }, { b: 'c' }],
    [{ a: ['b'] }, { a: 'c' }, { a: 'c' }],
    [{ a: 'c' }, { a: ['b'] }, { a: ['b'] }],
    [{ a: { b: 'c' } }, { a: { b: 'd', c: null } }, { a: { b: 'd' } }],
    [{ a: [{ b: 'c' }] }, { a: [1] }, { a: [1] }],
    [['a', 'b'], ['c', 'd'], ['c', 'd']],
    [{ a: 'b' }, ['c'], ['c']],
    [{ a: 'foo' }, null, null],
    [{ a: 'foo' }, 'bar', 'bar'],
    [{ e: null }, { a: 1 }, { e: null, a: 1 }],
    [[1, 2], { a: 'b', c: null }, { a: 'b' }],
    [{}, { a: { bb: { ccc: null } } }, { a: { bb: {} } }],
  ];
  it.each(cases)('applyMergePatch(%j, %j) === %j', (target, patch, expected) => {
    expect(applyMergePatch(target, patch)).toEqual(expected);
  });

  it('does not mutate the target', () => {
    const target = { a: 'b', nested: { x: 1 } };
    applyMergePatch(target, { nested: { y: 2 } });
    expect(target).toEqual({ a: 'b', nested: { x: 1 } });
  });
});

describe('lossless layer serialization (UNSET distinct from null)', () => {
  it('round-trips values, nulls, nested objects, and UNSET with zero drift', () => {
    const layer: Layer = {
      'a.scalar': 14,
      'a.null': null, // a legitimate null value, NOT a reset
      'a.nested': { x: 1, y: [1, 2, { z: true }] },
      'a.reset': UNSET,
    };
    const round = deserializeLayer(serializeLayer(layer));
    expect(round['a.scalar']).toBe(14);
    expect(round['a.null']).toBeNull();
    expect(round['a.nested']).toEqual({ x: 1, y: [1, 2, { z: true }] });
    expect(isUnset(round['a.reset'])).toBe(true);
    // The literal null was NOT turned into a reset:
    expect(isUnset(round['a.null'])).toBe(false);
  });

  it('serialized form keeps unset keys out of values', () => {
    const s = serializeLayer({ k: 1, gone: UNSET });
    expect(s.values).toEqual({ k: 1 });
    expect(s.unset).toEqual(['gone']);
  });

  it('layerToMergePatch maps UNSET -> null (lossy interop)', () => {
    expect(layerToMergePatch({ k: 1, gone: UNSET })).toEqual({ k: 1, gone: null });
  });
});

describe('RFC 6902 JSON Patch — Appendix A', () => {
  it('A.1 add an object member', () => {
    expect(applyJsonPatch({ foo: 'bar' }, [{ op: 'add', path: '/baz', value: 'qux' }])).toEqual({
      foo: 'bar',
      baz: 'qux',
    });
  });
  it('A.2 add an array element', () => {
    expect(applyJsonPatch({ foo: ['bar', 'baz'] }, [{ op: 'add', path: '/foo/1', value: 'qux' }])).toEqual({
      foo: ['bar', 'qux', 'baz'],
    });
  });
  it('A.3 remove an object member', () => {
    expect(applyJsonPatch({ baz: 'qux', foo: 'bar' }, [{ op: 'remove', path: '/baz' }])).toEqual({ foo: 'bar' });
  });
  it('A.4 remove an array element', () => {
    expect(applyJsonPatch({ foo: ['bar', 'qux', 'baz'] }, [{ op: 'remove', path: '/foo/1' }])).toEqual({
      foo: ['bar', 'baz'],
    });
  });
  it('A.5 replace a value', () => {
    expect(applyJsonPatch({ baz: 'qux', foo: 'bar' }, [{ op: 'replace', path: '/baz', value: 'boo' }])).toEqual({
      baz: 'boo',
      foo: 'bar',
    });
  });
  it('A.6 move a value', () => {
    expect(
      applyJsonPatch({ foo: { bar: 'baz', waldo: 'fred' }, qux: { corge: 'grault' } }, [
        { op: 'move', from: '/foo/waldo', path: '/qux/thud' },
      ]),
    ).toEqual({ foo: { bar: 'baz' }, qux: { corge: 'grault', thud: 'fred' } });
  });
  it('A.7 move an array element', () => {
    expect(
      applyJsonPatch({ foo: ['all', 'grass', 'cows', 'eat'] }, [{ op: 'move', from: '/foo/1', path: '/foo/3' }]),
    ).toEqual({ foo: ['all', 'cows', 'eat', 'grass'] });
  });
  it('A.8 test (success leaves doc unchanged)', () => {
    const doc = { baz: 'qux', foo: ['a', 2, 'c'] };
    expect(
      applyJsonPatch(doc, [
        { op: 'test', path: '/baz', value: 'qux' },
        { op: 'test', path: '/foo/1', value: 2 },
      ]),
    ).toEqual(doc);
  });
  it('A.9 test (failure throws)', () => {
    expect(() => applyJsonPatch({ baz: 'qux' }, [{ op: 'test', path: '/baz', value: 'bar' }])).toThrow();
  });
  it('A.16 add an array value with "-"', () => {
    expect(applyJsonPatch({ foo: ['bar'] }, [{ op: 'add', path: '/foo/-', value: ['abc', 'def'] }])).toEqual({
      foo: ['bar', ['abc', 'def']],
    });
  });
  it('replace on a missing path throws', () => {
    expect(() => applyJsonPatch({}, [{ op: 'replace', path: '/nope', value: 1 }])).toThrow();
  });
});

describe('diff + invert round-trips (undo)', () => {
  it('diffJsonPatch(before, after) applied to before yields after', () => {
    const before = { a: 1, b: { c: 2 }, d: 3 };
    const after = { a: 9, b: { c: 2, e: 5 }, f: 7 }; // change a, add b.e, remove d, add f
    const patch = diffJsonPatch(before, after);
    expect(applyJsonPatch(before, patch)).toEqual(after);
  });
  it('invertJsonPatch undoes a diff exactly', () => {
    const before = { a: 1, b: { c: 2 }, d: 3 };
    const after = { a: 9, b: { c: 2, e: 5 }, f: 7 };
    const patch = diffJsonPatch(before, after);
    const inverse = invertJsonPatch(patch, before);
    expect(applyJsonPatch(after, inverse)).toEqual(before);
  });
});
