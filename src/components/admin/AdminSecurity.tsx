/* Ασφάλεια & Έλεγχοι — only claims that are backed by something.
   1) Live checks the browser can really perform: what an ANONYMOUS visitor (public key, no session) can read.
      Read-only, «id» column only, never displayed. A pass means «no rows returned to an anonymous visitor».
   2) Findings from the source code with evidence and their staged fix — status «Χρειάζεται ενέργεια» until applied.
   3) Everything else is explicitly «Δεν έχει επαληθευτεί ζωντανά». No hard-coded green badges. */

import { useState } from 'react';
import { CheckCircle2, CircleHelp, Play, TriangleAlert } from 'lucide-react';
import { SOURCE_FINDINGS, STATUS_TEXT, UNVERIFIED, lastAnonChecks, runAnonChecks } from '@/lib/admin-checks';
import type { CheckResult, Status } from '@/lib/admin-checks';
import { Btn, Spinner } from '@/lib/ui';

const ICON: Record<Status, JSX.Element> = {
  verified: <CheckCircle2 size={16} className="text-[#15803d]" aria-hidden="true" />,
  action: <TriangleAlert size={16} className="text-[var(--atx-amber)]" aria-hidden="true" />,
  unverified: <CircleHelp size={16} className="text-[var(--atx-faint)]" aria-hidden="true" />,
};

export function CheckList({ items }: { items: CheckResult[] }) {
  return (
    <ul className="m-0 p-0 list-none">
      {items.map(c => (
        <li key={c.id} className="atx-check" data-check={c.id} data-status={c.status}>
          {ICON[c.status]}
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] font-medium">{c.label}</span>
            <span className="block text-[12.5px] text-[var(--atx-muted)]">{c.detail}</span>
          </span>
          <span className={`atx-tag ${c.status === 'verified' ? 't-success' : c.status === 'action' ? 't-warning' : ''}`}>{STATUS_TEXT[c.status]}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AdminSecurity() {
  const [last, setLast] = useState(lastAnonChecks);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); setLast(await runAnonChecks()); setBusy(false); };
  return (
    <div className="space-y-4">
      <div className="atx-panel">
        <div className="atx-card-head">
          <div>
            <h2 className="atx-section-title">Ζωντανοί έλεγχοι: τι βλέπει ένας ανώνυμος επισκέπτης</h2>
            <p className="text-[12.5px] text-[var(--atx-muted)]">Από αυτόν τον browser, με το δημόσιο κλειδί και χωρίς σύνδεση. Μόνο ανάγνωση· τα δεδομένα δεν εμφανίζονται.</p>
          </div>
          <Btn onClick={() => void run()} disabled={busy}>{busy ? <Spinner /> : <Play className="w-3.5 h-3.5" />} Εκτέλεση ελέγχων</Btn>
        </div>
        {last ? (
          <>
            <p className="px-4 pb-2 text-[12.5px] text-[var(--atx-muted)]">Τελευταίος έλεγχος: {new Date(last.at).toLocaleString('el-GR')}</p>
            <CheckList items={last.results} />
          </>
        ) : <p className="px-4 pb-4 text-[14px] text-[var(--atx-muted)]">Δεν έχουν εκτελεστεί έλεγχοι από αυτόν τον browser.</p>}
      </div>
      <div className="atx-panel">
        <div className="atx-card-head"><h2 className="atx-section-title">Ευρήματα από τον κώδικα</h2></div>
        <CheckList items={SOURCE_FINDINGS} />
      </div>
      <div className="atx-panel">
        <div className="atx-card-head"><h2 className="atx-section-title">Δεν έχουν επαληθευτεί ζωντανά</h2></div>
        <CheckList items={UNVERIFIED} />
      </div>
    </div>
  );
}
