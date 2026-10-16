/* Back Office queue (pure, unit-tested): one prioritised list instead of stage columns.
   Stages: the existing BACK_OFFICE_STAGES (signed, document_check, submitted, activation) plus `application`,
   which the activity metadata assigns to Back Office. Order: blocked/urgent first, then oldest in stage. */

import { buildChecklist } from './documents';
import { stageText } from './case-flow';

export const OPS_STAGES = ['application', 'signed', 'document_check', 'submitted', 'activation'] as const;

export interface OpsCase {
  id: string; case_no: string; title: string; current_stage: string; priority: string;
  service_type: string; property_type: string | null; case_type: string | null;
  stage_entered_at: string | null; updated_at: string; next_follow_up_at: string | null;
  next_action: string; next_action_owner_id: string | null; back_office_owner: string | null;
  customer: { full_name: string } | null;
  /** Returned for correction (phase2/07): the case waits on Inside/Field Sales, not on Back Office. */
  returned_at?: string | null;
  return_to_team?: string | null;
  /** Back Office exception (staged phase4/13); absent until applied. */
  exception_state?: string | null;
}

export const EXCEPTION_TEXT: Record<string, string> = {
  offer_declined: 'Η προσφορά απορρίφθηκε', no_response: 'Χωρίς απάντηση από τον πελάτη',
  unsigned: 'Στάλθηκε, δεν έχει υπογραφεί', provider_rejected: 'Απόρριψη από τον πάροχο',
};

/** «Από Sales»: handed over by a Νέο Sale (next action set by the field handover) or a Back Office owner already set
    while the case is still in Αίτηση / Υπογραφή. A convention over existing fields until workflows are configurable. */
export const fromSales = (c: Pick<OpsCase, 'next_action' | 'current_stage' | 'back_office_owner'>) =>
  (c.next_action ?? '').startsWith('Παραλαβή από Sales') || (['application', 'signed'].includes(c.current_stage) && !!c.back_office_owner);

/** Row subtitle: stage · case no. · time in stage · owner. Empty parts are left out (no «Αίτηση · · σήμερα»). */
export function opsRowSub(i: Pick<OpsItem, 'stageLabel' | 'caseNo' | 'daysInStage'>, owner: string): string {
  const days = i.daysInStage === 0 ? 'σήμερα στο στάδιο' : `${i.daysInStage} ${i.daysInStage === 1 ? 'ημέρα' : 'ημέρες'} στο στάδιο`;
  return [i.stageLabel, i.caseNo, days, owner].map(v => (v ?? '').trim()).filter(Boolean).join(' · ');
}

export interface OpsItem {
  id: string;
  title: string;
  caseNo: string;
  stage: string;
  stageLabel: string;
  daysInStage: number;
  blockers: string[];
  urgent: boolean;
  mine: boolean;
  ownerId: string | null;
  nextAction: string;
  /** Exception code (offer_declined, no_response, unsigned, provider_rejected); returned cases count as missing info. */
  exception: string | null;
  fromSales: boolean;
}

const DAY = 86_400_000;
const DOC_STAGES = ['application', 'signed', 'document_check', 'submitted'];

/** In the Back Office queue: Back Office stages, plus anything handed over from Sales (a «Νέο Sale» may still be in a
    sales stage); never closed cases. */
export const inOpsQueue = (c: Pick<OpsCase, 'current_stage' | 'next_action' | 'back_office_owner'>) =>
  (OPS_STAGES as readonly string[]).includes(c.current_stage) || (fromSales(c) && !['completed', 'lost', 'cancelled'].includes(c.current_stage));

export function buildOpsQueue(cases: OpsCase[], docsByCase: Record<string, { category: string; status: string }[]>, uid: string, now: number): OpsItem[] {
  return cases
    .filter(inOpsQueue)
    .map(c => {
      const since = new Date(c.stage_entered_at ?? c.updated_at).getTime();
      const blockers: string[] = [];
      if (DOC_STAGES.includes(c.current_stage)) {
        for (const i of buildChecklist(c, docsByCase[c.id] ?? [])) {
          if (i.required && i.status === 'missing') blockers.push(`Λείπει: ${i.label}`);
          if (i.required && i.status === 'rejected') blockers.push(`Απορρίφθηκε: ${i.label}`);
          if (c.current_stage === 'document_check' && i.required && i.status === 'received') blockers.push(`Προς έλεγχο: ${i.label}`);
        }
      }
      if (c.exception_state && EXCEPTION_TEXT[c.exception_state]) blockers.unshift(EXCEPTION_TEXT[c.exception_state]);
      if (c.returned_at) blockers.unshift(`Επιστράφηκε για διόρθωση σε ${c.return_to_team === 'field_sales' ? 'Field Sales' : 'Inside Sales'}`);
      if (c.next_follow_up_at && new Date(c.next_follow_up_at).getTime() < now) blockers.push('Εκπρόθεσμο follow-up');
      const ownerId = c.next_action_owner_id ?? c.back_office_owner;
      return {
        id: c.id,
        title: c.customer?.full_name ?? c.title,
        caseNo: c.case_no,
        stage: c.current_stage,
        stageLabel: stageText(c.current_stage),
        daysInStage: Number.isFinite(since) ? Math.max(0, Math.floor((now - since) / DAY)) : 0,
        blockers,
        urgent: c.priority === 'high' || c.priority === 'critical',
        mine: ownerId === uid,
        ownerId,
        nextAction: c.next_action?.trim() || '',
        exception: c.exception_state ?? (c.returned_at ? 'missing_info' : null),
        fromSales: fromSales(c),
      };
    })
    .sort((a, b) =>
      Number(b.urgent) - Number(a.urgent)
      || Number(b.blockers.length > 0) - Number(a.blockers.length > 0)
      || b.daysInStage - a.daysInStage
      || a.caseNo.localeCompare(b.caseNo));
}
