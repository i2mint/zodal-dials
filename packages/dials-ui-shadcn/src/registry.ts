/**
 * The shadcn settings renderer registry — a `@zodal/dials-ui` registry of React controls, one per
 * widget kind, the masked secret control at the OVERRIDE band, and a terminal rawJson control for
 * total coverage. Selection is open-closed (register a higher-priority control to override).
 */

import { createSettingsRendererRegistry, secretRoleIs, alwaysMatch, PRIORITY } from '@zodal/dials-ui';
import type { RendererRegistry, RendererTester, WidgetKind } from '@zodal/dials-ui';
import type { SettingControl } from './types.js';
import {
  SwitchControl,
  TextControl,
  NumberControl,
  SliderControl,
  SelectControl,
  RadioControl,
  SecretControl,
  RawJsonControl,
} from './widgets.js';

/** Tester matching a field's resolved widget kind (supplied via the render context as `widget`). */
export function widgetIs(kind: WidgetKind): RendererTester {
  return (_field, ctx) => (ctx.widget === kind ? PRIORITY.LIBRARY : -1);
}

const WIDGET_CONTROLS: Array<[WidgetKind, SettingControl]> = [
  ['switch', SwitchControl],
  ['text', TextControl],
  ['textarea', TextControl],
  ['number', NumberControl],
  ['slider', SliderControl],
  ['select', SelectControl],
  ['radio', RadioControl],
  ['color', TextControl],
  ['date', TextControl],
  ['path', TextControl],
  ['object', RawJsonControl],
  ['array', RawJsonControl],
  ['secret', SecretControl],
];

/** Create a shadcn/React settings renderer registry. */
export function createShadcnSettingsRegistry(): RendererRegistry<SettingControl> {
  const registry = createSettingsRendererRegistry<SettingControl>();
  registry.register({ tester: alwaysMatch(), renderer: RawJsonControl, name: 'rawJson' });
  for (const [kind, control] of WIDGET_CONTROLS) registry.register({ tester: widgetIs(kind), renderer: control, name: kind });
  registry.register({ tester: secretRoleIs(), renderer: SecretControl, name: 'secret' });
  return registry;
}
