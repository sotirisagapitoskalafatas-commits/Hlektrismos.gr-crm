import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { ROLES, roleLabel } from '@/lib/roles';
import { updateProfile } from '@/lib/api';
import { Btn, Card, CardHeader, Field, Micro, Pill } from '@/lib/ui';
import { Check, LogOut, Mail, Phone as PhoneIcon, ShieldCheck, UserCog } from 'lucide-react';

export default function AccountPage() {
  const { user, profile, role, refreshProfile, signOut } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const realRole = profile?.role ?? null;
  const sim = role !== realRole;

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    const ok = await updateProfile(profile.id, {
      full_name: fullName.trim() || profile.full_name,
      phone: phone.trim() || null,
    });
    setSaving(false);
    if (ok) {
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Micro tone="brand">Λογαριασμός</Micro>
        <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">Προφίλ & Λογαριασμός</h2>
      </div>

      {/* Identity */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-brand-100 text-brand-600 flex items-center justify-center text-[18px] font-bold shrink-0">
            {(profile?.full_name ?? 'Δ').slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[16px] font-semibold text-ink truncate">{profile?.full_name ?? 'Χρήστης'}</div>
            <div className="text-xs text-ink/50 truncate">{user?.email ?? '—'}</div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Pill tone={sim ? 'amber' : 'green'}>{sim ? `sim · ${roleLabel(role)}` : roleLabel(role)}</Pill>
            <span className="micro text-ink/40">{ROLES.find(r => r.id === role)?.hint}</span>
          </div>
        </div>
      </Card>

      {/* Editable details */}
      <Card>
        <CardHeader micro="Στοιχεία προφίλ" title="Επεξεργασία" className="mb-3" />
        <div className="space-y-4">
          <Field label="Ονοματεπώνυμο">
            <input value={fullName} onChange={e => setFullName(e.target.value)}
              className="w-full text-[13px] border border-line rounded-lg px-3 py-2 text-ink bg-white outline-none focus:border-brand-500"
              placeholder="Το ονοματεπώνυμό σας" />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Email">
              <div className="flex items-center gap-2 text-[13px] border border-line rounded-lg px-3 py-2 text-ink/60 bg-ink/[0.02]">
                <Mail className="w-3.5 h-3.5 text-ink/40" />
                <span className="truncate">{user?.email ?? '—'}</span>
              </div>
            </Field>
            <Field label="Τηλέφωνο">
              <div className="flex items-center gap-2 border border-line rounded-lg px-3 py-2 bg-white focus-within:border-brand-500">
                <PhoneIcon className="w-3.5 h-3.5 text-ink/40" />
                <input value={phone} onChange={e => setPhone(e.target.value)}
                  className="flex-1 text-[13px] text-ink bg-transparent outline-none" placeholder="+30…" />
              </div>
            </Field>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-ink/45 bg-ink/[0.03] rounded-lg px-3 py-2">
            <ShieldCheck className="w-3.5 h-3.5 text-ok-600 shrink-0" />
            Ο ρόλος σας αποδίδεται από τον διαχειριστή και δεν μπορεί να αλλάξει από εδώ.
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Btn onClick={save} disabled={saving || !profile || (fullName.trim() === profile?.full_name && phone.trim() === (profile?.phone ?? ''))}>
              {saving ? 'Αποθήκευση…' : saved ? (
                <><Check className="w-3.5 h-3.5" /> Αποθηκεύτηκε</>
              ) : 'Αποθήκευση'}
            </Btn>
            <Btn variant="danger" onClick={() => { signOut(); window.location.hash = '/'; }}>
              <LogOut className="w-3.5 h-3.5" /> Αποσύνδεση
            </Btn>
          </div>
        </div>
      </Card>

      {/* Role info */}
      <Card>
        <CardHeader micro="Επίθεση ρόλου" title="Ο ρόλος σας" className="mb-3" />
        <div className="grid sm:grid-cols-2 gap-2">
          {ROLES.map(r => (
            <div key={r.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${r.id === role ? 'border-brand-300 bg-brand-50/50' : 'border-line bg-white'}`}>
              <UserCog className={`w-4 h-4 shrink-0 ${r.id === role ? 'text-brand-600' : 'text-ink/30'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-ink">{r.label} <span className="micro text-ink/40">{r.short}</span></div>
                <div className="text-[11px] text-ink/45 truncate">{r.hint}</div>
              </div>
              {r.id === role && <Pill tone="blue">τρέχων</Pill>}
            </div>
          ))}
        </div>
      </Card>

      {/* Danger zone */}
      <Card className="border-bad-200">
        <CardHeader micro="Disconnect" title="Σύνδεση λογαριασμού" className="mb-3" />
        <p className="text-xs text-ink/50 mb-3">Η αποσύνδεση σας επιστρέφει στην δημόσια σελίδα της Hlektrismos.</p>
        <Btn variant="outline" onClick={() => { signOut(); window.location.hash = '/'; }}>
          <LogOut className="w-3.5 h-3.5" /> Αποσύνδεση από το CRM
        </Btn>
      </Card>
    </div>
  );
}