/** Render contract for the vanilla settings renderer. */

import type { SettingFieldConfig, SettingFieldState } from '@zodal/dials-ui';
import type { SettingKey } from '@zodal/dials-core';

export interface FieldHandlers {
  /** Called when the user changes a setting's value (the decoded value, not the raw event). */
  onChange?: (key: SettingKey, value: unknown) => void;
  /** Called when the user clicks reset on a setting. */
  onReset?: (key: SettingKey) => void;
}

/** A widget renderer: produce the control element for a setting from its config + current state. */
export type SettingRenderFn = (
  field: SettingFieldConfig,
  state: SettingFieldState,
  handlers: FieldHandlers,
) => HTMLElement;
