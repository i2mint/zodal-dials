import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', cascade: 'src/cascade-entry.ts' },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
