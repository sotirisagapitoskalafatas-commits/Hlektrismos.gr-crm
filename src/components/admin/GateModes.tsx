/* Admin Center → Έγγραφα: per-stage document gate — «Προειδοποίηση» (default: missing documents are shown, the move
   goes through) or «Μπλοκάρισμα» (the database refuses the move; admin/manager override with a reason).
   Only an admin can switch; the database checks it (set_stage_gate_mode) and audits it. */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { fetchStageGates, setStageGateMode } from '@/lib/api';
import type { StageGate } from '@/lib/api';
import { stageText } from '@/lib/case-flow';
import { pendingText } from '@/lib/pending-text';

const LEVEL = { received: 'να έχουν παραληφθεί', verified: 'να έχουν ελεγχθεί' } as const;

export default function GateModes() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [gates, setGates] = useState<StageGate[] | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => setGates(await fetchStageGates()), []);
  useEffect(() => { void load(); }, [load]);
  const isAdmin = role === 'admin';

  const change = async (g: StageGate, mode: 'warn' | 'block') => {
    if (mode === g.mode) return;
    setBusy(g.stage);
    const e = await setStageGateMode(g.stage, mode);
    await load();
    setBusy(null);
    toast(e ?? `«${stageText(g.stage)}»: ${mode === 'block' ? 'μπλοκάρισμα' : 'προειδοποίηση'}.`, e ? 'bad' : 'ok');
  };

  return (
    <div className="atx-panel" data-gate-modes>
      <div className="atx-card-head"><h2 className="atx-section-title">Έλεγχος εγγράφων ανά στάδιο</h2></div>
      <div className="px-4 pb-4">
        <p className="text-[13px] text-[var(--atx-muted)] mb-3">
          «Προειδοποίηση»: τα έγγραφα που λείπουν εμφανίζονται και καταγράφονται, αλλά το case προχωρά (και παραδίδεται στο Back Office).
          «Μπλοκάρισμα»: η βάση δεν επιτρέπει τη μετάβαση· ο διαχειριστής ή ο διευθυντής μπορεί να την παρακάμψει με αιτιολογία.
        </p>
        {gates === undefined && <div className="atx-skeleton" />}
        {gates === null && <div className="atx-notice">{pendingText(role, 'Η ρύθμιση ενεργοποιείται μετά την ενημέρωση της βάσης «Ροή case» (phase2/07). Μέχρι τότε κανένα στάδιο δεν μπλοκάρεται από τη βάση.', 'Η ρύθμιση δεν είναι ακόμη διαθέσιμη. Μέχρι τότε κανένα στάδιο δεν μπλοκάρεται.')}</div>}
        {gates && (
          <ul className="m-0 p-0 list-none divide-y divide-[var(--atx-line)]">
            {gates.filter(g => g.enabled).map(g => (
              <li key={g.stage} className="flex items-center gap-3 flex-wrap py-2.5" data-gate={g.stage}>
                <span className="flex-1 min-w-[200px]">
                  <span className="block text-[14px] font-medium">{stageText(g.stage)}</span>
                  <span className="block text-[12.5px] text-[var(--atx-muted)]">Απαιτούμενα έγγραφα {LEVEL[g.min_status]}</span>
                </span>
                <div role="radiogroup" aria-label={`Λειτουργία για ${stageText(g.stage)}`} className="flex gap-1.5">
                  {(['warn', 'block'] as const).map(m => (
                    <button key={m} role="radio" aria-checked={g.mode === m} disabled={!isAdmin || busy === g.stage}
                      className={`atx-chip ${g.mode === m ? 'is-on' : ''}`} onClick={() => void change(g, m)}>
                      {m === 'warn' ? 'Προειδοποίηση' : 'Μπλοκάρισμα'}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!isAdmin && gates && <p className="text-[12px] text-[var(--atx-faint)] mt-2">Μόνο ο διαχειριστής αλλάζει αυτή τη ρύθμιση.</p>}
      </div>
    </div>
  );
}
