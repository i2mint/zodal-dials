/** React render contract for the shadcn settings renderer. */

import type { ReactElement } from 'react';
import type { SettingFieldConfig, SettingFieldState } from '@zodal/dials-ui';
import type { SettingKey } from '@zodal/dials-core';

export interface ControlProps {
  field: SettingFieldConfig;
  state: SettingFieldState;
  /** Called with the decoded value when the control changes. */
  onChange?: (value: unknown) => void;
}

/** A widget control: a React component rendering the input for a setting. */
export type SettingControl = (props: ControlProps) => ReactElement;

export interface PanelHandlers {
  onChange?: (key: SettingKey, value: unknown) => void;
  onReset?: (key: SettingKey) => void;
}
