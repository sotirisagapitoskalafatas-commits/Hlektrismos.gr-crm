// «Οδηγός ATLAS»: the Learning Centre page. Sub-routes live in the URL hash filters (#/dashboard?view=guide&f.tab=maps&f.map=case&f.node=offer),
// so a link to a guide, a map step or a decision tree can be shared and Back/Forward work. Everything here only EXPLAINS: no CRM data is read or changed.
import { useCallback, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { LIBRARY } from '@/guide/catalog';
import { forRole } from '@/guide/library';
import { newsFor } from '@/guide/whatsnew';
import { canResumeTour } from '@/guide/progress';
import type { GuideRole } from '@/guide/markdown';
import ArticleView from './ArticleView';
import LibraryView from './LibraryView';
import MapsView from './MapsView';
import HelpView from './HelpView';
import PracticeView from './PracticeView';
import LearningView from './LearningView';
import NewsView from './NewsView';
import { startTour, useGuideProgress } from './useGuideProgress';
import './guide.css';

const TABS = [
  { id: 'home', label: 'Αρχή' }, { id: 'library', label: 'Οδηγοί' }, { id: 'maps', label: 'Χάρτες διαδικασιών' }, { id: 'help', label: 'Βοήθεια για προβλήματα' },
  { id: 'practice', label: 'Εξάσκηση' }, { id: 'learning', label: 'Η μάθησή μου' }, { id: 'news', label: 'Τι νέο υπάρχει' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const ROLE_TEXT: Record<GuideRole, { name: string; text: string }> = {
  admin: { name: 'Admin / Back Office', text: 'Κοινός λογαριασμός του γραφείου. Διεκπεραιώνει τους φακέλους, βλέπει αναφορές και έσοδα και διαχειρίζεται χρήστες και ρυθμίσεις.' },
  sales_agent: { name: 'Sales Agent', text: 'Προσωπικός λογαριασμός πωλητή. Δουλεύει leads, πελάτες, cases και πεδίο και παραδίδει τις πωλήσεις στο Back Office.' },
};
const START: Record<GuideRole, string[]> = {
  admin: ['ti-einai-to-atlas', 'roloi-kai-dikaiomata', 'diekperaiosi-back-office', 'kentro-diachirisis'],
  sales_agent: ['ti-einai-to-atlas', 'lead-dimiourgia', 'case-roi', 'imera-mou-kai-check-in'],
};

function Welcome({ role, onOpen, onTab }: { role: GuideRole; onOpen: (id: string) => void; onTab: (t: Tab) => void }) {
  const { progress, shared } = useGuideProgress();
  const r = ROLE_TEXT[role];
  const news = newsFor(role, progress.dismissedNews);
  return (
    <div>
      <section className="ui-card gd-card-lg" aria-labelledby="gd-welcome">
        <h2 id="gd-welcome" style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Καλώς ήρθατε στο ATLAS CRM</h2>
        <p style={{ margin: '8px 0 0', fontSize: 15.5 }}>Το ATLAS είναι το εργαλείο του γραφείου για leads, πελάτες και cases, από την πρώτη επαφή ως την ενεργοποίηση. Εδώ μαθαίνετε πώς δουλεύει, με δικούς σας ρυθμούς.</p>
        <div className="gd-row">
          <button className="atx-btn atx-btn-primary" onClick={() => startTour(canResumeTour(progress) ? 'resume' : 'start')}>{canResumeTour(progress) ? 'Συνέχιση ξενάγησης' : 'Ξεκινήστε την ξενάγηση'}</button>
          <button className="atx-btn atx-btn-quiet" onClick={() => onTab('library')}>Δείτε τους οδηγούς</button>
          <button className="atx-btn atx-btn-quiet" onClick={() => onTab('practice')}>Δοκιμάστε στην Εξάσκηση</button>
        </div>
      </section>
      <div className="gd-grid" style={{ marginTop: 12 }}>
        <section className="ui-card gd-card-lg" aria-label="Ο λογαριασμός σας">
          <h3>Ο λογαριασμός σας: {r.name}</h3>
          <p>{r.text}</p>
          <p className="gd-note" style={{ marginTop: 8 }}>Στο CRM υπάρχουν ακριβώς δύο τύποι λογαριασμού: Admin / Back Office και Sales Agent.{shared ? ' Ο λογαριασμός Admin είναι κοινός, οπότε το CRM δεν ξέρει ποιος υπάλληλος τον χρησιμοποιεί.' : ''}</p>
        </section>
        <section className="ui-card gd-card-lg" aria-label="Από πού να ξεκινήσετε">
          <h3>Από πού να ξεκινήσετε</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{START[role].map((id) => LIBRARY.byId.get(id)).filter(Boolean).map((d) => <li key={d!.meta.id} style={{ padding: '4px 0' }}><button className="gd-link" onClick={() => onOpen(d!.meta.id)}>{d!.meta.title}</button></li>)}</ul>
        </section>
        <section className="ui-card gd-card-lg" aria-label="Νέα">
          <h3>Τι νέο υπάρχει</h3>
          {news.length ? <p>{news[0].title}: {news[0].text}</p> : <p>Δεν υπάρχουν νέα.</p>}
          <button className="gd-link" onClick={() => onTab('news')}>Όλα τα νέα</button>
        </section>
      </div>
      <p className="gd-note" style={{ marginTop: 14 }}>Ο Οδηγός μόνο εξηγεί: δεν αλλάζει ποτέ πελάτες, cases ή ρυθμίσεις. Η πρόοδός σας μένει σε αυτόν τον browser και δεν στέλνεται πουθενά.</p>
    </div>
  );
}

export default function GuidePage() {
  const { view, go } = useNav();
  const { profile, role } = useAuth();
  const guideRole = (profile?.role ?? role) as GuideRole;
  const mine = forRole(LIBRARY, guideRole);
  const f = view.filters ?? {};
  const doc = f.doc ?? null;
  const tab: Tab = (TABS.find((t) => t.id === f.tab)?.id ?? (doc ? 'library' : 'home'));
  const [category, setCategory] = useState<string | null>(null);

  const nav = useCallback((filters: Record<string, string>) => go('guide', filters), [go]);
  const openDoc = useCallback((id: string) => nav({ tab: 'library', doc: id }), [nav]);
  const setTab = (t: Tab) => nav(t === 'home' ? {} : { tab: t });

  return (
    <div className="gd-page">
      <header className="gd-head">
        <h1>Οδηγός ATLAS</h1>
        <p>Μάθετε το CRM, βρείτε απαντήσεις και εξασκηθείτε χωρίς κίνδυνο. {mine.length} οδηγοί για τον λογαριασμό σας.</p>
      </header>
      <div className="gd-tabs" role="tablist" aria-label="Ενότητες του Οδηγού">
        {TABS.map((t) => <button key={t.id} id={`gd-tab-${t.id}`} role="tab" className="gd-tab" aria-selected={tab === t.id} aria-controls="gd-panel" tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)}
          onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const i = TABS.findIndex((x) => x.id === tab); const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]; setTab(n.id); document.getElementById(`gd-tab-${n.id}`)?.focus(); } }}>{t.label}</button>)}
      </div>
      <div id="gd-panel" role="tabpanel" aria-labelledby={`gd-tab-${tab}`}>
        {tab === 'home' && <Welcome role={guideRole} onOpen={openDoc} onTab={setTab} />}
        {tab === 'library' && (doc
          ? <ArticleView id={doc} role={guideRole} onOpen={openDoc} onHome={(c) => { setCategory(c ?? null); nav({ tab: 'library' }); }} />
          : <LibraryView role={guideRole} category={category} onOpen={openDoc} onCategory={setCategory} />)}
        {tab === 'maps' && <MapsView role={guideRole} mapId={f.map ?? 'case'} nodeId={f.node ?? null} onSelect={(m, n) => nav(n ? { tab: 'maps', map: m, node: n } : { tab: 'maps', map: m })} onOpen={openDoc} />}
        {tab === 'help' && <HelpView role={guideRole} treeId={f.tree ?? null} onTree={(id) => nav(id ? { tab: 'help', tree: id } : { tab: 'help' })} onOpen={openDoc} />}
        {tab === 'practice' && <PracticeView role={guideRole} onOpen={openDoc} />}
        {tab === 'learning' && <LearningView role={guideRole} onOpen={openDoc} />}
        {tab === 'news' && <NewsView role={guideRole} onOpen={openDoc} />}
      </div>
    </div>
  );
}
