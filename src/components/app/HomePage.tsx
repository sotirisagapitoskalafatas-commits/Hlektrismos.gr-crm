/* Αρχική — full-width command center (layout per the approved mockup).
   Desktop (≥1280px, admins/managers), on a 48-column grid:
     KPI ×4 (personal, lib/work.ts)                              | Καταγεγραμμένη αξία ενεργών cases
     Τι να κάνετε τώρα (scrolls in card) | Pipeline               | Η ομάδα (+ Στελέχωση for admins) + Atlas AI
     Summary metrics (admins: Ενεργά Cases, Πελάτες, Pipeline σταθμισμένο, Εκπρόθεσμα)
   Below: «Αναλυτικός πίνακας» (hideable): Funnel | Back Office ροή + Έγγραφα & Υπογραφές | Κορυφαία Cases + Ειδοποιήσεις,
   then the team follow-ups strip. Other roles keep their own role dashboard there.
   Unknown values are «μη διαθέσιμο», never €0; suggestions are rules over loaded records (lib/home-insights).
   Cards are <div role="region">, not <section>: the landing-page CSS pads every <section> on phones. */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlarmClock, Briefcase, CalendarCheck, CheckCircle2, ChevronRight, FileText, PenLine, Plus, SlidersHorizontal, Sparkles, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNav } from '@/lib/nav';
import { useWorkData } from '@/lib/useWorkData';
import { fmtMoney, todayLabel, Spinner } from '@/lib/ui';
import { stageText } from '@/lib/case-flow';
import { ACTIVE_STAGES } from '@/lib/roles';
import { dashboardTiles, homeInsights, pipelineStats } from '@/lib/home-insights';
import { usePreferences } from '@/lib/preferences';
import type { LayoutItem } from '@/lib/preferences';
import { HOME_EDIT_FLAG, addWidget, defaultLayout, hiddenWidgets, layoutToSave, moveBy, moveTo, removeWidget, resolveLayout, setSize, SIZE_LABEL, widgetMeta } from '@/lib/home-widgets';
import type { WidgetId } from '@/lib/home-widgets';
import HomeWidgetFrame from '@/components/app/HomeWidgetFrame';
import TaskQuickAdd from '@/components/work/TaskQuickAdd';
import type { Insight } from '@/lib/home-insights';
import { WorkRow } from '@/components/work/WorkRow';
import { useDashboardData } from '@/components/dashboards/data';
import { OperationalStrip } from '@/components/dashboards/OperationalStrip';
import { AdminFunnel, AdminOperations, AdminSummary, AdminTopAndNotifications } from '@/components/dashboards/AdminDashboard';
import InsideSalesDashboard from '@/components/dashboards/InsideSalesDashboard';
import FieldSalesDashboard from '@/components/dashboards/FieldSalesDashboard';
import BackOfficeDashboard from '@/components/dashboards/BackOfficeDashboard';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Καλημέρα' : h < 17 ? 'Καλό μεσημέρι' : 'Καλησπέρα';
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const DETAIL_KEY = 'atlas.home.detail';
const NA = 'μη διαθέσιμο';
const ROLE_GROUPS: [string, string][] = [['admin', 'Διαχειριστές'], ['manager', 'Παλαιός ρόλος (χωρίς πρόσβαση)'], ['inside_sales', 'Inside Sales'], ['field_sales', 'Field Sales'], ['back_office', 'Παλαιός ρόλος (χωρίς πρόσβαση)']];

function Kpi({ icon: Icon, tone, value, label, sub, subTone, alert, onClick, tile }: {
  icon: LucideIcon; tone: string; value: number | string | null; label: string; sub?: string; subTone?: 'red' | 'green' | 'blue' | 'gray'; alert?: boolean; onClick: () => void; tile?: string;
}) {
  const na = value === null || value === NA;
  return (
    <button type="button" className="atx-kpi" onClick={onClick} data-tile={tile}>
      <span className="atx-kpi-icon" style={{ color: tone, background: `color-mix(in srgb, ${tone} 13%, transparent)` }} aria-hidden="true"><Icon size={17} /></span>
      <span className={`atx-kpi-n ${na ? 'is-na' : alert && typeof value === 'number' && value > 0 ? 'is-alert' : ''}`}>{value === null ? NA : value}</span>
      <span className="atx-kpi-l">{label}</span>
      {sub && <span className={`atx-chip-s t-${subTone ?? 'gray'}`}>{sub}</span>}
    </button>
  );
}

export default function HomePage() {
  const { go, openCase } = useNav();
  const { loading, error, items, summary, now, reload, role, firstName, cases, leads, followUps } = useWorkData();
  const d = useDashboardData();
  const [detail, setDetail] = useState(() => { try { return localStorage.getItem(DETAIL_KEY) !== 'hidden'; } catch { return true; } });
  const toggleDetail = () => setDetail(v => { try { localStorage.setItem(DETAIL_KEY, v ? 'hidden' : 'shown'); } catch { /* ignore */ } return !v; });

  const attention = items.filter(i => i.bucket !== 'upcoming');
  const teamView = role === 'admin';
  const isAdmin = role === 'admin';
  const pipe = useMemo(() => pipelineStats(cases), [cases]);
  const tiles = useMemo(() => dashboardTiles(cases, summary?.overdue ?? 0, summary?.today ?? 0), [cases, summary]);
  const [taskOpen, setTaskOpen] = useState(false);
  const insights = useMemo(() => homeInsights({ cases, leads, followUps, now, teamView }), [cases, leads, followUps, now, teamView]);
  const staff = d?.staff ?? [];
  const staffing = isAdmin ? ROLE_GROUPS.map(([r, label]) => ({ r, label, n: staff.filter(s => s.role === r).length })).filter(x => x.n > 0) : [];
  const v = (n: number | undefined) => (loading || n === undefined ? null : n);

  const headline = (() => {
    if (!summary) return '';
    if (summary.overdue > 0) return `Έχετε ${plural(summary.overdue, 'εκπρόθεσμο follow-up', 'εκπρόθεσμα follow-ups')} που χρειάζονται προσοχή.`;
    if (attention.length > 0) return `Έχετε ${plural(attention.length, 'εργασία', 'εργασίες')} για σήμερα.`;
    return 'Δεν υπάρχει κάτι επείγον αυτή τη στιγμή.';
  })();

  // ── widget layout + edit mode ──
  const { dashboard_layout, update } = usePreferences();
  const saved = useMemo(() => resolveLayout(dashboard_layout, role), [dashboard_layout, role]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LayoutItem[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const layout = editing ? draft : saved;
  const hidden = useMemo(() => hiddenWidgets(layout, role), [layout, role]);
  const startEdit = () => { setDraft(saved); setEditing(true); setAnnounce('Λειτουργία προσαρμογής ενεργή.'); };
  const finishEdit = () => { update({ dashboard_layout: layoutToSave(draft, role) }); setEditing(false); setAnnounce('Η διάταξη αποθηκεύτηκε.'); };
  const cancelEdit = () => { setEditing(false); setAnnounce('Οι αλλαγές ακυρώθηκαν.'); };
  const resetDraft = () => { setDraft(defaultLayout(role)); setAnnounce('Επαναφορά στην προεπιλογή.'); };
  const change = (next: LayoutItem[], say: string) => { setDraft(next); setAnnounce(say); };
  // «Προσαρμογή της αρχικής» in the settings opens Home straight in edit mode.
  useEffect(() => {
    let wanted = false;
    try { wanted = sessionStorage.getItem(HOME_EDIT_FLAG) === '1'; sessionStorage.removeItem(HOME_EDIT_FLAG); } catch { /* ignore */ }
    if (wanted) startEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelEdit(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);

  const runInsight = (x: Insight) => (x.action.kind === 'case' ? openCase(x.action.id) : go(x.action.page as Parameters<typeof go>[0], x.action.filters));

  const aiPanel = (
    <div role="region" className="atx-panel atx-card" aria-label="Atlas AI προτάσεις">
      <div className="atx-card-head">
        <h2 className="atx-section-title inline-flex items-center gap-1.5"><Sparkles size={16} className="text-[var(--atx-blue)]" aria-hidden="true" /> Atlas AI</h2>
        <button className="atx-link" onClick={() => window.dispatchEvent(new Event('atlas:open-assistant'))}>Ρωτήστε →</button>
      </div>
      {!loading && insights.length === 0 && <p className="px-4 pb-3 text-[14px] text-[var(--atx-muted)]">Δεν υπάρχει κάτι να επισημανθεί αυτή τη στιγμή.</p>}
      {insights.length > 0 && (
        <ul className="m-0 p-0 list-none">
          {insights.map(x => (
            <li key={x.id} className="atx-insight">
              <span className={`atx-insight-dot ${x.tone === 'attention' ? 'is-alert' : ''}`} aria-hidden="true" />
              <span className="flex-1 min-w-0 text-[13px] leading-snug">{x.text}</span>
              <button className="atx-btn atx-btn-quiet !h-7 !px-2 !text-[12.5px] inline-flex items-center gap-0.5 shrink-0" onClick={() => runInsight(x)}>{x.actionLabel}<ChevronRight size={13} /></button>
            </li>
          ))}
        </ul>
      )}
      <p className="atx-fine px-4 pb-3 !mt-1">Με κανόνες από τα δεδομένα του CRM — δεν έγινε ανάλυση AI.</p>
    </div>
  );

  const bodies: Record<WidgetId, ReactNode> = {
    'kpi-urgent': (
      <Kpi tile="urgent" icon={AlarmClock} tone="#d1342f" alert value={v(summary ? tiles.urgent : undefined)} label="Επείγοντα"
                  sub={summary ? `${summary.overdue} εκπρόθεσμα follow-ups · ${tiles.urgentCases} υψηλής προτεραιότητας` : undefined} subTone={tiles.urgent ? 'red' : 'gray'}
                  onClick={() => go('mywork', { tab: 'today', kind: 'followup' })} />
    ),
    'kpi-followups': (
      <Kpi tile="followups" icon={CalendarCheck} tone="#1677ff" value={v(summary?.today)} label="Follow Up σήμερα" onClick={() => go('mywork', { tab: 'today', kind: 'followup' })} />
    ),
    'kpi-offers': (
      <Kpi tile="offers" icon={FileText} tone="#0e7490" value={v(loading ? undefined : tiles.offers)} label="Προσφορές" sub="cases στο στάδιο «Προσφορά»" onClick={() => go('cases', { stage: 'offer' })} />
    ),
    'kpi-signatures': (
      <Kpi tile="signatures" icon={PenLine} tone="#7c3aed" value={v(loading ? undefined : tiles.signatures)} label="Υπογραφές" sub="cases στο στάδιο «Υπογραφή»" onClick={() => go('cases', { stage: 'signed' })} />
    ),
    'kpi-new': (
      <Kpi tile="new" icon={Briefcase} tone="#15803d" value={v(loading ? undefined : tiles.newCases)} label="Νέα Cases"
                  sub={loading ? undefined : `${pipe.active} ενεργά συνολικά`} subTone="green" onClick={() => go('cases', { stage: 'new' })} />
    ),
    tasks: (
      <div role="region" className="atx-panel atx-card home-card" aria-label="Σημερινά Tasks" aria-busy={loading}>
        <div className="atx-card-head">
          <h2 className="atx-section-title">Σημερινά Tasks</h2>
          <span className="flex items-center gap-3">
            <button className="atx-btn atx-btn-quiet !h-8 inline-flex items-center gap-1" onClick={() => setTaskOpen(true)} data-add-task><Plus size={14} /> Task</button>
            <button className="atx-link" onClick={() => go('mywork')}>Όλη η εργασία{!loading && attention.length ? ` (${attention.length})` : ''} →</button>
          </span>
        </div>
        <div className="atx-scroll">
          {loading && [0, 1, 2].map(i => <div key={i} className="atx-skeleton" aria-hidden="true" />)}
          {!loading && attention.length === 0 && (
            <div className="atx-empty !py-6">
              <CheckCircle2 className="mx-auto mb-2" size={22} aria-hidden="true" />
              <strong>Όλα είναι υπό έλεγχο</strong>
              Δεν υπάρχει εργασία που να περιμένει εσάς αυτή τη στιγμή.
            </div>
          )}
          {!loading && attention.length > 0 && (
            <ul className="m-0 p-0 list-none">
              {attention.map(row => <WorkRow key={row.key} item={row} now={now} onChanged={reload} />)}
            </ul>
          )}
        </div>
      </div>
    ),
    pipeline: (
      <div role="region" className="atx-panel atx-card home-card" aria-label="Pipeline">
        <div className="atx-card-head">
          <h2 className="atx-section-title">Pipeline</h2>
          <button className="atx-link" onClick={() => go('cases', { status: 'active' })}>Προβολή όλων →</button>
        </div>
        <div className="px-4 pb-3.5">
          <div className="atx-pipe-value">
            <span className={pipe.weighted === null ? 'is-na' : ''}>{loading ? '–' : pipe.weighted === null ? NA : fmtMoney(pipe.weighted)}</span>
            <small>πιθανολογούμενη αξία (σταθμισμένη){!loading && pipe.withoutValue ? ` · ${pipe.withoutValue} χωρίς αξία εκτός` : ''}</small>
          </div>
          <p className="text-[12.5px] text-[var(--atx-muted)] -mt-1 mb-2" data-pipe-value>Καταγεγραμμένη αξία ενεργών cases: <b className="text-[var(--atx-ink,#0f172a)]">{loading ? '–' : pipe.known === null ? NA : fmtMoney(pipe.known)}</b></p>
          <div className="atx-pipe">
            {ACTIVE_STAGES.map((s, idx) => {
              const n = pipe.byStage[s] ?? 0;
              return (
                <button key={s} type="button" className={`atx-pipe-stage ${n ? '' : 'is-zero'}`} onClick={() => go('cases', { stage: s })} aria-label={`${stageText(s)}: ${n} cases`}>
                  <span className="atx-pipe-n">{loading ? '–' : n}</span>
                  <span className="atx-pipe-l" title={stageText(s)}><b>{idx + 1}</b>{stageText(s)}</span>
                </button>
              );
            })}
          </div>
          <p className="atx-pipe-flow">Νέο → Επικοινωνία → Προσφορά → Αίτηση → Υπογραφή → Έγγραφα → Πάροχος → Ενεργοποίηση</p>
          <dl className="atx-pipe-sum">
            <div><dt>Ενεργά</dt><dd>{loading ? '–' : pipe.active}</dd></div>
            <div><dt>Γνωστή αξία</dt><dd className={pipe.known === null ? 'is-na' : ''}>{pipe.known === null ? NA : fmtMoney(pipe.known)}</dd></div>
          </dl>
        </div>
      </div>
    ),
    team: (
      <div role="region" className="atx-panel atx-card home-card" aria-label="Η ομάδα">
        <div className="atx-card-head"><h2 className="atx-section-title">Η ομάδα</h2></div>
        {summary?.team && (
          <ul className="m-0 p-0 list-none">
            {[
              { n: summary.team.unassignedNewLeads, label: 'Νέα leads χωρίς ανάθεση', hint: 'Περιμένουν υπεύθυνο', go: () => go('leads') },
              { n: summary.team.staleCases, label: 'Cases χωρίς κίνηση 7+ ημέρες', hint: 'Ενεργά cases που δεν έχουν ενημερωθεί', go: () => go('cases', { status: 'active' }) },
              { n: summary.team.overdueFollowUps, label: 'Εκπρόθεσμα follow-ups ομάδας', hint: 'Όλων των υπαλλήλων', go: () => go('followups', { status: 'pending' }) },
            ].map(r => (
              <li key={r.label}>
                <button type="button" className="atx-team-row" onClick={r.go}>
                  <span className="min-w-0"><span className="atx-team-l">{r.label}</span><span className="atx-team-h">{r.hint}</span></span>
                  <span className={`atx-team-n ${r.n > 0 ? 'is-alert' : ''}`}>{r.n}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {staffing.length > 0 && (
          <div className="atx-staff" aria-label="Στελέχωση">
            <div className="atx-staff-head"><Users size={14} aria-hidden="true" /> Στελέχωση <span>{staff.length}</span></div>
            {staffing.map(s => <div key={s.r} className="atx-staff-row"><span>{s.label}</span><b>{s.n}</b></div>)}
          </div>
        )}
      </div>
    ),
    ai: aiPanel,
    summary: d ? <AdminSummary d={d} /> : <div className="atx-skeleton" aria-hidden="true" />,
  };

  return (
    <div className="atx-page atx-wide">
      <div className="atx-head">
        <p className="atx-eyebrow">{todayLabel()}</p>
        <h1 className="atx-title">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
        {!loading && !error && <p className="atx-sub">{headline}</p>}
      </div>

      {error && (
        <div className="atx-notice mt-4 flex items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button className="atx-btn atx-btn-quiet" onClick={() => void reload()}>Δοκιμή ξανά</button>
        </div>
      )}

      <div className="home-toolbar">
        {editing ? (
          <>
            <span className="home-toolbar__hint" id="home-edit-hint">Σύρετε τα κουτιά ή χρησιμοποιήστε τα κουμπιά τους για να τα μετακινήσετε, να αλλάξετε μέγεθος ή να τα αφαιρέσετε.</span>
            <span className="home-toolbar__actions">
              <button type="button" className="atx-btn atx-btn-quiet" onClick={resetDraft}>Επαναφορά προεπιλογής</button>
              <button type="button" className="atx-btn atx-btn-quiet" onClick={cancelEdit}>Ακύρωση</button>
              <button type="button" className="atx-btn atx-btn-primary" onClick={finishEdit}>Ολοκλήρωση</button>
            </span>
          </>
        ) : (
          <button type="button" className="atx-link inline-flex items-center gap-1" onClick={startEdit} data-home-customize><SlidersHorizontal size={14} aria-hidden="true" /> Προσαρμογή της αρχικής</button>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      <div className={`home-grid ${editing ? 'is-editing' : ''}`} role="group" aria-label="Κουτιά αρχικής" aria-describedby={editing ? 'home-edit-hint' : undefined}>
        {layout.map((it, i) => (
          <HomeWidgetFrame key={it.id} id={it.id} size={it.size} editing={editing} index={i} count={layout.length}
            canRemove={layout.length > 1} dragging={dragId === it.id}
            onMove={(delta) => change(moveBy(layout, it.id, delta), `${widgetMeta(it.id)?.title}: θέση ${i + 1 + delta} από ${layout.length}`)}
            onSize={(sz) => change(setSize(layout, it.id, sz), `${widgetMeta(it.id)?.title}: ${SIZE_LABEL[sz]}`)}
            onRemove={() => change(removeWidget(layout, it.id), `${widgetMeta(it.id)?.title}: αφαιρέθηκε`)}
            onDragStart={() => setDragId(it.id)} onDragEnd={() => setDragId(null)}
            onDropOn={() => { if (dragId) change(moveTo(layout, dragId, it.id), `${widgetMeta(dragId)?.title}: μετακινήθηκε`); setDragId(null); }}>
            {bodies[it.id as WidgetId]}
          </HomeWidgetFrame>
        ))}
      </div>

      {editing && hidden.length > 0 && (
        <div className="home-tray" role="group" aria-label="Διαθέσιμα κουτιά">
          <span className="home-tray__label">Προσθήκη κουτιού</span>
          {hidden.map((w) => (
            <button key={w.id} type="button" className="atx-btn atx-btn-quiet inline-flex items-center gap-1" onClick={() => change(addWidget(layout, w.id, role), `${w.title}: προστέθηκε`)}>
              <Plus size={14} aria-hidden="true" /> {w.title}
            </button>
          ))}
        </div>
      )}

      {/* Detailed modules */}
      <div role="region" className="mt-4" aria-label="Αναλυτικός πίνακας">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="atx-section-title">Αναλυτικός πίνακας</h2>
          <button className="atx-link" aria-expanded={detail} onClick={toggleDetail}>
            {detail ? 'Απόκρυψη αναλυτικού πίνακα' : 'Εμφάνιση αναλυτικού πίνακα'}
          </button>
        </div>
        {detail && !d && <div className="flex justify-center py-10"><Spinner /></div>}
        {detail && d && (
          isAdmin ? (
            <div className="space-y-4">
              <div className="atx-detail3">
                <AdminFunnel d={d} />
                <AdminOperations d={d} showStaffing={false} />
                <AdminTopAndNotifications d={d} />
              </div>
              {/* Team follow-ups list + all-new-leads count (team-wide, distinct from the personal KPIs above). */}
              <OperationalStrip d={d} pipeline={false} omit={['active', 'pipeline']} />
            </div>
          ) : (
            <div className="space-y-4">
              {/* The 8-stage pipeline is shown once, above; active cases / weighted pipeline are shown by the manager
                  dashboard with more context, so the strip omits them there. */}
              <OperationalStrip d={d} pipeline={false} omit={role === 'inside_sales' ? ['active'] : []} />
              {role === 'inside_sales' ? <InsideSalesDashboard d={d} />
                : role === 'field_sales' ? <FieldSalesDashboard d={d} />
                : <BackOfficeDashboard d={d} />}
            </div>
          )
        )}
      </div>
      <TaskQuickAdd open={taskOpen} cases={cases} onClose={() => setTaskOpen(false)} onSaved={() => { setTaskOpen(false); void reload(); }} />
    </div>
  );
}
