/** Shared test fixtures for the dials-ui-vanilla suite (not a test file). */
import type { SettingFieldConfig, SettingFieldState } from '@zodal/dials-ui';

export function cfg(over: Partial<SettingFieldConfig> = {}): SettingFieldConfig {
  return {
    key: 'k',
    label: 'K',
    widget: 'text',
    zodType: 'string',
    required: false,
    readOnly: false,
    hidden: false,
    sensitivity: 'public',
    mergeStrategy: 'replace',
    facets: [],
    advanced: false,
    isStructured: false,
    ...over,
  } as SettingFieldConfig;
}

export function st(over: Partial<SettingFieldState> = {}): SettingFieldState {
  return { value: undefined, managed: false, shadowed: false, dirty: false, ...over };
}

/** Set a control's value and dispatch a DOM event. */
export function fire(node: HTMLElement, type: string, value?: string): void {
  if (value !== undefined && 'value' in node) (node as HTMLInputElement).value = value;
  node.dispatchEvent(new Event(type, { bubbles: true }));
}
