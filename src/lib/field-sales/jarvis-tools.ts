/* ------------------------------------------------------------------ */
/*  jarvis-tools — Field Sales tools for JARVIS (Layer 3.5).           */
/*  Typed intents that run only against the CRM api / geo / routing    */
/*  layers — never raw DB access. Multi-match results always ask the   */
/*  user to pick (disambiguation); check-in always requires explicit   */
/*  confirmation before calling fieldCheckin.                          */
/* ------------------------------------------------------------------ */

import type { PageKey, Role } from '@/lib/roles';
import { can } from '@/lib/roles';
import type { CaseVisit, FieldTarget } from '@/lib/api';
import { fetchFieldTargets, fetchVisits, fieldCheckin, addActivity } from '@/lib/api';
import { getCurrentLocation } from '@/lib/geo/location';
import { geocodeAddress } from '@/lib/geo/geocoder';
import { planRoute } from '@/lib/routing/routing-provider';
import { distanceKm, formatDistance, formatDuration } from '@/lib/geo/distance';
import { isToday, fmtTime } from '@/lib/ui';

export type FieldSalesNav = { page: PageKey; caseId?: string; filters?: Record<string, string> };

export type PickOption = { id: string; entity_type: 'case' | 'customer' | 'lead' | 'visit'; label: string; target?: FieldTarget };

export type FieldSalesFlow =
  | { kind: 'pick'; title: string; options: PickOption[]; onPick: (opt: PickOption) => FieldSalesResult | Promise<FieldSalesResult> }
  | { kind: 'confirm_checkin'; visitId: string; label: string };

export type FieldSalesResult =
  | { type: 'done'; text: string; nav?: FieldSalesNav }
  | { type: 'flow'; text: string; nav?: FieldSalesNav; flow: FieldSalesFlow };

export type FieldSalesIntentKind =
  | 'search_contact' | 'search_locations' | 'get_user_location'
  | 'route' | 'open_entity' | 'check_in' | 'get_today' | 'get_nearby' | 'log_activity';

export type FieldSalesIntent = { kind: FieldSalesIntentKind; query?: string };

type IntentDef = { kind: FieldSalesIntentKind; re: RegExp; query?: RegExp };

const INTENTS: IntentDef[] = [
  { kind: 'get_user_location', re: /(?:πο(?:υ|ύ) (?:είμαι|βρίσκομαι)|θέση μου|τοποθεσί(?:α|ε) μου|\bgps\b)/i },
  { kind: 'check_in', re: /(?:χ(?:ε|έ)κ ?ιν|check[ -]?in|\bcheckin\b)/i },
  { kind: 'get_today', re: /(?:ραντεβού σήμερα|επισκέψεις σήμερα|σημεριν(?:ές|ά|ή) (?:επισκέψεις|ραντεβού)|τι έχω σήμερα|τι έχω να κάνω σήμερα)/i },
  { kind: 'get_nearby', re: /(?:κοντιν(?:ό|ά|ές|ούς|ή|οί)|γύρω (?:από|απ|στα|στο)|κοντ(?:ά|α) μου)/i },
  {
    kind: 'route',
    re: /(?:διαδρομή|δρομολόγι(?:ο|α)|πώς (?:θα |να )?π(?:ά|α)ω|πώς πάω|\broute\b)/i,
    query: /(?:προς (?:τον|την|το)?|στο(?:ν)?|στη)\s+(.+)/i,
  },
  {
    kind: 'search_locations',
    re: /(?:πο(?:υ|ύ) (?:είναι|βρίσκεται|μένει|μένουν)|δι(?:έ|ε)υθυνσ(?:η|η) (?:του|της|για|του)?|τοποθεσί(?:α|ες))/i,
    query: /(?:πο(?:υ|ύ) (?:είναι|βρίσκεται|μένει|μένουν)|δι(?:έ|ε)υθυνση|τοποθεσία)[^.,;]*?\s+(.+)/i,
  },
  { kind: 'open_entity', re: /(?:άνοιξε|δείξε μου|πήγαιν(?:έ|ε) με)/i, query: /(?:άνοιξε|δείξε μου|πήγαιν(?:έ|ε) με)\s+(?:τη(?:ν)?|το|τον)?\s*(.+)/i },
  {
    kind: 'search_contact',
    re: /(?:ψ(?:ά|α)χνω|βρ(?:έ|ε)ς|βρ(?:έ|ε)σε|αναζ(?:ή|η)τησ[εη]|ψ(?:ά|α)ξ|ποιος είν|ποια είν|ποιο είναι)/i,
    query: /(?:ψ(?:ά|α)χνω|βρ(?:έ|ε)ς|βρ(?:έ|ε)σε|αναζ(?:ή|η)τησ[εη]|ψ(?:ά|α)ξ)(?: για)?(?: τον| την| το| τη)?\s+(.+)/i,
  },
  { kind: 'log_activity', re: /(?:καταχώρησ(?:ε|η) σημ(?:είω|ε)ση|πρ(?:ό|ο)σθεσε σημ(?:είω|ε)ση|σημ(?:είω|ε)σε ο(?:τι|,τι)|κρ(?:ά|α)τησε σημ(?:είω|ε)ση)/i, query: /(?:σημ(?:είω|ε)ση)(?::\s*)?\s*(.+)/i },
];

export function detectFieldSalesIntent(text: string): FieldSalesIntent | null {
  for (const def of INTENTS) {
    if (!def.re.test(text)) continue;
    let query = '';
    if (def.query) {
      const m = text.match(def.query);
      if (m?.[1]) query = m[1].trim();
    }
    return { kind: def.kind, query: query || undefined };
  }
  return null;
}

/* ---------------- shared helpers ---------------- */

export type FieldSalesCtx = { role: Role | null };

const ATHENS = { lat: 37.9838, lng: 23.7275 };

function targetNav(t: PickOption): FieldSalesNav {
  switch (t.entity_type) {
    case 'case': return { page: 'case', caseId: t.id };
    case 'lead': return { page: 'leads' };
    case 'visit': return { page: 'myday' };
    default: return { page: 'customers' };
  }
}

function targetLabel(t: { label: string; sublabel: string; address?: string }): string {
  return [t.label, t.sublabel && t.sublabel !== t.label ? t.sublabel : '', t.address ?? ''].filter(Boolean).join(' · ');
}

function asPickOptions(targets: Awaited<ReturnType<typeof fetchFieldTargets>>): PickOption[] {
  return targets.map(t => ({ id: t.id, entity_type: t.entity_type, label: targetLabel(t), target: t }));
}

function makePickFlow(
  title: string,
  targets: Awaited<ReturnType<typeof fetchFieldTargets>>,
  onPick: (opt: PickOption) => FieldSalesResult | Promise<FieldSalesResult>,
): FieldSalesResult {
  const options = asPickOptions(targets);
  const list = options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
  return {
    type: 'flow',
    text: `${title}\n${list}\n\nΓράψτε τον αριθμό ή το όνομα για να επιλέξετε.`,
    flow: { kind: 'pick', title, options, onPick },
  };
}

async function resolveContacts(text: string): Promise<ReturnType<typeof fetchFieldTargets>> {
  let q = text.trim();
  q = q
    .replace(/(?:άνοιξε|δείξε μου|πήγαιν(?:έ|ε) με)/gi, '')
    .replace(/\b(?:υπόθεση|case|cases?|υποθέσεις)\b/gi, '')
    .replace(/\b(?:πελάτης|πελάτη|πελάτες|πελατών|customer)\b/gi, '')
    .replace(/\b(?:ο|η|το|οι|τα|τον|την|του|της|στο|στη|στην|στα|για|με|από|σε)\b/gi, '')
    .replace(/(?:ποιος|ποια|ποιο)\s+(?:είναι|είν)?/i, '')
    .trim();
  if (!q) return [];
  return fetchFieldTargets(q);
}

/* ---------------- execute ---------------- */

export async function runFieldSalesIntent(intent: FieldSalesIntent, ctx: FieldSalesCtx): Promise<FieldSalesResult> {
  const q = (intent.query ?? '').trim();
  switch (intent.kind) {
    case 'get_user_location': return getUserLocation();
    case 'check_in': return startCheckIn(ctx);
    case 'get_today': return getToday();
    case 'get_nearby': return getNearby();
    case 'route': return routeTo(q);
    case 'search_locations': return searchLocations(q);
    case 'open_entity': return openEntity(q);
    case 'search_contact': return searchContact(q);
    case 'log_activity': return logActivity(q, ctx);
    default: return { type: 'done', text: 'Δεν μπόρεσα να αναγνωρίσω την ενέργεια πεδίου.' };
  }
}

export async function resumeFieldSales(text: string, flow: FieldSalesFlow, ctx: FieldSalesCtx): Promise<FieldSalesResult> {
  if (flow.kind === 'pick') {
    const bail = /^(?:ακύρωσ|άσ(ε|το)|δεν θέλω|τίποτα|cancel|ξέχασ[εέ]|πίσω)\b/i.test(text.trim());
    if (bail) return { type: 'done', text: 'Εντάξει, ακύρωσα την επιλογή.' };
    const idx = text.match(/^\s*(\d+)/);
    const chosen = idx
      ? flow.options[Number(idx[1]) - 1]
      : flow.options.find(o => o.label.toLowerCase().includes(text.trim().toLowerCase()));
    if (!chosen) {
      const list = flow.options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
      return { type: 'flow', text: `${flow.title}\n${list}`, flow };
    }
    return await flow.onPick(chosen);
  }
  if (flow.kind === 'confirm_checkin') {
    const ok = /^(?:ναι|ok|οκ|ωραία|επιβεβαίω|βεβαίω|yes|confirm|προχώρησε|γίνεται)/i.test(text.trim());
    if (!ok) return { type: 'done', text: 'Εντάξει, ακύρωσα το check-in. Πείτε «check in» όταν φτάσετε στο ραντεβού.' };
    return doConfirmedCheckIn(flow.visitId, flow.label, ctx);
  }
  return { type: 'done', text: 'Η ενέργεια ακυρώθηκε.' };
}

/* ---------------- tools ---------------- */

async function getUserLocation(): Promise<FieldSalesResult> {
  try {
    const l = await getCurrentLocation();
    const acc = l.accuracy != null ? ` (ακρίβεια ±${l.accuracy} μ)` : '';
    return {
      type: 'done',
      text: `Βρίσκεστε στο ${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}${acc}. Άνοιξα τον χάρτη. 🗺️\nΕπόμενο βήμα: «κοντινοί πελάτες» ή «διαδρομή προς …».`,
      nav: { page: 'map' },
    };
  } catch {
    return { type: 'done', text: 'Δεν μπορώ να αποκτήσω πρόσβαση στο GPS. Ελέγξτε ότι το πρόγραμμα περιήγησης επιτρέπει την τοποθεσία.' };
  }
}

async function startCheckIn(ctx: FieldSalesCtx): Promise<FieldSalesResult> {
  if (!ctx.role || !can(ctx.role, 'check_in')) {
    return { type: 'done', text: 'Ο ρόλος σας δεν έχει δικαίωμα Check-in.' };
  }
  const visits = (await fetchVisits({ user: true })).filter(v =>
    v.status !== 'completed' && v.status !== 'cancelled' && v.scheduled_at != null && isToday(v.scheduled_at));
  if (visits.length === 0) {
    return { type: 'done', text: 'Δεν έχετε προγραμματισμένη επίσκεψη σήμερα για check-in. Ανοίγω την «Ημέρα μου» για πλάνο.', nav: { page: 'myday' } };
  }
  if (visits.length === 1) return confirmVisit(visits[0]);
  const options: PickOption[] = visits.map(v => ({
    id: v.id, entity_type: 'visit' as const,
    label: `${v.case?.customer?.full_name ?? v.purpose ?? 'Επίσκεψη'}${v.purpose ? ` · ${v.purpose}` : ''}${v.scheduled_at ? ` · ${fmtTime(v.scheduled_at)}` : ''}`,
  }));
  return {
    type: 'flow',
    text: `Έχετε ${visits.length} επισκέψεις σήμερα. Σε ποια θέλετε check-in;`,
    flow: {
      kind: 'pick',
      title: 'Επισκέψεις για check-in:',
      options,
      onPick: o => ({ type: 'done', text: `Επιλέχθηκε η επίσκεψη «${o.label}». Πείτε «check in» για επιβεβαίωση.` }),
    },
  };
}

function confirmVisit(v: CaseVisit): FieldSalesResult {
  const name = v.case?.customer?.full_name ?? v.purpose ?? 'Επίσκεψη';
  const when = v.scheduled_at ? ` · ${fmtTime(v.scheduled_at)}` : '';
  return {
    type: 'flow',
    text: `Θα κάνω check-in στην επίσκεψη «${name}»${when}.\nΤο Check-in ελέγχει ότι βρίσκεστε εντός του γεωγραφικού ορίου (default 150 μ).\nΝα συνεχίσω;`,
    flow: { kind: 'confirm_checkin', visitId: v.id, label: `${name}${when}` },
  };
}

async function doConfirmedCheckIn(visitId: string, label: string, ctx: FieldSalesCtx): Promise<FieldSalesResult> {
  if (!ctx.role || !can(ctx.role, 'check_in')) {
    return { type: 'done', text: 'Ο ρόλος σας δεν έχει δικαίωμα Check-in.' };
  }
  let coords: { lat: number; lng: number; accuracy?: number } | undefined;
  try {
    const l = await getCurrentLocation();
    coords = { lat: l.lat, lng: l.lng, accuracy: l.accuracy };
  } catch {
    coords = undefined;
  }
  const res = await fieldCheckin(visitId, coords);
  if (res.accepted || res.code === 'IDEMPOTENT') {
    const note = res.code === 'IDEMPOTENT'
      ? (res.message ?? 'Το Check-in έγινε ήδη παλαιότερα.')
      : (res.message ?? 'Check-in επιτυχές ✓');
    const d = res.distanceMeters != null ? ` · απόσταση ${formatDistance(res.distanceMeters / 1000)}` : '';
    return { type: 'done', text: `${note}${d}\nΕπίσκεψη: ${label}.`, nav: { page: 'map' } };
  }
  const why = res.code === 'OUTSIDE_RADIUS'
    ? `Βρίσκεστε εκτός ορίου (${res.distanceMeters != null ? formatDistance(res.distanceMeters / 1000) : '—'} από τον στόχο, όριο ${res.radiusM ?? 150} μ).`
    : res.code === 'GPS_UNCERTAIN'
      ? `Ακρίβεια GPS ανεπαρκής (${res.accuracyM ?? '—'} μ). Πλησιάστε και δοκιμάστε ξανά.`
      : res.code === 'NO_TARGET'
        ? 'Το ραντεβού δεν έχει αποθηκευμένη θέση στόχου. Προσθέστε γεωγραφική θέση πρώτα.'
        : (res.message ?? 'Το Check-in δεν έγινε αποδεκτό.');
  return { type: 'done', text: `${why} Πείτε «check in» για δοκιμή ξανά.` };
}

async function getToday(): Promise<FieldSalesResult> {
  const visits = (await fetchVisits({ user: true })).filter(v => v.scheduled_at != null && isToday(v.scheduled_at));
  const lines = visits
    .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
    .map(v => `- ${fmtTime(v.scheduled_at)} · ${v.case?.customer?.full_name ?? v.purpose ?? 'Επίσκεψη'} (${v.status})`);
  if (lines.length === 0) return { type: 'done', text: 'Σήμερα δεν έχετε προγραμματισμένες επισκέψεις.', nav: { page: 'myday' } };
  return {
    type: 'done',
    text: `Σημερινό πλάνο (${visits.length}):\n${lines.join('\n')}\n\nΑνοίγω την «Ημέρα μου» για λεπτομέρειες.`,
    nav: { page: 'myday' },
  };
}

async function getNearby(): Promise<FieldSalesResult> {
  let my: { lat: number; lng: number } | null = null;
  try { const l = await getCurrentLocation(); my = l; } catch { /* keep null */ }
  const targets = await fetchFieldTargets();
  if (my) {
    const sorted = [...targets]
      .map(t => ({ t, d: distanceKm(my, t.position) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 5);
    const lines = sorted.map(({ t, d }) => `- [${t.entity_type}] ${targetLabel(t)} — ${formatDistance(d)}`);
    return { type: 'done', text: `Τα κοντινότερα σημεία σε εσάς:\n${lines.join('\n')}\n\nΤα εμφανίζω στον χάρτη.`, nav: { page: 'map' } };
  }
  if (targets.length === 0) return { type: 'done', text: 'Δεν έχουμε αποθηκευμένα σημεία με συντεταγμένες ακόμα.' };
  return {
    type: 'done',
    text: `Δεν βρήκα τη θέση σας. Έχουμε ${targets.length} αποθηκευμένα σημεία — ανοίγω τον χάρτη για περιήγηση.`,
    nav: { page: 'map' },
  };
}

async function searchLocations(q: string): Promise<FieldSalesResult> {
  const ENTITY_HINT = /(πελάτ|υπόθεσ|case|lead|follow[ -]?up)/i;
  if (ENTITY_HINT.test(q)) return searchContact(q);
  const query = q.replace(/(?:πο(?:υ|ύ) (?:είναι|βρίσκεται|μένει|μένουν)|δι(?:έ|ε)υθυνση|τοποθεσία)/i, '').trim();
  if (!query) return { type: 'done', text: 'Για ποια διεύθυνση ή περιοχή ψάχνω; Π.χ. «πού είναι στην Αθήνα;»' };
  const hits = await geocodeAddress(query);
  if (hits.length === 0) return { type: 'done', text: `Δεν βρήκα την τοποθεσία «${query}». Δοκιμάστε με περισσότερες λεπτομέρειες (πόλη, οδός).` };
  const h = hits[0];
  return {
    type: 'done',
    text: `Βρήκα: ${h.label}\nΣυντεταγμένες: ${h.position.lat.toFixed(5)}, ${h.position.lng.toFixed(5)}\nΆνοιξα τον χάρτη εκεί.`,
    nav: { page: 'map' },
  };
}

async function searchContact(q: string): Promise<FieldSalesResult> {
  const targets = await resolveContacts(q);
  if (targets.length === 0) {
    return { type: 'done', text: `Δεν βρήκα σταθερό σημείο για «${q.trim()}». Ο πελάτης μπορεί να μην έχει αποθηκευμένη θέση στον χάρτη ακόμα.` };
  }
  if (targets.length === 1) return contactDone(targets[0]);
  return makePickFlow(
    `Βρήκα ${targets.length} αποτελέσματα. Ποιο εννοείτε;`,
    targets,
    t => contactDone(t),
  );
}

async function openEntity(q: string): Promise<FieldSalesResult> {
  if (!q) return { type: 'done', text: 'Τι να ανοίξω; Π.χ. «άνοιξε την υπόθεση 45» ή «άνοιξε τον Γιάννη Παπαδόπουλο».' };
  const targets = await resolveContacts(q);
  if (targets.length === 0) return { type: 'done', text: `Δεν βρήκα «${q}» με αποθηκευμένες συντεταγμένες.` };
  if (targets.length > 1) {
    return makePickFlow(
      `Βρήκα ${targets.length} επιλογές για «${q}». Ποια να ανοίξω;`,
      targets,
      t => ({ type: 'done', text: `Άνοιξα: ${t.label}`, nav: targetNav(t) }),
    );
  }
  const t = targets[0];
  return { type: 'done', text: `Άνοιξα: ${targetLabel(t)}`, nav: targetNav({ id: t.id, entity_type: t.entity_type, label: targetLabel(t) }) };
}

async function logActivity(q: string, ctx: FieldSalesCtx): Promise<FieldSalesResult> {
  const [refPart, ...noteParts] = q.split(':');
  const ref = (refPart ?? '').trim();
  const note = noteParts.join(':').trim();
  if (!ref) {
    return { type: 'done', text: 'Σε ποια υπόθεση; Π.χ. «καταχώρησε σημείωση στην υπόθεση Γιάννης Παπαδόπουλος: μίλησα τηλεφωνικά».' };
  }
  if (!note) {
    return { type: 'done', text: 'Ποια είναι η σημείωση; Γράψτε τη μετά από άνω-κάτω τελεία, π.χ. «…: μίλησα τηλεφωνικά».' };
  }
  const targets = await resolveContacts(ref);
  if (targets.length === 0) return { type: 'done', text: `Δεν βρήκα υπόθεση για «${ref}» με αποθηκευμένες συντεταγμένες.` };
  if (targets.length > 1) {
    return makePickFlow(
      `Για ποια από τις ${targets.length} επιλογές τη σημειώνω;`,
      targets,
      o => noteResult(o, note, ctx),
    );
  }
  return noteResult(asPickOptions(targets)[0], note, ctx);
}

async function noteResult(o: PickOption, note: string, ctx: FieldSalesCtx): Promise<FieldSalesResult> {
  const t = o.target;
  if (o.entity_type !== 'case' || !t) {
    return { type: 'done', text: 'Η σημείωση καταχωρείται σε υπόθεση (case). Δοκιμάστε με τον αριθμό ή το όνομα της υπόθεσης.' };
  }
  await addActivity(t.id, {
    role: ctx.role ?? 'field_sales',
    activity_type: 'note',
    title: 'Σημείωση (JARVIS)',
    description: note,
  });
  return { type: 'done', text: `Σημείωση καταχωρήθηκε στην υπόθεση «${t.label}».`, nav: { page: 'case', caseId: t.id } };
}

function contactDone(t: PickOption & { address?: string; position?: unknown }): FieldSalesResult {
  const nav = t.entity_type === 'case'
    ? { page: 'case' as const, caseId: t.id }
    : t.entity_type === 'lead'
      ? { page: 'leads' as const }
      : { page: 'customers' as const };
  return {
    type: 'done',
    text: `Βρήκα: ${t.label}${t.address ? `\n📍 ${t.address}` : ''}\nΆνοιξα τη σχετική σελίδα.`,
    nav,
  };
}

/* ---------------- unused guards ---------------- */

export async function routeTo(q: string): Promise<FieldSalesResult> {
  if (!q) return { type: 'done', text: 'Προς τα πού είναι η διαδρομή; Π.χ. «διαδρομή προς τον Γιάννη Παπαδόπουλο».' };
  const targets = await resolveContacts(q);
  if (targets.length === 0) return { type: 'done', text: `Δεν βρήκα σημείο για «${q}» με αποθηκευμένες συντεταγμένες.` };
  if (targets.length > 1) {
    return makePickFlow(
      `Βρήκα ${targets.length} πιθανούς προορισμούς. Έναν από αυτούς;`,
      targets,
      async o => {
        const t = o.target;
        if (!t) return { type: 'done', text: 'Σφάλμα δρομολόγησης. Δοκιμάστε ξανά.' };
        return planToTargetAsync(t);
      },
    );
  }
  return planToTargetAsync(targets[0]);
}

async function planToTargetAsync(t: { label: string; position: { lat: number; lng: number } }): Promise<FieldSalesResult> {
  let origin: { lat: number; lng: number } | null = null;
  let originNote = '';
  try { origin = await getCurrentLocation(); } catch { /* no gps */ }
  const from = origin ?? ATHENS;
  if (!origin) originNote = ' (χωρίς GPS, σημείο εκκίνησης: κέντρο Αθήνας)';
  const plan = await planRoute([
    { id: 'origin', label: 'Εκκίνηση', position: from },
    { id: 'dest', label: t.label, position: t.position },
  ]);
  const src = plan.source === 'osrm' ? 'OSRM' : plan.source === 'ors' ? 'openrouteservice' : 'εκτίμηση ευθείας';
  return {
    type: 'done',
    text: `Διαδρομή προς ${t.label}:\n📏 ${formatDistance(plan.totalDistanceMeters / 1000)} · ⏱ ${formatDuration(plan.totalDurationSeconds)} (${src})${originNote}\n\nΗ διαδρομή σχεδιάστηκε στον χάρτη.`,
    nav: { page: 'map' },
  };
}