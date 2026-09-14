import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';

// Multi-entry build (design.md D1, Module Boundaries): `main` is the admin
// SPA shell, `vista` is the public, unauthenticated debt view added in
// Phase 3 (task 3.4), `mi-cuenta` is the token-scoped member portal added in
// Phase 4 (task 4.7).
export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        vista: resolve(import.meta.dirname, 'vista/index.html'),
        'mi-cuenta': resolve(import.meta.dirname, 'mi-cuenta/index.html'),
      },
    },
  },
});
