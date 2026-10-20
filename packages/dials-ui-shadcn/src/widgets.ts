/**
 * React widget controls for settings — plain elements with `zodal-dials-*` class names (swap in
 * shadcn/ui `Switch`, `Select`, `Slider`, … in a consumer). Uses `React.createElement` (no JSX).
 * Continuous controls (slider, colour) call `onPreview` while they move and `onChange` once, on
 * release (the native `change` event). Enum choices show their display labels; a short enum renders
 * as a row of chips over native radios. A secret renders a masked status + write-only field and never
 * echoes plaintext; structured/unknown values fall back to a raw JSON editor that also refuses to
 * serialize a secret.
 */

import { createElement as h, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, RefObject } from 'react';
import { isSecretRef } from '@zodal/dials-core';
import { formatValue, optionLabel, toHexColor } from '@zodal/dials-ui';
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

const display = (p: ControlProps, value: unknown): string => p.format?.(p.field, value) ?? formatValue(p.field, value);

/** Call `onCommit` on the element's native `change` event (a slider's release, a colour picker's
 *  close). React's `onChange` fires on every `input`, so the commit is wired natively; `onCommit` is
 *  read through a ref, so the listener is attached once. */
function useNativeChange(ref: RefObject<HTMLInputElement | null>, onCommit: (input: HTMLInputElement) => void): void {
  const latest = useRef(onCommit);
  latest.current = onCommit;
  useEffect(() => {
    const input = ref.current;
    if (!input) return undefined;
    const listener = (): void => latest.current(input);
    input.addEventListener('change', listener);
    return () => input.removeEventListener('change', listener);
  }, [ref]);
}

/** A React `onChange` from a native `change` is the commit, handled by `useNativeChange`. */
const isCommitEvent = (e: ChangeEvent<HTMLInputElement>): boolean => e.nativeEvent.type === 'change';

/** Empty/non-numeric input → undefined (treated as "no change"; use Reset to unset). */
function decodeNumber(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

export const SwitchControl: SettingControl = (p) =>
  h('input', {
    type: 'checkbox',
    role: 'switch',
    id: p.field.key,
    className: 'zodal-dials-switch',
    checked: p.state.value === true,
    disabled: isDisabled(p),
    onChange: (e: ChangeEvent<HTMLInputElement>) => p.onChange?.(e.target.checked),
  });

export const TextControl: SettingControl = (p) =>
  h('input', {
    type: 'text',
    id: p.field.key,
    className: 'zodal-dials-text',
    value: asText(p.state.value),
    // never use a secret's default as a placeholder (defense in depth; secret defaults are omitted upstream)
    placeholder: p.field.sensitivity === 'secret' ? undefined : asText(p.field.defaultValue),
    disabled: isDisabled(p),
    onChange: (e: ChangeEvent<HTMLInputElement>) => p.onChange?.(e.target.value),
  });

export const NumberControl: SettingControl = (p) => {
  const input = h('input', {
    type: 'number',
    id: p.field.key,
    className: 'zodal-dials-number',
    value: asText(p.state.value),
    min: p.field.bounds?.min,
    max: p.field.bounds?.max,
    step: p.field.step,
    // iOS's decimal keypad has no minus key: only offer it when the value cannot be negative.
    inputMode: p.field.step !== undefined && p.field.step < 1 && (p.field.bounds?.min ?? -1) >= 0 ? 'decimal' : undefined,
    disabled: isDisabled(p),
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const v = decodeNumber(e.target.value);
      if (v !== undefined) p.onChange?.(v);
    },
  });
  // The unit sits beside the box (a number input cannot hold text), hidden from AT: the label says it.
  return p.field.unit
    ? h('span', { className: 'zodal-dials-number-wrap' }, input, h('span', { className: 'zodal-dials-unit', 'aria-hidden': true }, p.field.unit.trim()))
    : input;
};

export const SliderControl: SettingControl = (p) => {
  const ref = useRef<HTMLInputElement>(null);
  // The value under the thumb while it moves; undefined when at rest (the saved value shows).
  const [moving, setMoving] = useState<number | undefined>(undefined);
  useNativeChange(ref, (input) => {
    setMoving(undefined);
    const v = decodeNumber(input.value);
    if (v !== undefined) p.onChange?.(v);
  });
  const shown = moving ?? p.state.value;
  const text = shown == null ? '' : display(p, shown);
  return h(
    'span',
    { className: 'zodal-dials-slider-wrap' },
    h('input', {
      ref,
      type: 'range',
      id: p.field.key,
      className: 'zodal-dials-slider',
      value: asText(shown),
      min: p.field.bounds?.min,
      max: p.field.bounds?.max,
      // without a step a range input moves in steps of 1 (a 0.1..1 slider would have two positions)
      step: p.field.step ?? 'any',
      'aria-valuetext': text || undefined,
      disabled: isDisabled(p),
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        if (isCommitEvent(e)) return;
        const v = decodeNumber(e.target.value);
        if (v === undefined) return;
        setMoving(v);
        p.onPreview?.(v);
      },
    }),
    // aria-live off: the range's aria-valuetext is the one announcement (an <output> is a live region).
    h('output', { className: 'zodal-dials-slider-value', htmlFor: p.field.key, 'aria-live': 'off' }, text),
  );
};

export const ColorControl: SettingControl = (p) => {
  const ref = useRef<HTMLInputElement>(null);
  const [moving, setMoving] = useState<string | undefined>(undefined);
  useNativeChange(ref, (input) => {
    setMoving(undefined);
    p.onChange?.(input.value);
  });
  return h('input', {
    ref,
    type: 'color',
    id: p.field.key,
    className: 'zodal-dials-color',
    value: moving ?? toHexColor(p.state.value) ?? toHexColor(p.field.defaultValue) ?? '#000000',
    disabled: isDisabled(p),
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      if (isCommitEvent(e)) return;
      setMoving(e.target.value);
      p.onPreview?.(e.target.value);
    },
  });
};

export const SelectControl: SettingControl = (p) =>
  h(
    'select',
    {
      id: p.field.key,
      className: 'zodal-dials-select',
      value: asText(p.state.value),
      disabled: isDisabled(p),
      onChange: (e: ChangeEvent<HTMLSelectElement>) => p.onChange?.(e.target.value),
    },
    ...(p.field.enumValues ?? []).map((v, i) => h('option', { key: `${i}:${v}`, value: v }, optionLabel(p.field, v))),
  );

export const RadioControl: SettingControl = (p) =>
  h(
    'fieldset',
    { className: 'zodal-dials-radio', 'aria-label': p.field.label },
    ...(p.field.enumValues ?? []).map((v, i) => {
      const label = optionLabel(p.field, v);
      return h(
        'label',
        { key: `${i}:${v}`, className: 'zodal-dials-choice', 'data-value': v },
        h('input', {
          type: 'radio',
          name: p.field.key,
          value: v,
          checked: p.state.value === v,
          disabled: isDisabled(p),
          onChange: () => p.onChange?.(v),
        }),
        h('span', { className: 'zodal-dials-choice-label' }, p.decorateOption?.(p.field, v, label) ?? label),
      );
    }),
  );

export const SecretControl: SettingControl = (p) => {
  const ref = isSecretRef(p.state.value) ? p.state.value : undefined;
  return h(
    'span',
    { className: 'zodal-dials-secret-wrap' },
    h('span', { className: 'zodal-dials-secret-status' }, ref ? ref.masked : 'not set'),
    h('input', {
      type: 'password',
      id: p.field.key,
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
