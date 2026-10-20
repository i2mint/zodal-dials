/**
 * Vanilla widget renderers — each produces the control element for a setting from its config +
 * current state, wiring change events to the handlers. Continuous controls (slider, colour) call
 * `onPreview` while they move and `onChange` once, on release; a moving slider shows a ghost thumb at
 * the saved value. Enum choices show their display labels (`enumLabels`); a short enum renders as a
 * row of chips over native radios. A `secret` value
 * (a masked `SecretRef`) is shown as a status + a write-only field. Structured/unknown values fall
 * back to a raw JSON editor (the rawJson renderer states WHY). No framework; pure DOM.
 */

import { el } from './dom.js';
import { isSecretRef } from '@zodal/dials-core';
import { formatValue, optionLabel, sliderFraction, toHexColor } from '@zodal/dials-ui';
import type { SettingFieldConfig, SettingFieldState } from '@zodal/dials-ui';
import type { FieldPresentation, SettingRenderFn } from './types.js';

const isDisabled = (field: SettingFieldConfig, state: SettingFieldState): boolean => field.readOnly || state.managed;
const asText = (v: unknown): string => (v == null ? '' : String(v));

export { formatValue, optionLabel };

const display = (field: SettingFieldConfig, value: unknown, h: FieldPresentation): string =>
  h.format?.(field, value) ?? formatValue(field, value);

/** Decode a numeric input, returning undefined for empty/non-numeric so clearing the box is treated
 *  as "no change" (use Reset to unset) rather than silently writing 0 / NaN. */
function decodeNumber(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}
const jsonString = (v: unknown): string => {
  try {
    return JSON.stringify(v ?? null, null, 2);
  } catch {
    return String(v);
  }
};

export const renderSwitch: SettingRenderFn = (field, state, h) =>
  el('input', {
    type: 'checkbox',
    role: 'switch',
    id: field.key,
    class: 'zodal-dials-switch',
    checked: state.value === true,
    disabled: isDisabled(field, state),
    onchange: (e: Event) => h.onChange?.(field.key, (e.target as HTMLInputElement).checked),
  });

export const renderText: SettingRenderFn = (field, state, h) =>
  el('input', {
    type: 'text',
    id: field.key,
    class: 'zodal-dials-text',
    value: asText(state.value),
    placeholder: asText(field.defaultValue),
    disabled: isDisabled(field, state),
    onchange: (e: Event) => h.onChange?.(field.key, (e.target as HTMLInputElement).value),
  });

export const renderTextarea: SettingRenderFn = (field, state, h) =>
  el(
    'textarea',
    {
      id: field.key,
      class: 'zodal-dials-textarea',
      disabled: isDisabled(field, state),
      onchange: (e: Event) => h.onChange?.(field.key, (e.target as HTMLTextAreaElement).value),
    },
    asText(state.value),
  );

export const renderNumber: SettingRenderFn = (field, state, h) => {
  const input = el('input', {
    type: 'number',
    id: field.key,
    class: 'zodal-dials-number',
    value: asText(state.value),
    min: field.bounds?.min,
    max: field.bounds?.max,
    step: field.step,
    // iOS's decimal keypad has no minus key: only offer it when the value cannot be negative.
    inputmode: field.step !== undefined && field.step < 1 && (field.bounds?.min ?? -1) >= 0 ? 'decimal' : undefined,
    disabled: isDisabled(field, state),
    onchange: (e: Event) => {
      const v = decodeNumber((e.target as HTMLInputElement).value);
      if (v !== undefined) h.onChange?.(field.key, v);
    },
  });
  // The unit sits beside the box (a number input cannot hold text), hidden from AT: the label says it.
  return field.unit
    ? el('span', { class: 'zodal-dials-number-wrap' }, input, el('span', { class: 'zodal-dials-unit', 'aria-hidden': 'true' }, field.unit.trim()))
    : input;
};

/** The ghost thumb: a faded marker at the saved value, shown while the thumb is away from it, so the
 *  reader sees how far they moved and where to return. Decorative (the readout says the value). */
function ghostThumb(): HTMLElement {
  return el('span', { class: 'zodal-dials-slider-ghost', 'aria-hidden': 'true', hidden: true });
}

export const renderSlider: SettingRenderFn = (field, state, h) => {
  // aria-live off: the range's aria-valuetext is the one announcement (an <output> is a live region).
  const output = el('output', { class: 'zodal-dials-slider-value', for: field.key, 'aria-live': 'off' });
  const ghost = ghostThumb();
  // The value the ghost marks: what the thumb showed at rest, then each committed value (the panel
  // does not rebuild a control after a commit, so the control tracks its own saved value).
  let saved: number | undefined;
  const settle = (value: number | undefined): void => {
    saved = value;
    ghost.hidden = true;
    const at = sliderFraction(field, value);
    if (at === undefined) ghost.style.removeProperty('--zodal-dials-ghost-at');
    else ghost.style.setProperty('--zodal-dials-ghost-at', String(at));
  };
  const input = el('input', {
    type: 'range',
    id: field.key,
    class: 'zodal-dials-slider',
    min: field.bounds?.min,
    max: field.bounds?.max,
    // Without a step a range input moves in steps of 1, so a 0.1..1 slider would have two positions.
    step: field.step ?? 'any',
    disabled: isDisabled(field, state),
    oninput: (e: Event) => {
      const v = decodeNumber((e.target as HTMLInputElement).value);
      if (v === undefined) return;
      const text = display(field, v, h);
      output.textContent = text;
      input.setAttribute('aria-valuetext', text);
      ghost.hidden = saved === undefined || sliderFraction(field, saved) === undefined || v === saved;
      h.onPreview?.(field.key, v);
    },
    // Commit on release (or per arrow-key step): the committed value becomes the saved one.
    onchange: (e: Event) => {
      const v = decodeNumber((e.target as HTMLInputElement).value);
      settle(v ?? saved);
      if (v !== undefined) h.onChange?.(field.key, v);
    },
  });
  // Set the value after min/max/step exist, or the browser clamps/snaps it against the defaults; then
  // show (and mark as saved) what the thumb shows: the browser may have snapped the stored value.
  input.value = asText(state.value);
  if (state.value !== undefined) {
    const shown = decodeNumber(input.value) ?? (state.value as number);
    const text = display(field, shown, h);
    output.textContent = text;
    input.setAttribute('aria-valuetext', text);
    settle(typeof state.value === 'number' ? shown : undefined);
  }
  return el('span', { class: 'zodal-dials-slider-wrap' }, el('span', { class: 'zodal-dials-slider-track' }, input, ghost), output);
};

export const renderColor: SettingRenderFn = (field, state, h) => {
  const hex = toHexColor(state.value) ?? toHexColor(field.defaultValue);
  return el('input', {
    type: 'color',
    id: field.key,
    class: 'zodal-dials-color',
    value: hex,
    disabled: isDisabled(field, state),
    oninput: (e: Event) => h.onPreview?.(field.key, (e.target as HTMLInputElement).value),
    onchange: (e: Event) => h.onChange?.(field.key, (e.target as HTMLInputElement).value),
  });
};

export const renderSelect: SettingRenderFn = (field, state, h) => {
  const select = el(
    'select',
    {
      id: field.key,
      class: 'zodal-dials-select',
      disabled: isDisabled(field, state),
      onchange: (e: Event) => h.onChange?.(field.key, (e.target as HTMLSelectElement).value),
    },
    ...(field.enumValues ?? []).map((v) => el('option', { value: v }, optionLabel(field, v))),
  );
  select.value = asText(state.value);
  return select;
};

export const renderRadio: SettingRenderFn = (field, state, h) =>
  el(
    'fieldset',
    { class: 'zodal-dials-radio', 'aria-label': field.label },
    ...(field.enumValues ?? []).map((v) => {
      const label = el('span', { class: 'zodal-dials-choice-label' }, optionLabel(field, v));
      h.decorateOption?.(field, v, label);
      return el(
        'label',
        { class: 'zodal-dials-choice', 'data-value': v },
        el('input', {
          type: 'radio',
          name: field.key,
          value: v,
          checked: state.value === v,
          disabled: isDisabled(field, state),
          onchange: () => h.onChange?.(field.key, v),
        }),
        label,
      );
    }),
  );

export const renderSecret: SettingRenderFn = (field, state, h) => {
  const ref = isSecretRef(state.value) ? state.value : undefined;
  const status = el('span', { class: 'zodal-dials-secret-status' }, ref ? ref.masked : 'not set');
  const input = el('input', {
    type: 'password',
    id: field.key,
    class: 'zodal-dials-secret',
    placeholder: 'Enter new value',
    disabled: isDisabled(field, state),
    onchange: (e: Event) => h.onChange?.(field.key, (e.target as HTMLInputElement).value),
  });
  return el('span', { class: 'zodal-dials-secret-wrap' }, status, input);
};

function renderJsonish(cssClass: string, note?: string): SettingRenderFn {
  return (field, state, h) => {
    // Defense in depth: a JSON/raw editor must never serialize a secret, even if reached by a
    // widget↔sensitivity mismatch — always fall back to the masked secret widget.
    if (field.sensitivity === 'secret' || isSecretRef(state.value)) return renderSecret(field, state, h);
    const textarea = el(
      'textarea',
      {
        class: cssClass,
        disabled: isDisabled(field, state),
        onchange: (e: Event) => {
          try {
            h.onChange?.(field.key, JSON.parse((e.target as HTMLTextAreaElement).value));
          } catch {
            // invalid JSON: a real renderer would surface an error; the reference renderer ignores it.
          }
        },
      },
      jsonString(state.value),
    );
    return note
      ? el('span', { class: 'zodal-dials-json-wrap' }, el('small', { class: 'zodal-dials-json-note' }, note), textarea)
      : textarea;
  };
}

export const renderObject = renderJsonish('zodal-dials-object');
export const renderArray = renderJsonish('zodal-dials-array');
export const renderRawJson = renderJsonish('zodal-dials-rawjson', 'rendered as raw JSON (no structured editor for this type)');
