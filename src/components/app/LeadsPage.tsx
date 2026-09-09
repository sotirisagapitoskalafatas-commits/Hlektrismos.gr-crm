import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { SERVICES, can } from '@/lib/roles';
import { Lead, createCase, fetchLeads } from '@/lib/api';
import { Btn, Card, CardHeader, EmptyState, Micro, Pill, Spinner } from '@/lib/ui';
import { ArrowRight, Phone, Users } from 'lucide-react';

export default function LeadsPage() {
  const { role } = useAuth();
  const { openCase } = useNav();
  const [items, setItems] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await fetchLeads();
    setItems(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const convert = async (l: Lead) => {
    setBusyId(l.id);
    const fullName = l.full_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || l.client_name || 'Νέος πελάτης';
    const created = await createCase({
      title: `${fullName} — ${SERVICES[l.service_category ?? 'energy'] ?? l.service_category ?? 'Ενέργεια'}`,
      customer: { full_name: fullName, phone: l.phone ?? null, email: l.email ?? null },
      service_type: SERVICES[l.service_category ?? ''] ? l.service_category! : 'energy',
      source: l.source ?? 'website',
      notes: l.property_type ? `Ιδιοκτησία: ${l.property_type}` : '',
      stage: 'new',
      role,
    });
    setBusyId(null);
    if (created) openCase(created.id);
  };

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Micro tone="brand">CRM</Micro>
          <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">Leads</h2>
        </div>
        <Pill tone="gray">{items.length} εγγραφές</Pill>
      </div>

      <Card className="!p-0" pad={false}>
        <CardHeader micro="Inbox νέων αιτημάτων" title="Νεοεισερχόμενα" className="px-5 pt-5" />
        {loading && <div className="flex items-center justify-center py-16"><Spinner /></div>}
        {!loading && items.length === 0 && (
          <EmptyState icon={Users} title="Καμία εγγραφή lead" hint="Τα leads φθάνουν από την ιστοσελίδα hlektrismos.gr. Εάν βλέπετε δεδομένα εκεί, ελέγξτε τα δικαιώματα (RLS) του πίνακα." />
        )}
        {!loading && items.length > 0 && (
          <div className="divide-y divide-line">
            {items.map(l => {
              const name = l.full_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || l.client_name || '—';
              return (
                <div key={l.id} className="px-5 py-3 flex items-center gap-3 flex-wrap hover:bg-ink/[0.02]">
                  <span className="w-8 h-8 rounded-lg bg-ink/5 flex items-center justify-center shrink-0">
                    <Phone className="w-3.5 h-3.5 text-ink/45" />
                  </span>
                  <div className="flex-1 min-w-[160px]">
                    <div className="text-[13px] font-medium text-ink">{name}</div>
                    <div className="text-xs text-ink/45">
                      {l.phone || 'χωρίς τηλέφωνο'}
                      {(l.email ? ` · ${l.email}` : '')}
                      {l.property_type ? ` · ${l.property_type}` : ''}
                    </div>
                  </div>
                  <Pill tone="gray">{SERVICES[l.service_category ?? ''] ?? l.service_category ?? 'Ενέργεια'}</Pill>
                  <span className="text-xs text-ink/40">{l.created_at ? new Date(l.created_at).toLocaleDateString('el-GR', { day: '2-digit', month: 'short' }) : ''}</span>
                  {can(role, 'create_case') && (
                    <Btn variant="outline" onClick={() => convert(l)} disabled={busyId === l.id}>
                      {busyId === l.id ? <Spinner /> : <ArrowRight className="w-3.5 h-3.5" />} Μετατροπή σε Case
                    </Btn>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}