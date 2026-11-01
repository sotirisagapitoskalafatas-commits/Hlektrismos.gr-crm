// A one-line introduction shown the first time a page is opened, then never again (per workstation or per Sales Agent account, see guide/progress.ts).
// Dismissing it is a click; it never blocks the page and is not shown on the guide itself.
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { introFor } from '@/guide/helps';
import { markIntro } from '@/guide/progress';
import { LIBRARY } from '@/guide/catalog';
import { useGuideProgress } from './useGuideProgress';
import './guide.css';

export default function PageIntro() {
  const { view, go } = useNav();
  const { profile, role } = useAuth();
  const { progress, update } = useGuideProgress();
  const guideRole = (profile?.role ?? role) as 'admin' | 'sales_agent';
  const intro = introFor(view.page);
  if (!intro || progress.introSeen[intro.page]) return null;
  const doc = LIBRARY.byId.get(intro.guide);
  const canRead = !!doc && doc.meta.roles.includes(guideRole);
  return (
    <section className="gd-intro" aria-label="Πρώτη φορά εδώ">
      <p>{intro.text}</p>
      {canRead && <button className="atx-btn atx-btn-quiet" onClick={() => go('guide', { doc: intro.guide })}>Μάθετε περισσότερα</button>}
      <button className="atx-btn atx-btn-quiet" onClick={() => update((p) => markIntro(p, intro.page))}>Κατάλαβα</button>
    </section>
  );
}
