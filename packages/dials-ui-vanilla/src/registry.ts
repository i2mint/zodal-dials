/**
 * The vanilla settings renderer registry — populates a `@zodal/dials-ui` `RendererRegistry` with one
 * DOM renderer per widget kind, the masked secret widget at the OVERRIDE band, and a terminal rawJson
 * renderer (via `alwaysMatch`) so every setting renders to something. The widget kind is supplied via
 * the render context, so selection is open-closed (a consumer can register a higher-priority override).
 */

import { createSettingsRendererRegistry, secretRoleIs, alwaysMatch, PRIORITY } from '@zodal/dials-ui';
import type { RendererRegistry, RendererTester, WidgetKind } from '@zodal/dials-ui';
import type { SettingRenderFn } from './types.js';
import {
  renderSwitch,
  renderSelect,
  renderRadio,
  renderSlider,
  renderNumber,
  renderText,
  renderTextarea,
  renderObject,
  renderArray,
  renderRawJson,
  renderSecret,
} from './widgets.js';

/** Tester matching a field's resolved widget kind (supplied via the render context as `widget`). */
export function widgetIs(kind: WidgetKind): RendererTester {
  return (_field, ctx) => (ctx.widget === kind ? PRIORITY.LIBRARY : -1);
}

const WIDGET_RENDERERS: Array<[WidgetKind, SettingRenderFn]> = [
  ['switch', renderSwitch],
  ['select', renderSelect],
  ['radio', renderRadio],
  ['slider', renderSlider],
  ['number', renderNumber],
  ['text', renderText],
  ['textarea', renderTextarea],
  ['color', renderText],
  ['date', renderText],
  ['path', renderText],
  ['object', renderObject],
  ['array', renderArray],
  // Honor a resolved `secret` widget kind directly, so secret masking does not depend solely on the
  // sensitivity context staying in lockstep (secretRoleIs at OVERRIDE remains the primary signal).
  ['secret', renderSecret],
];

/** Create a vanilla settings renderer registry (a `@zodal/dials-ui` registry of DOM renderers). */
export function createVanillaSettingsRegistry(): RendererRegistry<SettingRenderFn> {
  const registry = createSettingsRendererRegistry<SettingRenderFn>();
  registry.register({ tester: alwaysMatch(), renderer: renderRawJson, name: 'rawJson' });
  for (const [kind, renderer] of WIDGET_RENDERERS) registry.register({ tester: widgetIs(kind), renderer, name: kind });
  registry.register({ tester: secretRoleIs(), renderer: renderSecret, name: 'secret' });
  return registry;
}
