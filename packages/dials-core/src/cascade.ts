/**
 * The cascade resolver: merge an ordered stack of scoped layers (lowest precedence first) into an
 * effective value per key, paired with provenance.
 *
 * Precedence is the stack order, with managed/policy layers elevated into a top band that wins over
 * every non-managed layer regardless of position (and marks the value non-overridable). The UNSET
 * sentinel is a fall-through: a layer that UNSETs a key ABSTAINS (contributes nothing for it),
 * re-exposing the next lower scope — at the top of a stack this is exactly "reset to default". Under
 * `deep-merge`/`append`, an abstaining (UNSET) layer simply does not participate in the merge; it
 * does NOT sever the contributors below it — to override a lower object wholesale, use the `replace`
 * strategy or set the full value. Provenance reports the winning scope, the shadowed layers
 * (including higher resets), the merge strategy used, and — for merges — only the scopes that
 * actually changed the result (`mergedFrom`, computed by leave-one-out, so fully-shadowed scopes are
 * not falsely claimed).
 */

import type {
  Conflict,
  EffectiveResult,
  KeyProvenance,
  MergeStrategy,
  ScopedLayer,
  SettingKey,
  SettingValue,
  ShadowedLayer,
} from './model.js';
import { isUnset } from './model.js';
import { mergeValues } from './merge.js';
import { deepClone, deepEqual, isPlainObject } from './util.js';

export interface ResolveOptions {
  /** Per-key merge strategy resolver. Default: 'replace' for every key. */
  strategyFor?: (key: SettingKey) => MergeStrategy;
}

interface Entry {
  scope: string;
  /** The raw layer value for this key; `undefined` here means UNSET (tracked via `isUnset`). */
  value: SettingValue;
  isUnset: boolean;
  managed: boolean;
  /** Computed precedence; higher wins. Managed layers occupy a top band. */
  precedence: number;
}

/** Resolve a stack of scoped layers (lowest precedence first) into effective values + provenance. */
export function resolve(stack: ScopedLayer[], options: ResolveOptions = {}): EffectiveResult {
  const strategyFor = options.strategyFor ?? (() => 'replace' as MergeStrategy);
  const band = stack.length + 1; // strictly greater than any non-managed index

  // Gather, per key, the layers that set it (with computed precedence).
  const byKey = new Map<SettingKey, Entry[]>();
  stack.forEach((sl, index) => {
    const managed = sl.managed === true;
    const precedence = (managed ? band : 0) + index;
    for (const [key, raw] of Object.entries(sl.layer)) {
      const entry: Entry = { scope: sl.scope, value: isUnset(raw) ? undefined : raw, isUnset: isUnset(raw), managed, precedence };
      const list = byKey.get(key);
      if (list) list.push(entry);
      else byKey.set(key, [entry]);
    }
  });

  const effective: Record<SettingKey, SettingValue> = {};
  const provenance: Record<SettingKey, KeyProvenance> = {};
  const conflicts: Conflict[] = [];

  for (const [key, rawEntries] of byKey) {
    // Highest precedence first.
    const entries = [...rawEntries].sort((a, b) => b.precedence - a.precedence);
    const contributors = entries.filter((e) => !e.isUnset); // UNSET = no contribution (fall-through)

    const shadowed: ShadowedLayer[] = entries.map((e) => ({
      scope: e.scope,
      value: e.isUnset ? 'UNSET' : e.value,
      managed: e.managed,
    }));

    if (contributors.length === 0) {
      // Every layer that touched this key reset it -> key is absent from the effective set.
      continue;
    }

    const strategy = strategyFor(key);
    const winner = contributors[0];
    let value: SettingValue;
    let mergedFrom: string[] | undefined;

    if (strategy === 'deep-merge') {
      const lowToHigh = [...contributors].reverse();
      value = mergeValues(lowToHigh.map((e) => e.value), 'deep-merge');
      // Attribute by surviving-leaf origin (not naive leave-one-out, which under-reports when two
      // scopes set an identical leaf): a scope is a contributor if it owns >=1 leaf in the result.
      const contributing = deepMergeContributors(contributors, value);
      mergedFrom = contributing.length > 1 ? contributing : undefined;
    } else if (strategy === 'append') {
      const lowToHigh = [...contributors].reverse();
      value = mergeValues(lowToHigh.map((e) => e.value), 'append');
      const contributing = contributingScopes(lowToHigh, 'append', value);
      mergedFrom = contributing.length > 1 ? contributing : undefined;
    } else {
      value = deepClone(winner.value);
    }

    effective[key] = value;
    // The winning scope is the one whose entry is shown in the UI as "set by"; for merges this is
    // the highest-precedence contributor (it dominates conflicting leaves).
    provenance[key] = {
      key,
      winningScope: winner.scope,
      value,
      managed: winner.managed,
      mergeStrategy: strategy,
      shadowed: shadowed.filter((s, i) => !(entries[i].scope === winner.scope && entries[i].precedence === winner.precedence)),
      mergedFrom,
    };

    // Conflict detection: more than one contributor with a differing value.
    const distinct: SettingValue[] = [];
    for (const c of contributors) if (!distinct.some((d) => deepEqual(d, c.value))) distinct.push(c.value);
    if (distinct.length > 1) {
      const overriddenByPolicy =
        winner.managed && contributors.some((c) => !c.managed && !deepEqual(c.value, winner.value));
      conflicts.push({
        key,
        contributors: contributors.map((c) => ({ scope: c.scope, value: c.value, managed: c.managed })),
        overriddenByPolicy,
      });
    }
  }

  return { effective, provenance, conflicts };
}

/** Flatten an object's scalar/array leaves into a path -> value map (arrays are leaves). */
function flattenLeaves(value: SettingValue, prefix: string, out: Map<string, SettingValue>): void {
  if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) flattenLeaves(v, `${prefix}/${k}`, out);
  } else {
    out.set(prefix, value);
  }
}

/**
 * Honest `mergedFrom` for deep-merge: for each surviving leaf of the merged value, the owner is the
 * highest-precedence contributor that supplied that exact leaf; the contributor set is returned
 * low -> high. This correctly attributes a value merged from distinct scopes even when a lower scope
 * set an identical (redundant) leaf.
 */
function deepMergeContributors(contributorsHighToLow: Entry[], merged: SettingValue): string[] {
  const mergedLeaves = new Map<string, SettingValue>();
  flattenLeaves(merged, '', mergedLeaves);
  const perEntry = contributorsHighToLow.map((e) => {
    const m = new Map<string, SettingValue>();
    flattenLeaves(e.value, '', m);
    return m;
  });
  const owners = new Set<string>();
  for (const [path, val] of mergedLeaves) {
    for (let i = 0; i < contributorsHighToLow.length; i += 1) {
      const leaf = perEntry[i].get(path);
      if (perEntry[i].has(path) && deepEqual(leaf, val)) {
        owners.add(contributorsHighToLow[i].scope);
        break;
      }
    }
  }
  return [...contributorsHighToLow].reverse().filter((e) => owners.has(e.scope)).map((e) => e.scope);
}

/**
 * Honest `mergedFrom` for append (and other replace-fold strategies): the scopes that actually
 * changed the merged result, computed by leave-one-out. Fully-shadowed scopes are excluded.
 */
function contributingScopes(lowToHigh: Entry[], strategy: MergeStrategy, full: SettingValue): string[] {
  const values = lowToHigh.map((e) => e.value);
  const out: string[] = [];
  for (let i = 0; i < lowToHigh.length; i += 1) {
    const without = mergeValues(
      values.filter((_, j) => j !== i),
      strategy,
    );
    if (!deepEqual(without, full)) out.push(lowToHigh[i].scope);
  }
  return out;
}
