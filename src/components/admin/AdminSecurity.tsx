/* Ασφάλεια & Έλεγχοι — an action centre, not a checklist of reassurances.
   Every line says WHAT is tested, the actual RESULT, WHEN and WHERE it was established (Production / staging / local), HOW (automated or manual), the EVIDENCE,
   and the NEXT ACTION with its owner. «Επαληθευμένο» exists only for a live Production result with a time stamp (the rules live in lib/security-evidence.ts and are
   tested); local tests, documents and notes appear as evidence but never turn a line green. */

import { useState } from 'react';
import { CheckCircle2, CircleHelp, ClipboardList, Info, Play, TriangleAlert } from 'lucide-react';
import { AREAS, ENV_TEXT, METHOD_TEXT, STATUS_TEXT, buildChecks, summarize } from '@/lib/security-evidence';
import type { Check, Status } from '@/lib/security-evidence';
import { lastLiveChecks, runSecurityChecks } from '@/lib/admin-checks';
import { Btn, Spinner } from '@/lib/ui';

const ICON: Record<Status, JSX.Element> = {
  verified: <CheckCircle2 size={16} className="text-[#15803d]" aria-hidden="true" />,
  action: <TriangleAlert size={16} className="text-[var(--atx-amber)]" aria-hidden="true" />,
  unverified: <CircleHelp size={16} className="text-[var(--atx-faint)]" aria-hidden="true" />,
  manual: <ClipboardList size={16} className="text-[var(--atx-blue)]" aria-hidden="true" />,
  accepted: <Info size={16} className="text-[var(--atx-muted)]" aria-hidden="true" />,
};
const TAG: Record<Status, string> = { verified: 't-success', action: 't-warning', unverified: '', manual: 't-info', accepted: '' };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('el-GR') : 'Δεν έχει γίνει έλεγχος');

export function CheckCard({ c }: { c: Check }) {
  return (
    <li className="atx-check !items-start" data-check={c.id} data-status={c.status}>
      <span className="pt-0.5">{ICON[c.status]}</span>
      <span className="flex-1 min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14px] font-medium">{c.label}</span>
          <span className={`atx-tag ${TAG[c.status]}`}>{STATUS_TEXT[c.status]}</span>
        </span>
        <span className="block text-[12.5px] text-[var(--atx-muted)] mt-0.5">{c.detail}</span>
        <span className="block text-[11.5px] text-[var(--atx-faint)] mt-1" data-field="meta">
          {ENV_TEXT[c.env]} · {METHOD_TEXT[c.method]} · {c.at ? `Τελευταίος έλεγχος: ${when(c.at)}` : 'Τελευταίος έλεγχος: —'}
        </span>
        {c.action && (
          <span className="block text-[12.5px] mt-1.5" data-field="action">
            <strong>Επόμενη ενέργεια{c.owner ? ` (${c.owner})` : ''}:</strong> {c.action}
          </span>
        )}
        <details className="mt-1.5 text-[12px] text-[var(--atx-muted)]">
          <summary className="cursor-pointer select-none">Τι ελέγχεται και ποιο είναι το τεκμήριο</summary>
          <dl className="mt-1 space-y-1">
            <div><dt className="inline font-medium">Τι ελέγχεται: </dt><dd className="inline" data-field="tests">{c.tests}</dd></div>
            <div><dt className="inline font-medium">Τεκμήριο: </dt><dd className="inline" data-field="evidence">{c.evidence}</dd></div>
            {c.local && <div><dt className="inline font-medium">Τοπικά τεκμήρια (δεν αντικαθιστούν τον ζωντανό έλεγχο): </dt><dd className="inline" data-field="local">{c.local}</dd></div>}
          </dl>
        </details>
      </span>
    </li>
  );
}

export function CheckList({ items }: { items: Check[] }) {
  return <ul className="m-0 p-0 list-none">{items.map((c) => <CheckCard key={c.id} c={c} />)}</ul>;
}

export default function AdminSecurity() {
  const [last, setLast] = useState(lastLiveChecks);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { setLast(await runSecurityChecks()); } finally { setBusy(false); } };
  const checks = buildChecks(last?.results ?? null);
  const counts = summarize(checks);
  const nonProd = last && last.env !== 'production';
  return (
    <div className="space-y-4">
      <div className="atx-panel">
        <div className="atx-card-head">
          <div>
            <h2 className="atx-section-title">Κατάσταση ασφάλειας: τι έχει αποδειχθεί και τι όχι</h2>
            <p className="text-[12.5px] text-[var(--atx-muted)]">
              Αυτή η σελίδα δεν δηλώνει ότι το σύστημα είναι ασφαλές. Κάθε γραμμή λέει τι ελέγχθηκε, πού, πότε και πώς· ό,τι δεν έχει αποδειχθεί ζωντανά στο Production δεν εμφανίζεται ως επιτυχία.
              Οι ζωντανοί έλεγχοι τρέχουν από αυτόν τον browser με τη δική σας σύνδεση, μόνο ανάγνωση: δεν αλλάζουν δεδομένα και δεν εμφανίζουν τιμές κλειδιών.
            </p>
          </div>
          <Btn onClick={() => void run()} disabled={busy}>{busy ? <Spinner /> : <Play className="w-3.5 h-3.5" />} Εκτέλεση ζωντανών ελέγχων</Btn>
        </div>
        <div className="px-4 pb-3 flex flex-wrap gap-2" data-testid="security-summary">
          {(Object.keys(STATUS_TEXT) as Status[]).map((s) => <span key={s} className={`atx-tag ${TAG[s]}`} data-count={s}>{STATUS_TEXT[s]}: {counts[s]}</span>)}
        </div>
        <p className="px-4 pb-3 text-[12.5px] text-[var(--atx-muted)]" data-testid="security-lastrun">
          {last ? `Τελευταίοι ζωντανοί έλεγχοι: ${when(last.at)} · ${ENV_TEXT[last.env]}` : 'Δεν έχουν εκτελεστεί ζωντανοί έλεγχοι από αυτόν τον browser: όλες οι γραμμές που τους χρειάζονται εμφανίζονται ως «Δεν έχει επαληθευτεί ζωντανά».'}
        </p>
        {nonProd && <p className="mx-4 mb-3 text-[12.5px] rounded-lg border border-[var(--atx-line)] px-3 py-2" role="status">Αυτή η εκτέλεση έγινε σε περιβάλλον που δεν είναι το Production ({ENV_TEXT[last.env]}): τα αποτελέσματα φαίνονται, αλλά δεν μετράνε ως επαλήθευση.</p>}
      </div>
      {AREAS.map((a) => {
        const items = checks.filter((c) => c.area === a.id);
        return (
          <div className="atx-panel" key={a.id} data-area={a.id}>
            <div className="atx-card-head"><div><h2 className="atx-section-title">{a.title}</h2><p className="text-[12.5px] text-[var(--atx-muted)]">{a.lead}</p></div></div>
            <CheckList items={items} />
          </div>
        );
      })}
    </div>
  );
}
