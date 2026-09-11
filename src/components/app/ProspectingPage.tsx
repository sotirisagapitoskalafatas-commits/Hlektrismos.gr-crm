/* ------------------------------------------------------------------ */
/*  B2B Prospecting — Google Maps business search → lead pipeline.     */
/*                                                                     */
/*  Search hits the `scrape-b2b` edge function (SerpApi Google Maps).   */
/*  Results are reviewed here and imported as `import` leads tagged     */
/*  "B2B Scraper · Google Maps", so they land in the same pipeline as   */
/*  every other lead.                                                  */
/* ------------------------------------------------------------------ */

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { SERVICES, can } from '@/lib/roles';
import {
  B2B_CATEGORIES, DEFAULT_SCRAPER_CONFIG, GREEK_REGIONS, ScrapeSourceInfo,
  ScrapedBusiness, businessesToCsv, categoryLabel, fetchScraperSettings,
  importScrapedBusinesses, runB2BScrape,
} from '@/lib/scraper';
import { Btn, Card, CardHeader, EmptyState, Field, Micro, Pill, Spinner } from '@/lib/ui';
import { Building2, Download, Globe, Radar, Star, UserPlus } from 'lucide-react';

type HistoryRow = { at: Date; category: string; region: string; source: string; count: number };

export default function ProspectingPage() {
  const { role } = useAuth();
  const { go } = useNav();

  const [category, setCategory] = useState(DEFAULT_SCRAPER_CONFIG.default_category);
  const [region, setRegion] = useState(DEFAULT_SCRAPER_CONFIG.default_region);
  const [maxResults, setMaxResults] = useState(DEFAULT_SCRAPER_CONFIG.max_results);
  const [service, setService] = useState('energy');

  const [keySet, setKeySet] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ScrapedBusiness[]>([]);
  const [sourceInfo, setSourceInfo] = useState<ScrapeSourceInfo | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad' | 'info'; text: string } | null>(null);

  /* Only admins/managers can read the scraper settings row; for everyone
     else the key state stays unknown and the search simply reports what
     the edge function says. */
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await fetchScraperSettings();
      if (!alive || !s) return;
      setKeySet(s.keySet);
      setCategory(s.config.default_category);
      setRegion(s.config.default_region);
      setMaxResults(s.config.max_results);
    })();
    return () => { alive = false; };
  }, []);

  const canImport = can(role, 'create_case');
  const chosen = useMemo(
    () => (selected.size === 0 ? results : results.filter((_, i) => selected.has(i))),
    [results, selected],
  );

  const search = async () => {
    setRunning(true);
    setMsg({ tone: 'info', text: 'Αναζήτηση επιχειρήσεων στο Google Maps…' });
    const res = await runB2BScrape({ category, region, maxResults });
    setRunning(false);
    if (res.error) { setMsg({ tone: 'bad', text: res.error }); return; }
    setResults(res.businesses);
    setSourceInfo(res.sourceInfo);
    setSelected(new Set());
    setHistory(h => [{
      at: new Date(), category, region,
      source: res.sourceInfo?.api ?? 'SerpApi Google Maps',
      count: res.businesses.length,
    }, ...h].slice(0, 10));
    setMsg(res.businesses.length === 0
      ? { tone: 'info', text: 'Δεν βρέθηκαν επιχειρήσεις με τηλέφωνο για αυτά τα κριτήρια.' }
      : { tone: 'ok', text: `Βρέθηκαν ${res.businesses.length} επιχειρήσεις.` });
  };

  const importLeads = async () => {
    if (chosen.length === 0) return;
    setImporting(true);
    setMsg({ tone: 'info', text: `Εισαγωγή ${chosen.length} leads…` });
    const out = await importScrapedBusinesses(chosen, { serviceCategory: service });
    setImporting(false);
    setSelected(new Set());
    const parts = [`${out.imported} leads εισήχθησαν`];
    if (out.duplicates > 0) parts.push(`${out.duplicates} διπλότυπα παραλείφθηκαν`);
    if (out.failed > 0) parts.push(`${out.failed} απέτυχαν`);
    setMsg({ tone: out.imported > 0 ? 'ok' : 'bad', text: parts.join(' · ') });
  };

  const exportCsv = () => {
    if (results.length === 0) return;
    const blob = new Blob([businessesToCsv(results)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `b2b_${category}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleAll = () => {
    setSelected(s => (s.size === results.length ? new Set() : new Set(results.map((_, i) => i))));
  };

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Micro tone="brand">Sales</Micro>
          <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">B2B Prospecting</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {keySet === false && <Pill tone="amber">χωρίς κλειδί SerpApi</Pill>}
          {keySet === true && <Pill tone="green">SerpApi ενεργό</Pill>}
          <Btn onClick={search} disabled={running}>
            <Radar className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Αναζήτηση…' : 'Αναζήτηση'}
          </Btn>
        </div>
      </div>

      {msg && (
        <div className={`rounded-xl text-[13px] px-4 py-2.5 ${msg.tone === 'bad' ? 'bg-bad-100 text-bad-600' : msg.tone === 'ok' ? 'bg-ok-100 text-ok-600' : 'bg-ink/5 text-ink/60'}`}>
          {msg.text}
        </div>
      )}

      {keySet === false && (
        <div className="rounded-xl border border-warn-600/20 bg-warn-100 px-4 py-3 text-[13px] text-warn-600">
          Το κλειδί SerpApi δεν έχει οριστεί. Προσθέστε το από <span className="font-semibold">Διαχείριση → B2B Scraper</span> για να ενεργοποιηθεί η αναζήτηση.
        </div>
      )}

      {/* Criteria */}
      <Card>
        <CardHeader micro="Κριτήρια" title="Ρυθμίσεις αναζήτησης" className="mb-3" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Κατηγορία επιχείρησης">
            <select className="field" value={category} onChange={e => setCategory(e.target.value)}>
              {B2B_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Περιοχή">
            <select className="field" value={region} onChange={e => setRegion(e.target.value)}>
              {GREEK_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Μέγιστα αποτελέσματα">
            <input type="number" min={5} max={60} className="field" value={maxResults}
              onChange={e => setMaxResults(Math.min(60, Math.max(5, parseInt(e.target.value, 10) || 20)))} />
          </Field>
          <Field label="Υπηρεσία για τα leads">
            <select className="field" value={service} onChange={e => setService(e.target.value)}>
              {Object.entries(SERVICES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-ink/45">
          <Globe className="w-3 h-3" /> SerpApi Google Maps engine · μόνο επιχειρήσεις με τηλέφωνο · deduplication ανά όνομα + τηλέφωνο
        </div>
      </Card>

      {sourceInfo && (
        <div className="rounded-xl bg-ink/[0.035] px-4 py-2.5 text-[11px] text-ink/55">
          <span className="font-semibold text-ink/70">{sourceInfo.api}</span> · query «{sourceInfo.query}» · {sourceInfo.region} ({sourceInfo.ll})
        </div>
      )}

      {/* Results */}
      <Card className="!p-0" pad={false}>
        <CardHeader micro="Αποτελέσματα" title={results.length > 0 ? `${results.length} επιχειρήσεις` : 'Αποτελέσματα'}
          className="px-5 pt-5"
          action={results.length > 0 ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Btn variant="ghost" onClick={toggleAll}>{selected.size === results.length ? 'Αποεπιλογή' : 'Επιλογή όλων'}</Btn>
              <Btn variant="outline" onClick={exportCsv}><Download className="w-3.5 h-3.5" /> CSV</Btn>
              {canImport && (
                <Btn onClick={importLeads} disabled={importing || chosen.length === 0}>
                  <UserPlus className="w-3.5 h-3.5" /> Εισαγωγή ({chosen.length})
                </Btn>
              )}
            </div>
          ) : undefined} />

        {running && <div className="flex items-center justify-center py-16"><Spinner /></div>}

        {!running && results.length === 0 && (
          <div className="px-5 pb-5">
            <EmptyState icon={Building2} title="Καμία αναζήτηση ακόμα"
              hint="Επιλέξτε κατηγορία και περιοχή και πατήστε Αναζήτηση." />
          </div>
        )}

        {!running && results.length > 0 && (
          <div className="overflow-x-auto px-2.5 pb-3">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-ink/40">
                  <th className="w-9 px-2.5 py-2">
                    <input type="checkbox" aria-label="Επιλογή όλων"
                      checked={selected.size === results.length && results.length > 0} onChange={toggleAll} />
                  </th>
                  <th className="px-2.5 py-2 font-medium">Επιχείρηση</th>
                  <th className="px-2.5 py-2 font-medium">Τηλέφωνο</th>
                  <th className="px-2.5 py-2 font-medium">Διεύθυνση</th>
                  <th className="px-2.5 py-2 font-medium">Ιστοσελίδα</th>
                  <th className="px-2.5 py-2 font-medium">Αξιολόγηση</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {results.map((r, i) => (
                  <tr key={`${r.placeId ?? r.company}-${i}`} className={selected.has(i) ? 'bg-brand-100/40' : undefined}>
                    <td className="px-2.5 py-2.5">
                      <input type="checkbox" aria-label={`Επιλογή ${r.company}`} checked={selected.has(i)}
                        onChange={() => setSelected(s => {
                          const next = new Set(s);
                          if (next.has(i)) next.delete(i); else next.add(i);
                          return next;
                        })} />
                    </td>
                    <td className="px-2.5 py-2.5">
                      <div className="font-medium text-ink">{r.company}</div>
                      <div className="text-[11px] text-ink/45">{r.category} · {r.region}</div>
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">{r.phone || '—'}</td>
                    <td className="px-2.5 py-2.5 max-w-[220px] truncate text-ink/60" title={r.address}>{r.address || '—'}</td>
                    <td className="px-2.5 py-2.5">
                      {r.website ? (
                        <a className="text-brand-600 hover:underline" target="_blank" rel="noopener noreferrer"
                          href={r.website.startsWith('http') ? r.website : `https://${r.website}`}>
                          {r.website.replace(/^https?:\/\//, '').slice(0, 28)}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      {r.rating != null ? (
                        <span className="inline-flex items-center gap-1 text-ink/60">
                          <Star className="w-3 h-3 text-warn-600" /> {r.rating}
                          <span className="text-[11px] text-ink/35">({r.totalReviews ?? 0})</span>
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {results.length > 0 && canImport && (
          <div className="px-5 pb-4 text-[11px] text-ink/40">
            Τα leads εισάγονται ως «Εισαγωγή · B2B Scraper» με κατάσταση «Νέο» — δείτε τα στη σελίδα{' '}
            <button className="text-brand-600 hover:underline" onClick={() => go('leads')}>Leads</button>.
            Νομική βάση: έννομο συμφέρον (δημόσια στοιχεία επιχειρήσεων).
          </div>
        )}
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader micro="Ιστορικό" title="Αναζητήσεις αυτής της συνεδρίας" className="mb-2" />
          <div className="divide-y divide-line">
            {history.map((h, i) => (
              <div key={i} className="py-2 flex items-center gap-3 text-[13px]">
                <span className="text-ink/40 text-[11px] w-32 shrink-0">{h.at.toLocaleString('el-GR')}</span>
                <span className="flex-1 min-w-0 truncate">{categoryLabel(h.category)} · {h.region}</span>
                <Pill tone="gray">{h.count}</Pill>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
