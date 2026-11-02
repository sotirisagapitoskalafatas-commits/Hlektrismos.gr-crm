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
    // Reload once whenever a newly installed worker first takes control or replaces an
    // older worker. This also covers first-time PWA installs where no controller existed
    // when the page started.
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!navigator.serviceWorker.controller || reloaded) return;
      reloaded = true;
      window.location.reload();
    }, { once: true });

    // Bypass the browser HTTP cache and explicitly check for a worker update.
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then(registration => registration.update().catch(() => {}))
      .catch(() => {});
  });
}
