/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { CSP } from './src/lib/csp.ts';

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [],
      manifest: {
        name: 'SubSnipe',
        short_name: 'SubSnipe',
        description: 'Find subscriptions hiding in your statements. Entirely on your device.',
        theme_color: '#0f5e5b',
        background_color: '#f6f1e7',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
        globIgnores: ['**/icon-192.png', '**/icon-512.png'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        manifestTransforms: [
          (entries) => {
            const seen = new Set<string>();
            const manifest = entries.filter((entry) => {
              if (seen.has(entry.url)) return false;
              seen.add(entry.url);
              return true;
            });
            return { manifest };
          },
        ],
      },
    }),
    {
      name: 'subsnipe-csp',
      transformIndexHtml(html, ctx) {
        if (ctx.server) {
          return html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '\n');
        }
        return html.replace('__CSP__', CSP);
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.test.ts', 'src/lib/shareCard.ts'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 75,
        branches: 70,
      },
    },
  },
});
