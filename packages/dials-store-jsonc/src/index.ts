/**
 * @zodal/dials-store-jsonc — a JSONC-file `LayerStore` for zodal-dials. **Node-only** (it owns a file).
 *
 * The file is a FLAT map of dotted setting keys -> values (the VS Code `settings.json` convention),
 * with `//` and block comments allowed. Reads parse it to a layer; writes are FORMAT-PRESERVING —
 * comments, key order, and whitespace are kept — by applying targeted `jsonc-parser` edits rather
 * than re-stringifying. The UNSET sentinel removes a key; a plain `undefined` is skipped (it is NOT
 * a delete). File IO is injectable (defaults to Node fs, which mkdir's the parent and writes
 * atomically via temp-file + rename). Saves on one store are serialized to avoid lost updates.
 *
 * SECURITY: a settings file is plaintext. Pass `sensitivityFor` to REDACT secret keys on save (they
 * are never written to disk); otherwise the caller MUST split secrets out (e.g. dials-core's
 * `splitBySensitivity`) before calling `save`. See the README.
 */

import { applyEdits, modify, parse } from 'jsonc-parser';
import { isUnset } from '@zodal/dials-core';
import type { Layer, LayerStore, LayerStoreCapabilities, Sensitivity } from '@zodal/dials-core';

/** Minimal file IO contract (injectable for tests / non-Node hosts). `read` returns undefined when
 *  the file is absent. */
export interface FileIO {
  read(path: string): Promise<string | undefined>;
  write(path: string, text: string): Promise<void>;
}

export interface JsoncStoreOptions {
  /** Scope id. Default: 'file'. */
  scope?: string;
  /** Path to the JSONC file. */
  path: string;
  /** File IO. Default: Node fs (mkdir parent + atomic temp-then-rename; read returns undefined on ENOENT). */
  fs?: FileIO;
  /** Classify a setting's sensitivity. When provided, `secret` keys are REDACTED on save (never
   *  written to disk) — fail-closed. Without it, the caller is responsible for excluding secrets. */
  sensitivityFor?: (key: string) => Sensitivity;
}

function isPlainObject(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

let tmpCounter = 0;

function nodeFileIO(): FileIO {
  return {
    async read(path: string): Promise<string | undefined> {
      try {
        const fs = await import('node:fs/promises');
        return await fs.readFile(path, 'utf8');
      } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') return undefined;
        throw error;
      }
    },
    async write(path: string, text: string): Promise<void> {
      const fs = await import('node:fs/promises');
      const nodePath = await import('node:path');
      await fs.mkdir(nodePath.dirname(path), { recursive: true });
      // Atomic-ish: write a temp sibling then rename over the target so a crash can't truncate it.
      const pid = (globalThis as { process?: { pid?: number } }).process?.pid ?? 0;
      const tmp = `${path}.tmp-${pid}-${(tmpCounter += 1)}`;
      await fs.writeFile(tmp, text, 'utf8');
      await fs.rename(tmp, path);
    },
  };
}

/** Create a JSONC-file LayerStore with format-preserving, secret-aware, serialized writes. */
export function createJsoncStore(options: JsoncStoreOptions): LayerStore {
  const scope = options.scope ?? 'file';
  const io = options.fs ?? nodeFileIO();
  const sensitivityFor = options.sensitivityFor;
  let writeQueue: Promise<void> = Promise.resolve();

  return {
    scope,
    getCapabilities: (): LayerStoreCapabilities => ({ readable: true, writable: true, watchable: false }),

    async load(): Promise<Layer> {
      const text = await io.read(options.path);
      if (text === undefined || text.trim() === '') return {};
      const parsed = parse(text) as unknown;
      return isPlainObject(parsed) ? (parsed as Layer) : {};
    },

    save(layer: Layer): Promise<void> {
      const run = async (): Promise<void> => {
        let text = (await io.read(options.path)) ?? '{}';
        // Reset a non-object root (array/scalar/null/empty) to an empty object so edits never throw.
        if (text.trim() === '' || !isPlainObject(parse(text))) text = '{}';
        const formattingOptions = { tabSize: 2, insertSpaces: true, eol: '\n' };
        for (const [key, value] of Object.entries(layer)) {
          if (sensitivityFor && sensitivityFor(key) === 'secret') continue; // never persist secrets
          let newValue: unknown;
          if (isUnset(value)) {
            newValue = undefined; // jsonc modify with undefined deletes the property
          } else if (value === undefined) {
            continue; // a plain `undefined` is NOT a delete (distinct from the UNSET sentinel) — skip
          } else {
            newValue = value;
          }
          const edits = modify(text, [key], newValue, { formattingOptions });
          text = applyEdits(text, edits);
        }
        await io.write(options.path, text);
      };
      // Serialize saves to this store so concurrent calls can't lose updates (read-modify-write).
      writeQueue = writeQueue.then(run, run);
      return writeQueue;
    },
  };
}
