/** Settings renderer registry tests: PRIORITY-ranked selection, the terminal rawJson fallback, and
 *  the secret/structured testers reading from the render context. */
import { describe, it, expect } from 'vitest';
import {
  createSettingsRendererRegistry,
  secretRoleIs,
  isStructuredValue,
  isBoolean,
  isEnum,
  alwaysMatch,
  PRIORITY,
} from '../src/registry.js';
import { field } from './fixture.js';

function build() {
  const reg = createSettingsRendererRegistry<string>();
  reg.register({ tester: alwaysMatch(), renderer: 'rawJson', name: 'rawJson' }); // terminal FALLBACK
  reg.register({ tester: isBoolean(), renderer: 'switch', name: 'switch' });
  reg.register({ tester: isEnum(), renderer: 'select', name: 'select' });
  reg.register({ tester: isStructuredValue(), renderer: 'object', name: 'object' });
  reg.register({ tester: secretRoleIs(), renderer: 'secret', name: 'secret' });
  return reg;
}

describe('settings renderer registry', () => {
  it('picks the type-specific renderer over the fallback', () => {
    const reg = build();
    expect(reg.resolve(field('boolean'), { mode: 'form' })).toBe('switch');
    expect(reg.resolve(field('enum'), { mode: 'form' })).toBe('select');
    expect(reg.resolve(field('object'), { mode: 'form' })).toBe('object');
  });

  it('the terminal alwaysMatch renderer guarantees coverage for any unknown type', () => {
    const reg = build();
    expect(reg.resolve(field('mystery-type'), { mode: 'form' })).toBe('rawJson');
  });

  it('a secret wins via the OVERRIDE band regardless of underlying type', () => {
    const reg = build();
    expect(reg.resolve(field('boolean'), { mode: 'form', sensitivity: 'secret' })).toBe('secret');
    expect(reg.resolve(field('object'), { mode: 'form', sensitivity: 'secret' })).toBe('secret');
  });

  it('alwaysMatch scores at FALLBACK by default', () => {
    expect(alwaysMatch()(field('x'), { mode: 'form' })).toBe(PRIORITY.FALLBACK);
  });

  it('secretRoleIs only matches when context sensitivity is secret', () => {
    expect(secretRoleIs()(field('string'), { mode: 'form' })).toBe(-1);
    expect(secretRoleIs()(field('string'), { mode: 'form', sensitivity: 'public' })).toBe(-1);
    expect(secretRoleIs()(field('string'), { mode: 'form', sensitivity: 'secret' })).toBe(PRIORITY.OVERRIDE);
  });
});
