# Lessons from the build — gotchas the adversarial reviews caught

> Every package shipped through 1–2 adversarial-critic passes. The critics found **real,
> ship-blocking bugs that the happy-path tests missed** — at every chunk. This file distills those
> findings into a checklist so they are not re-introduced. Each item is enforced by a regression test
> (mostly in a `tests/*hardening*.test.ts` or `tests/adversarial.test.ts` of the named package).

## Secrets — the guarantee leaks in non-obvious places

The secret-never-leaks benchmark (#5) is easy to pass on the happy path and easy to violate everywhere else. A secret value must never appear as plaintext in any **display / export / log** surface (the editable layer in memory may hold it, en route to a secret backend).

- **Mask the WHOLE resolution result, not just `effective`.** `provenance[key].value`, `provenance[key].shadowed[].value`, and `conflicts[].contributors[].value` all carry raw values. `explain()` returns provenance. Use `maskEffectiveResult` (dials-core), never a hand-rolled effective-only mask. *(dials-core)*
- **Nested secrets in containers.** `classifySensitivity` recurses into `ZodObject`/`ZodArray`/`ZodRecord`/tuple/union — a secret-named field inside an object/array value classifies the **whole** setting as secret (fail-safe; the value can't be masked field-by-field). *(dials-core)*
- **Out-of-schema keys fail safe.** An ad-hoc layer key not in the schema is still name-classified (a `*_token` ad-hoc key → secret), never defaulted to public. *(dials-core)*
- **The UI must not re-expose what the core masked.** `describeSettings` omits a secret's plaintext `defaultValue`; `toFieldStates` masks the value even from an UNMASKED resolution (defense in depth). *(dials-ui)*
- **Renderers: the rawJson fallback must refuse to serialize a secret;** secret masking must not depend on `widget`↔`sensitivity` lockstep (register the secret control by widget kind too). *(dials-ui-vanilla, dials-ui-shadcn)*
- **Stores: never write a secret to disk.** The jsonc store redacts `secret` keys on save via `sensitivityFor` (fail-closed); callers must otherwise `splitBySensitivity` first. *(dials-store-jsonc)*
- **Codegen: strip ALL value-bearing keywords for secrets** (`default`/`const`/`enum`/`examples`) from the emitted JSON Schema; the CLI `set` must mask the echoed confirmation (never print the typed secret to stdout/history); `toPrompt` omits secret defaults. *(dials-codegen)*

## Patches & merge (dials-core)

- **Prototype pollution.** Reject `__proto__`/`constructor`/`prototype` in JSON-pointer writes; build cloned/merged objects with `Object.defineProperty` so a literal `__proto__` own key can't corrupt a prototype or pollute `Object.prototype`.
- **RFC 6902 strictness.** Validate array indices (`/^(0|[1-9][0-9]*)$/`, bounds-check `add`/`replace`); a `test` against a non-existent member must FAIL (don't let `undefined === undefined` pass it).
- **`UNSET` ≠ `null` ≠ `undefined`.** The cascade `UNSET` sentinel is fall-through/abstain (re-expose lower scope); a literal `null` is a value. Serialize layers losslessly (UNSET recorded separately), not via RFC-7386 null-as-delete.
- **Honest provenance.** `mergedFrom` attributes by **surviving-leaf origin**, not naive leave-one-out (which under-reports when two scopes set an identical leaf).

## UI (dials-ui & renderers)

- **`getNumericBounds` returns ±Infinity (or null) when unbounded — not undefined.** Coalesce non-finite to undefined with `Number.isFinite`, or every number becomes a slider.
- **Group ids must be unique.** A user facet colliding with a computed id (`@secret`) or the catch-all (`_ungrouped`) must not produce two groups with one id (renderers key off id).
- **Dirty must distinguish `null` / `undefined` / absent / UNSET** as four states.
- **Number inputs:** `Number('')` is `0` and `Number('abc')` is `NaN` — decode empty/invalid as "no change", never write 0/NaN.
- **React:** uncontrolled JSON editors desync on re-render (re-seed via a `key` on the serialized value); key mapped children (duplicate enum values → `key` by index); memoize the registry.

## Reactive store (dials-ui)

- **Validate over UNMASKED values** (a constraint must see the real secret, not a `SecretRef`); mask only the display surfaces.
- **Isolate throwing listeners** (try/catch per listener + `onListenerError`); a no-op/write-back guard on `set` prevents spurious notifications and re-entrancy stack overflow.
- **Copy `scopes` in and out** — never alias the caller's array into internal state.

## Stores (env / jsonc)

- **Lossless coercion.** Coerce an env string to a number only when it round-trips (`String(Number(x)) === x`) — keep leading-zero / big-int strings as strings.
- **Reject env-var collisions** at construction (`a.b`, `a-b` both → `A__B`).
- **JSONC save:** reset a non-object file root before editing (don't crash); a plain `undefined` is NOT a delete (only `UNSET` deletes); `mkdir` the parent, write atomically (temp + rename), serialize concurrent saves.

## Process

- **Adversarial review is not a formality.** Two critic passes on the keystone caught a second round of incomplete fixes. Every chunk's critic found something real. Write the regression test for each finding in the same change.
