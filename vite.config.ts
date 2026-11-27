import { defineConfig } from 'vite';

// Relative base so the built files work from any GitHub Pages subpath
// (e.g. https://user.github.io/jellyairlines/) without hardcoding the repo name.
// Routing is hash-based, so page refreshes never hit a missing path.
export default defineConfig({
  base: './',
  server: { port: 5173 },
});
