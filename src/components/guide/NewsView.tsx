import { LIBRARY } from '@/guide/catalog';
import { NEWS, newsFor } from '@/guide/whatsnew';
import { dismissNews } from '@/guide/progress';
import type { GuideRole } from '@/guide/markdown';
import { useGuideProgress } from './useGuideProgress';

export default function NewsView({ role, onOpen }: { role: GuideRole; onOpen: (id: string) => void }) {
  const { progress, update } = useGuideProgress();
  const items = newsFor(role, progress.dismissedNews);
  const hidden = NEWS.filter((n) => n.roles.includes(role)).length - items.length;
  return (
    <div>
      <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>Τι νέο υπάρχει</h2>
      <p className="gd-note">Μόνο αλλαγές που υπάρχουν στο CRM. Ό,τι δεν είναι ακόμη έτοιμο φαίνεται ως προγραμματισμένο.</p>
      {items.length === 0 && <p role="status">Δεν υπάρχουν νέα για εσάς{hidden ? ` (έχετε αποκρύψει ${hidden})` : ''}.</p>}
      {items.map((n) => (
        <article key={n.id} className="ui-card gd-card-lg" style={{ marginBottom: 10 }}>
          <h3>{n.title} <span className={`ui-pill ${n.status === 'planned' ? 'ui-pill--gray' : 'ui-pill--green'}`}>{n.status === 'planned' ? 'Προγραμματισμένο' : 'Διαθέσιμο'}</span></h3>
          <p>{n.text}</p>
          <p className="gd-note" style={{ margin: '6px 0 0' }}>{n.date}</p>
          <div className="gd-row">
            {n.guide && LIBRARY.byId.get(n.guide)?.meta.roles.includes(role) && <button className="atx-btn atx-btn-quiet" onClick={() => onOpen(n.guide!)}>Διαβάστε περισσότερα</button>}
            <button className="atx-btn atx-btn-quiet" onClick={() => update((p) => dismissNews(p, n.id))}>Απόκρυψη</button>
          </div>
        </article>
      ))}
    </div>
  );
}
