import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';

// Multi-entry stub (task 1.1): only the existing admin shell is wired in today.
// The `vista` entry (public debt dashboard) is added in Phase 3 (task 3.4)
// once `vista/index.html` exists — see design.md's Module Boundaries section.
export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
      },
    },
  },
});
