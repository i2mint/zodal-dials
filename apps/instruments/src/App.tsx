/**
 * The instruments demo: one zodal-dials settings surface (thoremin-derived), rendered TWO ways the
 * user can toggle (the React/shadcn panel vs. the framework-free vanilla-DOM panel — same headless
 * config, swapped renderer), driven by one reactive `createSettingsStore`, with a save/load
 * "instruments" panel (named profiles persisted to localStorage) and live validation/provenance.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createSettingsStore, toFieldStates, toSettingsForm } from '@zodal/dials-ui';
import type { ProfileMeta, SettingFieldState, SettingsForm } from '@zodal/dials-ui';
import { SettingsPanel } from '@zodal/dials-ui-shadcn';
import { renderSettingsPanel } from '@zodal/dials-ui-vanilla';
import type { Layer, SettingKey } from '@zodal/dials-core';
import { thoreminDials } from './schema.js';
import { instruments } from './instruments.js';

type Renderer = 'shadcn' | 'vanilla';

/** Mounts the framework-free vanilla DOM renderer inside React. */
function VanillaPanel(props: {
  form: SettingsForm;
  states: Record<SettingKey, SettingFieldState>;
  onChange: (key: SettingKey, value: unknown) => void;
  onReset: (key: SettingKey) => void;
}): JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (el) el.replaceChildren(renderSettingsPanel(props.form, props.states, { onChange: props.onChange, onReset: props.onReset }));
  }, [props.form, props.states, props.onChange, props.onReset]);
  return <div ref={host} className="vanilla-host" />;
}

export function App(): JSX.Element {
  const [store] = useState(() => createSettingsStore(thoreminDials, { layer: {} }));
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  const [renderer, setRenderer] = useState<Renderer>('shadcn');
  const [list, setList] = useState<ProfileMeta[]>([]);
  const [name, setName] = useState('');

  const refresh = useCallback(() => {
    void instruments.list().then(setList);
  }, []);
  useEffect(refresh, [refresh]);

  const onChange = useCallback((key: SettingKey, value: unknown) => store.set(key, value), [store]);
  const onReset = useCallback((key: SettingKey) => store.reset(key), [store]);

  // `form` (fields + facet sections) is value-independent — memoize it so the vanilla panel only
  // rebuilds on real state changes (not every render). `states` carries the value-dependent part.
  const form = useMemo(() => toSettingsForm(thoreminDials), []);
  const states = toFieldStates(form.fields, state, state.dirty);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await instruments.save(trimmed, state.layer);
    setName('');
    refresh();
  };
  const load = async (n: string) => {
    const layer = await instruments.load(n);
    if (layer) store.setLayer(layer as Layer);
  };
  const remove = async (n: string) => {
    await instruments.remove(n);
    refresh();
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎛️ Instruments</h1>
        <p className="subtitle">A thoremin settings surface, powered by zodal-dials — same schema, two renderers.</p>
      </header>

      <div className="layout">
        <main className="panel-col">
          <div className="toolbar">
            <span className="toolbar-label">Renderer:</span>
            <div className="seg">
              {(['shadcn', 'vanilla'] as Renderer[]).map((r) => (
                <button key={r} className={renderer === r ? 'seg-btn active' : 'seg-btn'} onClick={() => setRenderer(r)}>
                  {r === 'shadcn' ? 'React / shadcn' : 'Vanilla DOM'}
                </button>
              ))}
            </div>
            {state.dirty.length > 0 && <span className="dirty-badge">{state.dirty.length} unsaved</span>}
          </div>

          {renderer === 'shadcn' ? (
            <SettingsPanel form={form} states={states} onChange={onChange} onReset={onReset} />
          ) : (
            <VanillaPanel form={form} states={states} onChange={onChange} onReset={onReset} />
          )}

          {!state.validation.ok && (
            <div className="errors">
              {state.validation.errors.map((e, i) => (
                <div key={i} className="error">⛔ {e.message}</div>
              ))}
            </div>
          )}
          {state.validation.warnings.map((w, i) => (
            <div key={i} className="warning">⚠️ {w}</div>
          ))}
        </main>

        <aside className="side-col">
          <section className="card">
            <h2>Instruments</h2>
            <div className="save-row">
              <input
                className="name-input"
                placeholder="Name this instrument…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void save()}
              />
              <button className="btn primary" onClick={() => void save()} disabled={!name.trim()}>
                Save
              </button>
            </div>
            {list.length === 0 ? (
              <p className="empty">No instruments saved yet. Tune the controls, name it, and Save.</p>
            ) : (
              <ul className="inst-list">
                {list.map((p) => (
                  <li key={p.name} className="inst">
                    <span className="inst-name">{p.name}</span>
                    <span className="inst-actions">
                      <button className="btn" onClick={() => void load(p.name)}>Load</button>
                      <button className="btn ghost" onClick={() => void remove(p.name)}>Delete</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button className="btn ghost full" onClick={() => store.setLayer({})}>Reset to defaults</button>
          </section>

          <section className="card">
            <h2>Current patch</h2>
            <pre className="patch">{JSON.stringify(state.effective, null, 2)}</pre>
          </section>
        </aside>
      </div>
    </div>
  );
}
