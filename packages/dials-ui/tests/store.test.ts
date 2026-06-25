/** Reactive createSettingsStore tests: resolution, dirty, validation (over UNMASKED values),
 *  secret masking, scope changes, save baseline, and subscription. */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { defineDials, isSecretRef } from '@zodal/dials-core';
import { createSettingsStore } from '../src/store.js';

const dials = defineDials(
  z.object({
    'editor.fontSize': z.number().min(6).max(72).default(14),
    'editor.theme': z.enum(['light', 'dark', 'system']).default('system'),
    'network.apiKey': z.string().optional().meta({ secret: true }),
  }),
  {
    constraints: {
      assertions: [
        { message: 'fontSize must be even', keys: ['editor.fontSize'], check: (v) => (v['editor.fontSize'] as number) % 2 === 0 },
        {
          message: 'apiKey must be at least 8 chars',
          keys: ['network.apiKey'],
          check: (v) => !v['network.apiKey'] || String(v['network.apiKey']).length >= 8,
        },
      ],
    },
  },
);

describe('createSettingsStore', () => {
  it('initial state has defaults, no dirty, and is valid', () => {
    const store = createSettingsStore(dials);
    expect(store.getState().effective['editor.fontSize']).toBe(14);
    expect(store.getState().effective['editor.theme']).toBe('system');
    expect(store.getState().dirty).toEqual([]);
    expect(store.getState().validation.ok).toBe(true);
  });

  it('set updates state, notifies subscribers, and marks dirty', () => {
    const store = createSettingsStore(dials);
    const listener = vi.fn();
    store.subscribe(listener);
    store.set('editor.fontSize', 20);
    expect(listener).toHaveBeenCalled();
    expect(store.get('editor.fontSize')).toBe(20);
    expect(store.getState().dirty).toContain('editor.fontSize');
    expect(store.explain('editor.fontSize')?.winningScope).toBe('user');
  });

  it('reset removes a key (a lower scope re-wins)', () => {
    const store = createSettingsStore(dials, { layer: { 'editor.fontSize': 20 } });
    store.reset('editor.fontSize');
    expect(store.get('editor.fontSize')).toBe(14);
  });

  it('unset re-exposes a lower scope', () => {
    const store = createSettingsStore(dials, { scopes: [{ scope: 'workspace', layer: { 'editor.theme': 'dark' } }] });
    expect(store.get('editor.theme')).toBe('dark');
    store.set('editor.theme', 'light');
    expect(store.get('editor.theme')).toBe('light');
    store.unset('editor.theme'); // user reset -> workspace re-wins
    expect(store.get('editor.theme')).toBe('dark');
  });

  it('setScopes changes the effective value and provenance', () => {
    const store = createSettingsStore(dials);
    store.setScopes([{ scope: 'workspace', layer: { 'editor.fontSize': 16 } }]);
    expect(store.get('editor.fontSize')).toBe(16);
    expect(store.explain('editor.fontSize')?.winningScope).toBe('workspace');
  });

  it('markSaved clears the dirty set', () => {
    const store = createSettingsStore(dials);
    store.set('editor.fontSize', 20);
    expect(store.getState().dirty).toContain('editor.fontSize');
    store.markSaved();
    expect(store.getState().dirty).toEqual([]);
  });

  it('masks secrets on the display surfaces (effective/provenance/conflicts)', () => {
    const store = createSettingsStore(dials, { layer: { 'network.apiKey': 'sk-LIVE-VALUE' } });
    const { effective, provenance, conflicts, layer } = store.getState();
    expect(isSecretRef(store.get('network.apiKey'))).toBe(true);
    // display surfaces are masked — no plaintext
    expect(JSON.stringify({ effective, provenance, conflicts }).includes('sk-LIVE-VALUE')).toBe(false);
    // the editable layer keeps the real value (the source to persist; split secrets out before saving)
    expect(layer['network.apiKey']).toBe('sk-LIVE-VALUE');
  });

  it('validates over UNMASKED values (a constraint sees the real secret, not the mask)', () => {
    const store = createSettingsStore(dials);
    store.set('editor.fontSize', 15); // odd
    expect(store.getState().validation.ok).toBe(false);
    store.set('editor.fontSize', 16);
    expect(store.getState().validation.ok).toBe(true);
    store.set('network.apiKey', 'short'); // < 8 chars — would pass if validated against the masked ref
    expect(store.getState().validation.ok).toBe(false);
    store.set('network.apiKey', 'long-enough-key');
    expect(store.getState().validation.ok).toBe(true);
  });

  it('unsubscribe stops notifications', () => {
    const store = createSettingsStore(dials);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.set('editor.fontSize', 20);
    expect(listener).not.toHaveBeenCalled();
  });

  it('isolates a throwing listener and reports via onListenerError (HIGH 1)', () => {
    const errors: unknown[] = [];
    const store = createSettingsStore(dials, { onListenerError: (e) => errors.push(e) });
    const good = vi.fn();
    store.subscribe(() => {
      throw new Error('boom');
    });
    store.subscribe(good);
    expect(() => store.set('editor.fontSize', 20)).not.toThrow();
    expect(good).toHaveBeenCalled();
    expect(errors.length).toBe(1);
  });

  it('does not alias the scopes array — input or output mutation cannot corrupt it (HIGH 2)', () => {
    const input = [{ scope: 'workspace', layer: { 'editor.fontSize': 16 } }];
    const store = createSettingsStore(dials, { scopes: input });
    expect(store.getState().scopes).not.toBe(input);
    input.push({ scope: 'evil', layer: { 'editor.fontSize': 99 } });
    store.set('editor.theme', 'dark'); // recompute
    expect(store.get('editor.fontSize')).toBe(16);
    store.getState().scopes.push({ scope: 'evil2', layer: { 'editor.fontSize': 77 } });
    store.set('editor.theme', 'light');
    expect(store.get('editor.fontSize')).toBe(16);
  });

  it('a no-op set does not notify; a write-back listener does not infinite-loop (MEDIUM)', () => {
    const store = createSettingsStore(dials, { layer: { 'editor.fontSize': 20 } });
    const listener = vi.fn();
    store.subscribe(listener);
    store.set('editor.fontSize', 20); // unchanged
    expect(listener).not.toHaveBeenCalled();
    store.subscribe(() => store.set('editor.fontSize', store.get('editor.fontSize') as number));
    expect(() => store.set('editor.fontSize', 21)).not.toThrow();
    expect(store.get('editor.fontSize')).toBe(21);
  });
});
