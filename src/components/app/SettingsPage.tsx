import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { PERMS, ROLES, roleLabel } from '@/lib/roles';
import { StaffProfile, fetchStaff } from '@/lib/api';
import {
  B2B_CATEGORIES, DEFAULT_SCRAPER_CONFIG, GREEK_REGIONS, ScraperConfig,
  fetchScraperSettings, saveScraperConfig, setScraperKey,
} from '@/lib/scraper';
import { Btn, Card, CardHeader, Field, Micro, Pill, Spinner, fmtDate } from '@/lib/ui';
import { Database, FolderLock, KeyRound, Radar, ShieldCheck, UsersRound } from 'lucide-react';

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

      <ScraperSettingsCard />

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

/* ---------------- B2B Scraper (SerpApi) ---------------- */
function ScraperSettingsCard() {
  const { role } = useAuth();
  const [config, setConfig] = useState<ScraperConfig>(DEFAULT_SCRAPER_CONFIG);
  const [keySet, setKeySet] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const isAdmin = role === 'admin';

  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await fetchScraperSettings();
      if (!alive) return;
      if (s) { setConfig(s.config); setKeySet(s.keySet); }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const saveConfig = async () => {
    setBusy(true);
    const ok = await saveScraperConfig(config);
    setBusy(false);
    setMsg(ok ? { tone: 'ok', text: 'Οι ρυθμίσεις αποθηκεύτηκαν.' } : { tone: 'bad', text: 'Η αποθήκευση απέτυχε.' });
  };

  const saveKey = async () => {
    const key = keyInput.trim();
    if (!key) return;
    setBusy(true);
    const ok = await setScraperKey(key);
    setBusy(false);
    setKeyInput('');
    if (ok) { setKeySet(true); setMsg({ tone: 'ok', text: 'Το κλειδί SerpApi αποθηκεύτηκε.' }); }
    else setMsg({ tone: 'bad', text: 'Η αποθήκευση του κλειδιού απέτυχε.' });
  };

  return (
    <Card>
      <CardHeader micro="B2B Scraper" title="SerpApi Google Maps"
        className="mb-3"
        action={loading ? <Spinner /> : keySet
          ? <Pill tone="green">κλειδί ενεργό</Pill>
          : <Pill tone="amber">χωρίς κλειδί</Pill>} />

      {msg && (
        <div className={`mb-3 rounded-xl text-[13px] px-4 py-2.5 ${msg.tone === 'ok' ? 'bg-ok-100 text-ok-600' : 'bg-bad-100 text-bad-600'}`}>
          {msg.text}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Προεπιλεγμένη κατηγορία">
          <select className="field" value={config.default_category}
            onChange={e => setConfig(c => ({ ...c, default_category: e.target.value }))}>
            {B2B_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Προεπιλεγμένη περιοχή">
          <select className="field" value={config.default_region}
            onChange={e => setConfig(c => ({ ...c, default_region: e.target.value }))}>
            {GREEK_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Μέγιστα αποτελέσματα ανά αναζήτηση">
          <input type="number" min={5} max={60} className="field" value={config.max_results}
            onChange={e => setConfig(c => ({ ...c, max_results: Math.min(60, Math.max(5, parseInt(e.target.value, 10) || 20)) }))} />
        </Field>
        <Field label="Όριο αναζητήσεων / λεπτό">
          <input type="number" min={1} max={60} className="field" value={config.rate_limit_per_minute}
            onChange={e => setConfig(c => ({ ...c, rate_limit_per_minute: Math.min(60, Math.max(1, parseInt(e.target.value, 10) || 10)) }))} />
        </Field>
      </div>

      <div className="mt-4 flex justify-end">
        <Btn onClick={saveConfig} disabled={busy || loading}>Αποθήκευση ρυθμίσεων</Btn>
      </div>

      <div className="mt-4 pt-4 border-t border-line">
        <Field label={keySet ? 'Αντικατάσταση κλειδιού SerpApi' : 'Κλειδί SerpApi'}>
          <input type="password" className="field" value={keyInput} autoComplete="off"
            disabled={!isAdmin}
            onChange={e => setKeyInput(e.target.value)}
            placeholder={isAdmin ? 'Επικολλήστε το private key από serpapi.com' : 'Μόνο ο διαχειριστής μπορεί να το αλλάξει'} />
        </Field>
        <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-ink/40 flex items-center gap-1.5 max-w-lg">
            <Radar className="w-3 h-3 shrink-0" />
            Το κλειδί αποθηκεύεται στη βάση και χρησιμοποιείται μόνο server-side από τη function scrape-b2b — δεν επιστρέφεται ποτέ στον browser.
          </p>
          {isAdmin && <Btn onClick={saveKey} disabled={busy || !keyInput.trim()}>Αποθήκευση κλειδιού</Btn>}
        </div>
      </div>
    </Card>
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