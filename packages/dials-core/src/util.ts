/**
 * Internal value utilities shared across the cascade engine: plain-object detection, structural
 * deep clone, deep equality, and structural deep merge. Pure and dependency-free. All object
 * construction goes through `setOwn` (a defineProperty-based assignment) so a value carrying a
 * literal `__proto__` / `constructor` / `prototype` own key cannot corrupt a prototype or pollute
 * the global `Object.prototype`. Not part of the public API.
 */

/** Keys whose plain assignment could mutate a prototype — always assigned via defineProperty. */
const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Assign an own, enumerable property safely (never triggers the `__proto__` setter). */
function setOwn(obj: Record<string, unknown>, key: string, value: unknown): void {
  if (PROTO_KEYS.has(key)) {
    Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
  } else {
    obj[key] = value;
  }
}

/** True for a non-null, non-array object with a plain prototype (a JSON-style object). */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Structural deep clone of JSON-shaped values (objects, arrays, primitives). Proto-safe. */
export function deepClone<T>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => deepClone(x)) as unknown as T;
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) setOwn(out, k, deepClone(val));
    return out as unknown as T;
  }
  return v;
}

/** Structural deep equality for JSON-shaped values (key-order-insensitive). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    return ak.length === bk.length && ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * Structural deep merge: `b` wins per leaf; nested plain objects merge recursively; arrays and
 * scalars from `b` replace `a`. Pure (inputs never mutated) and proto-safe.
 */
export function deepMerge(a: unknown, b: unknown): unknown {
  if (isPlainObject(a) && isPlainObject(b)) {
    const out: Record<string, unknown> = deepClone(a);
    for (const [k, vb] of Object.entries(b)) {
      setOwn(out, k, Object.prototype.hasOwnProperty.call(out, k) ? deepMerge(out[k], vb) : deepClone(vb));
    }
    return out;
  }
  return deepClone(b);
}
