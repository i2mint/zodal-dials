/** Change-lifecycle tests: dirty detection (incl. UNSET vs absent), reset/unset, undo via patches. */
import { describe, it, expect } from 'vitest';
import { dirtyKeys, isDirty, resetToDefault, unsetKey, recordLayerChange, applyLayerPatch } from '../src/lifecycle.js';
import { UNSET, isUnset } from '@zodal/dials-core';

describe('dirty detection', () => {
  it('flags value changes, additions, removals, and UNSET vs absent', () => {
    expect(dirtyKeys({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual(['b']);
    expect(dirtyKeys({ a: 1, c: 9 }, { a: 1 })).toEqual(['c']);
    expect(dirtyKeys({ a: 1 }, { a: 1, c: 9 })).toEqual(['c']);
    expect(dirtyKeys({ a: UNSET }, { a: 1 })).toEqual(['a']);
    expect(dirtyKeys({ a: UNSET }, {})).toEqual(['a']); // explicit reset vs never-set
    expect(dirtyKeys({ a: 1 }, { a: 1 })).toEqual([]);
  });

  it('isDirty', () => {
    expect(isDirty({ a: 1 }, { a: 2 })).toBe(true);
    expect(isDirty({ a: 1 }, { a: 1 })).toBe(false);
  });
});

describe('reset / unset', () => {
  it('resetToDefault removes the key (lower scope re-wins)', () => {
    expect(resetToDefault({ a: 1, b: 2 }, 'a')).toEqual({ b: 2 });
  });

  it('unsetKey records an explicit UNSET', () => {
    expect(isUnset(unsetKey({ a: 1 }, 'b').b)).toBe(true);
  });
});

describe('undo via reversible patches (UNSET survives)', () => {
  it('recordLayerChange + applyLayerPatch round-trips an edit and its undo', () => {
    const before = { a: 1, b: 2, gone: UNSET };
    const after = { a: 9, c: 3, gone: UNSET };
    const change = recordLayerChange(before, after);
    expect(applyLayerPatch(before, change.forward)).toEqual(after);
    const undone = applyLayerPatch(after, change.inverse);
    expect(undone).toEqual(before);
    expect(isUnset(undone.gone)).toBe(true);
  });
});
