import { describe, it, expect, afterEach } from 'vitest';
import { createElement as h } from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { z } from 'zod';
import { defineDials } from '@zodal/dials-core';
import { createSettingsStore } from '@zodal/dials-ui';
import { useSettings } from '../src/index.js';
import type { UseSettingsResult } from '../src/index.js';

afterEach(cleanup);

const dials = defineDials(z.object({ size: z.number().default(10), name: z.string().default('a') }));

describe('useSettings', () => {
  it('returns state, form and field states, and re-renders on change', () => {
    const store = createSettingsStore(dials, { layer: {} });
    const seen: UseSettingsResult[] = [];
    function Probe() {
      const r = useSettings(store, dials);
      seen.push(r);
      return h('span', null, String(r.states.size?.value));
    }
    const { container } = render(h(Probe));
    expect(container.textContent).toBe('10');
    expect(seen[0]!.form.fields.map((f) => f.key).sort()).toEqual(['name', 'size']);
    act(() => store.set('size', 42));
    expect(container.textContent).toBe('42');
    const last = seen[seen.length - 1]!;
    expect(last.states.size?.dirty).toBe(true);
    expect(last.state.effective.size).toBe(42);
    // The form does not depend on values: built once.
    expect(last.form).toBe(seen[0]!.form);
  });
});
