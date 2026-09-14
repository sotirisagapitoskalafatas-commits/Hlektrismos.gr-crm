import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { SERVICES, can } from '@/lib/roles';
import { Case, Customer, fetchCases, fetchCustomers, getPosition, updateCustomer } from '@/lib/api';
import { Btn, Card, CardHeader, EmptyState, Field, Micro, Pill, Spinner, StagePill, fmtDateTime, fmtMoney } from '@/lib/ui';
import { ArrowUpRight, Briefcase as BriefcaseIcon, Check, Crosshair, Globe as GlobeIcon, MapPin, Pencil, Phone, Search, Send as SendIcon, UserRound, Users, X } from 'lucide-react';

export default function CustomersPage() {
  const { role } = useAuth();
  const { openCase } = useNav();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: '', phone: '', email: '', address: '', city: '', postal_code: '', lat: '', lng: '', notes: '',
  });

  const canEdit = can(role, 'edit_case');

  const openEdit = useCallback((c: Customer) => {
    setEditing(true);
    setEditForm({
      full_name: c.full_name ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      city: c.city ?? '',
      postal_code: c.postal_code ?? '',
      lat: c.lat ?? '',
      lng: c.lng ?? '',
      notes: c.notes ?? '',
    });
  }, []);

  const fillMyLocation = async () => {
    setLocating(true);
    const coords = await getPosition();
    setLocating(false);
    if (coords) setEditForm(f => ({ ...f, lat: String(coords.lat), lng: String(coords.lng) }));
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    const ok = await updateCustomer(id, {
      full_name: editForm.full_name?.trim() || 'Χωρίς όνομα',
      phone: editForm.phone || null,
      email: editForm.email || null,
      address: editForm.address || null,
      city: editForm.city || null,
      postal_code: editForm.postal_code || null,
      lat: editForm.lat === '' ? null : Number(editForm.lat),
      lng: editForm.lng === '' ? null : Number(editForm.lng),
      notes: editForm.notes ?? '',
    });
    setSaving(false);
    if (ok) { setEditing(false); await load(); }
  };

  const load = useCallback(async () => {
    const [cs, ks] = await Promise.all([fetchCustomers(), fetchCases({ includeDone: true, search: '' })]);
    setCustomers(cs);
    setCases(ks);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const hay = q.toLowerCase().trim();

  const filtered = useMemo(() => {
    let list = customers;
    if (hay) {
      list = list.filter(c =>
        c.full_name.toLowerCase().includes(hay) ||
        (c.phone ?? '').includes(hay) ||
        (c.email ?? '').toLowerCase().includes(hay) ||
        (c.city ?? '').toLowerCase().includes(hay),
      );
    }
    return [...list].sort((a, b) => a.full_name.localeCompare(b.full_name, 'el'));
  }, [customers, hay]);

  const casesFor = (id: string) => cases.filter(k => k.customer_id === id);

  const selected = customers.find(c => c.id === selectedId) ?? null;
  const selectedCases = selected ? casesFor(selected.id).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)) : [];
  const totalValue = cases.reduce((s, k) => s + (k.value || 0), 0);

  const cities = [...new Set(customers.map(c => c.city).filter(Boolean))].length;

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Spinner /></div>;
  }

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Micro tone="brand">Customers</Micro>
          <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">Μητρώο Πελατών</h2>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-ink/50">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-500" /> Δραστήριοι λογαριασμοί</span>
        </div>
      </div>

      {/* Vitals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { micro: 'Πελάτες', value: String(customers.length), sub: `${cities} πόλεις`, tone: 'text-ink' as const },
          { micro: 'Ενεργά Cases', value: String(cases.filter(k => k.current_stage !== 'completed' && k.current_stage !== 'lost' && k.current_stage !== 'cancelled').length), sub: `${cases.filter(k => k.current_stage === 'completed').length} ολοκληρωμένα`, tone: 'text-ink' as const },
          { micro: 'Αξία Πελατολογίου', value: fmtMoney(totalValue), sub: 'σύνολο ανοιχτών & κλειστών', tone: 'text-ink' as const },
          { micro: 'Με γεωγραφία', value: String(customers.filter(c => c.lat != null && c.lng != null).length), sub: 'διαθέσιμα για χάρτη', tone: 'text-ink' as const },
        ].map(v => (
          <Card key={v.micro}>
            <Micro>{v.micro}</Micro>
            <div className={`mt-2 text-[26px] font-semibold tracking-tight leading-none ${v.tone}`}>{v.value}</div>
            <div className="text-xs text-ink/40 mt-2">{v.sub}</div>
          </Card>
        ))}
      </div>

      <Card className="!p-0" pad={false}>
        <CardHeader micro="Αναζήτηση" title="Πελάτες"
          action={
            <div className="flex items-center gap-2 border border-line rounded-lg px-2.5 py-1.5 bg-white">
              <Search className="w-3.5 h-3.5 text-ink/40" />
              <input value={q} onChange={e => setQ(e.target.value)}
                placeholder="Όνομα, τηλέφωνο, email, πόλη…"
                className="w-56 bg-transparent outline-none text-[13px] text-ink placeholder:text-ink/35"
                aria-label="Αναζήτηση πελάτη" />
            </div>
          } />
        {!loading && filtered.length === 0 && (
          <EmptyState icon={Users} title="Κανένας πελάτης" hint="Οι πελάτες δημιουργούνται αυτόματα κατά τη μετατροπή lead σε case." />
        )}
        {filtered.length > 0 && (
          <div className="grid lg:grid-cols-5 divide-y lg:divide-y-0 divide-line lg:divide-x">
            {/* Customer list */}
            <div className="lg:col-span-3 divide-y divide-line max-h-[560px] overflow-y-auto">
              {filtered.map(c => {
                const ks = casesFor(c.id);
                const value = ks.reduce((s, k) => s + (k.value || 0), 0);
                const active = ks.filter(k => k.current_stage !== 'completed' && k.current_stage !== 'lost' && k.current_stage !== 'cancelled').length;
                return (
                  <button key={c.id} onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-ink/[0.02] transition-colors ${selectedId === c.id ? 'bg-brand-50/40' : ''}`}>
                    <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center text-[13px] font-bold shrink-0">
                      {c.full_name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium text-ink truncate">
                        {c.full_name}
                        {c.city && <span className="text-ink/40 font-normal"> · {c.city}</span>}
                      </span>
                      <span className="block text-xs text-ink/45 truncate">
                        {c.phone || 'χωρίς τηλέφωνο'}
                        {(c.email ? ` · ${c.email}` : '')}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-xs font-semibold text-ink">{fmtMoney(value)}</span>
                      <span className="text-[11px] text-ink/45">{ks.length} cases{active > 0 ? ` · ${active} ενεργά` : ''}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Detail panel */}
            <div className="lg:col-span-2">
              {!selected && (
                <div className="flex items-center justify-center h-full min-h-[280px] px-6">
                  <div className="text-center">
                    <UserRound className="w-8 h-8 text-ink/20 mx-auto mb-2" />
                    <p className="text-xs text-ink/40">Επιλέξτε έναν πελάτη για να δείτε το προφίλ και τα cases του.</p>
                  </div>
                </div>
              )}
              {selected && (
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-brand-100 text-brand-600 flex items-center justify-center text-[16px] font-bold shrink-0">
                      {selected.full_name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-semibold text-ink truncate">{selected.full_name}</div>
                      <div className="text-xs text-ink/50 truncate">{selected.city ?? '—'}{selected.postal_code ? ` ${selected.postal_code}` : ''}</div>
                    </div>
                    <Pill tone="gray">{fmtDateTime(selected.created_at)}</Pill>
                    {canEdit && (
                      editing
                        ? <button onClick={() => setEditing(false)} title="Ακύρωση" className="p-1.5 rounded-lg border border-line bg-white text-ink/60 hover:text-ink transition-colors"><X className="w-3.5 h-3.5" /></button>
                        : <button onClick={() => openEdit(selected)} title="Επεξεργασία" className="p-1.5 rounded-lg border border-line bg-white text-ink/60 hover:text-ink transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                    )}
                  </div>

                  {editing ? (
                    <div className="mt-4 space-y-2">
                      <Field label="Ονοματεπώνυμο">
                        <input className="field" value={editForm.full_name ?? ''} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
                      </Field>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Field label="Τηλέφωνο">
                          <input type="tel" className="field" value={editForm.phone ?? ''} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
                        </Field>
                        <Field label="Email">
                          <input type="email" className="field" value={editForm.email ?? ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                        </Field>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Field label="Διεύθυνση">
                          <input className="field" value={editForm.address ?? ''} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} />
                        </Field>
                        <Field label="Πόλη">
                          <input className="field" value={editForm.city ?? ''} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} />
                        </Field>
                      </div>
                      <Field label="Ταχυδρομικός Κώδικας">
                        <input className="field" value={editForm.postal_code ?? ''} onChange={e => setEditForm(f => ({ ...f, postal_code: e.target.value }))} />
                      </Field>
                      <Field label="Τοποθεσία (συντεταγμένες)">
                        <div className="grid grid-cols-2 gap-2">
                          <input type="number" step="any" className="field" value={editForm.lat ?? ''} onChange={e => setEditForm(f => ({ ...f, lat: e.target.value }))} placeholder="lat" />
                          <input type="number" step="any" className="field" value={editForm.lng ?? ''} onChange={e => setEditForm(f => ({ ...f, lng: e.target.value }))} placeholder="lng" />
                        </div>
                        <button type="button" onClick={fillMyLocation} disabled={locating}
                          className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-600 hover:underline">
                          <Crosshair className="w-3.5 h-3.5" /> {locating ? 'Εντοπισμός…' : 'Χρήση τρέχουσας τοποθεσίας'}
                        </button>
                      </Field>
                      <Field label="Σημειώσεις">
                        <textarea className="field" rows={2} value={editForm.notes ?? ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                      </Field>
                      <div className="flex gap-2 pt-1">
                        <Btn onClick={() => saveEdit(selected.id)} disabled={saving || !editForm.full_name?.trim()}>
                          {saving ? <Spinner /> : <Check className="w-3.5 h-3.5" />} Αποθήκευση
                        </Btn>
                        <Btn variant="ghost" onClick={() => setEditing(false)}>Ακύρωση</Btn>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <InfoRow icon={Phone} label="Τηλέφωνο" value={selected.phone ?? '—'} />
                      <InfoRow icon={SendIcon} label="Email" value={selected.email ?? '—'} />
                      <InfoRow icon={MapPin} label="Διεύθυνση" value={selected.address ?? '—'} />
                      <InfoRow icon={GlobeIcon} label="Τοποθεσία" value={selected.lat != null && selected.lng != null ? `${selected.lat.toFixed(4)}, ${selected.lng.toFixed(4)}` : '—'} />
                    </div>
                  )}

                  {selected.notes && <p className="text-xs text-ink/50 mt-3 bg-ink/[0.03] rounded-lg px-3 py-2">{selected.notes}</p>}

                  <div className="mt-5 flex items-center justify-between">
                    <Micro>Cases ({selectedCases.length})</Micro>
                    {selectedCases.length > 0 && (
                      <span className="text-[11px] text-ink/40">σύνολο αξίας {fmtMoney(selectedCases.reduce((s, k) => s + (k.value || 0), 0))}</span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {selectedCases.length === 0 && (
                      <EmptyState icon={BriefcaseIcon} title="Κανένα case για αυτόν τον πελάτη" hint="Δημιουργήστε case μέσα από την ενότητα Cases." />
                    )}
                    {selectedCases.map(k => (
                      <button key={k.id} onClick={() => openCase(k.id)}
                        className="w-full text-left p-3 rounded-xl border border-line bg-white hover:border-ink/25 transition-colors flex items-center gap-3">
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] font-medium text-ink truncate">
                            <span className="font-mono text-ink/40 text-[11px] mr-2">{k.case_no}</span>{k.title}
                          </span>
                          <span className="block text-xs text-ink/45 truncate">
                            {SERVICES[k.service_type] ?? k.service_type} · {k.source} · {k.created_at ? fmtDateTime(k.created_at) : ''}
                          </span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-[13px] font-semibold text-ink/80">{fmtMoney(k.value)}</span>
                          <StagePill stage={k.current_stage} />
                          <ArrowUpRight className="w-3.5 h-3.5 text-ink/30" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-line bg-white px-3 py-2.5">
      <Icon className="w-4 h-4 text-ink/35 shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block micro text-ink/40">{label}</span>
        <span className="block text-[13px] text-ink truncate">{value}</span>
      </span>
    </div>
  );
}