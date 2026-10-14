/* One row of work, used by both Home and My Work. Only real, connected actions are offered:
   - follow-up: Ολοκλήρωση (completeFollowUp), Αναβολή (snoozeFollowUp → tomorrow 09:00), open the case
   - lead:      open the Leads screen (a per-lead deep link arrives with the Lead Details increment), `tel:` link
   - case:      open the case */

import { useState } from 'react';
import { Briefcase, CalendarClock, Phone, UserPlus } from 'lucide-react';
import { completeFollowUp, snoozeFollowUp } from '@/lib/api';
import { useNav } from '@/lib/nav';
import { useToast } from '@/lib/toast';
import type { WorkItem } from '@/lib/work';
import { formatWhen } from '@/lib/work-format';

const ICON = { followup: CalendarClock, lead: UserPlus, case: Briefcase } as const;

function tomorrowNine(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export function WorkRow({ item, now, onChanged }: { item: WorkItem; now: number; onChanged: () => Promise<WorkItem[]> }) {
  const { go, openCase } = useNav();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const Icon = ICON[item.kind];

  const open = () => {
    if (item.caseId) openCase(item.caseId);
    else go('leads');
  };

  const mutate = async (fn: () => Promise<void>, ok: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      // The api helpers swallow errors, so success is only claimed if the item really left the list.
      const fresh = await onChanged();
      if (fresh.some(x => x.key === item.key)) toast('Η ενέργεια δεν ολοκληρώθηκε. Δοκιμάστε ξανά.', 'bad');
      else toast(ok, 'ok');
    } catch {
      toast('Η ενέργεια δεν ολοκληρώθηκε. Δοκιμάστε ξανά.', 'bad');
    } finally {
      setBusy(false);
    }
  };

  const primary = () => {
    if (item.primary.action === 'complete-followup' && item.followUpId) {
      void mutate(() => completeFollowUp(item.followUpId!, item.caseId), 'Το follow-up ολοκληρώθηκε');
    } else open();
  };

  return (
    <li className={`atx-row ${item.bucket === 'overdue' ? 'is-overdue' : ''}`}>
      <span className="atx-icon" aria-hidden="true"><Icon size={17} /></span>
      <button type="button" className="atx-row-main" onClick={open} aria-label={`${item.title} — άνοιγμα`}>
        <span className="atx-row-title">{item.title}</span>
        <span className="atx-row-sub">{item.subtitle}</span>
        <span className="atx-row-when-inline">{formatWhen(item, now)}</span>
      </button>
      <span className="atx-row-when">{formatWhen(item, now)}</span>
      {item.kind === 'followup' && <span className={`atx-tag t-${item.statusTone}`}>{item.statusLabel}</span>}
      <span className="atx-row-act flex items-center gap-2">
        {item.phone && (
          <a className="atx-btn atx-btn-quiet atx-btn-icon inline-flex items-center justify-center" href={`tel:${item.phone.replace(/\s+/g, '')}`}
            aria-label={`Κλήση ${item.title}`} title="Κλήση">
            <Phone size={15} aria-hidden="true" />
          </a>
        )}
        {item.kind === 'followup' && item.followUpId && (
          <button type="button" className="atx-btn atx-btn-quiet" disabled={busy}
            onClick={() => void mutate(() => snoozeFollowUp(item.followUpId!, tomorrowNine()), 'Αναβλήθηκε για αύριο στις 09:00')}>
            Αναβολή
          </button>
        )}
        <button type="button" className="atx-btn atx-btn-primary" disabled={busy} onClick={primary}>
          {busy ? '…' : item.primary.label}
        </button>
      </span>
    </li>
  );
}
