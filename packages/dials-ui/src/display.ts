/**
 * Renderer-neutral display rules every settings renderer shares, so the vanilla DOM and the React
 * renderers show the same thing: how a value reads (`formatValue`: rounded to the step, plus the
 * unit), what an enum option is called (`optionLabel`), the `#rrggbb` form a colour input needs
 * (`toHexColor`), and when a panel shows its search box (`showsSearch`).
 */

import type { SettingFieldConfig } from './types.js';

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

/** Normalize a CSS colour to the `#rrggbb` form `<input type="color">` requires (else undefined). */
export function toHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : undefined;
}

/** The default `searchThreshold`: a form with more settings than this gets a search box under
 *  `search: 'auto'`. */
export const DEFAULT_SEARCH_THRESHOLD = 15;

/** A panel's search-box options: `true`, `false`, or `'auto'` (default), which shows the box only
 *  when the form has more than `searchThreshold` settings (every field counts, advanced ones behind
 *  a disclosure included; a non-finite threshold falls back to `DEFAULT_SEARCH_THRESHOLD`). */
export interface SearchBoxOptions {
  search?: boolean | 'auto';
  searchThreshold?: number;
}

/** Whether a panel of `fieldCount` settings shows its search box under these options. */
export function showsSearch(fieldCount: number, options: SearchBoxOptions = {}): boolean {
  const search = options.search ?? 'auto';
  if (search !== 'auto') return search === true;
  const threshold = Number.isFinite(options.searchThreshold) ? (options.searchThreshold as number) : DEFAULT_SEARCH_THRESHOLD;
  return fieldCount > threshold;
}
