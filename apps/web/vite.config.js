import { defineConfig } from 'vite';
import { resolve } from 'path';

// Multi-page setup: this is still 7 hand-written HTML pages, not a
// client-side-routed SPA — Vite just needs every entry listed so `vite
// build` bundles and hashes each page's own <script type="module"> and
// finds broken imports at build time instead of at runtime in a browser.
export default defineConfig({
  root: __dirname,
  server: {
    port: 5173,
    // Allows the Django dev server (different origin) to be hit from here
    // during local development; see backend_integration/settings_snippet.py
    // for the matching CORS_ALLOWED_ORIGINS entry.
    cors: true,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        auth: resolve(__dirname, 'auth.html'),
        profile: resolve(__dirname, 'profile.html'),
        wallet: resolve(__dirname, 'wallet.html'),
        marketplace: resolve(__dirname, 'marketplace.html'),
        seller: resolve(__dirname, 'seller-dashboard.html'),
      },
    },
  },
});
