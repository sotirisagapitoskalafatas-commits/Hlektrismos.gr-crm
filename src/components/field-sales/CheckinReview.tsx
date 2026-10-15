/* «Check-in προς έλεγχο» — accepted check-ins that carry a review flag (staged phase4/10). Admin / manager / Back Office.
   Hidden when the migration is not applied yet or there is nothing to review. */

import { useCallback, useEffect, useState } from 'react';
import { MapPinOff } from 'lucide-react';
import { useNav } from '@/lib/nav';
import { useToast } from '@/lib/toast';
import { fmtDateTime } from '@/lib/ui';
import { FLAG_TEXT, fetchFlaggedCheckins, flagDetail, markCheckinReviewed } from '@/lib/field-review';
import type { FlaggedCheckin } from '@/lib/field-review';

export default function CheckinReview() {
  const { openCase } = useNav();
  const { toast } = useToast();
  const [rows, setRows] = useState<FlaggedCheckin[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => setRows(await fetchFlaggedCheckins(30)), []);
  useEffect(() => { void load(); }, [load]);
  if (!rows || rows.length === 0) return null;

  const done = async (r: FlaggedCheckin) => {
    setBusy(r.id);
    const e = await markCheckinReviewed(r.id);
    await load();
    setBusy(null);
    toast(e ?? 'Σημειώθηκε ως ελεγμένο.', e ? 'bad' : 'ok');
  };

  return (
    <div className="atx-section" data-checkin-review>
      <div className="atx-section-head">
        <h2 className="atx-section-title flex items-center gap-1.5"><MapPinOff size={16} aria-hidden="true" /> Check-in προς έλεγχο ({rows.length})</h2>
      </div>
      <p className="text-[13px] text-[var(--atx-muted)] mb-2">Τα check-in έγιναν δεκτά· εδώ φαίνονται όσα έγιναν μακριά από τη διεύθυνση ή χωρίς αξιόπιστη θέση (τελευταίες 30 ημέρες).</p>
      <ul className="atx-panel m-0 p-0 list-none">
        {rows.map(r => (
          <li key={r.id} className="atx-row" data-flag={r.review_flag}>
            <button className="atx-row-main" onClick={() => r.case_id && openCase(r.case_id)}>
              <span className="atx-row-title">{r.customer ?? r.case_no ?? 'Case'} · {r.agent}</span>
              <span className="atx-row-sub">{FLAG_TEXT[r.review_flag]}{flagDetail(r) ? ` · ${flagDetail(r)}` : ''} · {fmtDateTime(r.created_at)}{r.case_no ? ` · ${r.case_no}` : ''}</span>
            </button>
            <span className="atx-row-act">
              <button className="atx-btn atx-btn-quiet" disabled={busy === r.id} onClick={() => void done(r)}>Ελέγχθηκε</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
