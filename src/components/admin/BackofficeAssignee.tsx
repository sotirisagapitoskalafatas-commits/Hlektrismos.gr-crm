/* Διαχείριση → Cases & Ροή: «Υπεύθυνος Back Office για νέα leads με έγγραφα». A setting that points to a user
   (staged phase4/12) — never a hardcoded name. Admin changes it; others see it. */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useStaff } from '@/lib/useStaff';
import { fetchDefaultBackofficeAssignee, setDefaultBackofficeAssignee } from '@/lib/lead-intake';
import type { Assignee } from '@/lib/lead-intake';
import { pendingText } from '@/lib/pending-text';

export default function BackofficeAssignee() {
  const { role } = useAuth();
  const { toast } = useToast();
  const staff = useStaff();
  const [cur, setCur] = useState<Assignee | null | undefined>(undefined);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const a = await fetchDefaultBackofficeAssignee(); setCur(a); setPick(a?.id ?? ''); }, []);
  useEffect(() => { void load(); }, [load]);
  const bo = staff.filter(s => s.role === 'admin'); // the shared Admin / Back Office login only (legacy back_office rows hold no access)
  const isAdmin = role === 'admin';

  const save = async () => {
    setBusy(true);
    const e = await setDefaultBackofficeAssignee(pick || null);
    await load();
    setBusy(false);
    toast(e ?? 'Ο υπεύθυνος Back Office αποθηκεύτηκε.', e ? 'bad' : 'ok');
  };

  return (
    <div className="atx-panel" data-bo-assignee>
      <div className="atx-card-head"><h2 className="atx-section-title">Υπεύθυνος Back Office για νέα leads με έγγραφα</h2></div>
      <div className="px-4 pb-4 space-y-3">
        <p className="text-[13px] text-[var(--atx-muted)]">Όταν δημιουργείται lead με έγγραφα, ανατίθεται σε αυτόν τον χρήστη, που ειδοποιείται και το βλέπει στη «Διεκπεραίωση». Ο δημιουργός του lead καταγράφεται κανονικά.</p>
        {cur === undefined && <div className="atx-notice">{pendingText(role, 'Η ρύθμιση ενεργοποιείται μετά την ενημέρωση της βάσης «Υπεύθυνος Back Office» (phase4/12). Μέχρι τότε τα leads με έγγραφα μένουν σε αυτόν που τα δημιουργεί.', 'Η ρύθμιση δεν είναι ακόμη διαθέσιμη. Μέχρι τότε τα leads με έγγραφα μένουν σε αυτόν που τα δημιουργεί.')}</div>}
        {cur !== undefined && (
          <div className="flex gap-2 flex-wrap items-center">
            <select className="field max-w-xs" value={pick} disabled={!isAdmin || busy} onChange={e => setPick(e.target.value)} aria-label="Υπεύθυνος Back Office">
              <option value="">— Δεν έχει οριστεί —</option>
              {bo.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
            {isAdmin && <button className="atx-btn atx-btn-primary" disabled={busy || pick === (cur?.id ?? '')} onClick={() => void save()}>Αποθήκευση</button>}
            {!isAdmin && <span className="text-[12.5px] text-[var(--atx-faint)]">Μόνο ο διαχειριστής αλλάζει αυτή τη ρύθμιση.</span>}
          </div>
        )}
      </div>
    </div>
  );
}
