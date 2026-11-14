/**
 * Name heuristics shared by the zod-backed schema introspection and the zod-free cascade entry
 * (`@zodal/dials-core/cascade`), so both classify an ad-hoc key the same way.
 */

/** Split a dotted/snake/camelCase key into lowercased word-separated form for heuristic matching. */
export function normalizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[._\-/]+/g, ' ')
    .toLowerCase();
}

/**
 * Field-name heuristic for secret values. Matched against the de-camelCased, separator-normalized
 * key so `apiKey`, `api_key`, `apiKeys`, `refreshToken`, `privateKeyPath`, `passwordHash`,
 * `client_secret`, `secretId` all trip it, while `keyboard`, `tokenize`, `secretary` do not. Errs
 * toward classifying-as-secret (fail-safe).
 */
const SECRET_NAME =
  /(?:^| )(secret|secrets|secret ?id|passwords?|passwd|credentials?|tokens?|api ?keys?|access ?keys?|private ?keys?|client ?secret|refresh ?token|access ?token|auth ?token)(?: |$)/;

/** Whether a key's name says it holds a secret (`apiKey`, `client_secret`, `auth.token`...). */
export function secretByName(key: string): boolean {
  return SECRET_NAME.test(normalizeKey(key));
}

