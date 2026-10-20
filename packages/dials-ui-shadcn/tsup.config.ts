import { copyFile } from 'node:fs/promises';
import { defineConfig } from 'tsup';

// Both renderers emit the same `zodal-dials-*` markup, so they share ONE stylesheet: the vanilla
// package's `styles.css` is the source, shipped here as `dist/styles.css` (export `./styles.css`).
const SHARED_STYLES = '../dials-ui-vanilla/styles.css';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['react', 'react-dom'],
  onSuccess: () => copyFile(SHARED_STYLES, 'dist/styles.css'),
});
