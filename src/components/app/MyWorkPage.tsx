/* Η εργασία μου — one prioritized list of what needs the signed-in employee, built by lib/work.ts from real
   follow-ups, leads and cases. Same data and definitions as Αρχική, so the numbers always agree.
   Authorization is NOT decided here: the lists show whatever the database returns to this user. */

import { useMemo, useState } from 'react';
import { Inbox } from 'lucide-react';
import { useNav } from '@/lib/nav';
import { useWorkData } from '@/lib/useWorkData';
import type { Bucket, WorkItem, WorkKind } from '@/lib/work';
import { WorkRow } from '@/components/work/WorkRow';

type Tab = 'today' | 'upcoming' | 'all';
type Kind = 'all' | WorkKind;
type Sort = 'priority' | 'oldest';

const TAB_OF: Record<Bucket, Tab> = { overdue: 'today', today: 'today', now: 'today', upcoming: 'upcoming' };
const SECTION: Record<Bucket, string> = { overdue: 'Εκπρόθεσμα', today: 'Σήμερα', now: 'Έτοιμα για ενέργεια', upcoming: 'Προσεχώς' };
const KIND_LABEL: Record<Kind, string> = { all: 'Όλα', followup: 'Follow-ups', lead: 'Leads', case: 'Cases' };

const asTab = (v?: string): Tab => (v === 'upcoming' || v === 'all' ? v : 'today');
const asKind = (v?: string): Kind => (v === 'followup' || v === 'lead' || v === 'case' ? v : 'all');

export default function MyWorkPage() {
  const { view } = useNav();
  const { loading, error, items, now, reload } = useWorkData();
  const [tab, setTab] = useState<Tab>(() => asTab(view.filters?.tab));
  const [kind, setKind] = useState<Kind>(() => asKind(view.filters?.kind));
  const [sort, setSort] = useState<Sort>('priority');

  const inTab = useMemo(() => items.filter(i => tab === 'all' || TAB_OF[i.bucket] === tab), [items, tab]);
  const counts = useMemo(() => {
    const c: Record<Kind, number> = { all: inTab.length, followup: 0, lead: 0, case: 0 };
    for (const i of inTab) c[i.kind]++;
    return c;
  }, [inTab]);
  const tabCount = (t: Tab) => items.filter(i => t === 'all' || TAB_OF[i.bucket] === t).length;

  const visible = useMemo(() => {
    const list = inTab.filter(i => kind === 'all' || i.kind === kind);
    if (sort === 'priority') return list;
    const key = (i: WorkItem) => i.due ?? i.since ?? 0;
    return [...list].sort((a, b) => key(a) - key(b));
  }, [inTab, kind, sort]);

  // Section headers only make sense in the priority order.
  const sections = useMemo(() => {
    if (sort !== 'priority') return [{ label: '', rows: visible }];
    const out: { label: string; rows: WorkItem[] }[] = [];
    for (const row of visible) {
      const label = SECTION[row.bucket];
      const last = out[out.length - 1];
      if (last && last.label === label) last.rows.push(row);
      else out.push({ label, rows: [row] });
    }
    return out;
  }, [visible, sort]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'today', label: 'Σήμερα' }, { id: 'upcoming', label: 'Προσεχώς' }, { id: 'all', label: 'Όλα' },
  ];

  return (
    <div className="atx-page">
      <div className="atx-head">
        <h1 className="atx-title">Η εργασία μου</h1>
        <p className="atx-sub">Ό,τι χρειάζεται τη δική σας ενέργεια, με σειρά προτεραιότητας.</p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 justify-between">
        <div className="atx-tabs" role="tablist" aria-label="Χρονικό εύρος">
          {tabs.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className="atx-tab" onClick={() => setTab(t.id)}>
              {t.label}{!loading && <span className="ml-1.5 opacity-60">{tabCount(t.id)}</span>}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[13px] text-[var(--atx-muted)]">
          Ταξινόμηση
          <select className="atx-chip !pr-2" value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Ταξινόμηση">
            <option value="priority">Προτεραιότητα</option>
            <option value="oldest">Παλαιότερα πρώτα</option>
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Τύπος εργασίας">
        {(Object.keys(KIND_LABEL) as Kind[]).map(k => (
          <button key={k} className="atx-chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {KIND_LABEL[k]}{!loading && <span className="ml-1.5 opacity-60">{counts[k]}</span>}
          </button>
        ))}
      </div>

      {error && (
        <div className="atx-notice mt-4 flex items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button className="atx-btn atx-btn-quiet" onClick={() => void reload()}>Δοκιμή ξανά</button>
        </div>
      )}

      <div className="atx-panel mt-5" aria-busy={loading}>
        {loading && [0, 1, 2, 3].map(i => <div key={i} className="atx-skeleton" aria-hidden="true" />)}

        {!loading && visible.length === 0 && (
          <div className="atx-empty">
            <Inbox className="mx-auto mb-3" size={28} aria-hidden="true" />
            <strong>{items.length === 0 ? 'Δεν υπάρχει εργασία για εσάς' : 'Τίποτα σε αυτή την προβολή'}</strong>
            {items.length === 0
              ? 'Όταν σας ανατεθούν leads, cases ή follow-ups, θα εμφανιστούν εδώ.'
              : 'Αλλάξτε το χρονικό εύρος ή τον τύπο εργασίας για να δείτε τα υπόλοιπα.'}
          </div>
        )}

        {!loading && sections.map((s, si) => (
          <div role="region" key={s.label || si} aria-label={s.label || undefined}>
            {s.label && (
              <h2 className="px-4 pt-3 pb-1.5 text-[12.5px] font-semibold text-[var(--atx-faint)]" style={si > 0 ? { borderTop: '1px solid var(--atx-line)' } : undefined}>
                {s.label} · {s.rows.length}
              </h2>
            )}
            <ul className="m-0 p-0 list-none">
              {s.rows.map(row => <WorkRow key={row.key} item={row} now={now} onChanged={reload} />)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
