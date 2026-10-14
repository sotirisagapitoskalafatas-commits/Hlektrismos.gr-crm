/* Πελάτες — searchable list; a customer opens the full Customer details screen (CustomerDetail), where editing,
   cases, documents and history live. Deep link: go('customers', { customer: id }). */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search, Users } from 'lucide-react';
import { useNav } from '@/lib/nav';
import { fetchCases, fetchCustomers } from '@/lib/api';
import { TrashButton } from '@/components/trash/TrashControls';
import type { Case, Customer } from '@/lib/api';
import { fmtMoney } from '@/lib/ui';
import { norm } from '@/lib/crm-assistant';
import CustomerDetail from '@/components/customers/CustomerDetail';

const ACTIVE = (k: Case) => !['completed', 'lost', 'cancelled'].includes(k.current_stage);

export default function CustomersPage() {
  const { view, go } = useNav();
  const detailId = view.filters?.customer ?? null;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [onlyActive, setOnlyActive] = useState(false);

  const load = useCallback(async () => {
    const [cs, ks] = await Promise.all([fetchCustomers(), fetchCases({ includeDone: true })]);
    setCustomers(cs);
    setCases(ks);
    setLoading(false);
  }, []);
  useEffect(() => { if (!detailId) void load(); }, [load, detailId]);

  const byCustomer = useMemo(() => {
    const m = new Map<string, Case[]>();
    for (const k of cases) if (k.customer_id) m.set(k.customer_id, [...(m.get(k.customer_id) ?? []), k]);
    return m;
  }, [cases]);

  const list = useMemo(() => {
    const t = norm(q);
    return customers
      .filter(c => !t || [c.full_name, c.phone, c.email, c.city].some(v => v && norm(v).includes(t)))
      .filter(c => !onlyActive || (byCustomer.get(c.id) ?? []).some(ACTIVE))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'el'));
  }, [customers, q, onlyActive, byCustomer]);

  if (detailId) return <CustomerDetail customerId={detailId} />;

  const withActive = customers.filter(c => (byCustomer.get(c.id) ?? []).some(ACTIVE)).length;

  return (
    <div className="atx-page" style={{ maxWidth: 1040 }}>
      <div className="atx-head">
        <h1 className="atx-title">Πελάτες</h1>
        <p className="atx-sub">{loading ? 'Φόρτωση…' : `${customers.length} πελάτες · ${withActive} με ενεργό case`}</p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 h-10 px-3 rounded-xl bg-white border border-[var(--atx-line)] flex-1 min-w-[220px] max-w-md">
          <Search size={16} className="text-[var(--atx-muted)]" aria-hidden="true" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Όνομα, τηλέφωνο, email, πόλη…" aria-label="Αναζήτηση πελάτη"
            className="flex-1 bg-transparent outline-none text-[14px]" />
        </label>
        <button className="atx-chip" aria-pressed={onlyActive} onClick={() => setOnlyActive(v => !v)}>Μόνο με ενεργό case</button>
      </div>

      <div className="atx-panel mt-4" aria-busy={loading}>
        {loading && [0, 1, 2, 3].map(i => <div key={i} className="atx-skeleton" aria-hidden="true" />)}
        {!loading && list.length === 0 && (
          <div className="atx-empty">
            <Users className="mx-auto mb-3" size={28} aria-hidden="true" />
            <strong>{customers.length === 0 ? 'Δεν υπάρχουν πελάτες ακόμη' : 'Κανένα αποτέλεσμα'}</strong>
            {customers.length === 0 ? 'Οι πελάτες δημιουργούνται όταν ένα lead μετατρέπεται σε case.' : 'Δοκιμάστε άλλη αναζήτηση ή αφαιρέστε το φίλτρο.'}
          </div>
        )}
        {!loading && list.length > 0 && (
          <ul className="m-0 p-0 list-none">
            {list.map(c => {
              const ks = byCustomer.get(c.id) ?? [];
              const active = ks.filter(ACTIVE).length;
              const known = ks.reduce((s, k) => s + (k.value > 0 ? k.value : 0), 0);
              const initials = c.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
              return (
                <li key={c.id} className="atx-row">
                  <span className="atx-icon" style={{ borderRadius: 999, background: 'var(--atx-blue-soft)', color: 'var(--atx-blue)', fontWeight: 700, fontSize: 12 }} aria-hidden="true">{initials || '?'}</span>
                  <button className="atx-row-main" onClick={() => go('customers', { customer: c.id })}>
                    <span className="atx-row-title">{c.full_name}{c.city ? <span className="font-normal text-[var(--atx-muted)]"> · {c.city}</span> : null}</span>
                    <span className="atx-row-sub">{[c.phone, c.email].filter(Boolean).join(' · ') || 'Χωρίς στοιχεία επικοινωνίας'}</span>
                  </button>
                  <span className="atx-row-when">
                    {ks.length === 0 ? 'Χωρίς case' : `${active} ενεργά / ${ks.length}`}
                    {known > 0 && <span className="block">{fmtMoney(known)}</span>}
                  </span>
                  <TrashButton compact type="customer" id={c.id} name={c.full_name}
                    onTrashed={async () => { const list = await fetchCustomers(); setCustomers(list); return !list.some(x => x.id === c.id); }} />
                  <ChevronRight size={16} className="text-[var(--atx-faint)] shrink-0" aria-hidden="true" />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
