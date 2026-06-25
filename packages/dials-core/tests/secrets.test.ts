/**
 * ⛔ CHECKPOINT GATE — secret-never-leaks (issue #5).
 *
 * A secret value must never appear as plaintext in: the queryable config layer (after split), an
 * exported/serialized layer (after redaction), or the masked effective set / provenance. Reads
 * return a masked SecretRef; plaintext is only obtainable via an explicit reveal seam.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineDials } from '../src/define-dials.js';
import { classifySensitivity } from '../src/schema.js';
import {
  maskSecrets,
  splitBySensitivity,
  redactSecretsFromLayer,
  makeSecretRef,
} from '../src/secrets.js';
import { serializeLayer } from '../src/patch.js';
import { isSecretRef } from '../src/model.js';
import type { Sensitivity, SettingKey } from '../src/model.js';

const SECRET = 'super-secret-token-DO-NOT-LEAK';

/** Recursively scan any value for a plaintext needle (string match anywhere). */
function leaks(value: unknown, needle: string): boolean {
  if (typeof value === 'string') return value.includes(needle);
  if (Array.isArray(value)) return value.some((v) => leaks(v, needle));
  if (value && typeof value === 'object') return Object.values(value).some((v) => leaks(v, needle));
  return false;
}

describe('classification', () => {
  it.each([
    ['network.apiKey', 'secret'],
    ['database.password', 'secret'],
    ['auth.access_token', 'secret'],
    ['service.client_secret', 'secret'],
    ['editor.fontSize', 'public'],
    ['editor.theme', 'public'],
  ])('classifySensitivity(%s) === %s by name heuristic', (key, expected) => {
    expect(classifySensitivity(key, z.string())).toBe(expected);
  });

  it('.meta({ secret: true }) forces secret regardless of name', () => {
    expect(classifySensitivity('innocuous.value', z.string().meta({ secret: true }))).toBe('secret');
  });
});

describe('masking + split + redaction', () => {
  const sensitivityFor = (key: SettingKey): Sensitivity => classifySensitivity(key, z.string());

  it('maskSecrets replaces a secret with a SecretRef and never carries plaintext', () => {
    const masked = maskSecrets({ 'network.apiKey': SECRET, 'editor.theme': 'dark' }, sensitivityFor);
    expect(isSecretRef(masked['network.apiKey'])).toBe(true);
    expect(masked['editor.theme']).toBe('dark');
    expect(leaks(masked, SECRET)).toBe(false);
  });

  it('splitBySensitivity keeps secrets out of the config layer', () => {
    const { config, secrets } = splitBySensitivity({ 'network.apiKey': SECRET, 'editor.theme': 'dark' }, sensitivityFor);
    expect('network.apiKey' in config).toBe(false);
    expect(config['editor.theme']).toBe('dark');
    expect(secrets['network.apiKey']).toBe(SECRET);
    expect(leaks(config, SECRET)).toBe(false);
  });

  it('redactSecretsFromLayer strips secrets from anything serialized for export/audit', () => {
    const serialized = serializeLayer({ 'network.apiKey': SECRET, 'editor.theme': 'dark' });
    const redacted = redactSecretsFromLayer(serialized, sensitivityFor);
    expect(leaks(redacted, SECRET)).toBe(false);
    expect(redacted.values).toEqual({ 'editor.theme': 'dark' });
  });

  it('a masked SecretRef reports set/unset without the value', () => {
    expect(makeSecretRef('k', true)).toEqual({ _tag: 'SecretRef', key: 'k', isSet: true, masked: '•••• (set)' });
    expect(makeSecretRef('k', false).masked).toBe('not set');
  });
});

describe('end-to-end via defineDials', () => {
  const dials = defineDials(
    z.object({
      'network.apiKey': z.string().optional(),
      'editor.theme': z.enum(['light', 'dark', 'system']).default('system'),
    }),
  );

  it('classifies the secret field and reports it in capabilities', () => {
    expect(dials.sensitivityFor('network.apiKey')).toBe('secret');
    expect(dials.getCapabilities().hasSecrets).toBe(true);
  });

  it('masked resolution never exposes plaintext anywhere', () => {
    const stack = [{ scope: 'user', layer: { 'network.apiKey': SECRET, 'editor.theme': 'dark' } }];
    const masked = dials.resolve(stack, { maskSecrets: true });
    expect(leaks(masked.effective, SECRET)).toBe(false);
    expect(isSecretRef(masked.effective['network.apiKey'])).toBe(true);
    expect(leaks(masked.provenance['editor.theme'], SECRET)).toBe(false);
    // The config portion of the user layer (what a queryable store would persist) excludes the secret.
    const { config } = splitBySensitivity(stack[0].layer, dials.sensitivityFor);
    expect(leaks(config, SECRET)).toBe(false);
  });
});
