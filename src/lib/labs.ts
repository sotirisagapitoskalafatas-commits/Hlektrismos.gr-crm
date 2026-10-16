/* «Πειραματικές λειτουργίες» — admin-only switch, OFF by default, stored per browser.
   Modules outside the Hlektrismos brief or not finished (docs/product/MODULE_SCOPE_AND_WORDING.md) are marked
   `labs` in the menu: AI Εργατικό Δυναμικό, Αυτοματισμοί, B2B Prospecting. They are shown only to an admin who
   turned the switch on; everybody else never sees them, and opening their page directly shows Αρχική.
   This HIDES unfinished work; it is not access control (the data stays protected by RLS and server checks). */

import type { Role } from './roles';

const KEY = 'atlas.labs';

export function labsEnabled(): boolean {
  try { return localStorage.getItem(KEY) === 'on'; } catch { return false; }
}

export function setLabsEnabled(on: boolean): void {
  try { if (on) localStorage.setItem(KEY, 'on'); else localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

/** A labs module is visible only to an admin with the switch on. */
export function labsVisible(role: Role | null | undefined): boolean {
  return role === 'admin' && labsEnabled();
}
