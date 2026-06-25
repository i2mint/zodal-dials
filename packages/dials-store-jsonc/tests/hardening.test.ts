/** Hardening regressions for dials-store-jsonc: secret redaction (C1), non-object root reset (H2),
 *  plain-undefined != delete (M5), and serialized concurrent saves (M7). */
import { describe, it, expect } from 'vitest';
import { createJsoncStore } from '../src/index.js';
import { UNSET } from '@zodal/dials-core';
import type { FileIO } from '../src/index.js';

function memoryIO(initial: Record<string, string> = {}): { files: Record<string, string>; io: FileIO } {
  const files: Record<string, string> = { ...initial };
  return {
    files,
    io: {
      read: (path) => Promise.resolve(files[path]),
      write: (path, text) => {
        files[path] = text;
        return Promise.resolve();
      },
    },
  };
}

describe('C1 — secrets are redacted on save when sensitivityFor is provided', () => {
  it('never writes a secret key or value to disk', async () => {
    const mem = memoryIO({ 's.jsonc': '{}' });
    const store = createJsoncStore({
      path: 's.jsonc',
      fs: mem.io,
      sensitivityFor: (k) => (k === 'network.apiKey' ? 'secret' : 'public'),
    });
    await store.save({ 'editor.fontSize': 14, 'network.apiKey': 'sk-SUPER-SECRET' });
    const text = mem.files['s.jsonc'];
    expect(text.includes('sk-SUPER-SECRET')).toBe(false);
    expect(text.includes('network.apiKey')).toBe(false);
    expect(text.includes('editor.fontSize')).toBe(true);
  });
});

describe('H2 — a non-object file root is reset, not crashed', () => {
  it.each(['[1,2,3]', '42', '"hi"', 'null', '   '])('save over root %j does not throw', async (root) => {
    const mem = memoryIO({ 's.jsonc': root });
    const store = createJsoncStore({ path: 's.jsonc', fs: mem.io });
    await expect(store.save({ a: 1 })).resolves.toBeUndefined();
    expect(await store.load()).toEqual({ a: 1 });
  });
});

describe('M5 — a plain undefined value is not a delete (only UNSET deletes)', () => {
  it('skips plain undefined, deletes on UNSET', async () => {
    const mem = memoryIO({ 's.jsonc': '{ "a": 1 }' });
    const store = createJsoncStore({ path: 's.jsonc', fs: mem.io });
    await store.save({ a: undefined });
    expect(await store.load()).toEqual({ a: 1 }); // unchanged
    await store.save({ a: UNSET });
    expect(await store.load()).toEqual({}); // deleted
  });
});

describe('M7 — concurrent saves do not lose updates', () => {
  it('serializes writes to the same file', async () => {
    const mem = memoryIO({ 's.jsonc': '{ "a": 1 }' });
    const store = createJsoncStore({ path: 's.jsonc', fs: mem.io });
    await Promise.all([store.save({ b: 2 }), store.save({ c: 3 })]);
    expect(await store.load()).toEqual({ a: 1, b: 2, c: 3 });
  });
});
