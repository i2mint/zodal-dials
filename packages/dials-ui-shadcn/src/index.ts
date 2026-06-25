/**
 * @zodal/dials-ui-shadcn — a React/shadcn renderer for @zodal/dials-ui.
 *
 * React components that turn the headless settings config (`SettingsForm` + field states) into a
 * settings panel: `SettingsPanel` (search + grouped fields) and `SettingField` (one row), with a
 * per-widget control registry (`createShadcnSettingsRegistry`) and a terminal rawJson fallback. The
 * controls are plain elements with `zodal-dials-*` class names — swap in shadcn/ui primitives in a
 * consumer. Secrets render masked and never echo plaintext.
 */

export type { ControlProps, SettingControl, PanelHandlers } from './types.js';

export {
  SwitchControl,
  TextControl,
  NumberControl,
  SliderControl,
  SelectControl,
  RadioControl,
  SecretControl,
  RawJsonControl,
} from './widgets.js';

export { createShadcnSettingsRegistry, widgetIs } from './registry.js';

export { SettingField, SettingsPanel } from './components.js';
export type { SettingFieldProps, SettingsPanelProps } from './components.js';
