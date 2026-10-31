import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Served under this path (the backend's server.servlet.context-path), so a reverse proxy can route on it.
const base = '/team/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Team Manager',
        short_name: 'Team',
        description: 'Manage your team: leave calendar, work allocation and follow-up notes.',
        start_url: `${base}home`,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#eef2fa',
        theme_color: '#3949ab',
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the app shell is cached. API calls always go to the network, and their
        // URLs must never be answered with index.html.
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/^\/team\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  server: {
    proxy: {
      [`${base}api`]: 'http://localhost:8081',
    },
  },
});
