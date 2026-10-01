import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
        manifest: {
          name: 'DocEase Desktop Professional',
          short_name: 'DocEase',
          description: 'Système de gestion médicale professionnelle hors-ligne',
          theme_color: '#064e3b',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'any',
          icons: [
            {
              src: 'logo.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
          globIgnores: ['**/medicaments_par_classe_v2.json', '**/medicaments/medicament_*.json'],
          maximumFileSizeToCacheInBytes: 4000000,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                },
              },
            }
          ],
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      chunkSizeWarningLimit: 1000,
      minify: 'terser',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('html2pdf.js')) return 'vendor-html2pdf';
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor';
            if (id.includes('node_modules/lucide-react')) return 'lucide';
          }
        }
      }
    }
  };
});
