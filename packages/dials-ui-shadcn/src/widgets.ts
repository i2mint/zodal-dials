/**
 * React widget controls for settings — plain elements with `zodal-dials-*` class names (swap in
 * shadcn/ui `Switch`, `Select`, `Slider`, … in a consumer). Uses `React.createElement` (no JSX). A
 * secret renders a masked status + write-only field and never echoes plaintext; structured/unknown
 * values fall back to a raw JSON editor that also refuses to serialize a secret.
 */

import { createElement as h } from 'react';
import type { ChangeEvent } from 'react';
import { isSecretRef } from '@zodal/dials-core';
import type { ControlProps, SettingControl } from './types.js';

const isDisabled = (p: ControlProps): boolean => p.field.readOnly || p.state.managed;
const asText = (v: unknown): string => (v == null ? '' : String(v));
const jsonString = (v: unknown): string => {
  try {
    return JSON.stringify(v ?? null, null, 2);
  } catch {
    return String(v);
  }
};

/** Empty/non-numeric input → undefined (treated as "no change"; use Reset to unset). */
function decodeNumber(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

export const SwitchControl: SettingControl = (p) =>
  h('input', {
    type: 'checkbox',
    className: 'zodal-dials-switch',
    checked: p.state.value === true,
    disabled: isDisabled(p),
    onChange: (e: ChangeEvent<HTMLInputElement>) => p.onChange?.(e.target.checked),
  });

export const TextControl: SettingControl = (p) =>
  h('input', {
    type: 'text',
    className: 'zodal-dials-text',
    value: asText(p.state.value),
    // never use a secret's default as a placeholder (defense in depth; secret defaults are omitted upstream)
    placeholder: p.field.sensitivity === 'secret' ? undefined : asText(p.field.defaultValue),
    disabled: isDisabled(p),
    onChange: (e: ChangeEvent<HTMLInputElement>) => p.onChange?.(e.target.value),
  });

export const NumberControl: SettingControl = (p) =>
  h('input', {
    type: 'number',
    className: 'zodal-dials-number',
    value: asText(p.state.value),
    min: p.field.bounds?.min,
    max: p.field.bounds?.max,
    disabled: isDisabled(p),
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const v = decodeNumber(e.target.value);
      if (v !== undefined) p.onChange?.(v);
    },
  });

export const SliderControl: SettingControl = (p) =>
  h(
    'span',
    { className: 'zodal-dials-slider-wrap' },
    h('input', {
      type: 'range',
      className: 'zodal-dials-slider',
      value: asText(p.state.value),
      min: p.field.bounds?.min,
      max: p.field.bounds?.max,
      disabled: isDisabled(p),
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        const v = decodeNumber(e.target.value);
        if (v !== undefined) p.onChange?.(v);
      },
    }),
    h('output', { className: 'zodal-dials-slider-value' }, asText(p.state.value)),
  );

export const SelectControl: SettingControl = (p) =>
  h(
    'select',
    {
      className: 'zodal-dials-select',
      value: asText(p.state.value),
      disabled: isDisabled(p),
      onChange: (e: ChangeEvent<HTMLSelectElement>) => p.onChange?.(e.target.value),
    },
    ...(p.field.enumValues ?? []).map((v, i) => h('option', { key: `${i}:${v}`, value: v }, v)),
  );

export const RadioControl: SettingControl = (p) =>
  h(
    'fieldset',
    { className: 'zodal-dials-radio' },
    ...(p.field.enumValues ?? []).map((v, i) =>
      h(
        'label',
        { key: `${i}:${v}` },
        h('input', {
          type: 'radio',
          name: p.field.key,
          value: v,
          checked: p.state.value === v,
          disabled: isDisabled(p),
          onChange: () => p.onChange?.(v),
        }),
        v,
      ),
    ),
  );

export const SecretControl: SettingControl = (p) => {
  const ref = isSecretRef(p.state.value) ? p.state.value : undefined;
  return h(
    'span',
    { className: 'zodal-dials-secret-wrap' },
    h('span', { className: 'zodal-dials-secret-status' }, ref ? ref.masked : 'not set'),
    h('input', {
      type: 'password',
      className: 'zodal-dials-secret',
      placeholder: 'Enter new value',
      disabled: isDisabled(p),
      onChange: (e: ChangeEvent<HTMLInputElement>) => p.onChange?.(e.target.value),
    }),
  );
};

export const RawJsonControl: SettingControl = (p) => {
  // Defense in depth: never serialize a secret as JSON — always fall back to the masked widget.
  if (p.field.sensitivity === 'secret' || isSecretRef(p.state.value)) return SecretControl(p);
  return h(
    'span',
    { className: 'zodal-dials-json-wrap' },
    h('small', { className: 'zodal-dials-json-note' }, 'rendered as raw JSON (no structured editor for this type)'),
    h('textarea', {
      // key on the serialized value: remounts (re-seeds) the uncontrolled textarea when the upstream
      // value changes (fixes desync), while keeping local typing smooth when it does not.
      key: jsonString(p.state.value),
      className: 'zodal-dials-rawjson',
      defaultValue: jsonString(p.state.value),
      disabled: isDisabled(p),
      onChange: (e: ChangeEvent<HTMLTextAreaElement>) => {
        try {
          p.onChange?.(JSON.parse(e.target.value));
        } catch {
          // invalid JSON: ignore (a real renderer would surface an error)
        }
      },
    }),
  );
};
