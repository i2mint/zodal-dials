/**
 * Vanilla widget renderers — each produces the control element for a setting from its config +
 * current state, wiring change events to the handlers. Continuous controls (slider, colour) call
 * `onPreview` while they move and `onChange` once, on release. Enum choices show their display
 * labels (`enumLabels`); a short enum renders as a row of chips over native radios. A `secret` value
 * (a masked `SecretRef`) is shown as a status + a write-only field. Structured/unknown values fall
 * back to a raw JSON editor (the rawJson renderer states WHY). No framework; pure DOM.
 */

import { el } from './dom.js';
import { isSecretRef } from '@zodal/dials-core';
import type { SettingFieldConfig, SettingFieldState } from '@zodal/dials-ui';
import type { FieldPresentation, SettingRenderFn } from './types.js';

const isDisabled = (field: SettingFieldConfig, state: SettingFieldState): boolean => field.readOnly || state.managed;
const asText = (v: unknown): string => (v == null ? '' : String(v));

/** The display label of an enum value (its `enumLabels` entry, else the value itself). */
export function optionLabel(field: SettingFieldConfig, value: string): string {
  return field.enumLabels?.[value] ?? value;
}

/** Decimal places that a step implies (0.25 → 2, 0.1 → 1, 1 → 0, 1e-7 → 7). */
function decimalsFor(step: number | undefined): number {
  if (!step || !Number.isFinite(step)) return 0;
  const [mantissa, exponent] = step.toExponential().split('e');
  const fraction = (mantissa.split('.')[1] ?? '').length;
  return Math.min(20, Math.max(0, fraction - Number(exponent)));
}

/** Default display of a value: a number rounded to its step's precision, followed by the field's
 *  unit verbatim (`unit: 'px'` → `12px`; put a leading space in the unit for `3 s`); anything else as
 *  text. Scaling (0.8 → `80%`) is a host `format`, not a unit. */
export function formatValue(field: SettingFieldConfig, value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const text = field.step !== undefined ? String(Number(value.toFixed(decimalsFor(field.step)))) : String(value);
    return field.unit ? `${text}${field.unit}` : text;
  }
  return asText(value);
}

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

export const renderNumber: SettingRenderFn = (field, state, h) =>
  el('input', {
    type: 'number',
    id: field.key,
    class: 'zodal-dials-number',
    value: asText(state.value),
    min: field.bounds?.min,
    max: field.bounds?.max,
    step: field.step,
    inputmode: field.step !== undefined && field.step < 1 ? 'decimal' : undefined,
    disabled: isDisabled(field, state),
    onchange: (e: Event) => {
      const v = decodeNumber((e.target as HTMLInputElement).value);
      if (v !== undefined) h.onChange?.(field.key, v);
    },
  });

export const renderSlider: SettingRenderFn = (field, state, h) => {
  const output = el('output', { class: 'zodal-dials-slider-value', for: field.key }, display(field, state.value, h));
  const input = el('input', {
    type: 'range',
    id: field.key,
    class: 'zodal-dials-slider',
    min: field.bounds?.min,
    max: field.bounds?.max,
    // Without a step a range input moves in steps of 1, so a 0.1..1 slider would have two positions.
    step: field.step ?? 'any',
    'aria-valuetext': state.value === undefined ? undefined : display(field, state.value, h),
    disabled: isDisabled(field, state),
    oninput: (e: Event) => {
      const v = decodeNumber((e.target as HTMLInputElement).value);
      if (v === undefined) return;
      const text = display(field, v, h);
      output.textContent = text;
      input.setAttribute('aria-valuetext', text);
      h.onPreview?.(field.key, v);
    },
    onchange: (e: Event) => {
      const v = decodeNumber((e.target as HTMLInputElement).value);
      if (v !== undefined) h.onChange?.(field.key, v);
    },
  });
  // Set the value after min/max/step exist, or the browser clamps/snaps it against the defaults.
  input.value = asText(state.value);
  return el('span', { class: 'zodal-dials-slider-wrap' }, input, output);
};

/** Normalize a CSS colour to the `#rrggbb` form `<input type="color">` requires (else undefined). */
function toHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : undefined;
}

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
