# 05b — Python Ecosystem Notes: Config/Settings/Params Prior Art

Lightweight grounding pass over the user's ~200-package local Python ecosystem
(indexed by `projreg`, manifest at `~/Dropbox/py/proj/my_packages.pth`) to learn
the BACKEND shapes and conceptual patterns the user already uses for
config / settings / parameterization. Purpose: inform the new TS/JS package
`zodal-settings`, which will often front Python backends, so it should feel
*consistent* with these patterns.

Method: `projreg search` over the ledger + cached READMEs; direct reading of
README, `__init__.py` exports, and key source modules. Read-only.

---

## TL;DR — the four packages that matter

| Package | Role for config/params | Headline abstraction |
|---------|------------------------|----------------------|
| **config2py** | THE config package — cascade of sources | `get_config(key, sources=[...])` — ordered fallback over gettable sources |
| **dol** | key-value store substrate ("data object layer") | `Mapping`/`MutableMapping` stores, codec wrapping, store overlay/cascade |
| **i2** | parameter / signature calculus | `Sig` (signature-as-data), `Param`, `ch_defaults` |
| **meshed** | parameters wired across a function DAG | `DAG`, `FuncNode.bind` (declarative param wiring) |

The user did **not** have a separate "settings"/"prefs"/"options" package — config2py
*is* the settings package, and it is deliberately built on top of `dol` stores and
`i2` signatures. Secondary search hits (`oq`, `ho`, `cw`, `rh`, `au`, `wads`) merely
*consume* config2py or report config; they define no config abstraction worth
mirroring. `tabled` is tabular data, not config.

---

## 1. config2py — the cascade-of-sources model (most important)

- **Purpose**: "Simplified reading and writing configurations from various sources
  and formats." (`@i2mint/config2py`, deps: `dol`, `i2`.)
- **Local path**: `/Users/thorwhalen/Dropbox/py/proj/i/config2py`
- **Core file**: `config2py/base.py`

### (d) Layering / cascade — the central idea

`get_config(key, sources, *, default=no_default, egress=None, val_is_valid=always_true,
config_not_found_exceptions=(Exception,))`:

- A **source** is anything "gettable": a `Mapping`/`dict`/`list`/`str`
  (`GettableContainer` Protocol = has `__getitem__` + `__contains__`) **or** a plain
  `Callable[[key], value]`.
- `get_config` walks `sources` **in order** and returns the **first** value it can
  fetch/compute. A source that raises (any of `config_not_found_exceptions`) is
  skipped and the search continues to the next source.
- `val_is_valid(value) -> bool`: lets a source "return but be ignored" (e.g. skip a
  `None`/empty sentinel and keep searching). `is_not_empty` is a common choice.
- `default`: returned if no source yields a valid value (else raises
  `ConfigNotFound`).
- `egress(key, value) -> value`: post-processing / write-back hook applied to the
  found value before return (used for caching / coercion).
- `sources_chainmap(sources)` wraps the source list as a `collections.ChainMap`
  (the same first-match-wins semantics, as a Mapping). The whole model is essentially
  **`ChainMap` over heterogeneous gettables**.

This is the pattern zodal-settings should echo: **a setting is resolved by walking an
ordered list of sources, first hit wins, with per-source validity and a final
default.**

### The canonical source order (from `simple_config_getter`)

```python
configs = config_store_factory(configs_src)     # a dol store (see below)
source = [
    os.environ,                  # 1. environment variables
    configs,                     # 2. persisted local config store
    user_gettable(configs),      # 3. interactively ASK the user, then persist
]
config_getter = get_config(sources=source)
```

- The ready-made `config_getter` (and factory `simple_config_getter(configs_src, *,
  first_look_in_env_vars=True, ask_user_if_key_not_found=None,
  config_store_factory=get_configs_local_store)`) embodies this: **env var → local
  file store → prompt-and-save**.
- `user_gettable(save_to, ...)`: a source that, on a miss, **prompts the user**
  (`ask_user_for_input`) and **writes the answer back** into `save_to` (a
  `MutableMapping`, usually a dol store) so the next lookup is silent. Only fires in a
  REPL (`is_repl()`); production code should pass `ask_user_if_key_not_found=False`.
- Sources are open-ended: the README shows prepending `locals()` (lexical scope of
  definition) before `os.environ`, or swapping the store. **Order and membership are
  fully user-controlled.**

### (c) Store of values

- `config_store_factory` default = `get_configs_local_store`, which inspects
  `configs_src`: a **directory** → folder of text files; a **file** → ini/cfg file; a
  bare **string** → an app name, resolved to an XDG config folder
  (`~/.config/{app_name}`, overridable via `CONFIG2PY_CONFIG_DIR` and standard XDG
  env vars). Helpers: `get_app_config_folder`, `get_app_data_folder`,
  `get_configs_folder_for_app`, `AppData`.
- The store is always a **dol-style `MutableMapping`** (default `dol.TextFiles`), so
  `list()`, `[key]`, `len()`, `del store[key]` all work on the underlying files —
  "treat config like a dict, persisted as files."
- `config2py/sync_store.py`: `SyncStore` / `FileStore` / `JsonStore` — `MutableMapping`
  that auto-persists on write, with a context manager for deferred/batch sync. Uses an
  **extension → (loader, dumper) registry** (`register_extension('.json', json.loads,
  json.dumps)`, ini via `configparser`).
- `config2py/codecs.py`: extension-based codec registry, `encode_by_extension` /
  `decode_by_extension`, `register_encoder` / `register_decoder` — auto-registers
  json/toml/ini, conditionally yaml/json5 if libs present. **Format is a pluggable
  codec keyed by file extension.**
- `config2py/s_configparser.py`: `ConfigStore` / `ConfigReader` — Mapping persister
  over `.ini`/`.cfg`.

### (a) parameter/setting and (b) defaults

- A setting = a `(key, value)` entry retrievable from any source; there is no heavy
  "Setting" object — it is just a Mapping key.
- "Default" is layered three ways: (1) the last `default=` arg to `get_config`,
  (2) a lower-priority source later in the list, (3) `user_gettable` as the ultimate
  "no default, ask the human" fallback.

---

## 2. dol — the key-value store substrate

- **Purpose**: "Data Object Layer" — uniform `Mapping`/`MutableMapping` (dict-like)
  facades over disparate backends (files, JSON, S3, DBs) plus composable key/value
  transformations.
- **Local path**: `/Users/thorwhalen/Dropbox/py/proj/i/dol`
- Relevant abstractions:
  - `Store` (`dol/base.py`): `MutableMapping` with hooks `_id_of_key` / `_key_of_id`
    / `_data_of_obj` / `_obj_of_data` to transform keys & values bidirectionally.
  - `TextFiles`, `JsonFiles`, `Files`: concrete persisted Mapping stores (config2py's
    default config store is one of these).
  - `wrap_kvs(...)` (`dol/trans.py`): decorator that layers key/value
    encode/decode transforms (`id_of_key`, `obj_of_data`, `preset`, `postget`) onto
    any store.
  - `Pipe` (`dol/util.py`): sequential function composition; used to stack codecs.
  - Store **overlay / cascade** patterns (`dol/sources.py`): a `MultiSource`-style
    read-first-match overlay and a cascade that writes-through / falls back across
    multiple stores — conceptual sibling of config2py's source cascade and
    `ChainMap`.
- **Philosophy**: the dict (`Mapping`) interface is the universal contract;
  persistence, format, and location are pluggable transformation layers. Stores
  compose by overlay (read first match) and cascade (write-through / fallback).

---

## 3. i2 — parameter & signature calculus

- **Purpose**: introspect, manipulate, merge function signatures; bind params to
  values; treat a signature as first-class data.
- **Local path**: `/Users/thorwhalen/Dropbox/py/proj/i/i2`
- Relevant abstractions (`i2/signatures.py`):
  - `Sig`: an extended `inspect.Signature` that is **also a Mapping**; exposes
    `.names`, `.defaults`, `.annotations`, `.kinds` as dicts. Supports signature
    arithmetic (`Sig(f) + Sig(g)` merges params).
  - `Param`: wraps `inspect.Parameter` — one parameter's name / kind / **default** /
    annotation.
  - `ch_defaults(...)`: returns a **new** `Sig` with changed defaults (immutable
    update of defaults).
  - `call_forgivingly` / `map_arguments`: bind a pool of args/kwargs to only the
    params a function declares.
- **Philosophy**: parameters and their defaults are **queryable, mergeable,
  immutably-updatable data**, not opaque function internals. (This is the closest
  Python analogue to a Zod-schema-as-data mindset — relevant for zodal.)

---

## 4. meshed — parameters wired through a function DAG

- **Purpose**: compose functions into a callable DAG wired **by parameter name**.
- **Local path**: `/Users/thorwhalen/Dropbox/py/proj/i/meshed`
- Relevant abstractions:
  - `DAG` (`meshed/dag.py`): callable graph; auto-wires each function's outputs to
    other functions' inputs by **matching parameter names**; merges all node
    signatures into one interface; defaults flow through and can be overridden at
    call time.
  - `FuncNode` (`meshed/base.py`): dataclass wrapping a function with `out` (output
    var name) and `bind` (`{param: source_var_or_value}`) — **declarative parameter
    rebinding metadata**.
  - `ch_funcs(...)`: swap functions in a DAG with signature-compatibility checks.
- **Philosophy**: parameter **names are the wiring language**; bindings/defaults are
  declarative metadata on nodes.

---

## Patterns zodal-settings should stay consistent with

1. **Cascade of ordered sources, first hit wins** (config2py `get_config` /
   `ChainMap`). A setting's value is *resolved*, not *stored in one place*: env →
   persisted store → prompt/default. zodal-settings should model resolution as an
   ordered, user-controlled list of heterogeneous sources, with per-source "is this
   value valid?" and a final default.
2. **Settings store = a Mapping (dict-like) over a pluggable backend** (dol). Reading,
   writing, listing, deleting a setting are dict operations; persistence/format are
   swappable layers (codec keyed by extension). This maps naturally onto zodal's
   `DataProvider`/store mindset — a settings store is "just another store."
3. **Format as pluggable codec, keyed by extension/type** (config2py codecs,
   `register_extension`). zodal-settings serializers should be a registry, not
   hardcoded.
4. **Parameters/defaults as first-class, mergeable data** (i2 `Sig`/`Param`,
   `ch_defaults`; meshed `FuncNode.bind`). The user thinks of params + defaults as
   schema-like data you can introspect, merge, and immutably update — the same
   schema-as-data philosophy zodal already uses with Zod. zodal-settings can expose a
   setting's schema (type, default, annotation) as inspectable data.
5. **Dependency injection of the store / sources** (config2py `config_store_factory`,
   `sources=`; dol store hooks). Behavior is parametrized via injected stores and
   factory callables with smart defaults — "simple things simple" (ready-made
   `config_getter`) but "complex things possible" (custom source lists, custom store
   factory). zodal-settings should ship a zero-config getter AND expose the source
   list / store factory for full control.
6. **Interactive write-back fallback** (config2py `user_gettable`): on a miss, ask &
   persist so the next lookup is silent. A UI-fronted settings package can mirror
   this: a missing setting becomes a prompt whose answer is written back to the store.

## Not found / out of scope

- No dedicated `settings`/`prefs`/`options` package distinct from config2py.
- `oq` (AI tools), `ho` (HTTP objects), `cw` (CLI wizard), `rh`, `au`, `wads`,
  `epythet` surfaced in search only because they *use* or *mention* config; they hold
  no config abstraction to mirror.
- `tabled` is tabular-data tooling, not config.
