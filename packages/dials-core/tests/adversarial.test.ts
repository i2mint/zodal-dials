/**
 * Adversarial regression suite — the vectors found by the checkpoint critics. Each case would have
 * been RED before the hardening fixes and is GREEN after: prototype-pollution safety, RFC 6902
 * strictness (MUST-error cases), copy-invert undo, secret masking across provenance/conflicts/
 * explain/nested/out-of-schema, the broadened secret heuristic, honest mergedFrom, and the
 * documented UNSET-abstains-under-deep-merge behavior.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { applyJsonPatch, applyMergePatch, invertJsonPatch } from '../src/patch.js';
import { deepClone } from '../src/util.js';
import { resolve } from '../src/cascade.js';
import { defineDials } from '../src/define-dials.js';
import { classifySensitivity } from '../src/schema.js';
import { UNSET, isSecretRef } from '../src/model.js';
import type { JsonPatchOp, MergeStrategy, ScopedLayer } from '../src/model.js';

const SECRET = 'super-secret-token-DO-NOT-LEAK';
const deepMerge = (): MergeStrategy => 'deep-merge';

function leaks(value: unknown, needle: string): boolean {
  if (typeof value === 'string') return value.includes(needle);
  if (Array.isArray(value)) return value.some((v) => leaks(v, needle));
  if (value && typeof value === 'object') return Object.values(value).some((v) => leaks(v, needle));
  return false;
}

describe('prototype-pollution hardening', () => {
  it('applyJsonPatch refuses to write through __proto__ and does not pollute', () => {
    expect(() => applyJsonPatch({}, [{ op: 'add', path: '/__proto__/polluted', value: true }])).toThrow();
    expect((({}) as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('applyMergePatch skips __proto__ keys', () => {
    const out = applyMergePatch({ a: 1 }, JSON.parse('{"__proto__":{"polluted":true},"b":2}'));
    expect(out).toEqual({ a: 1, b: 2 });
    expect((({}) as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('deepClone preserves a literal __proto__ own key without corrupting the prototype', () => {
    const src = JSON.parse('{"__proto__":{"x":1},"safe":2}');
    const clone = deepClone(src);
    expect(Object.getPrototypeOf(clone)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(clone, '__proto__')).toBe(true);
    expect((clone as { safe: number }).safe).toBe(2);
    expect((({}) as Record<string, unknown>).x).toBeUndefined();
  });
});

describe('RFC 6902 strictness — MUST-error cases', () => {
  it.each<[string, JsonPatchOp[]]>([
    ['add out of range', [{ op: 'add', path: '/a/5', value: 9 }]],
    ['add leading zero', [{ op: 'add', path: '/a/01', value: 9 }]],
    ['add negative', [{ op: 'add', path: '/a/-1', value: 9 }]],
    ['replace empty token', [{ op: 'replace', path: '/a/', value: 9 }]],
  ])('%s throws', (_label, ops) => {
    expect(() => applyJsonPatch({ a: [1] }, ops)).toThrow();
  });

  it('test against a non-existent member fails (not undefined === undefined)', () => {
    expect(() => applyJsonPatch({ a: [1] }, [{ op: 'test', path: '/a/5', value: undefined }])).toThrow();
  });

  it('add with "-" still appends to the array', () => {
    expect(applyJsonPatch({ a: [1] }, [{ op: 'add', path: '/a/-', value: 2 }])).toEqual({ a: [1, 2] });
  });

  it('invertJsonPatch undoes a copy that overwrote an existing member', () => {
    const before = { a: 1, b: 2 };
    const ops: JsonPatchOp[] = [{ op: 'copy', from: '/a', path: '/b' }];
    const after = applyJsonPatch(before, ops);
    expect(after).toEqual({ a: 1, b: 1 });
    expect(applyJsonPatch(after, invertJsonPatch(ops, before))).toEqual(before);
  });
});

describe('secret masking covers every result surface', () => {
  const dials = defineDials(z.object({ 'network.apiKey': z.string().optional() }));
  const stack: ScopedLayer[] = [
    { scope: 'workspace', layer: { 'network.apiKey': `OLD-${SECRET}` } },
    { scope: 'user', layer: { 'network.apiKey': SECRET } },
  ];

  it('conflicts never carry plaintext under maskSecrets', () => {
    expect(leaks(dials.resolve(stack, { maskSecrets: true }).conflicts, SECRET)).toBe(false);
  });

  it('provenance and explain() never carry plaintext under maskSecrets', () => {
    const masked = dials.resolve(stack, { maskSecrets: true });
    expect(leaks(masked.provenance, SECRET)).toBe(false);
    const prov = dials.explain('network.apiKey', stack, { maskSecrets: true });
    expect(leaks(prov, SECRET)).toBe(false);
    expect(isSecretRef(prov?.value)).toBe(true);
  });

  it('a secret nested in an object-valued setting is classified secret and masked whole', () => {
    const d = defineDials(z.object({ network: z.object({ host: z.string(), apiKey: z.string() }).optional() }));
    expect(d.sensitivityFor('network')).toBe('secret');
    const masked = d.resolve([{ scope: 'user', layer: { network: { host: 'h', apiKey: SECRET } } }], { maskSecrets: true });
    expect(leaks(masked.effective, SECRET)).toBe(false);
    expect(isSecretRef(masked.effective.network)).toBe(true);
  });

  it('an out-of-schema secret-named key is classified secret (fail-safe), not public', () => {
    const d = defineDials(z.object({ 'editor.theme': z.string().default('dark') }));
    expect(d.sensitivityFor('adhoc.api_key')).toBe('secret');
    const masked = d.resolve([{ scope: 'user', layer: { 'adhoc.api_key': SECRET } }], { maskSecrets: true });
    expect(leaks(masked.effective, SECRET)).toBe(false);
  });
});

describe('broadened secret name heuristic', () => {
  it.each([
    ['service.apiKeys', 'secret'],
    ['service.api_keys', 'secret'],
    ['db.passwordHash', 'secret'],
    ['oauth.refreshToken', 'secret'],
    ['ssh.privateKeyPath', 'secret'],
    ['vault.secretId', 'secret'],
    ['ui.keyboard', 'public'],
    ['text.tokenize', 'public'],
    ['org.secretary', 'public'],
  ])('classifySensitivity(%s) === %s', (key, expected) => {
    expect(classifySensitivity(key)).toBe(expected);
  });
});

describe('provenance honesty + UNSET under deep-merge', () => {
  it('mergedFrom excludes a fully-shadowed lower object', () => {
    const r = resolve(
      [
        { scope: 'low', layer: { o: { k: 'low' } } },
        { scope: 'high', layer: { o: { k: 'high' } } },
      ],
      { strategyFor: deepMerge },
    );
    expect(r.effective.o).toEqual({ k: 'high' });
    expect(r.provenance.o.mergedFrom).toBeUndefined(); // 'low' contributed no surviving leaf
  });

  it('mergedFrom lists both scopes when each owns a surviving leaf', () => {
    const r = resolve(
      [
        { scope: 'low', layer: { o: { a: 1 } } },
        { scope: 'high', layer: { o: { b: 2 } } },
      ],
      { strategyFor: deepMerge },
    );
    expect(r.effective.o).toEqual({ a: 1, b: 2 });
    expect(r.provenance.o.mergedFrom).toEqual(['low', 'high']);
  });

  it('UNSET abstains from a deep-merge (does not sever lower contributors) — documented', () => {
    const r = resolve(
      [
        { scope: 'low', layer: { o: { fromLow: 1 } } },
        { scope: 'mid', layer: { o: UNSET } },
        { scope: 'high', layer: { o: { fromHigh: 2 } } },
      ],
      { strategyFor: deepMerge },
    );
    expect(r.effective.o).toEqual({ fromLow: 1, fromHigh: 2 });
  });

  it('mergedFrom attributes by surviving-leaf origin, not naive leave-one-out (identical leaves)', () => {
    const r = resolve(
      [
        { scope: 's1', layer: { o: { a: 1 } } },
        { scope: 's2', layer: { o: { a: 1 } } }, // identical leaf, redundant with s1
        { scope: 's3', layer: { o: { b: 2 } } },
      ],
      { strategyFor: deepMerge },
    );
    expect(r.effective.o).toEqual({ a: 1, b: 2 });
    // genuinely a merge of two distinct origins — must NOT collapse to undefined/single-scope
    expect(r.provenance.o.mergedFrom).toEqual(['s2', 's3']);
  });
});

describe('secrets nested in containers (array / record / tuple / union / deep) are classified secret', () => {
  const cases: Array<[string, z.ZodType]> = [
    ['array of objects', z.array(z.object({ apiKey: z.string() }))],
    ['record of objects', z.record(z.string(), z.object({ password: z.string() }))],
    ['tuple with secret object', z.tuple([z.string(), z.object({ token: z.string() })])],
    ['union with secret object', z.union([z.string(), z.object({ secret: z.string() })])],
    ['3-level nested object', z.object({ a: z.object({ b: z.object({ accessToken: z.string() }) }) })],
  ];
  it.each(cases)('%s -> secret + masked whole', (_label, field) => {
    const d = defineDials(z.object({ box: field.optional() }));
    expect(d.sensitivityFor('box')).toBe('secret');
    // the offending value, however nested, must not leak under maskSecrets
    const payload =
      _label === 'array of objects'
        ? [{ apiKey: SECRET }]
        : _label === 'record of objects'
          ? { k: { password: SECRET } }
          : _label === 'tuple with secret object'
            ? ['x', { token: SECRET }]
            : _label === 'union with secret object'
              ? { secret: SECRET }
              : { a: { b: { accessToken: SECRET } } };
    const masked = d.resolve([{ scope: 'user', layer: { box: payload } }], { maskSecrets: true });
    expect(leaks(masked.effective, SECRET)).toBe(false);
    expect(isSecretRef(masked.effective.box)).toBe(true);
  });

  it('a non-secret container stays public', () => {
    const d = defineDials(z.object({ rows: z.array(z.object({ name: z.string(), count: z.number() })).optional() }));
    expect(d.sensitivityFor('rows')).toBe('public');
  });
});
