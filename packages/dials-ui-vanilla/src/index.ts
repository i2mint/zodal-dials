/**
 * @zodal/dials-ui-vanilla — the vanilla HTML/JS reference renderer for @zodal/dials-ui.
 *
 * Turns the headless settings config (`SettingsForm` + field states from `@zodal/dials-ui`) into real
 * DOM, with no framework: `renderSettingsPanel` builds the whole panel (search, grouped essentials,
 * and the advanced settings behind one disclosure), `renderField` builds one row, and
 * `createVanillaSettingsRegistry` is the per-widget DOM renderer registry (with a terminal rawJson
 * fallback). It proves the headless contract end-to-end. The optional touch-first stylesheet ships
 * as `@zodal/dials-ui-vanilla/styles.css`.
 */

export { el } from './dom.js';
export type { Attrs } from './dom.js';

export type { FieldHandlers, FieldPresentation, WidgetContext, SettingRenderFn } from './types.js';

export {
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
  renderColor,
  formatValue,
  optionLabel,
} from './widgets.js';

export { createVanillaSettingsRegistry, widgetIs } from './registry.js';

export { renderField, renderSettingsPanel, showsSearch, DEFAULT_SEARCH_THRESHOLD } from './panel.js';
export type { RenderOptions } from './panel.js';
