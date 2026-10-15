/* Λειτουργίες: «Follow-ups για υπεύθυνο» — follow-ups created from a field visit with the outcome
   «Follow-up από υπεύθυνο» (marked by MANAGER_FOLLOWUP_PREFIX). The agent who created it stays visible. Hidden when empty. */

import { useCallback, useEffect, useState } from 'react';
import { UserCheck } from 'lucide-react';
import { useNav } from '@/lib/nav';
import { useToast } from '@/lib/toast';
import { fmtDateTime } from '@/lib/ui';
import { completeFollowUp, fetchFollowUps } from '@/lib/api';
import type { FollowUp } from '@/lib/api';
import { isManagerFollowUp, MANAGER_FOLLOWUP_PREFIX } from '@/lib/field-day';
import { useStaff } from '@/lib/useStaff';

export default function ManagerFollowUps() {
  const { openCase } = useNav();
  const { toast } = useToast();
  const staff = useStaff();
  const [rows, setRows] = useState<FollowUp[] | null>(null);
  const load = useCallback(async () => {
    const all = await fetchFollowUps({ status: 'pending' });
    setRows(all.filter(f => isManagerFollowUp(f.reason)).sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at)));
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!rows || rows.length === 0) return null;
  const name = (id: string | null | undefined) => staff.find(s => s.id === id)?.full_name ?? '—';
  return (
    <div className="atx-section" data-manager-followups>
      <div className="atx-section-head"><h2 className="atx-section-title flex items-center gap-1.5"><UserCheck size={16} aria-hidden="true" /> Follow-ups για υπεύθυνο ({rows.length})</h2></div>
      <ul className="atx-panel m-0 p-0 list-none">
        {rows.map(f => (
          <li key={f.id} className="atx-row">
            <button className="atx-row-main" onClick={() => openCase(f.case_id)}>
              <span className="atx-row-title">{f.reason.slice(MANAGER_FOLLOWUP_PREFIX.length).replace(/^\s*—\s*/, '') || 'Από επίσκεψη πεδίου'}</span>
              <span className="atx-row-sub">από {name(f.created_by)} · {fmtDateTime(f.due_at)}{f.assignee_id && f.assignee_id !== f.created_by ? ` · σε ${name(f.assignee_id)}` : ''}</span>
            </button>
            <span className="atx-row-act">
              <button className="atx-btn atx-btn-quiet" onClick={async () => { await completeFollowUp(f.id, f.case_id); toast('Ολοκληρώθηκε.', 'ok'); void load(); }}>Ολοκλήρωση</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
