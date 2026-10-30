// «Προσαρμογή CRM»: Προφίλ (account), Εμφάνιση (preferences) and Αρχική σελίδα (homelayout) share this page;
// the settings sidebar picks the section. Everything the old Account and Preferences pages offered is kept.
import { useRef, useState } from 'react';
import { Check, FlaskConical, LayoutDashboard, LogOut, Mail, Navigation, Phone as PhoneIcon, RotateCcw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { ROLES, accessGroupLabel } from '@/lib/roles';
import { updateProfile } from '@/lib/api';
import { Btn, Card, CardHeader, Field, Micro, Pill } from '@/lib/ui';
import { THEMES } from '@/lib/theme';
import { usePreferences } from '@/lib/preferences';
import { checkAvatarFile, cropToAvatarBlob, forgetAvatar, removeAvatar, uploadAvatar } from '@/lib/avatar';
import { getNavigationPreference, setNavigationPreference, NAV_APP_OPTIONS, navigationAppLabel } from '@/lib/navigation/external-maps';
import type { NavigationApp } from '@/lib/navigation/external-maps';
import { labsEnabled, setLabsEnabled } from '@/lib/labs';
import ShellAvatar from '@/components/shell/ShellAvatar';

export type CustomizeSection = 'profile' | 'appearance' | 'home';

const TITLES: Record<CustomizeSection, { micro: string; title: string; lead: string }> = {
  profile: { micro: 'Ο λογαριασμός μου', title: 'Προφίλ', lead: 'Το όνομα και η φωτογραφία σας, όπως τα βλέπουν οι συνάδελφοί σας.' },
  appearance: { micro: 'Προσαρμογή CRM', title: 'Εμφάνιση', lead: 'Επιλέξτε χρώματα και πλαϊνή μπάρα. Οι αλλαγές εφαρμόζονται αμέσως και σας ακολουθούν σε κάθε συσκευή.' },
  home: { micro: 'Προσαρμογή CRM', title: 'Αρχική σελίδα', lead: 'Διαλέξτε ποια κουτιά βλέπετε στην αρχική και σε ποιο μέγεθος.' },
};

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${checked ? 'bg-brand-500' : 'bg-ink/20'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function SaveNote() {
  const { remote, saving, saveFailed } = usePreferences();
  const text = saveFailed ? 'Δεν αποθηκεύτηκε ακόμη στο λογαριασμό σας· θα ξαναδοκιμάσουμε.'
    : saving ? 'Αποθήκευση…'
    : remote === 'unavailable' ? 'Οι επιλογές αποθηκεύονται σε αυτόν τον browser.'
    : 'Οι αλλαγές αποθηκεύονται αυτόματα.';
  return <p className="text-[11px] text-ink/45 mt-3" role="status">{text}</p>;
}

/* ───────── Προφίλ ───────── */
function ProfileSection() {
  const { user, profile, preview, refreshProfile, signOut } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const realRole = profile?.role ?? null; // always the REAL assigned role, never the presentation preview

  const dirty = !!profile && (fullName.trim() !== profile.full_name || phone.trim() !== (profile.phone ?? ''));

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    const ok = await updateProfile(profile.id, { full_name: fullName.trim() || profile.full_name, phone: phone.trim() || null });
    setSaving(false);
    if (ok) { await refreshProfile(); setSaved(true); setTimeout(() => setSaved(false), 2500); }
  };

  const onPick = async (file: File | undefined) => {
    if (!file || !profile) return;
    setPhotoMsg(null);
    const problem = checkAvatarFile(file);
    if (problem) { setPhotoMsg({ tone: 'err', text: problem }); return; }
    setPhotoBusy(true);
    try {
      const blob = await cropToAvatarBlob(file);
      const res = await uploadAvatar(profile.id, blob);
      if (!res.ok) { setPhotoMsg({ tone: 'err', text: res.message }); return; }
      if (!(await updateProfile(profile.id, { avatar_url: res.path }))) { setPhotoMsg({ tone: 'err', text: 'Η φωτογραφία ανέβηκε αλλά το προφίλ δεν ενημερώθηκε. Δοκιμάστε ξανά.' }); return; }
      forgetAvatar(res.path);
      await refreshProfile();
      setPhotoMsg({ tone: 'ok', text: 'Η φωτογραφία ενημερώθηκε.' });
    } catch {
      setPhotoMsg({ tone: 'err', text: 'Δεν ήταν δυνατή η επεξεργασία της εικόνας. Δοκιμάστε άλλο αρχείο.' });
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onRemove = async () => {
    if (!profile?.avatar_url) return;
    setPhotoBusy(true); setPhotoMsg(null);
    const path = profile.avatar_url;
    const gone = await removeAvatar(profile.id);
    const cleared = gone && await updateProfile(profile.id, { avatar_url: null });
    setPhotoBusy(false);
    if (cleared) { forgetAvatar(path); await refreshProfile(); setPhotoMsg({ tone: 'ok', text: 'Η φωτογραφία αφαιρέθηκε.' }); }
    else setPhotoMsg({ tone: 'err', text: 'Η φωτογραφία δεν αφαιρέθηκε. Δοκιμάστε ξανά.' });
  };

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-5">
          <ShellAvatar name={profile?.full_name} path={profile?.avatar_url} size={96} />
          <div className="flex-1 min-w-[200px]">
            <div className="text-[16px] font-semibold text-ink truncate">{profile?.full_name ?? 'Χρήστης'}</div>
            <div className="text-xs text-ink/50 truncate">{user?.email ?? '—'}</div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label="Επιλογή φωτογραφίας"
                onChange={(e) => void onPick(e.target.files?.[0])} />
              <Btn variant="outline" disabled={photoBusy || !profile} onClick={() => fileRef.current?.click()}>
                <Upload className="w-3.5 h-3.5" /> {photoBusy ? 'Επεξεργασία…' : 'Αλλαγή φωτογραφίας'}
              </Btn>
              {profile?.avatar_url && (
                <Btn variant="ghost" disabled={photoBusy} onClick={() => void onRemove()}><Trash2 className="w-3.5 h-3.5" /> Αφαίρεση</Btn>
              )}
            </div>
            <p className={`text-[11px] mt-2 ${photoMsg?.tone === 'err' ? 'text-danger-600' : 'text-ink/45'}`} role="status">
              {photoMsg?.text ?? 'Η φωτογραφία κόβεται σε τετράγωνο και αποθηκεύεται ιδιωτικά.'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Pill tone="blue">{realRole ? accessGroupLabel(realRole) : '—'}</Pill>
            {preview.role && <span className="micro text-warn-600">προεπισκόπηση: {accessGroupLabel(preview.role)}</span>}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader micro="Στοιχεία προφίλ" title="Επεξεργασία" className="mb-3" />
        <div className="space-y-4">
          <Field label="Ονοματεπώνυμο">
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120}
              className="w-full text-[13px] border border-line rounded-lg px-3 py-2 text-ink bg-white outline-none focus:border-brand-500"
              placeholder="Το ονοματεπώνυμό σας" />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Email">
              <div className="flex items-center gap-2 text-[13px] border border-line rounded-lg px-3 py-2 text-ink/60 bg-ink/[0.02]">
                <Mail className="w-3.5 h-3.5 text-ink/40" /><span className="truncate">{user?.email ?? '—'}</span>
              </div>
            </Field>
            <Field label="Τηλέφωνο">
              <div className="flex items-center gap-2 border border-line rounded-lg px-3 py-2 bg-white focus-within:border-brand-500">
                <PhoneIcon className="w-3.5 h-3.5 text-ink/40" />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className="flex-1 text-[13px] text-ink bg-transparent outline-none" placeholder="+30…" />
              </div>
            </Field>
          </div>
          <Field label="Ρόλος">
            <div className="flex flex-wrap items-center gap-2 text-[13px] border border-line rounded-lg px-3 py-2 text-ink/70 bg-ink/[0.02]" aria-readonly="true">
              <ShieldCheck className="w-3.5 h-3.5 text-ink/40" />
              <span>{realRole ? accessGroupLabel(realRole) : '—'}</span>
              <span className="text-ink/40">· {ROLES.find((r) => r.id === realRole)?.hint}</span>
              <span className="ml-auto text-[11px] text-ink/45">Ορίζεται από τον διαχειριστή</span>
            </div>
          </Field>
          <div className="flex items-center gap-2 pt-1">
            <Btn onClick={() => void save()} disabled={saving || !dirty}>
              {saving ? 'Αποθήκευση…' : saved ? (<><Check className="w-3.5 h-3.5" /> Αποθηκεύτηκε</>) : 'Αποθήκευση'}
            </Btn>
            <Btn variant="danger" onClick={() => { void signOut(); window.location.hash = '/'; }}>
              <LogOut className="w-3.5 h-3.5" /> Αποσύνδεση
            </Btn>
          </div>
        </div>
      </Card>
    </>
  );
}

/* ───────── Εμφάνιση ───────── */
function ThemeCard({ t, selected, onPick }: { t: (typeof THEMES)[number]; selected: boolean; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} aria-pressed={selected} aria-label={`Θέμα ${t.name}`}
      className={`ui-lift text-left rounded-2xl border p-2.5 bg-white transition-shadow ${selected ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-line hover:border-ink/25'}`}>
      <span aria-hidden="true" className="block rounded-xl overflow-hidden border border-line/60" style={{ background: '#f4f6fb' }}>
        <span className="block h-4 px-2 flex items-center gap-1" style={{ background: t.top }}>
          <span className="w-6 h-1.5 rounded-full" style={{ background: t.accent }} />
          <span className="w-3 h-1.5 rounded-full" style={{ background: t.accent2 }} />
        </span>
        <span className="flex h-14">
          <span className="w-1/4" style={{ background: t.side }} />
          <span className="flex-1 p-1.5 grid gap-1 content-start">
            <span className="h-2 rounded bg-white" /><span className="h-2 w-2/3 rounded bg-white" />
          </span>
        </span>
      </span>
      <span className="flex items-center justify-between mt-2 px-0.5">
        <span className="text-[13px] font-medium text-ink">{t.name}</span>
        {selected && <Check className="w-4 h-4 text-brand-600" aria-hidden="true" />}
      </span>
    </button>
  );
}

function AppearanceSection() {
  const { shell_theme, sidebar_compact, update } = usePreferences();
  const { role } = useAuth();
  const [navApp, setNavApp] = useState<NavigationApp>(() => getNavigationPreference());
  const [labs, setLabs] = useState(() => labsEnabled());
  const changeNavApp = (next: NavigationApp) => { setNavApp(next); setNavigationPreference(next); };
  const toggleLabs = () => { const next = !labs; setLabs(next); setLabsEnabled(next); window.location.reload(); };

  return (
    <>
      <Card>
        <CardHeader micro="Χρώματα" title="Θέμα πλαϊνής μπάρας και κεντρικής μπάρας" className="mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {THEMES.map((t) => <ThemeCard key={t.key} t={t} selected={shell_theme === t.key} onPick={() => update({ shell_theme: t.key })} />)}
        </div>
        <p className="text-[11px] text-ink/45 mt-3">Η περιοχή περιεχομένου μένει πάντα φωτεινή, για καθαρή ανάγνωση.</p>
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3">
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-medium text-ink">Συμπαγής πλαϊνή μπάρα</span>
            <span className="block text-xs text-ink/45">Η πλαϊνή πλοήγηση εμφανίζεται ως εικονίδια.</span>
          </span>
          <Switch checked={sidebar_compact} onChange={(v) => update({ sidebar_compact: v })} label="Συμπαγής πλαϊνή μπάρα" />
        </div>
        <SaveNote />
      </Card>

      {role === 'admin' && (
        <Card>
          <CardHeader micro="Μόνο για διαχειριστές" title="Πειραματικές λειτουργίες" className="mb-3" />
          <label className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 cursor-pointer hover:border-ink/25 transition-colors" data-labs-toggle>
            <FlaskConical className="w-4 h-4 text-ink/40 shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-medium text-ink">Εμφάνιση μη ολοκληρωμένων ενοτήτων</span>
              <span className="block text-xs text-ink/45">AI Εργατικό Δυναμικό, Αυτοματισμοί, B2B Prospecting. Μόνο εσείς τις βλέπετε, μόνο σε αυτόν τον browser. Οι υπόλοιποι χρήστες δεν τις βλέπουν ποτέ.</span>
            </span>
            <input type="checkbox" checked={labs} onChange={toggleLabs} className="w-4 h-4 accent-brand-500" aria-label="Πειραματικές λειτουργίες" />
          </label>
        </Card>
      )}

      <Card>
        <CardHeader micro="Πλοήγηση" title="Εφαρμογή πλοήγησης" className="mb-3" />
        <select value={navApp} onChange={(e) => changeNavApp(e.target.value as NavigationApp)} aria-label="Εφαρμογή πλοήγησης"
          className="w-full sm:w-72 text-[13px] font-medium bg-white border border-line rounded-lg px-2 py-2 text-ink focus:outline-none focus:border-brand-500 appearance-none">
          {NAV_APP_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <div className="flex items-start gap-2 mt-3">
          <Navigation className="w-3.5 h-3.5 shrink-0 mt-0.5 text-ink/40" />
          <span className="flex-1 text-xs text-ink/45">
            Με «Αυτόματο» επιλέγεται η πιο ενδεδειγμένη εφαρμογή (Apple Maps σε iOS, αλλιώς Google Maps).
            Τα κουμπιά «Πλοήγηση» την χρησιμοποιούν άμεσα. Τρέχουσα: <strong className="text-ink/70">{navigationAppLabel(navApp)}</strong>
          </span>
        </div>
      </Card>
    </>
  );
}

/* ───────── Αρχική σελίδα ───────── */
export const HOME_EDIT_FLAG = 'atlas.home.edit';

function HomeSection() {
  const { dashboard_layout, resetHomeLayout } = usePreferences();
  const { go } = useNav();
  const [msg, setMsg] = useState('');
  const custom = dashboard_layout.length > 0;

  const openHome = () => {
    try { sessionStorage.setItem(HOME_EDIT_FLAG, '1'); } catch { /* the home page simply opens normally */ }
    go('home');
  };
  const reset = () => {
    if (!custom) { setMsg('Η αρχική χρησιμοποιεί ήδη την προεπιλογή.'); return; }
    resetHomeLayout();
    setMsg('Η αρχική επανήλθε στην προεπιλογή.');
  };

  return (
    <Card>
      <CardHeader micro="Διάταξη" title="Η αρχική μου" className="mb-3" />
      <div className="flex items-start gap-3 rounded-xl border border-line bg-white px-4 py-3">
        <LayoutDashboard className="w-4 h-4 text-ink/40 shrink-0 mt-0.5" />
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-medium text-ink">{custom ? `Προσαρμοσμένη διάταξη · ${dashboard_layout.length} κουτιά` : 'Προεπιλεγμένη διάταξη'}</span>
          <span className="block text-xs text-ink/45">Στην αρχική μπορείτε να προσθέσετε, να αφαιρέσετε, να μετακινήσετε και να αλλάξετε μέγεθος στα κουτιά.</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <Btn onClick={openHome}>Προσαρμογή της αρχικής</Btn>
        <Btn variant="outline" onClick={reset}><RotateCcw className="w-3.5 h-3.5" /> Επαναφορά στην προεπιλογή</Btn>
      </div>
      <p className="text-xs text-ink/55 mt-3 min-h-[1rem]" role="status">{msg}</p>
      <SaveNote />
    </Card>
  );
}

export default function CustomizePage({ section }: { section: CustomizeSection }) {
  const t = TITLES[section];
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Micro tone="brand">{t.micro}</Micro>
        <h1 className="text-lg font-semibold text-ink tracking-tight mt-0.5">{t.title}</h1>
        <p className="text-xs text-ink/50 mt-1">{t.lead}</p>
      </div>
      {section === 'profile' && <ProfileSection />}
      {section === 'appearance' && <AppearanceSection />}
      {section === 'home' && <HomeSection />}
    </div>
  );
}
