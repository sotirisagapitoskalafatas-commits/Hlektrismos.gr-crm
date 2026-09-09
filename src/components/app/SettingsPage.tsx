import { useEffect, useState } from 'react';
import { PERMS, ROLES, roleLabel } from '@/lib/roles';
import { StaffProfile, fetchStaff } from '@/lib/api';
import { Card, CardHeader, Micro, Pill, Spinner, fmtDate } from '@/lib/ui';
import { Database, FolderLock, KeyRound, ShieldCheck, UsersRound } from 'lucide-react';

export default function SettingsPage() {
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await fetchStaff();
      if (!alive) return;
      setStaff(list);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <Micro tone="brand">Διαχείριση</Micro>
        <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">Workspace · Διαχείριση</h2>
      </div>

      {/* System info */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SysCard icon={Database} micro="Βάση δεδομένων" title="Postgres + RLS" sub="Όλα τα tables προστατεύονται ανά ρόλο." />
        <SysCard icon={FolderLock} micro="Αρχεία" title="hlektrismos_docs" sub="Ιδιωτικό bucket μόνο για staff." />
        <SysCard icon={KeyRound} micro="Δημόσια υποβολή" title="1 whitelist RPC" sub="Τα leads εισέρχονται μόνο μέσω RPC." />
        <SysCard icon={ShieldCheck} micro="Ασφάλεια" title="Role-check policies" sub="Εσωτερικά helpers is_staff / is_role." />
      </div>

      {/* Team */}
      <Card>
        <CardHeader micro="Ομάδα" title="Χρήστες με πρόσβαση" className="px-5 pt-5"
          action={loading ? <Spinner /> : <Pill tone="gray">{staff.length}</Pill>} />
        {!loading && staff.length === 0 && (
          <p className="px-5 pb-5 text-xs text-ink/40">Δεν βρέθηκαν προφίλ — οι λογαριασμοί δημιουργούνται κατά την πρώτη σύνδεση.</p>
        )}
        <div className="px-2.5 pb-3 divide-y divide-line">
          {staff.map(p => (
            <div key={p.id} className="px-2.5 py-2.5 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-brand-100 text-brand-600 flex items-center justify-center text-[11px] font-bold shrink-0">
                {p.full_name.slice(0, 1).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-ink truncate">{p.full_name}</div>
                <div className="text-xs text-ink/45 truncate">{p.phone || 'χωρίς τηλέφωνο'}{p.created_at ? ` · εγγραφή ${fmtDate(p.created_at)}` : ''}</div>
              </div>
              <Pill tone="gray">{roleLabel(p.role)}</Pill>
            </div>
          ))}
        </div>
        <p className="px-5 pb-4 text-[11px] text-ink/40 flex items-center gap-1.5">
          <UsersRound className="w-3 h-3" />
          Οι ρόλοι ενημερώνονται από τον διαχειριστή μέσω της βάσης (profiles.role).
        </p>
      </Card>

      {/* Roles & permissions */}
      <Card>
        <CardHeader micro="Μήτρα δικαιωμάτων" title="Ρόλοι & Δικαιώματα" className="mb-3" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {ROLES.map(r => {
            const perms = PERMS[r.id];
            return (
              <div key={r.id} className="rounded-xl border border-line bg-white px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink">{r.label}</span>
                  <span className="micro text-ink/40">{r.short}</span>
                </div>
                <div className="text-[11px] text-ink/45 mt-0.5 mb-2">{r.hint}</div>
                <div className="flex flex-wrap gap-1">
                  {perms.slice(0, 6).map(p => (
                    <span key={p} className="pill bg-ink/5 text-ink/50">{p}</span>
                  ))}
                  {perms.length > 6 && <span className="pill bg-ink/5 text-ink/50">+{perms.length - 6}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function SysCard({ icon: Icon, micro, title, sub }: { icon: typeof Database; micro: string; title: string; sub: string }) {
  return (
    <Card>
      <Icon className="w-5 h-5 text-brand-600" />
      <div className="mt-2 text-[13px] font-semibold text-ink">{title}</div>
      <Micro className="mt-0.5 w-[13px]">{micro}</Micro>
      <div className="text-xs text-ink/40 mt-2">{sub}</div>
    </Card>
  );
}