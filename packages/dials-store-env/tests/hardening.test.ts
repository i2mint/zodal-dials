/** Hardening regressions for dials-store-env: lossless coercion (H3) and collision detection (H4). */
import { describe, it, expect } from 'vitest';
import { createEnvStore, defaultCoerce } from '../src/index.js';

describe('H3 — coercion preserves numeric-looking strings that would lose information', () => {
  it('keeps leading zeros, big ints, and signed zero as strings', () => {
    expect(defaultCoerce('007')).toBe('007');
    expect(defaultCoerce('00501')).toBe('00501');
    expect(defaultCoerce('9007199254740993')).toBe('9007199254740993'); // > MAX_SAFE_INTEGER
    expect(defaultCoerce('-0')).toBe('-0');
    expect(defaultCoerce('01.5')).toBe('01.5');
  });
  it('still coerces round-trippable numbers', () => {
    expect(defaultCoerce('42')).toBe(42);
    expect(defaultCoerce('-3.14')).toBe(-3.14);
    expect(defaultCoerce('0')).toBe(0);
  });
});

describe('H4 — env var collisions are rejected at construction', () => {
  it('throws when two distinct keys map to the same env var', () => {
    expect(() => createEnvStore({ keys: ['a.b', 'a-b'] })).toThrow(/both map to env var A__B/);
  });
  it('allows distinct keys', () => {
    expect(() => createEnvStore({ keys: ['a.b', 'a.c'] })).not.toThrow();
  });
});
