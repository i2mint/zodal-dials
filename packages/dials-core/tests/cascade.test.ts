/**
 * ⛔ CHECKPOINT GATE — cascade + provenance fidelity (issue #4).
 *
 * Resolve a multi-scope stack, mutate a layer, re-resolve; assert correct effective values, honest
 * provenance, a non-overridable policy band, fall-through UNSET (distinct from null), the deep-merge
 * and append strategies, and lossless RFC-7386-shaped layer round-trips. Any misattribution fails.
 */
import { describe, it, expect } from 'vitest';
import { resolve } from '../src/cascade.js';
import { serializeLayer, deserializeLayer } from '../src/patch.js';
import { UNSET } from '../src/model.js';
import type { MergeStrategy, ScopedLayer, SettingKey } from '../src/model.js';

const stackFor = (theme: string, fontSize?: number): ScopedLayer[] => [
  { scope: 'default', layer: { 'editor.theme': 'system', 'editor.fontSize': 12 } },
  { scope: 'preset', layer: { 'editor.theme': 'light' } },
  { scope: 'profile', layer: { 'editor.theme': theme } },
  { scope: 'user', layer: fontSize === undefined ? {} : { 'editor.fontSize': fontSize } },
];

describe('basic precedence + provenance', () => {
  it('higher scope wins; provenance names the winner and lists shadowed layers', () => {
    const r = resolve(stackFor('dark', 16));
    expect(r.effective['editor.theme']).toBe('dark');
    expect(r.effective['editor.fontSize']).toBe(16);

    const themeProv = r.provenance['editor.theme'];
    expect(themeProv.winningScope).toBe('profile');
    expect(themeProv.managed).toBe(false);
    // shadowed = the lower contributors, highest-first: preset('light') then default('system')
    expect(themeProv.shadowed.map((s) => s.scope)).toEqual(['preset', 'default']);
    expect(themeProv.shadowed.map((s) => s.value)).toEqual(['light', 'system']);
  });

  it('re-resolving after mutating a layer reflects the change', () => {
    const first = resolve(stackFor('dark', 16));
    const second = resolve(stackFor('light', 18));
    expect(first.effective['editor.theme']).toBe('dark');
    expect(second.effective['editor.theme']).toBe('light');
    expect(second.effective['editor.fontSize']).toBe(18);
    expect(second.provenance['editor.fontSize'].winningScope).toBe('user');
  });
});

describe('policy/managed band is non-overridable', () => {
  it('a managed lower-index layer beats a non-managed higher-index layer', () => {
    const stack: ScopedLayer[] = [
      { scope: 'policy', layer: { 'telemetry.enabled': false }, managed: true }, // index 0, managed
      { scope: 'user', layer: { 'telemetry.enabled': true } }, // index 1, NOT managed
    ];
    const r = resolve(stack);
    expect(r.effective['telemetry.enabled']).toBe(false);
    expect(r.provenance['telemetry.enabled'].winningScope).toBe('policy');
    expect(r.provenance['telemetry.enabled'].managed).toBe(true);
    expect(r.conflicts.find((c) => c.key === 'telemetry.enabled')?.overriddenByPolicy).toBe(true);
  });
});

describe('UNSET is fall-through and distinct from null', () => {
  it('UNSET in a higher scope re-exposes the lower scope ("reset to default")', () => {
    const stack: ScopedLayer[] = [
      { scope: 'default', layer: { 'editor.fontSize': 12 } },
      { scope: 'user', layer: { 'editor.fontSize': UNSET } },
    ];
    const r = resolve(stack);
    expect(r.effective['editor.fontSize']).toBe(12);
    expect(r.provenance['editor.fontSize'].winningScope).toBe('default');
    // the user reset shows up as a shadowed 'UNSET' above the winner
    expect(r.provenance['editor.fontSize'].shadowed[0]).toEqual({ scope: 'user', value: 'UNSET', managed: false });
  });

  it('a literal null value is a value, not a reset', () => {
    const stack: ScopedLayer[] = [
      { scope: 'default', layer: { 'proxy.url': 'http://d' } },
      { scope: 'user', layer: { 'proxy.url': null } },
    ];
    const r = resolve(stack);
    expect(r.effective['proxy.url']).toBeNull();
    expect(r.provenance['proxy.url'].winningScope).toBe('user');
  });

  it('a key reset by every layer is absent from the effective set', () => {
    const r = resolve([{ scope: 'user', layer: { ghost: UNSET } }]);
    expect('ghost' in r.effective).toBe(false);
  });
});

describe('merge strategies', () => {
  const strategyFor =
    (map: Record<string, MergeStrategy>) =>
    (key: SettingKey): MergeStrategy =>
      map[key] ?? 'replace';

  it('deep-merge merges object contributors across scopes and records mergedFrom', () => {
    const stack: ScopedLayer[] = [
      { scope: 'default', layer: { 'ui.layout': { sidebar: true, width: 200 } } },
      { scope: 'user', layer: { 'ui.layout': { width: 320, theme: 'dark' } } },
    ];
    const r = resolve(stack, { strategyFor: strategyFor({ 'ui.layout': 'deep-merge' }) });
    expect(r.effective['ui.layout']).toEqual({ sidebar: true, width: 320, theme: 'dark' });
    expect(r.provenance['ui.layout'].mergeStrategy).toBe('deep-merge');
    expect(r.provenance['ui.layout'].mergedFrom).toEqual(['default', 'user']);
  });

  it('replace (default) takes the highest scope wholesale', () => {
    const stack: ScopedLayer[] = [
      { scope: 'default', layer: { 'ui.layout': { sidebar: true, width: 200 } } },
      { scope: 'user', layer: { 'ui.layout': { width: 320 } } },
    ];
    const r = resolve(stack); // replace
    expect(r.effective['ui.layout']).toEqual({ width: 320 });
  });

  it('append concatenates array contributors low -> high', () => {
    const stack: ScopedLayer[] = [
      { scope: 'default', layer: { 'search.exclude': ['node_modules'] } },
      { scope: 'user', layer: { 'search.exclude': ['dist', '.cache'] } },
    ];
    const r = resolve(stack, { strategyFor: strategyFor({ 'search.exclude': 'append' }) });
    expect(r.effective['search.exclude']).toEqual(['node_modules', 'dist', '.cache']);
  });
});

describe('conflicts', () => {
  it('reports keys set to differing values by multiple layers', () => {
    const r = resolve(stackFor('dark', 16));
    const conflict = r.conflicts.find((c) => c.key === 'editor.theme');
    expect(conflict).toBeDefined();
    expect(conflict?.contributors.map((c) => c.scope)).toEqual(['profile', 'preset', 'default']);
    expect(conflict?.overriddenByPolicy).toBe(false);
  });

  it('does not report a key set by only one layer', () => {
    const r = resolve([{ scope: 'user', layer: { lone: 1 } }]);
    expect(r.conflicts.length).toBe(0);
  });
});

describe('layer round-trip survives serialize -> deserialize with zero drift', () => {
  it('resolves identically before and after a full stack round-trip', () => {
    const stack = stackFor('dark', 16).concat([{ scope: 'user2', layer: { 'editor.fontSize': UNSET, extra: { a: [1, { b: null }] } } }]);
    const roundTripped: ScopedLayer[] = stack.map((sl) => ({
      scope: sl.scope,
      managed: sl.managed,
      layer: deserializeLayer(serializeLayer(sl.layer)),
    }));
    expect(resolve(roundTripped)).toEqual(resolve(stack));
  });
});
