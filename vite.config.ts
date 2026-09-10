import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // Legacy VITE_ prefix plus the private CRM_VITE_ namespace used on Vercel
  // (operator prefers a non-public framework prefix so the value is not
  // flagged as browser-exposed). Vite inlines both into import.meta.env at
  // build time; VITE_ remains for local .env.local fallback.
  envPrefix: ['VITE_', 'CRM_VITE_'],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
