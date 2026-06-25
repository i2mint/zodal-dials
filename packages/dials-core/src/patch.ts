/**
 * Patch & serialization utilities for layers.
 *
 * - RFC 7386 JSON Merge Patch (`applyMergePatch`) — the ergonomic, mirror-shaped delta format.
 * - Lossless layer serialization (`serializeLayer`/`deserializeLayer`) — encodes the UNSET sentinel
 *   separately from values so a layer round-trips with zero drift (UNSET is NOT conflated with a
 *   literal `null`, the standard RFC 7386 footgun).
 * - `layerToMergePatch` — a layer AS a standard RFC 7386 patch (UNSET -> null) for interop (lossy
 *   only for the rare literal-`null` value).
 * - RFC 6902 JSON Patch (`applyJsonPatch`) + `diffJsonPatch` + `invertJsonPatch` — for history/undo.
 *
 * All functions are pure; inputs are never mutated. Pointer traversal rejects the prototype-polluting
 * keys `__proto__`/`constructor`/`prototype`, and array indices are validated per RFC 6902 §4.
 */

import { isPlainObject, deepClone, deepEqual } from './util.js';
import { UNSET, isUnset } from './model.js';
import type { Layer } from './model.js';

// ---------------------------------------------------------------------------
// RFC 7386 — JSON Merge Patch  (https://www.rfc-editor.org/rfc/rfc7386)
// ---------------------------------------------------------------------------

const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Apply an RFC 7386 JSON Merge Patch to a target. `null` in the patch deletes a member. Pure. */
export function applyMergePatch(target: unknown, patch: unknown): unknown {
  if (!isPlainObject(patch)) return deepClone(patch);
  const base: Record<string, unknown> = isPlainObject(target) ? deepClone(target) : {};
  for (const [key, val] of Object.entries(patch)) {
    if (PROTO_KEYS.has(key)) continue; // never let a patch reach a prototype
    if (val === null) delete base[key];
    else base[key] = applyMergePatch(base[key], val);
  }
  return base;
}

// ---------------------------------------------------------------------------
// Lossless layer serialization (UNSET kept distinct from null)
// ---------------------------------------------------------------------------

/** The on-disk/wire shape of a layer: values plus an explicit list of reset (UNSET) keys. */
export interface SerializedLayer {
  values: Record<string, unknown>;
  unset: string[];
}

/** Serialize a layer losslessly (UNSET keys recorded separately from values). */
export function serializeLayer(layer: Layer): SerializedLayer {
  const values: Record<string, unknown> = {};
  const unset: string[] = [];
  for (const [k, v] of Object.entries(layer)) {
    if (isUnset(v)) unset.push(k);
    else values[k] = deepClone(v);
  }
  return { values, unset };
}

/** Deserialize a layer produced by `serializeLayer` (the inverse; round-trips with zero drift). */
export function deserializeLayer(s: SerializedLayer): Layer {
  const layer: Layer = {};
  for (const [k, v] of Object.entries(s.values ?? {})) layer[k] = deepClone(v);
  for (const k of s.unset ?? []) layer[k] = UNSET;
  return layer;
}

/**
 * Express a layer as a standard RFC 7386 merge patch (UNSET -> null). Lossy ONLY for the rare case
 * of a setting whose legitimate value is `null` (indistinguishable from a reset under RFC 7386); use
 * `serializeLayer` when that distinction must be preserved.
 */
export function layerToMergePatch(layer: Layer): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(layer)) patch[k] = isUnset(v) ? null : deepClone(v);
  return patch;
}

// ---------------------------------------------------------------------------
// RFC 6901 — JSON Pointer
// ---------------------------------------------------------------------------

/** RFC 6902 §4: an array index is `0` or a non-zero-leading run of digits (no leading zeros, signs, spaces). */
const ARRAY_INDEX = /^(?:0|[1-9][0-9]*)$/;

function parsePointer(pointer: string): string[] {
  if (pointer === '') return [];
  if (pointer[0] !== '/') throw new Error(`Invalid JSON Pointer (must start with "/"): ${pointer}`);
  return pointer
    .slice(1)
    .split('/')
    .map((tok) => tok.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function arrayIndex(token: string, length: number, mode: 'add' | 'access'): number {
  if (mode === 'add' && token === '-') return length;
  if (!ARRAY_INDEX.test(token)) throw new Error(`Invalid array index "${token}"`);
  const idx = Number(token);
  if (mode === 'add' ? idx > length : idx >= length) {
    throw new Error(`Array index out of bounds: ${token} (length ${length})`);
  }
  return idx;
}

function getAtPointer(doc: unknown, tokens: string[]): unknown {
  let cur: unknown = doc;
  for (const tok of tokens) {
    if (Array.isArray(cur)) {
      if (tok === '-' || !ARRAY_INDEX.test(tok)) return undefined;
      cur = cur[Number(tok)];
    } else if (isPlainObject(cur)) {
      if (PROTO_KEYS.has(tok)) return undefined;
      cur = cur[tok];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Set/insert at a pointer, mutating `doc` (callers always pass a fresh clone). */
function setAtPointer(doc: unknown, tokens: string[], value: unknown, insert: boolean): unknown {
  if (tokens.length === 0) return value;
  const last = tokens[tokens.length - 1];
  const parent = getAtPointer(doc, tokens.slice(0, -1));
  if (Array.isArray(parent)) {
    const idx = arrayIndex(last, parent.length, insert ? 'add' : 'access');
    if (insert) parent.splice(idx, 0, value);
    else parent[idx] = value;
  } else if (isPlainObject(parent)) {
    if (PROTO_KEYS.has(last)) throw new Error(`Refusing to set prototype-polluting key: ${last}`);
    parent[last] = value;
  } else {
    throw new Error(`Cannot set at pointer; parent is not a container: /${tokens.slice(0, -1).join('/')}`);
  }
  return doc;
}

function removeAtPointer(doc: unknown, tokens: string[]): unknown {
  if (tokens.length === 0) throw new Error('Cannot remove the document root');
  const last = tokens[tokens.length - 1];
  const parent = getAtPointer(doc, tokens.slice(0, -1));
  if (Array.isArray(parent)) {
    const idx = arrayIndex(last, parent.length, 'access');
    parent.splice(idx, 1);
  } else if (isPlainObject(parent)) {
    if (PROTO_KEYS.has(last) || !Object.prototype.hasOwnProperty.call(parent, last)) {
      throw new Error(`Cannot remove; member does not exist: /${tokens.join('/')}`);
    }
    delete parent[last];
  } else {
    throw new Error(`Cannot remove at pointer; parent is not a container: /${tokens.slice(0, -1).join('/')}`);
  }
  return doc;
}

function pointerExists(doc: unknown, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const parent = getAtPointer(doc, tokens.slice(0, -1));
  const last = tokens[tokens.length - 1];
  if (Array.isArray(parent)) return ARRAY_INDEX.test(last) && Number(last) < parent.length;
  if (isPlainObject(parent)) return !PROTO_KEYS.has(last) && Object.prototype.hasOwnProperty.call(parent, last);
  return false;
}

// ---------------------------------------------------------------------------
// RFC 6902 — JSON Patch  (https://datatracker.ietf.org/doc/html/rfc6902)
// ---------------------------------------------------------------------------

/** An RFC 6902 JSON Patch operation. */
export type JsonPatchOp =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'move'; from: string; path: string }
  | { op: 'copy'; from: string; path: string }
  | { op: 'test'; path: string; value: unknown };

/** Apply an ordered RFC 6902 JSON Patch to a document. Pure; throws on a failed `test` or bad path. */
export function applyJsonPatch(doc: unknown, ops: JsonPatchOp[]): unknown {
  let result = deepClone(doc);
  for (const op of ops) {
    switch (op.op) {
      case 'add': {
        result = setAtPointer(result, parsePointer(op.path), deepClone(op.value), true);
        break;
      }
      case 'remove': {
        result = removeAtPointer(result, parsePointer(op.path));
        break;
      }
      case 'replace': {
        const tokens = parsePointer(op.path);
        if (!pointerExists(result, tokens)) throw new Error(`replace target does not exist: ${op.path}`);
        result = setAtPointer(result, tokens, deepClone(op.value), false);
        break;
      }
      case 'move': {
        const fromTokens = parsePointer(op.from);
        if (!pointerExists(result, fromTokens)) throw new Error(`move source does not exist: ${op.from}`);
        const val = deepClone(getAtPointer(result, fromTokens));
        result = removeAtPointer(result, fromTokens);
        result = setAtPointer(result, parsePointer(op.path), val, true);
        break;
      }
      case 'copy': {
        const fromTokens = parsePointer(op.from);
        if (!pointerExists(result, fromTokens)) throw new Error(`copy source does not exist: ${op.from}`);
        const val = deepClone(getAtPointer(result, fromTokens));
        result = setAtPointer(result, parsePointer(op.path), val, true);
        break;
      }
      case 'test': {
        const tokens = parsePointer(op.path);
        if (!pointerExists(result, tokens) || !deepEqual(getAtPointer(result, tokens), op.value)) {
          throw new Error(`test failed at ${op.path}`);
        }
        break;
      }
      default: {
        throw new Error(`Unknown JSON Patch op: ${(op as { op: string }).op}`);
      }
    }
  }
  return result;
}

/**
 * Compute an RFC 6902 patch turning `before` into `after`, at object-member granularity (recursing
 * into nested plain objects; arrays and scalars are replaced wholesale). The patches we generate are
 * always add/remove/replace, which `invertJsonPatch` inverts exactly — ideal for settings history.
 */
export function diffJsonPatch(before: unknown, after: unknown, basePath = ''): JsonPatchOp[] {
  if (deepEqual(before, after)) return [];
  if (!isPlainObject(before) || !isPlainObject(after)) {
    return [{ op: 'replace', path: basePath, value: deepClone(after) }];
  }
  const ops: JsonPatchOp[] = [];
  const enc = (k: string) => k.replace(/~/g, '~0').replace(/\//g, '~1');
  for (const k of Object.keys(before)) {
    const path = `${basePath}/${enc(k)}`;
    if (!Object.prototype.hasOwnProperty.call(after, k)) ops.push({ op: 'remove', path });
    else ops.push(...diffJsonPatch(before[k], after[k], path));
  }
  for (const k of Object.keys(after)) {
    if (!Object.prototype.hasOwnProperty.call(before, k)) {
      ops.push({ op: 'add', path: `${basePath}/${enc(k)}`, value: deepClone(after[k]) });
    }
  }
  return ops;
}

/**
 * Produce the inverse of a patch (relative to the document it was applied to), so applying the
 * inverse undoes it. Exact for add/remove/replace/test/copy; `move` is inverted as a reverse move.
 */
export function invertJsonPatch(ops: JsonPatchOp[], before: unknown): JsonPatchOp[] {
  const inverse: JsonPatchOp[] = [];
  let state = deepClone(before);
  for (const op of ops) {
    const tokens = 'path' in op ? parsePointer(op.path) : [];
    switch (op.op) {
      case 'add': {
        const parent = getAtPointer(state, tokens.slice(0, -1));
        if (Array.isArray(parent)) {
          inverse.unshift({ op: 'remove', path: op.path }); // inserts shift back on remove
        } else {
          const existed = pointerExists(state, tokens);
          inverse.unshift(
            existed ? { op: 'replace', path: op.path, value: deepClone(getAtPointer(state, tokens)) } : { op: 'remove', path: op.path },
          );
        }
        break;
      }
      case 'remove': {
        inverse.unshift({ op: 'add', path: op.path, value: deepClone(getAtPointer(state, tokens)) });
        break;
      }
      case 'replace': {
        inverse.unshift({ op: 'replace', path: op.path, value: deepClone(getAtPointer(state, tokens)) });
        break;
      }
      case 'move': {
        inverse.unshift({ op: 'move', from: op.path, path: op.from });
        break;
      }
      case 'copy': {
        const existed = pointerExists(state, tokens);
        inverse.unshift(
          existed ? { op: 'replace', path: op.path, value: deepClone(getAtPointer(state, tokens)) } : { op: 'remove', path: op.path },
        );
        break;
      }
      case 'test': {
        inverse.unshift(op);
        break;
      }
    }
    state = applyJsonPatch(state, [op]);
  }
  return inverse;
}
