/** Hardening regressions from the shadcn adversarial review: rawJson re-seeds on re-render (H1) and
 *  duplicate enum values do not trigger a React key warning (M1). */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement as h } from 'react';
import { render, cleanup } from '@testing-library/react';
import { RawJsonControl, SelectControl } from '../src/widgets.js';
import type { SettingFieldConfig, SettingFieldState } from '@zodal/dials-ui';

afterEach(cleanup);

const cfg = (over: Partial<SettingFieldConfig> = {}): SettingFieldConfig =>
  ({
    key: 'k',
    label: 'K',
    widget: 'rawJson',
    zodType: 'object',
    required: false,
    readOnly: false,
    hidden: false,
    sensitivity: 'public',
    mergeStrategy: 'replace',
    facets: [],
    advanced: false,
    isStructured: true,
    ...over,
  }) as SettingFieldConfig;

const st = (value: unknown): SettingFieldState => ({ value, managed: false, shadowed: false, dirty: false });

describe('H1 — RawJsonControl reflects upstream value changes (no desync)', () => {
  it('re-seeds the editor when the state value changes', () => {
    const { container, rerender } = render(h(RawJsonControl, { field: cfg(), state: st({ a: 1 }) }));
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toContain('"a": 1');
    rerender(h(RawJsonControl, { field: cfg(), state: st({ a: 999 }) }));
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toContain('"a": 999');
  });
});

describe('M1 — duplicate enum values do not trigger a React key warning', () => {
  it('renders without a "same key" warning', () => {
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((msg: unknown) => {
      errors.push(String(msg));
    });
    render(h(SelectControl, { field: cfg({ widget: 'select', zodType: 'enum', enumValues: ['x', 'x', 'y'] }), state: st('x') }));
    spy.mockRestore();
    expect(errors.join(' ')).not.toMatch(/same key/i);
  });
});
