/* Λειτουργίες: «Νέα leads με έγγραφα» — leads created with documents and routed to the default Back Office assignee
   (staged phase4/12). Back Office sees the ones assigned to them; admin/manager see all. Hidden when empty. */

import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { fmtDateTime } from '@/lib/ui';
import { fetchBackofficeLeads } from '@/lib/lead-intake';
import { leadFiles } from '@/lib/lead-files';
import { leadName } from '@/lib/work';
import type { Lead } from '@/lib/api';

export default function BackofficeLeads() {
  const { role, user } = useAuth();
  const { go } = useNav();
  const [rows, setRows] = useState<Lead[] | null>(null);
  useEffect(() => {
    if (!user) return;
    void fetchBackofficeLeads(role === 'back_office' ? user.id : null).then(r => setRows(role === 'back_office' ? r : r.filter(l => l.assigned_to_user_id && l.assigned_to_user_id !== l.created_by_user_id)));
  }, [role, user]);
  if (!rows || rows.length === 0) return null;
  return (
    <div className="atx-section" data-bo-leads>
      <div className="atx-section-head"><h2 className="atx-section-title flex items-center gap-1.5"><FileText size={16} aria-hidden="true" /> Νέα leads με έγγραφα ({rows.length})</h2></div>
      <ul className="atx-panel m-0 p-0 list-none">
        {rows.map(l => (
          <li key={l.id} className="atx-row">
            <button className="atx-row-main" onClick={() => go('leads', { lead: l.id })}>
              <span className="atx-row-title">{leadName(l)}</span>
              <span className="atx-row-sub">{leadFiles(l.attached_files).length} έγγραφα · από {l.created_by?.full_name ?? '—'} · {fmtDateTime(l.created_at)}{role !== 'back_office' && l.assigned_to?.full_name ? ` · σε ${l.assigned_to.full_name}` : ''}</span>
            </button>
            <span className="atx-row-act"><button className="atx-btn atx-btn-quiet" onClick={() => go('leads', { lead: l.id })}>Άνοιγμα</button></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
