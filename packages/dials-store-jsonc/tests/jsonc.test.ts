/** JSONC LayerStore tests: parse-with-comments, format-preserving save, UNSET removal, round-trip. */
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

describe('createJsoncStore', () => {
  it('parses a JSONC file (with comments) into a flat layer', async () => {
    const { io } = memoryIO({
      'settings.jsonc': `{
  // editor settings
  "editor.fontSize": 14,
  "editor.theme": "dark" /* trailing */
}`,
    });
    const store = createJsoncStore({ path: 'settings.jsonc', fs: io });
    expect(store.getCapabilities()).toEqual({ readable: true, writable: true, watchable: false });
    expect(await store.load()).toEqual({ 'editor.fontSize': 14, 'editor.theme': 'dark' });
  });

  it('a missing or empty file loads as an empty layer', async () => {
    expect(await createJsoncStore({ path: 'nope.jsonc', fs: memoryIO().io }).load()).toEqual({});
    expect(await createJsoncStore({ path: 'e.jsonc', fs: memoryIO({ 'e.jsonc': '   ' }).io }).load()).toEqual({});
  });

  it('save is format-preserving (keeps comments) and round-trips', async () => {
    const mem = memoryIO({
      'settings.jsonc': `{
  // keep me
  "editor.fontSize": 14
}`,
    });
    const store = createJsoncStore({ path: 'settings.jsonc', fs: mem.io });
    await store.save({ 'editor.fontSize': 16, 'editor.theme': 'dark' });
    const text = mem.files['settings.jsonc'];
    expect(text).toContain('// keep me');
    expect(text).toContain('"editor.fontSize": 16');
    expect(text).toContain('"editor.theme": "dark"');
    expect(await store.load()).toEqual({ 'editor.fontSize': 16, 'editor.theme': 'dark' });
  });

  it('UNSET removes a key', async () => {
    const mem = memoryIO({ 'settings.jsonc': '{ "a": 1, "b": 2 }' });
    const store = createJsoncStore({ path: 'settings.jsonc', fs: mem.io });
    await store.save({ a: UNSET });
    expect(await store.load()).toEqual({ b: 2 });
  });

  it('writes a fresh file when none exists', async () => {
    const mem = memoryIO();
    const store = createJsoncStore({ path: 'new.jsonc', fs: mem.io });
    await store.save({ 'x.y': 1 });
    expect(await store.load()).toEqual({ 'x.y': 1 });
  });
});
