/* Reference tabs of the Admin Center: Δικαιώματα, Cases & Ροή εργασίας, Έγγραφα.
   They describe what the APPLICATION implements; enforcement status is stated plainly next to each part. */

import { Check, Minus } from 'lucide-react';
import { PERMS, ROLES, STAGE_TRANSITIONS } from '@/lib/roles';
import type { CaseAction, Role, Stage } from '@/lib/roles';
import { JOURNEY, TEAM_LABEL, stageText, teamForStage } from '@/lib/case-flow';
import { DOC_GROUP_LABEL, requiredDocs, uploadableDocTypes } from '@/lib/documents';
import type { DocGroup } from '@/lib/documents';
import { ROLE_DESCRIPTION, manageableRoles } from '@/lib/staff-admin';
import GateModes from './GateModes';

const GROUPS: { label: string; items: [CaseAction, string][] }[] = [
  { label: 'Cases', items: [['create_case', 'Δημιουργία case'], ['edit_case', 'Επεξεργασία case'], ['change_stage', 'Αλλαγή σταδίου'], ['assign', 'Ανάθεση / παράδοση'], ['delete', 'Διαγραφή']] },
  { label: 'Επικοινωνία', items: [['log_call', 'Καταγραφή κλήσης'], ['log_email', 'Καταγραφή email'], ['log_sms', 'Καταγραφή SMS'], ['log_whatsapp', 'Καταγραφή WhatsApp'], ['add_note', 'Σημείωση'], ['create_followup', 'Νέο follow-up'], ['complete_followup', 'Ολοκλήρωση follow-up']] },
  { label: 'Προσφορές', items: [['create_offer', 'Δημιουργία προσφοράς'], ['send_offer', 'Αποστολή προσφοράς']] },
  { label: 'Πεδίο', items: [['schedule_visit', 'Προγραμματισμός επίσκεψης'], ['check_in', 'Check-in'], ['check_out', 'Check-out'], ['photo', 'Φωτογραφία'], ['meeting', 'Συνάντηση'], ['capture_signature', 'Λήψη υπογραφής']] },
  { label: 'Λειτουργίες', items: [['add_document', 'Προσθήκη εγγράφου'], ['verify_document', 'Έλεγχος εγγράφου'], ['create_application', 'Δημιουργία αίτησης'], ['submit_provider', 'Καταχώρηση στον πάροχο']] },
];

const Yes = () => <Check size={15} className="text-[#15803d] mx-auto" aria-label="ναι" />;
const No = () => <Minus size={15} className="text-[var(--atx-faint)] mx-auto" aria-label="όχι" />;

export function PermissionsTab() {
  const roles = ROLES.map(r => r.id as Role);
  return (
    <div className="space-y-4">
      <div className="atx-notice">Πίνακας αναφοράς της εφαρμογής (τι εμφανίζει το UI ανά ρόλο). Η πραγματική επιβολή γίνεται από RLS, συναρτήσεις βάσης και edge functions — <strong>δεν έχει επαληθευτεί ζωντανά</strong> με λογαριασμούς ανά ρόλο.</div>
      <div className="atx-panel overflow-x-auto">
        <table className="atx-table atx-matrix">
          <thead><tr><th>Ενέργεια</th>{ROLES.map(r => <th key={r.id} title={r.hint}>{r.label}</th>)}</tr></thead>
          <tbody>
            <tr className="atx-matrix-group"><td colSpan={roles.length + 1}>Διαχείριση χρηστών (επιβάλλεται από τον server — phase2/05)</td></tr>
            <tr>
              <td>Ποιους ρόλους διαχειρίζεται</td>
              {roles.map(r => <td key={r} className="text-[12px] text-center">{manageableRoles(r, true).length ? manageableRoles(r, true).map(x => ROLES.find(y => y.id === x)?.short).join(' · ') : '—'}</td>)}
            </tr>
            {GROUPS.map(g => [
              <tr key={g.label} className="atx-matrix-group"><td colSpan={roles.length + 1}>{g.label}</td></tr>,
              ...g.items.map(([a, label]) => (
                <tr key={a}><td>{label}</td>{roles.map(r => <td key={r}>{PERMS[r].includes(a) ? <Yes /> : <No />}</td>)}</tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {ROLES.map(r => (
          <div key={r.id} className="atx-panel px-4 py-3">
            <div className="text-[14px] font-semibold">{r.label} <span className="text-[var(--atx-faint)] font-normal">{r.short}</span></div>
            <p className="text-[13px] text-[var(--atx-muted)] mt-1">{ROLE_DESCRIPTION[r.id as Role]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorkflowTab() {
  return (
    <div className="space-y-4">
      <div className="atx-panel">
        <div className="atx-card-head"><h2 className="atx-section-title">Στάδια, υπεύθυνη ομάδα και επιτρεπτές μεταβάσεις</h2></div>
        <table className="atx-table">
          <thead><tr><th>#</th><th>Στάδιο</th><th>Υπεύθυνη ομάδα</th><th>Μπορεί να πάει σε</th></tr></thead>
          <tbody>
            {JOURNEY.map((s, i) => {
              const team = teamForStage(s);
              return (
                <tr key={s}>
                  <td className="text-[var(--atx-faint)]">{i + 1}</td>
                  <td className="font-medium">{stageText(s)}</td>
                  <td>{team ? TEAM_LABEL[team] : '—'}</td>
                  <td className="text-[13px] text-[var(--atx-muted)]">{(STAGE_TRANSITIONS[s as Stage] ?? []).map(stageText).join(' · ') || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="atx-panel">
        <div className="atx-card-head"><h2 className="atx-section-title">Κατάσταση κανόνων</h2></div>
        <ul className="m-0 p-0 list-none">
          <li className="atx-check"><span className="flex-1"><b>Επιτρεπτές μεταβάσεις</b><span className="block text-[12.5px] text-[var(--atx-muted)]">Επιβάλλονται από τη βάση (staged phase2/07, trigger στο στάδιο) — ενεργές μόλις εφαρμοστεί· ως τότε μόνο το UI τις περιορίζει.</span></span><span className="atx-tag">Δεν έχει επαληθευτεί ζωντανά</span></li>
          <li className="atx-check"><span className="flex-1"><b>Απαιτούμενα έγγραφα πριν την αλλαγή σταδίου</b><span className="block text-[12.5px] text-[var(--atx-muted)]">Η βάση απορρίπτει τη μετάβαση όταν λείπουν (Έλεγχος εγγράφων) ή δεν έχουν ελεγχθεί (Καταχώρηση/Ενεργοποίηση/Ολοκλήρωση). Παράκαμψη μόνο Διαχειριστής/Διευθυντής με αιτιολογία. Οι κανόνες χρειάζονται επιβεβαίωση από την επιχείρηση.</span></span><span className="atx-tag t-warning">Εκκρεμεί εφαρμογή (phase2/07)</span></li>
          <li className="atx-check"><span className="flex-1"><b>Επιστροφή για διόρθωση (Back Office)</b><span className="block text-[12.5px] text-[var(--atx-muted)]">Υποχρεωτική αιτιολογία και στοιχεία, ίδιο case, ειδοποίηση υπευθύνου, χρονολόγιο και audit· «Επανυποβολή» από την ομάδα που το παρέλαβε.</span></span><span className="atx-tag t-warning">Εκκρεμεί εφαρμογή (phase2/07)</span></li>
        </ul>
      </div>
    </div>
  );
}

export function DocumentsTab() {
  const groups = new Map<DocGroup, ReturnType<typeof uploadableDocTypes>>();
  for (const t of uploadableDocTypes()) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);
  const sample = [
    { title: 'Οικιακό ρεύμα', c: { service_type: 'energy', property_type: 'Διαμέρισμα', case_type: null } },
    { title: 'Οικιακό φυσικό αέριο', c: { service_type: 'gas', property_type: 'Διαμέρισμα', case_type: null } },
    { title: 'Επαγγελματικό ρεύμα', c: { service_type: 'energy', property_type: 'Επαγγελματικό', case_type: 'business' } },
  ];
  return (
    <div className="space-y-4">
      <GateModes />
      <div className="atx-notice">Ενδεικτικές λίστες της εφαρμογής για παρόχους ενέργειας στην Ελλάδα. Τα ακριβή δικαιολογητικά διαφέρουν ανά πάροχο — χρειάζεται επιβεβαίωση από την επιχείρηση πριν γίνουν κανόνες του server.</div>
      <div className="grid lg:grid-cols-3 gap-3">
        {sample.map(x => (
          <div key={x.title} className="atx-panel px-4 py-3">
            <div className="text-[14px] font-semibold mb-2">{x.title}</div>
            <ul className="m-0 p-0 list-none space-y-1">
              {requiredDocs(x.c).map(d => <li key={d.label} className="text-[13px] flex gap-2"><span className={d.required ? 'text-[var(--atx-amber)]' : 'text-[var(--atx-faint)]'}>{d.required ? '●' : '○'}</span>{d.label}</li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="atx-panel">
        <div className="atx-card-head"><h2 className="atx-section-title">Τύποι εγγράφων</h2></div>
        <div className="grid md:grid-cols-2 gap-x-6 px-4 pb-4">
          {[...groups.entries()].map(([g, types]) => (
            <div key={g} className="mb-3">
              <div className="text-[12px] font-semibold text-[var(--atx-muted)] mb-1">{DOC_GROUP_LABEL[g]}</div>
              {types.map(t => <div key={t.key} className="text-[13px] py-0.5"><b className="font-medium">{t.label}</b> <span className="text-[var(--atx-muted)]">— {t.hint}</span></div>)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
