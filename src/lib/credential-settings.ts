// Integration credentials (API keys, tokens, SMTP/IMAP/Vapi/Twilio settings) are WRITE-ONLY from the browser once phase6/27 is applied: the database
// never returns their value, to any session. The settings panel shows «configured» and lets the Admin type a new value; it never shows an old one.
// Before phase6/27 the status function does not exist and the panel keeps its previous behaviour (nothing is hidden by the browser alone).
import { supabase } from './supabase';

/** Shown in a credential field when a value is already stored. It is not a secret and is never sent back. */
export const CREDENTIAL_MASK = '••••••••';

// The same list as public.crm_setting_is_credential (phase2/05): a case-insensitive substring match on the setting name.
const PATTERNS = ['key', 'secret', 'password', 'passwd', 'token', 'credential', 'imap', 'smtp', 'vapi', 'twilio'];
export const isCredentialKey = (key: string): boolean => { const k = key.toLowerCase(); return PATTERNS.some((p) => k.includes(p)); };

/** The text typed into a panel field, whatever shape the legacy panel keeps it in (a plain string, or an object holding a JSON string). */
export function credentialText(entry: unknown): string {
  if (entry && typeof entry === 'object' && 'setting_value' in (entry as Record<string, unknown>)) return String((entry as { setting_value: unknown }).setting_value ?? '').replace(/^"|"$/g, '');
  return typeof entry === 'string' ? entry.replace(/^"|"$/g, '') : '';
}

/** The credential names that have a value stored, or null when phase6/27 is not installed (or the caller is not allowed). */
export async function loadCredentialStatus(): Promise<Record<string, boolean> | null> {
  const { data, error } = await supabase.rpc('crm_credential_status');
  if (error || !Array.isArray(data)) return null;
  return Object.fromEntries((data as { setting_key: string; configured: boolean }[]).map((r) => [r.setting_key, !!r.configured]));
}

/** Stores one credential; the value is not returned and not logged. */
export async function saveCredential(key: string, value: string): Promise<boolean> {
  const { error } = await supabase.rpc('crm_set_credential', { p_key: key, p_value: value });
  return !error;
}

/** What to do with a credential field when saving: nothing for an untouched or empty field, otherwise the typed value. */
export const credentialToSave = (entry: unknown): string | null => { const t = credentialText(entry); return t === '' || t === CREDENTIAL_MASK ? null : t; };
