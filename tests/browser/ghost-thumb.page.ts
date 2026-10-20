/** Browser page for the ghost-thumb alignment check (bundled by `ghost-thumb.browser.mjs`, not a
 *  test file): mounts one 0..100 slider from either renderer, at a given saved value, in `#root`. */
import { createElement as h, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { SettingFieldConfig, SettingFieldState } from '@zodal/dials-ui';
import { renderSlider } from '@zodal/dials-ui-vanilla';
import { SliderControl } from '@zodal/dials-ui-shadcn';

const field = {
  key: 'k',
  label: 'K',
  widget: 'slider',
  zodType: 'number',
  bounds: { min: 0, max: 100 },
  step: 1,
  required: false,
  readOnly: false,
  hidden: false,
  sensitivity: 'public',
  mergeStrategy: 'replace',
  facets: [],
  advanced: false,
  isStructured: false,
} as unknown as SettingFieldConfig;

const state = (value: number): SettingFieldState => ({ value, managed: false, shadowed: false, dirty: false });

/** The shadcn control is controlled: the host owns the saved value and updates it on commit. */
function Harness({ initial }: { initial: number }) {
  const [saved, setSaved] = useState(initial);
  return h(SliderControl, { field, state: state(saved), onChange: (v) => setSaved(v as number) });
}

let reactRoot: Root | undefined;

function mount(renderer: 'vanilla' | 'shadcn', value: number): void {
  const host = document.getElementById('root')!;
  reactRoot?.unmount();
  reactRoot = undefined;
  host.replaceChildren();
  if (renderer === 'vanilla') {
    host.append(renderSlider(field, state(value), {}));
  } else {
    const root = createRoot(host);
    reactRoot = root;
    flushSync(() => root.render(h(Harness, { initial: value })));
  }
}

(window as unknown as { __mount: typeof mount }).__mount = mount;
