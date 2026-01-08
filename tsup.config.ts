import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node18',
  splitting: false,
  sourcemap: true,
  minify: false,
  external: [
    // Prisma has native bindings that shouldn't be bundled
    '@prisma/client',
    'prisma',
    // Native node modules
    'fsevents',
  ],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
