/**
 * Render contract for the vanilla settings renderer: the host's handlers (preview, commit, reset)
 * and the presentation hooks (value formatting, per-option decoration) every widget receives.
 */

import type { SettingFieldConfig, SettingFieldState } from '@zodal/dials-ui';
import type { SettingKey } from '@zodal/dials-core';

export interface FieldHandlers {
  /** Called once per deliberate change (release, Enter, blur, pick) with the decoded value. Commit
   *  here: persist, record undo, dispatch the command. */
  onChange?: (key: SettingKey, value: unknown) => void;
  /** Called while a continuous control moves (a slider being dragged, a colour being picked) with
   *  each transient value. Apply it to the view only; `onChange` follows on release. */
  onPreview?: (key: SettingKey, value: unknown) => void;
  /** Called when the user clicks reset on a setting. */
  onReset?: (key: SettingKey) => void;
}

/** Presentation hooks: how values and options are shown, without replacing a widget. */
export interface FieldPresentation {
  /** Format a value for display — used by the slider (its readout and `aria-valuetext`). Return `undefined`
   *  to fall back to the default (`formatValue`: rounded to the step, plus the field's unit). */
  format?: (field: SettingFieldConfig, value: unknown) => string | undefined;
  /** Decorate one choice of an enum shown as chips (e.g. a colour swatch, a font sample): receives
   *  the option's label element after it is built. Chips only: an enum of more than 4 values is a
   *  `<select>` unless declared `.meta({ editWidget: 'radio' })`, and `<option>`s cannot be decorated. */
  decorateOption?: (field: SettingFieldConfig, value: string, label: HTMLElement) => void;
}

/** What a widget renderer receives besides the field and its state. */
export type WidgetContext = FieldHandlers & FieldPresentation;

/** A widget renderer: produce the control element for a setting from its config + current state. */
export type SettingRenderFn = (
  field: SettingFieldConfig,
  state: SettingFieldState,
  handlers: WidgetContext,
) => HTMLElement;
