import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig(({ command }) => {
  // Only non-secret deployment metadata is embedded in the client bundle.
  // Vercel's system variables identify the actual deployment; GitHub variables are CI fallbacks.
  const buildEnvironment = process.env.VERCEL_ENV
    || process.env.VERCEL_TARGET_ENV
    || (command === 'serve' ? 'development' : process.env.CI ? 'ci' : 'build');
  const buildCommit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '';
  const buildRef = process.env.VERCEL_GIT_COMMIT_REF
    || process.env.GITHUB_HEAD_REF
    || process.env.GITHUB_REF_NAME
    || '';

  return {
    plugins: [react()],
    // Legacy VITE_ prefix plus the private CRM_VITE_ namespace used on Vercel
    // (operator prefers a non-public framework prefix so the value is not
    // flagged as browser-exposed). Vite inlines both into import.meta.env at
    // build time; VITE_ remains for local .env.local fallback.
    envPrefix: ['VITE_', 'CRM_VITE_'],
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
      __BUILD_COMMIT__: JSON.stringify(buildCommit),
      __BUILD_REF__: JSON.stringify(buildRef),
      __BUILD_ENVIRONMENT__: JSON.stringify(buildEnvironment),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
