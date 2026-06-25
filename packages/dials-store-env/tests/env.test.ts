/** Env LayerStore tests: key mapping, coercion, load, read-only capabilities. */
import { describe, it, expect } from 'vitest';
import { createEnvStore, envVarName, defaultCoerce } from '../src/index.js';

describe('envVarName', () => {
  it('maps dotted/camelCase keys, with and without a prefix', () => {
    expect(envVarName('editor.fontSize', 'MYAPP')).toBe('MYAPP_EDITOR__FONT_SIZE');
    expect(envVarName('network.apiKey')).toBe('NETWORK__API_KEY');
    expect(envVarName('simple')).toBe('SIMPLE');
    expect(envVarName('a.b-c/d')).toBe('A__B__C__D');
  });
});

describe('defaultCoerce', () => {
  it('coerces booleans, numbers, and JSON; keeps plain strings', () => {
    expect(defaultCoerce('true')).toBe(true);
    expect(defaultCoerce('false')).toBe(false);
    expect(defaultCoerce('42')).toBe(42);
    expect(defaultCoerce('-3.14')).toBe(-3.14);
    expect(defaultCoerce('{"a":1}')).toEqual({ a: 1 });
    expect(defaultCoerce('[1,2]')).toEqual([1, 2]);
    expect(defaultCoerce('hello')).toBe('hello');
    expect(defaultCoerce('not json {')).toBe('not json {');
  });
});

describe('createEnvStore', () => {
  it('loads only the declared keys present in env, coerced', async () => {
    const store = createEnvStore({
      prefix: 'MYAPP',
      keys: ['editor.fontSize', 'editor.theme', 'flags.beta'],
      env: { MYAPP_EDITOR__FONT_SIZE: '18', MYAPP_FLAGS__BETA: 'true' },
    });
    expect(store.scope).toBe('env');
    expect(store.getCapabilities()).toEqual({ readable: true, writable: false, watchable: false });
    expect(await store.load()).toEqual({ 'editor.fontSize': 18, 'flags.beta': true });
  });

  it('is read-only (exposes no save)', () => {
    expect(createEnvStore().save).toBeUndefined();
  });

  it('honors a custom coerce', async () => {
    const store = createEnvStore({ keys: ['x'], env: { X: '42' }, coerce: (raw) => `seen:${raw}` });
    expect(await store.load()).toEqual({ x: 'seen:42' });
  });
});
