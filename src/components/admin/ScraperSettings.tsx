/* B2B Scraper (SerpApi) settings — moved unchanged from the old SettingsPage into the Admin Center.
   The key is write-only: the browser can replace it but never reads it back (crm_set_scraper_key / crm_scraper_settings). */

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  B2B_CATEGORIES, DEFAULT_SCRAPER_CONFIG, GREEK_REGIONS, ScraperConfig,
  fetchScraperSettings, saveScraperConfig, setScraperKey,
} from '@/lib/scraper';
import { Btn, Card, CardHeader, Field, Pill, Spinner } from '@/lib/ui';
import { Radar } from 'lucide-react';

export default function ScraperSettingsCard() {
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

