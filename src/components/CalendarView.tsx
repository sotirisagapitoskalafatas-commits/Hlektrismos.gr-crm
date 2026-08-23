import { useEffect, useMemo, useState } from 'react';
import {
  Plus, ChevronLeft, ChevronRight, Settings, Search, Calendar as CalendarIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  CalendarEvent, CRMContact, CalendarSettings, DEFAULT_CALENDAR_SETTINGS,
} from '@/types/calendar';
import {
  CATEGORIES, CategoryKey, categoryOf, blankEvent, fetchContacts, dbToEvent, eventToDb,
  fmtTime, sameDay, MONTHS_GR,
} from './calendar/shared';
import QuickCreatePopover from './calendar/QuickCreatePopover';
import EventEditorModal from './calendar/EventEditorModal';
import CalendarSettingsModal from './calendar/CalendarSettingsModal';
import TimeGridView from './calendar/TimeGridView';

type Lead = { id: string; first_name: string; last_name: string };
type ViewMode = 'day' | 'week' | 'month' | 'year' | '4days';

const SETTINGS_KEY = 'gcal_settings_v1';

export default function CalendarView({ leads = [], initialDraft = null, onDraftConsumed }: {
  leads?: Lead[];
  initialDraft?: Partial<CalendarEvent> | null;
  onDraftConsumed?: () => void;
}) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [peopleSearch, setPeopleSearch] = useState('');
  const [quickSlot, setQuickSlot] = useState<Date | null>(null);
  const [quickSeed, setQuickSeed] = useState<Partial<CalendarEvent> | undefined>();
  const [fullEdit, setFullEdit] = useState<{ ev: CalendarEvent; isNew: boolean } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [filters, setFilters] = useState<Set<CategoryKey>>(new Set(Object.keys(CATEGORIES) as CategoryKey[]));
  const [miniNav, setMiniNav] = useState({ y: new Date().getFullYear(), m: new Date().getMonth() });

  const [settings, setSettings] = useState<CalendarSettings>(() => {
    try { return { ...DEFAULT_CALENDAR_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
    catch { return DEFAULT_CALENDAR_SETTINGS; }
  });
  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data }, contactsList] = await Promise.all([
        supabase.from('calendar_events').select('*').order('start_time', { ascending: true }),
        fetchContacts(),
      ]);
      if (data) setEvents(data.map((r: any) => dbToEvent(r, settings.primaryTimeZone)));
      setContacts(contactsList);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Email→Calendar bridge: consume prefill draft
  useEffect(() => {
    if (initialDraft) {
      setFullEdit({ ev: blankEvent(settings, null, initialDraft as Partial<CalendarEvent>), isNew: true });
      onDraftConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraft]);

  const visibleEvents = useMemo(() => events.filter(ev => {
    if (!filters.has(categoryOf(ev))) return false;
    if (!settings.showDeclinedEvents && ev.status === 'cancelled') return false;
    if (!settings.showCompletedTasks && ev.status === 'completed') return false;
    return true;
  }), [events, filters, settings.showDeclinedEvents, settings.showCompletedTasks]);

  /* ═══ NAVIGATION ═══ */
  const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  const weekStartOf = (d: Date): Date => {
    const x = new Date(d); x.setHours(0, 0, 0, 0);
    const startDow = settings.startWeekOn === 'Monday' ? 1 : 0;
    const diff = (x.getDay() - startDow + 7) % 7;
    return addDays(x, -diff);
  };

  const navigate = (dir: number) => {
    if (viewMode === 'month') setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + dir, 1));
    else if (viewMode === 'year') setCurrentDate(new Date(currentDate.getFullYear() + dir, currentDate.getMonth(), 1));
    else if (viewMode === 'week') setCurrentDate(addDays(currentDate, 7 * dir));
    else setCurrentDate(addDays(currentDate, (viewMode === '4days' ? 4 : 1) * dir));
  };

  const rangeDays = (): Date[] => {
    if (viewMode === 'day') return [new Date(currentDate)];
    if (viewMode === '4days') return Array.from({ length: 4 }, (_, i) => addDays(currentDate, i));
    const ws = weekStartOf(currentDate);
    const count = settings.showWeekends ? 7 : 5;
    return Array.from({ length: count }, (_, i) => addDays(ws, settings.startWeekOn === 'Monday' ? i : i)).slice(0, settings.startWeekOn === 'Monday' ? count : count);
  };

  const headerLabel = () => {
    if (viewMode === 'year') return `${currentDate.getFullYear()}`;
    if (viewMode === 'month') return `${MONTHS_GR[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    if (viewMode === 'week' || viewMode === '4days') {
      const days = rangeDays();
      const a = days[0], b = days[days.length - 1];
      if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} ${MONTHS_GR[a.getMonth()].slice(0, 3)} ${a.getFullYear()}`;
      return `${a.getDate()} ${MONTHS_GR[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MONTHS_GR[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`;
    }
    return currentDate.toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  /* ═══ CRUD ═══ */
  const persist = async (ev: CalendarEvent) => {
    const db = eventToDb(ev);
    if (ev.id) {
      await supabase.from('calendar_events').update(db).eq('id', ev.id);
      setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, ...ev } : e));
    } else {
      const { data } = await supabase.from('calendar_events').insert(db).select().single();
      if (data) setEvents(prev => [...prev, dbToEvent(data, settings.primaryTimeZone)].sort((a, b) => a.start_time.localeCompare(b.start_time)));
    }
    setFullEdit(null); setQuickSlot(null);
  };

  const removeEvent = async (id: string) => {
    await supabase.from('calendar_events').delete().eq('id', id);
    setEvents(prev => prev.filter(e => e.id !== id));
    setFullEdit(null);
  };

  /* ═══ MONTH GRID ═══ */
  const monthGrid = useMemo(() => {
    const y = currentDate.getFullYear(); const m = currentDate.getMonth();
    const first = new Date(y, m, 1);
    const startOffset = settings.startWeekOn === 'Monday'
      ? (first.getDay() === 0 ? 6 : first.getDay() - 1)
      : first.getDay();
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) cells.push(addDays(new Date(y, m, 1 - startOffset), i));
    return cells;
  }, [currentDate, settings.startWeekOn]);

  const eventsForDay = (d: Date) => visibleEvents.filter(ev => {
    const s = new Date(ev.start_time);
    if (sameDay(s, d)) return true;
    if (ev.end_time) {
      const e = new Date(ev.end_time);
      return d >= new Date(s.getFullYear(), s.getMonth(), s.getDate()) && d <= new Date(e.getFullYear(), e.getMonth(), e.getDate()) && (ev.is_all_day || true);
    }
    return false;
  });

  const peopleResults = peopleSearch.trim() === '' ? [] : contacts.filter(c =>
    c.name.toLowerCase().includes(peopleSearch.toLowerCase())
  ).slice(0, 6);

  const openQuickWithGuest = (c: CRMContact) => {
    const slot = new Date(); slot.setHours(slot.getHours() + 1, 0, 0, 0);
    setQuickSeed({ guests: [c], color: '#039be5' });
    setQuickSlot(slot);
    setPeopleSearch('');
  };

  const today = new Date();

  return (
    <div className="flex h-[calc(100vh-130px)] bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm text-gray-800">
      {/* ═══ LEFT SIDEBAR ═══ */}
      <aside className="w-60 border-r border-gray-200 p-4 flex flex-col gap-5 shrink-0 overflow-y-auto select-none">
        <button
          onClick={() => { setQuickSeed(undefined); setQuickSlot(new Date(today.setMinutes(0, 0, 0))); }}
          className="flex items-center gap-3 px-5 py-3 rounded-full shadow-md border border-gray-200 hover:shadow-lg transition-all bg-white font-medium text-gray-700 w-fit"
        >
          <Plus className="w-6 h-6 text-blue-600" />
          <span className="text-sm">Δημιουργία</span>
        </button>

        {/* Mini calendar */}
        <div className="border-b border-gray-100 pb-4">
          <div className="flex items-center justify-between text-xs font-semibold mb-2">
            <span>{MONTHS_GR[miniNav.m].slice(0, 3)} {miniNav.y}</span>
            <div className="flex gap-0.5">
              <button onClick={() => setMiniNav(miniNav.m === 0 ? { y: miniNav.y - 1, m: 11 } : { ...miniNav, m: miniNav.m - 1 })}><ChevronLeft className="w-3.5 h-3.5" /></button>
              <button onClick={() => setMiniNav(miniNav.m === 11 ? { y: miniNav.y + 1, m: 0 } : { ...miniNav, m: miniNav.m + 1 })}><ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 text-center text-[10px] text-gray-400 font-medium mb-1">
            {(settings.startWeekOn === 'Monday' ? ['Δ', 'Τ', 'Τ', 'Π', 'Π', 'Σ', 'Κ'] : ['Κ', 'Δ', 'Τ', 'Τ', 'Π', 'Π', 'Σ']).map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="grid grid-cols-7 text-center text-[10px] gap-y-0.5">
            {(() => {
              const first = new Date(miniNav.y, miniNav.m, 1);
              const off = settings.startWeekOn === 'Monday' ? (first.getDay() === 0 ? 6 : first.getDay() - 1) : first.getDay();
              const total = new Date(miniNav.y, miniNav.m + 1, 0).getDate();
              return [
                ...Array.from({ length: off }, () => null),
                ...Array.from({ length: total }, (_, i) => i + 1),
              ].map((day, i) => {
                if (!day) return <span key={i} />;
                const d = new Date(miniNav.y, miniNav.m, day);
                const isToday = sameDay(d, today);
                const isSelected = sameDay(d, currentDate);
                return (
                  <button key={i}
                    onClick={() => { setCurrentDate(d); setViewMode(v => v === 'year' ? 'month' : v); }}
                    className={`py-0.5 rounded-full hover:bg-gray-100 ${isToday ? 'bg-blue-600 text-white font-bold' : isSelected ? 'bg-blue-100 font-bold' : ''}`}
                  >{day}</button>
                );
              });
            })()}
          </div>
        </div>

        {/* Search people */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
          <input
            type="text"
            placeholder="Αναζήτηση ατόμων"
            value={peopleSearch}
            onChange={e => setPeopleSearch(e.target.value)}
            className="w-full pl-8 pr-2 py-1.5 bg-gray-100 text-xs rounded-md focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
          />
          {peopleResults.length > 0 && (
            <div className="absolute left-0 right-0 top-9 bg-white border border-gray-200 rounded-md shadow-lg z-20 max-h-48 overflow-y-auto">
              {peopleResults.map(c => (
                <div key={c.id} onClick={() => openQuickWithGuest(c)} className="p-2 hover:bg-blue-50 cursor-pointer text-xs flex justify-between items-center border-b border-gray-50 last:border-0">
                  <div>
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-[10px] text-gray-400">{c.email || '—'}</div>
                  </div>
                  <span className={`text-[9px] uppercase font-bold px-1 rounded ${c.role === 'lead' ? 'text-amber-700' : c.role === 'customer' ? 'text-emerald-700' : 'text-purple-700'}`}>{c.role}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My calendars */}
        <div className="space-y-1.5 text-xs">
          <span className="font-semibold text-gray-600">Το ημερολόγιό μου</span>
          {(Object.keys(CATEGORIES) as CategoryKey[]).map(key => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.has(key)}
                onChange={() => setFilters(prev => {
                  const n = new Set(prev);
                  if (n.has(key)) n.delete(key); else n.add(key);
                  return n;
                })}
                style={{ accentColor: CATEGORIES[key].color }}
              />
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: CATEGORIES[key].color }} />
              <span className={filters.has(key) ? 'text-gray-800' : 'text-gray-400'}>{CATEGORIES[key].label}</span>
            </label>
          ))}
        </div>

        {/* Other calendars */}
        <div className="space-y-1.5 text-xs">
          <span className="font-semibold text-gray-600">Άλλα ημερολόγια</span>
          <label className="flex items-center gap-2 cursor-pointer text-gray-500">
            <input type="checkbox" defaultChecked style={{ accentColor: '#0b8043' }} />
            🇬🇷 Αργίες Ελλάδας
          </label>
        </div>
      </aside>

      {/* ═══ MAIN AREA ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 border-b border-gray-200 px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <CalendarIcon className="w-5 h-5 text-blue-600" />
            <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium hover:bg-gray-50">
              Σήμερα
            </button>
            <div className="flex items-center gap-0.5">
              <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 rounded-full"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => navigate(1)} className="p-1.5 hover:bg-gray-100 rounded-full"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <h1 className="text-lg font-medium text-gray-800 capitalize">{headerLabel()}</h1>
            {settings.showWorldClock && settings.secondaryTimeZone && (
              <span className="text-[10px] text-gray-400 ml-2">🌐 {settings.secondaryTimeZone}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {loading && <span className="text-[10px] text-gray-400 animate-pulse">φόρτωση…</span>}
            <select
              value={viewMode}
              onChange={(e: any) => setViewMode(e.target.value)}
              className="border border-gray-300 rounded-md px-2.5 py-1.5 text-xs font-medium bg-white hover:bg-gray-50 focus:outline-none cursor-pointer"
            >
              <option value="day">Ημέρα</option>
              <option value="week">Εβδομάδα</option>
              <option value="month">Μήνας</option>
              <option value="year">Χρόνος</option>
              <option value="4days">4 ημέρες</option>
            </select>
            <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-gray-100 rounded-full" title="Ρυθμίσεις">
              <Settings className="w-4.5 h-4.5 text-gray-600" />
            </button>
          </div>
        </header>

        {/* ═══ VIEWS ═══ */}
        {(viewMode === 'day' || viewMode === 'week' || viewMode === '4days') && (
          <TimeGridView
            days={rangeDays()}
            events={visibleEvents}
            settings={settings}
            onSlotClick={(slot) => { setQuickSeed(undefined); setQuickSlot(slot); }}
            onEventClick={(ev) => setFullEdit({ ev, isNew: false })}
          />
        )}

        {/* Month view */}
        {viewMode === 'month' && (
          <div className="flex-1 overflow-auto flex flex-col">
            <div className="grid grid-cols-7 border-b border-gray-200 shrink-0">
              {(settings.startWeekOn === 'Monday'
                ? ['Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ', 'Κυρ']
                : ['Κυρ', 'Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ']
              ).map(d => (
                <div key={d} className="p-2 text-center text-[11px] font-semibold text-gray-500">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 grid-rows-6 flex-1">
              {monthGrid.map((day, i) => {
                const inMonth = day.getMonth() === currentDate.getMonth();
                const isToday = sameDay(day, today);
                const dayEvents = eventsForDay(day);
                return (
                  <div key={i}
                    onClick={() => { const s = new Date(day); s.setHours(9, 0, 0, 0); setQuickSeed(undefined); setQuickSlot(s); }}
                    className={`border-r border-b border-gray-100 p-1 min-h-[90px] cursor-pointer hover:bg-blue-50/30 transition-colors ${inMonth ? 'bg-white' : 'bg-gray-50/60'} ${isToday ? 'ring-2 ring-inset ring-blue-500/60' : ''}`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs mb-0.5 mx-auto md:mx-0 ${isToday ? 'bg-blue-600 text-white font-bold' : inMonth ? 'text-gray-700' : 'text-gray-300'}`}>
                      {day.getDate()}
                    </div>
                    {dayEvents.slice(0, 3).map(ev => (
                      <div key={ev.id}
                        onClick={(e) => { e.stopPropagation(); setFullEdit({ ev, isNew: false }); }}
                        title={`${ev.title} · ${fmtTime(new Date(ev.start_time), settings.timeFormat)}`}
                        className="text-[10px] px-1 py-0.5 rounded mb-0.5 text-white truncate hover:brightness-95 cursor-pointer shadow-sm"
                        style={{
                          background: ev.color,
                          textDecoration: ev.status === 'cancelled' ? 'line-through' : 'none',
                          opacity: ev.status === 'completed' ? 0.7 : 1,
                        }}
                      >
                        {!ev.is_all_day && <span className="opacity-80 mr-0.5">{fmtTime(new Date(ev.start_time), settings.timeFormat).replace(':00', '')}</span>}
                        {ev.title || '(Χωρίς τίτλο)'}
                      </div>
                    ))}
                    {dayEvents.length > 3 && <div className="text-[9px] text-gray-400 pl-1">+{dayEvents.length - 3} ακόμα</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Year view */}
        {viewMode === 'year' && (
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-4 gap-4 content-start">
            {Array.from({ length: 12 }, (_, m) => {
              const first = new Date(currentDate.getFullYear(), m, 1);
              const off = settings.startWeekOn === 'Monday' ? (first.getDay() === 0 ? 6 : first.getDay() - 1) : first.getDay();
              const total = new Date(currentDate.getFullYear(), m + 1, 0).getDate();
              return (
                <div key={m} className="border border-gray-100 rounded-lg p-2 hover:shadow-sm transition-shadow">
                  <div className="text-xs font-semibold text-center mb-1 cursor-pointer hover:text-blue-600"
                    onClick={() => { setCurrentDate(new Date(currentDate.getFullYear(), m, 1)); setViewMode('month'); }}>
                    {MONTHS_GR[m]}
                  </div>
                  <div className="grid grid-cols-7 gap-y-0.5 text-center">
                    {(settings.startWeekOn === 'Monday' ? ['Δ','Τ','Τ','Π','Π','Σ','Κ'] : ['Κ','Δ','Τ','Τ','Π','Π','Σ']).map((d, i) => (
                      <span key={`h${i}`} className="text-[8px] text-gray-400">{d}</span>
                    ))}
                    {[...Array(off).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)].map((day, i) => {
                      if (!day) return <span key={i} />;
                      const d = new Date(currentDate.getFullYear(), m, day);
                      const hasEvents = eventsForDay(d).length > 0;
                      const isToday = sameDay(d, today);
                      return (
                        <button key={i}
                          onClick={() => { setCurrentDate(d); setViewMode('day'); }}
                          className={`text-[8.5px] leading-none py-0.5 rounded-full relative hover:bg-blue-100 ${isToday ? 'bg-blue-600 text-white font-bold' : ''}`}
                        >
                          {day}
                          {hasEvents && !isToday && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-green-500" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ MODALS ═══ */}
      {quickSlot !== null && (
        <QuickCreatePopover
          event={blankEvent(settings, quickSlot, quickSeed)}
          contacts={contacts}
          settings={settings}
          onClose={() => { setQuickSlot(null); setQuickSeed(undefined); }}
          onSave={(ev) => persist({ ...ev, event_type: ev.event_kind === 'event' ? 'meeting' : ev.event_kind === 'task' ? 'follow_up' : 'meeting' })}
          onMoreOptions={(ev) => { setQuickSlot(null); setFullEdit({ ev, isNew: true }); }}
        />
      )}

      {fullEdit && (
        <EventEditorModal
          event={fullEdit.ev}
          isNew={fullEdit.isNew}
          contacts={contacts}
          settings={settings}
          onClose={() => setFullEdit(null)}
          onSave={(ev) => persist(ev)}
          onDelete={(id) => removeEvent(id)}
        />
      )}

      {showSettings && (
        <CalendarSettingsModal settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
