/**
 * Linked validation — one model of relations over setting keys, evaluated to VALIDATE. Hard
 * constraints are authored in Zod (`.refine`/`.superRefine`, validated over the effective values)
 * and/or as a serializable `{ message, keys, check }` list (the NixOS `assertions`/`warnings` shape,
 * a mirror that could be exported to a CSP/SAT solver). Soft `warnings` are advisory and never fail.
 * Evaluation is fail-fast: it returns all errors so the UI can show them at resolve time.
 */

import type { z } from 'zod';
import type { SettingKey } from './model.js';

/** A serializable hard constraint: a predicate over the effective values plus a message + the keys it concerns. */
export interface Assertion {
  id?: string;
  message: string;
  /** The keys this constraint relates (for highlighting + solver export). */
  keys?: SettingKey[];
  /** The predicate: returns true when satisfied. A throw counts as unsatisfied. */
  check: (values: Record<string, unknown>) => boolean;
}

/** A soft warning: advisory guidance shown when `when` holds. Never fails validation. */
export interface Warning {
  message: string;
  keys?: SettingKey[];
  when: (values: Record<string, unknown>) => boolean;
}

export interface ConstraintsConfig {
  /** A Zod schema validated against the effective values (cross-field via `.superRefine`). */
  schema?: z.ZodType;
  /** Declarative hard constraints (serializable mirror; solver-exportable). */
  assertions?: Assertion[];
  /** Soft, advisory warnings. */
  warnings?: Warning[];
}

export interface ConstraintError {
  message: string;
  keys: SettingKey[];
}

export interface ConstraintResult {
  ok: boolean;
  errors: ConstraintError[];
  warnings: string[];
}

/** Evaluate constraints + warnings over a resolved values map. Pure; collects all errors. */
export function evaluateConstraints(
  values: Record<string, unknown>,
  config: ConstraintsConfig = {},
): ConstraintResult {
  const errors: ConstraintError[] = [];
  const warnings: string[] = [];

  if (config.schema) {
    const r = config.schema.safeParse(values);
    if (!r.success) {
      for (const issue of r.error.issues) {
        errors.push({ message: issue.message, keys: issue.path.map((p) => String(p)) });
      }
    }
  }

  for (const a of config.assertions ?? []) {
    let satisfied = false;
    try {
      satisfied = a.check(values);
    } catch {
      satisfied = false;
    }
    if (!satisfied) errors.push({ message: a.message, keys: a.keys ?? [] });
  }

  for (const w of config.warnings ?? []) {
    let hit = false;
    try {
      hit = w.when(values);
    } catch {
      hit = false;
    }
    if (hit) warnings.push(w.message);
  }

  return { ok: errors.length === 0, errors, warnings };
}
