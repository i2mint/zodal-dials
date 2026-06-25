/**
 * Vanilla widget renderers — each produces the control element for a setting from its config +
 * current state, wiring change events to the handlers. A `secret` value (a masked `SecretRef`) is
 * shown as a status + a write-only field. Structured/unknown values fall back to a raw JSON editor
 * (the rawJson renderer states WHY). No framework; pure DOM.
 */

import { el } from './dom.js';
import { isSecretRef } from '@zodal/dials-core';
import type { SettingFieldConfig, SettingFieldState } from '@zodal/dials-ui';
import type { SettingRenderFn } from './types.js';

const isDisabled = (field: SettingFieldConfig, state: SettingFieldState): boolean => field.readOnly || state.managed;
const asText = (v: unknown): string => (v == null ? '' : String(v));

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
    class: 'zodal-dials-switch',
    checked: state.value === true,
    disabled: isDisabled(field, state),
    onchange: (e: Event) => h.onChange?.(field.key, (e.target as HTMLInputElement).checked),
  });

export const renderText: SettingRenderFn = (field, state, h) =>
  el('input', {
    type: 'text',
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
      class: 'zodal-dials-textarea',
      disabled: isDisabled(field, state),
      onchange: (e: Event) => h.onChange?.(field.key, (e.target as HTMLTextAreaElement).value),
    },
    asText(state.value),
  );

export const renderNumber: SettingRenderFn = (field, state, h) =>
  el('input', {
    type: 'number',
    class: 'zodal-dials-number',
    value: asText(state.value),
    min: field.bounds?.min,
    max: field.bounds?.max,
    disabled: isDisabled(field, state),
    onchange: (e: Event) => {
      const v = decodeNumber((e.target as HTMLInputElement).value);
      if (v !== undefined) h.onChange?.(field.key, v);
    },
  });

export const renderSlider: SettingRenderFn = (field, state, h) => {
  const output = el('output', { class: 'zodal-dials-slider-value' }, asText(state.value));
  const input = el('input', {
    type: 'range',
    class: 'zodal-dials-slider',
    value: asText(state.value),
    min: field.bounds?.min,
    max: field.bounds?.max,
    disabled: isDisabled(field, state),
    oninput: (e: Event) => {
      output.textContent = (e.target as HTMLInputElement).value;
    },
    onchange: (e: Event) => {
      const v = decodeNumber((e.target as HTMLInputElement).value);
      if (v !== undefined) h.onChange?.(field.key, v);
    },
  });
  return el('span', { class: 'zodal-dials-slider-wrap' }, input, output);
};

export const renderSelect: SettingRenderFn = (field, state, h) => {
  const select = el(
    'select',
    {
      class: 'zodal-dials-select',
      disabled: isDisabled(field, state),
      onchange: (e: Event) => h.onChange?.(field.key, (e.target as HTMLSelectElement).value),
    },
    ...(field.enumValues ?? []).map((v) => el('option', { value: v }, v)),
  );
  select.value = asText(state.value);
  return select;
};

export const renderRadio: SettingRenderFn = (field, state, h) =>
  el(
    'fieldset',
    { class: 'zodal-dials-radio' },
    ...(field.enumValues ?? []).map((v) =>
      el(
        'label',
        null,
        el('input', {
          type: 'radio',
          name: field.key,
          value: v,
          checked: state.value === v,
          disabled: isDisabled(field, state),
          onchange: () => h.onChange?.(field.key, v),
        }),
        v,
      ),
    ),
  );

export const renderSecret: SettingRenderFn = (field, state, h) => {
  const ref = isSecretRef(state.value) ? state.value : undefined;
  const status = el('span', { class: 'zodal-dials-secret-status' }, ref ? ref.masked : 'not set');
  const input = el('input', {
    type: 'password',
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
