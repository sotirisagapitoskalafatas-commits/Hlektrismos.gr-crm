// Imported FIRST by main.tsx: notes the e-mailed link type before the Supabase client consumes the URL hash.
import { captureAuthLink } from './auth-link';
import { captureAuthNotice } from './auth-notice';

captureAuthLink();
// A failed or half-finished link (#error=…, #message=…) is turned into a Greek notice, and its fragment is dropped so a refresh does not repeat it.
if (captureAuthNotice()) {
  try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* the notice is still shown */ }
}
