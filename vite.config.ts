/// <reference types="node" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Aggressive cache invalidation: skipWaiting + clientsClaim means a new
      // SW activates immediately on every deploy. This is the canonical fix
      // for "phone PWA shows stale meta-charset HTML after I redeployed".
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'generateSW',
      includeAssets: ['icons/*.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'BigDawg D&D',
        short_name: 'BigDawg',
        description: 'AI-powered D&D simulator with full character sheets, dice, and a Dungeon Master in your pocket.',
        theme_color: '#D4AF37',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Do NOT precache /index.html — it changes hash on every deploy.
        // The NetworkFirst / navigateFallback handling below fetches it fresh.
        globPatterns: ['**/*.{js,css,svg,png,webp,woff2}'],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/openrouter\.ai\/api\/v1\/models/,
            handler: 'NetworkFirst',
            options: { cacheName: 'or-models', expiration: { maxAgeSeconds: 60 * 60 * 24, maxEntries: 50 } }
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/.netlify/functions/nim'),
            handler: 'NetworkOnly',
            options: { cacheName: 'nim-proxy-no-cache' }
          }
        ]
      }
    })
  ],
  // During `npm run dev` we proxy the NIM function path straight to the
  // upstream API so CORS doesn't bite the developer. The deployed site uses
  // the Netlify Function at `/.netlify/functions/nim` (see
  // `netlify/functions/nim.ts`); locally we mimic it.
  server: {
    proxy: {
      '/.netlify/functions/nim': {
        target: 'https://integrate.api.nvidia.com/v1',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/\.netlify\/functions\/nim\/?/, '')
      }
    }
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          motion: ['framer-motion']
        }
      }
    }
  }
});
