/* Admin Center → Έγγραφα: what each stage expects, read-only. Missing documents are shown as a warning and recorded in the
   case history, but they NEVER stop a stage change or a handover to Back Office (master prompt §7). There is nothing to
   switch: the former «Μπλοκάρισμα» option was removed on the owner's approval (staged phase2/07a). */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { fetchStageGates } from '@/lib/api';
import type { StageGate } from '@/lib/api';
import { stageText } from '@/lib/case-flow';
import { pendingText } from '@/lib/pending-text';

const LEVEL = { received: 'δεν έχουν παραληφθεί', verified: 'δεν έχουν ελεγχθεί' } as const;

export default function GateModes() {
  const { role } = useAuth();
  const [gates, setGates] = useState<StageGate[] | null | undefined>(undefined);
  const load = useCallback(async () => setGates(await fetchStageGates()), []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="atx-panel" data-gate-modes>
      <div className="atx-card-head"><h2 className="atx-section-title">Έγγραφα και στάδια</h2></div>
      <div className="px-4 pb-4">
        <p className="text-[13px] text-[var(--atx-muted)] mb-3" data-docs-never-block>
          Τα έγγραφα που λείπουν εμφανίζονται ως προειδοποίηση και καταγράφονται στο ιστορικό του case, αλλά δεν εμποδίζουν ποτέ μια αλλαγή σταδίου ή την παράδοση στο Back Office.
          Παρακάτω φαίνεται σε ποιο στάδιο ελέγχεται κάθε επίπεδο εγγράφων.
        </p>
        {gates === undefined && <div className="atx-skeleton" />}
        {gates === null && <div className="atx-notice">{pendingText(role, 'Η λίστα εμφανίζεται μετά την ενημέρωση της βάσης «Ροή case» (phase2/07a). Μέχρι τότε οι προειδοποιήσεις βασίζονται στη λίστα της εφαρμογής.', 'Η λίστα δεν είναι ακόμη διαθέσιμη.')}</div>}
        {gates && (
          <ul className="m-0 p-0 list-none divide-y divide-[var(--atx-line)]">
            {gates.filter(g => g.enabled).map(g => (
              <li key={g.stage} className="flex items-center gap-3 flex-wrap py-2.5" data-gate={g.stage}>
                <span className="flex-1 min-w-[200px]">
                  <span className="block text-[14px] font-medium">{stageText(g.stage)}</span>
                  <span className="block text-[12.5px] text-[var(--atx-muted)]">Προειδοποίηση αν τα απαιτούμενα έγγραφα {LEVEL[g.min_status]}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
