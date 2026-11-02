import './lib/auth-link-boot'; // must run before the Supabase client reads (and clears) the URL hash
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './fonts.css';
import './index.css';
import { initPreferences } from './lib/preferences';

initPreferences(); // theme from the local copy before the first paint

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // A newly activated worker takes control of existing tabs. Reload once so an open
    // ATLAS tab cannot keep rendering JavaScript from the previous production build.
    const hadController = Boolean(navigator.serviceWorker.controller);
    if (hadController) {
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      }, { once: true });
    }

    // Bypass the browser HTTP cache when checking for a new worker after deployment.
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}
