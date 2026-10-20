/**
 * React render contract for the shadcn settings renderer: the host's handlers (preview, commit,
 * reset) and the presentation hooks (value formatting, per-option decoration) — the same contract as
 * `@zodal/dials-ui-vanilla`, in React terms.
 */

import type { ReactElement, ReactNode } from 'react';
import type { SettingFieldConfig, SettingFieldState } from '@zodal/dials-ui';
import type { SettingKey } from '@zodal/dials-core';

/** Presentation hooks: how values and options are shown, without replacing a control. */
export interface FieldPresentation {
  /** Format a value for display — used by the slider (its readout and `aria-valuetext`). Return
   *  `undefined` to fall back to `formatValue` (rounded to the step, plus the field's unit). */
  format?: (field: SettingFieldConfig, value: unknown) => string | undefined;
  /** Decorate one choice of an enum shown as chips (e.g. a colour swatch, a font sample): receives
   *  the option's display label and returns what the chip shows (`undefined` keeps the label). Chips
   *  only: an enum of more than 4 values is a `<select>` unless declared `.meta({ editWidget: 'radio' })`. */
  decorateOption?: (field: SettingFieldConfig, value: string, label: string) => ReactNode | undefined;
}

export interface ControlProps extends FieldPresentation {
  field: SettingFieldConfig;
  state: SettingFieldState;
  /** Called once per deliberate change (release, Enter, blur, pick) with the decoded value. */
  onChange?: (value: unknown) => void;
  /** Called while a continuous control moves (a slider dragged, a colour picked) with each transient
   *  value; `onChange` follows on release. */
  onPreview?: (value: unknown) => void;
}

/** A widget control: a React component rendering the input for a setting. */
export type SettingControl = (props: ControlProps) => ReactElement;

export interface PanelHandlers {
  /** Called once per deliberate change with the decoded value. Commit here: persist, record undo. */
  onChange?: (key: SettingKey, value: unknown) => void;
  /** Called while a slider or colour moves. Apply it to the view only; `onChange` follows on release. */
  onPreview?: (key: SettingKey, value: unknown) => void;
  /** Called when the user clicks reset on a setting. */
  onReset?: (key: SettingKey) => void;
}
