// «Η εργασία μου»: tasks and follow-ups as two tabs of one page. The old Follow-ups route (#followups) opens the
// second tab, so nothing that linked to it breaks. Both tabs are the existing pages, unchanged.
import { useNav } from '@/lib/nav';
import FollowUpsPage from './FollowUpsPage';
import MyWorkPage from './MyWorkPage';

type HubTab = 'tasks' | 'followups';

function HubTabs({ tab }: { tab: HubTab }) {
  const { go } = useNav();
  const tabs: { id: HubTab; label: string }[] = [{ id: 'tasks', label: 'Εργασίες' }, { id: 'followups', label: 'Follow-ups' }];
  return (
    <div className="atx-tabs" role="tablist" aria-label="Εργασίες και follow-ups">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={tab === t.id} className="atx-tab"
          onClick={() => { if (tab !== t.id) go(t.id === 'tasks' ? 'mywork' : 'followups'); }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export default function WorkHub({ tab }: { tab: HubTab }) {
  const tabs = <HubTabs tab={tab} />;
  if (tab === 'tasks') return <MyWorkPage hubTabs={tabs} />;
  return (
    <div className="atx-page">
      <div className="atx-head">
        <h1 className="atx-title">Η εργασία μου</h1>
        <p className="atx-sub">Ό,τι χρειάζεται τη δική σας ενέργεια, με σειρά προτεραιότητας.</p>
      </div>
      <div className="mt-5">{tabs}</div>
      <div className="mt-5"><FollowUpsPage /></div>
    </div>
  );
}
