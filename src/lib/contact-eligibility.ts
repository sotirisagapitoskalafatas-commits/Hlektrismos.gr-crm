/* Contact eligibility in the CRM (staged migration phase3/09). Shows the person about to call or write whether
   promotional contact is allowed and why not, using the SAME pure decision module the edge functions enforce
   (supabase/functions/_shared/eligibility.ts). Display only — the database and edge functions are the boundary.
   Facts are read through contact_facts(); every change goes through a SECURITY DEFINER function. */

import { supabase } from './supabase';
import type { Role } from './roles';
import { decideEligibility, DEFAULT_CONFIG } from '../../supabase/functions/_shared/eligibility';
import type { Channel, EligibilityConfig, PermissionRecord } from '../../supabase/functions/_shared/eligibility';

/** Shown when the consent tables are not in the database yet (staged phase3/09). Non-admins don't see the block at all. */
export const CONTACT_CHECK_UNAVAILABLE = 'Ο έλεγχος συγκαταθέσεων δεν είναι ακόμη διαθέσιμος.';

export type { Channel };

export interface ContactFacts {
  has_phone: boolean;
  has_email: boolean;
  objections: { id: string; batch_id: string; address_kind: 'phone' | 'email'; scope: 'marketing' | 'all'; channels: Channel[] | null; reason: string; source: string; created_at: string }[];
  consents: Partial<Record<Channel, { status: 'granted' | 'withdrawn'; basis: 'consent' | 'existing_customer' | null; evidence_ref: string | null; evidence_at: string | null; text_version: string | null; updated_at: string }>>;
  article11: { result: 'not_listed' | 'listed'; screened_at: string; register_source: string } | null;
  email_suppressed: boolean;
}

export const SHOWN_CHANNELS: { channel: Channel; label: string; automated: boolean }[] = [
  { channel: 'call', label: 'Τηλεφωνική προώθηση από πωλητή', automated: false },
  { channel: 'sms', label: 'SMS προώθησης', automated: true },
  { channel: 'email', label: 'Email προώθησης', automated: true },
  { channel: 'voice', label: 'Αυτόματη κλήση (AI)', automated: true },
];

export const CHANNEL_TEXT: Record<Channel, string> = {
  call: 'Κλήση από πωλητή', sms: 'SMS', email: 'Email', voice: 'Αυτόματη κλήση (AI)', whatsapp: 'WhatsApp', viber: 'Viber',
};

export const REASON_TEXT: Record<string, string> = {
  NO_ADDRESS: 'Δεν υπάρχει στοιχείο επικοινωνίας για αυτό το κανάλι.',
  OBJECTION_RECORDED: 'Έχει δηλώσει ότι δεν θέλει επικοινωνία.',
  OBJECTION_UNKNOWN: 'Δεν ήταν δυνατός ο έλεγχος αντιρρήσεων.',
  ARTICLE11_NOT_SCREENED: 'Δεν έχει γίνει έλεγχος στο μητρώο του Άρθρου 11.',
  ARTICLE11_SCREENING_STALE: 'Ο έλεγχος στο μητρώο του Άρθρου 11 είναι παλαιότερος από 30 ημέρες.',
  ARTICLE11_LISTED: 'Ο αριθμός είναι στο μητρώο του Άρθρου 11 — δεν δέχεται τηλεφωνική προώθηση.',
  ARTICLE11_UNKNOWN: 'Δεν ήταν δυνατός ο έλεγχος του μητρώου του Άρθρου 11.',
  OUTSIDE_CONTACT_HOURS: 'Εκτός ωραρίου επικοινωνίας (09:00–20:00).',
  TIME_UNKNOWN: 'Δεν ήταν δυνατός ο έλεγχος ωραρίου.',
  NO_CHANNEL_PERMISSION: 'Δεν υπάρχει καταγεγραμμένη συγκατάθεση για αυτό το κανάλι.',
  PERMISSION_WRONG_CHANNEL: 'Η συγκατάθεση αφορά άλλο κανάλι.',
  BASIS_NOT_SUFFICIENT: 'Η νομική βάση της συγκατάθεσης δεν αρκεί.',
  NO_PERMISSION_EVIDENCE: 'Η συγκατάθεση δεν έχει αποδεικτικό.',
  SUPPRESSED: 'Είναι στη λίστα «μη αποστολής» email.',
  SUPPRESSION_UNKNOWN: 'Δεν ήταν δυνατός ο έλεγχος της λίστας «μη αποστολής».',
  FREQUENCY_CAP: 'Έχει ήδη λάβει το μέγιστο πλήθος μηνυμάτων.',
  FREQUENCY_UNKNOWN: 'Δεν ήταν δυνατός ο έλεγχος συχνότητας.',
  OUTREACH_DISABLED: 'Οι αυτόματες αποστολές είναι κλειστές.',
  LEGAL_APPROVAL_MISSING: 'Δεν έχει καταγραφεί νομική έγκριση.',
  VOICE_DISABLED: 'Οι αυτόματες κλήσεις είναι κλειστές.',
};
export const reasonText = (r: string) => REASON_TEXT[r] ?? r;

/** One recorded «no» is stored once per contact point (phone, email); show it once, with where it applies. */
export function groupObjections(list: ContactFacts['objections']): (ContactFacts['objections'][number] & { kinds: ('phone' | 'email')[] })[] {
  const by = new Map<string, ContactFacts['objections'][number] & { kinds: ('phone' | 'email')[] }>();
  for (const o of list) {
    const g = by.get(o.batch_id);
    if (g) { if (!g.kinds.includes(o.address_kind)) g.kinds.push(o.address_kind); } else by.set(o.batch_id, { ...o, kinds: [o.address_kind] });
  }
  return [...by.values()];
}

export const SCOPE_TEXT = { marketing: 'Όχι προωθητική επικοινωνία', all: 'Καμία επικοινωνία' } as const;
export const SOURCE_TEXT: Record<string, string> = {
  customer_request: 'Αίτημα του ίδιου', unsubscribe: 'Απεγγραφή', complaint: 'Παράπονο', register: 'Μητρώο', other: 'Άλλο',
};

/** Recording an objection or a withdrawal: anyone on staff. Consent / register screening: these roles. Lift: admin. */
export const canRecordEvidence = (r: Role | null | undefined) => r === 'admin';
export const canLiftObjection = (r: Role | null | undefined) => r === 'admin';

// The global switches are shown once as a separate notice, so per-channel rows carry only the reasons about THIS person.
const SUBJECT_CONFIG: EligibilityConfig = { ...DEFAULT_CONFIG, outreachEnabled: true, legalApprovalRecorded: true, voiceEnabled: true };

export interface ChannelVerdict { channel: Channel; label: string; automated: boolean; allowed: boolean; reasons: string[] }

export function evaluate(f: ContactFacts, now: Date = new Date()): ChannelVerdict[] {
  const objections = f.objections.map(o => ({ scope: o.scope, channels: o.channels }));
  const article11 = f.article11 ? { result: f.article11.result, screenedAt: f.article11.screened_at } : { result: null, screenedAt: null };
  return SHOWN_CHANNELS.map(({ channel, label, automated }) => {
    const c = f.consents[channel];
    const permission: PermissionRecord | null = c ? { status: c.status, channel, basis: c.basis, evidenceRef: c.evidence_ref, evidenceAt: c.evidence_at } : null;
    const d = decideEligibility({
      channel, purpose: 'promotional', now, config: SUBJECT_CONFIG,
      hasAddress: channel === 'email' ? f.has_email : f.has_phone,
      suppressed: channel === 'email' ? f.email_suppressed : false,
      permission, recentAttempts: 0, objections,
      article11: channel === 'call' || channel === 'voice' ? article11 : undefined,
    });
    return { channel, label, automated, allowed: d.allowed, reasons: d.reasons };
  });
}

const friendly = (m: string | undefined, fallback: string) => {
  const s = m ?? '';
  if (/Could not find the function|PGRST202|schema cache|does not exist/i.test(s)) return CONTACT_CHECK_UNAVAILABLE;
  if (/a reason is required/i.test(s)) return 'Χρειάζεται αιτιολογία.';
  if (/evidence is required/i.test(s)) return 'Χρειάζεται αποδεικτικό (αριθμός εντύπου, ηχογράφησης κ.λπ.) και ημερομηνία.';
  if (/in the future/i.test(s)) return 'Η ημερομηνία του αποδεικτικού δεν μπορεί να είναι μελλοντική.';
  if (/invalid screening date/i.test(s)) return 'Η ημερομηνία ελέγχου πρέπει να είναι μέσα στον τελευταίο χρόνο.';
  if (/no phone or email|no address|no phone number/i.test(s)) return 'Δεν υπάρχει τηλέφωνο ή email για αυτό το κανάλι.';
  if (/register checked is required/i.test(s)) return 'Συμπληρώστε ποιο μητρώο ελέγχθηκε.';
  if (/not allowed|42501|permission/i.test(s)) return 'Δεν έχετε δικαίωμα για αυτή την ενέργεια.';
  if (/PREVIEW_READ_ONLY|μόνο ανάγνωση/.test(s)) return 'Προεπισκόπηση ρόλου: μόνο ανάγνωση.';
  return fallback;
};

export async function fetchContactFacts(phone: string | null | undefined, email: string | null | undefined): Promise<{ facts: ContactFacts | null; error: string | null }> {
  const { data, error } = await supabase.rpc('contact_facts', { p_phone: phone ?? null, p_email: email ?? null });
  if (error) return { facts: null, error: friendly(error.message, 'Ο έλεγχος επικοινωνίας δεν φορτώθηκε.') };
  return { facts: data as ContactFacts, error: null };
}

export interface Subject { phone: string | null | undefined; email: string | null | undefined; leadId?: string | null; customerId?: string | null }

export async function recordObjection(s: Subject, scope: 'marketing' | 'all', channels: Channel[] | null, reason: string, source: string): Promise<string | null> {
  const { error } = await supabase.rpc('record_contact_objection', {
    p_phone: s.phone ?? null, p_email: s.email ?? null, p_scope: scope, p_channels: channels, p_reason: reason.trim(), p_source: source,
    p_lead_id: s.leadId ?? null, p_customer_id: s.customerId ?? null,
  });
  return error ? friendly(error.message, 'Η καταγραφή απέτυχε.') : null;
}

export async function liftObjection(id: string, reason: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('lift_contact_objection', { p_id: id, p_reason: reason.trim() });
  if (error) return friendly(error.message, 'Η άρση απέτυχε.');
  return data === false ? 'Η αντίρρηση είχε ήδη αρθεί.' : null;
}

export async function recordConsent(s: Subject, channel: Channel, basis: 'consent' | 'existing_customer', evidenceRef: string, evidenceAt: string, textVersion: string): Promise<string | null> {
  const { error } = await supabase.rpc('record_contact_consent', {
    p_phone: s.phone ?? null, p_email: s.email ?? null, p_channel: channel, p_basis: basis, p_evidence_ref: evidenceRef.trim(),
    p_evidence_at: evidenceAt, p_text_version: textVersion.trim() || null, p_source: 'crm', p_lead_id: s.leadId ?? null, p_customer_id: s.customerId ?? null,
  });
  return error ? friendly(error.message, 'Η καταγραφή απέτυχε.') : null;
}

export async function withdrawConsent(s: Subject, channel: Channel, reason: string): Promise<string | null> {
  const { error } = await supabase.rpc('withdraw_contact_consent', {
    p_phone: s.phone ?? null, p_email: s.email ?? null, p_channel: channel, p_reason: reason.trim(), p_lead_id: s.leadId ?? null, p_customer_id: s.customerId ?? null,
  });
  return error ? friendly(error.message, 'Η ανάκληση απέτυχε.') : null;
}

export async function recordArticle11(s: Subject, result: 'not_listed' | 'listed', registerSource: string, evidenceRef: string, screenedAt: string): Promise<string | null> {
  const { error } = await supabase.rpc('record_article11_screening', {
    p_phone: s.phone ?? null, p_result: result, p_register_source: registerSource.trim(), p_evidence_ref: evidenceRef.trim() || null,
    p_screened_at: screenedAt, p_lead_id: s.leadId ?? null, p_customer_id: s.customerId ?? null,
  });
  return error ? friendly(error.message, 'Η καταγραφή απέτυχε.') : null;
}
