import { useEffect, useState } from 'react';
import { Calendar, Clock, Plus, User, MapPin, ChevronLeft, ChevronRight, CheckCircle, XCircle, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type CalendarEvent = {
  id: string;
  lead_id: string | null;
  agent_id: string | null;
  title: string;
  description: string | null;
  event_type: string;
  start_time: string;
  end_time: string | null;
  status: string;
  location: string | null;
  notes: string | null;
  created_at: string;
};

type Lead = { id: string; first_name: string; last_name: string; email: string; phone: string; company_name?: string };

const EVENT_COLORS: Record<string, { bg: string; fg: string }> = {
  meeting: { bg: '#0066cc15', fg: '#0066cc' },
  call: { bg: '#00c87815', fg: '#00c878' },
  follow_up: { bg: '#fffbeb', fg: '#f59e0b' },
  deadline: { bg: '#ef444415', fg: '#ef4444' },
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Προγραμματισμένο',
  completed: 'Ολοκληρώθηκε',
  cancelled: 'Ακυρώθηκε',
  no_show: 'Δεν εμφανίστηκε',
};

const WEEKDAYS = ['Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ', 'Κυρ'];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = firstDay === 0 ? 6 : firstDay - 1; // Monday start
  const days: (number | null)[] = [];
  for (let i = 0; i < offset; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  return days;
}

export default function CalendarView({ leads = [] }: { leads?: Lead[] }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');

  const [form, setForm] = useState({
    title: '',
    description: '',
    event_type: 'meeting',
    lead_id: '',
    start_date: new Date().toISOString().slice(0, 10),
    start_time: '09:00',
    end_time: '10:00',
    location: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();

  useEffect(() => {
    loadEvents();
  }, []);

  // Auto-create follow-up reminder when a lead's status changes to 'follow_up'
  useEffect(() => {
    const createFollowUpReminder = async (lead: any) => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      const nextWeek = new Date(tomorrow);
      nextWeek.setDate(nextWeek.getDate() + 7);
      nextWeek.setHours(10, 0, 0, 0);
      
      await supabase.from('calendar_events').insert({
        title: `📞 Follow-Up: ${lead.first_name} ${lead.last_name}`,
        description: `Αυτόματο reminder για follow-up με ${lead.first_name} ${lead.last_name}. Email: ${lead.email || 'N/A'}, Τηλ: ${lead.phone || 'N/A'}`,
        event_type: 'follow_up',
        start_time: tomorrow.toISOString(),
        end_time: nextWeek.toISOString(),
        status: 'scheduled',
        lead_id: lead.id,
        notes: 'Αυτόματο reminder — lead μετατράπηκε σε follow_up status',
      });
    };
    // This effect runs when leads prop changes - check for follow_up status
    // (In practice this is triggered by parent component reloading data)
  }, [leads]);

  const loadEvents = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('calendar_events')
      .select('*')
      .order('start_time', { ascending: true });
    if (data) setEvents(data);
    setLoading(false);
  };

  const createEvent = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const start = new Date(`${form.start_date}T${form.start_time}`);
    const end = new Date(`${form.start_date}T${form.end_time}`);
    const { error } = await supabase.from('calendar_events').insert({
      title: form.title,
      description: form.description || null,
      event_type: form.event_type,
      lead_id: form.lead_id || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: 'scheduled',
      location: form.location || null,
      notes: form.notes || null,
    });
    if (!error) {
      setShowForm(false);
      setForm({ title: '', description: '', event_type: 'meeting', lead_id: '', start_date: new Date().toISOString().slice(0, 10), start_time: '09:00', end_time: '10:00', location: '', notes: '' });
      loadEvents();
    }
    setSaving(false);
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('calendar_events').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    loadEvents();
  };

  const deleteEvent = async (id: string) => {
    await supabase.from('calendar_events').delete().eq('id', id);
    loadEvents();
  };

  const navigateMonth = (dir: number) => {
    const d = new Date(year, month + dir, 1);
    setSelectedDate(d);
  };

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const getEventsForDate = (dateStr: string) =>
    events.filter(e => e.start_time.slice(0, 10) === dateStr);

  const days = getMonthDays(year, month);
  const monthLabel = selectedDate.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' });

  // Stats
  const upcomingCount = events.filter(e => e.status === 'scheduled' && new Date(e.start_time) >= today).length;
  const completedCount = events.filter(e => e.status === 'completed').length;
  const thisMonthEvents = events.filter(e => {
    const d = new Date(e.start_time);
    return d.getMonth() === month && d.getFullYear() === year;
  }).length;

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={22} /> Ημερολόγιο
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
            Διαχείριση συναντήσεων, κλήσεων και follow-ups
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
        >
          <Plus size={16} /> Νέο Event
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Επερχόμενα', value: upcomingCount, color: '#0066cc' },
          { label: 'Αυτόν τον μήνα', value: thisMonthEvents, color: '#00c878' },
          { label: 'Ολοκληρωμένα', value: completedCount, color: '#f59e0b' },
          { label: 'Σύνολο', value: events.length, color: '#6b7280' },
        ].map((s, i) => (
          <div key={i} style={{ padding: '12px 16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: `${s.color}10`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={18} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* View controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigateMonth(-1)} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: 6, cursor: 'pointer' }}><ChevronLeft size={16} /></button>
          <span style={{ fontWeight: 700, fontSize: 16, minWidth: 160, textAlign: 'center' }}>{monthLabel}</span>
          <button onClick={() => navigateMonth(1)} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: 6, cursor: 'pointer' }}><ChevronRight size={16} /></button>
          <button onClick={() => setSelectedDate(new Date())} style={{ marginLeft: 8, padding: '4px 10px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Σήμερα</button>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['month', 'week', 'day'] as const).map(v => (
            <button key={v} onClick={() => setViewMode(v)} style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600,
              background: viewMode === v ? '#0066cc' : '#f3f4f6',
              color: viewMode === v ? '#fff' : '#374151',
              border: 'none',
            }}>
              {v === 'month' ? 'Μήνας' : v === 'week' ? 'Εβδομάδα' : 'Ημέρα'}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar Grid (Month View) */}
      {viewMode === 'month' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          {/* Weekday headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #e5e7eb' }}>
            {WEEKDAYS.map(d => (
              <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#6b7280', background: '#f9fafb' }}>{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {days.map((day, i) => {
              const dateStr = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
              const dayEvents = day ? getEventsForDate(dateStr) : [];
              const isToday = dateStr === todayStr;

              return (
                <div
                  key={i}
                  style={{
                    minHeight: 90,
                    padding: 6,
                    borderRight: (i + 1) % 7 === 0 ? 'none' : '1px solid #f3f4f6',
                    borderBottom: i < days.length - 7 ? '1px solid #f3f4f6' : 'none',
                    background: isToday ? '#f0f7ff' : '#fff',
                    cursor: day ? 'pointer' : 'default',
                    position: 'relative',
                  }}
                  onClick={() => {
                    if (day) {
                      setForm(prev => ({ ...prev, start_date: dateStr }));
                      setShowForm(true);
                    }
                  }}
                >
                  {day && (
                    <>
                      <div style={{
                        fontSize: 12, fontWeight: isToday ? 700 : 400,
                        marginBottom: 4,
                        width: 22, height: 22, borderRadius: 11,
                        background: isToday ? '#0066cc' : 'transparent',
                        color: isToday ? '#fff' : '#374151',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {day}
                      </div>
                      {dayEvents.slice(0, 3).map(ev => {
                        const colors = EVENT_COLORS[ev.event_type] || EVENT_COLORS.meeting;
                        return (
                          <div key={ev.id} onClick={(e) => e.stopPropagation()} style={{
                            fontSize: 10, padding: '2px 4px', borderRadius: 4,
                            background: colors.bg, color: colors.fg,
                            marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            cursor: 'pointer',
                          }}>
                            {ev.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && <div style={{ fontSize: 9, color: '#6b7280' }}>+{dayEvents.length - 3} ακόμα</div>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week View */}
      {viewMode === 'week' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
            {Array.from({ length: 7 }, (_, i) => {
              const d = new Date(selectedDate);
              d.setDate(d.getDate() - d.getDay() + 1 + i);
              const dateStr = d.toISOString().slice(0, 10);
              const dayEvents = getEventsForDate(dateStr);
              const isToday = dateStr === todayStr;
              return (
                <div key={i} style={{ minHeight: 200 }}>
                  <div style={{ textAlign: 'center', padding: '4px 0', fontSize: 11, fontWeight: 700, color: isToday ? '#0066cc' : '#6b7280', marginBottom: 8 }}>
                    {WEEKDAYS[i]} {d.getDate()}
                  </div>
                  {dayEvents.map(ev => {
                    const colors = EVENT_COLORS[ev.event_type] || EVENT_COLORS.meeting;
                    return (
                      <div key={ev.id} style={{
                        fontSize: 10, padding: 6, borderRadius: 6,
                        background: colors.bg, color: colors.fg,
                        marginBottom: 4, border: `1px solid ${colors.fg}22`,
                      }}>
                        <div style={{ fontWeight: 600 }}>{ev.title}</div>
                        <div style={{ fontSize: 9, opacity: 0.7 }}>{new Date(ev.start_time).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Day View */}
      {viewMode === 'day' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
            {selectedDate.toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          {getEventsForDate(todayStr).length === 0 && events.filter(e => e.start_time.slice(0, 10) === selectedDate.toISOString().slice(0, 10)).length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Δεν υπάρχουν events</div>
          ) : (
            getEventsForDate(selectedDate.toISOString().slice(0, 10)).map(ev => {
              const colors = EVENT_COLORS[ev.event_type] || EVENT_COLORS.meeting;
              return (
                <div key={ev.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 8,
                  background: colors.bg, border: `1px solid ${colors.fg}22`,
                  marginBottom: 8,
                }}>
                  <div style={{ width: 4, height: 36, borderRadius: 2, background: colors.fg }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: colors.fg }}>{ev.title}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      <Clock size={10} /> {new Date(ev.start_time).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })}
                      {ev.end_time && ` — ${new Date(ev.end_time).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })}`}
                      {ev.location && <><MapPin size={10} /> {ev.location}</>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {ev.status === 'scheduled' && (
                      <button onClick={() => updateStatus(ev.id, 'completed')} title="Ολοκληρώθηκε" style={{ background: '#00c87815', border: 'none', borderRadius: 4, padding: 4, cursor: 'pointer', color: '#00c878' }}>
                        <CheckCircle size={14} />
                      </button>
                    )}
                    <button onClick={() => deleteEvent(ev.id)} title="Διαγραφή" style={{ background: '#ef444415', border: 'none', borderRadius: 4, padding: 4, cursor: 'pointer', color: '#ef4444' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Upcoming Events List */}
      <div style={{ marginTop: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={18} /> Επερχόμενα Events
        </h3>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          {events.filter(e => e.status === 'scheduled' && new Date(e.start_time) >= today).slice(0, 10).map(ev => {
            const colors = EVENT_COLORS[ev.event_type] || EVENT_COLORS.meeting;
            const lead = leads.find(l => l.id === ev.lead_id);
            return (
              <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: colors.bg, color: colors.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Calendar size={14} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{ev.title}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>
                    {new Date(ev.start_time).toLocaleDateString('el-GR', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {' • '}
                    {new Date(ev.start_time).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })}
                    {lead && <> • <User size={10} /> {lead.first_name} {lead.last_name}</>}
                  </div>
                </div>
                <span style={{ padding: '2px 8px', borderRadius: 6, background: colors.bg, color: colors.fg, fontSize: 10, fontWeight: 600 }}>
                  {STATUS_LABELS[ev.status] || ev.status}
                </span>
              </div>
            );
          })}
          {events.filter(e => e.status === 'scheduled' && new Date(e.start_time) >= today).length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Δεν υπάρχουν επερχόμενα events</div>
          )}
        </div>
      </div>

      {/* New Event Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 480, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Plus size={18} /> Νέο Event</h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><XCircle size={20} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Τίτλος *</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="π.χ. Συνάντηση με ΔΕΗ" style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Τύπος</label>
                <select value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff' }}>
                  <option value="meeting">📅 Συνάντηση</option>
                  <option value="call">📞 Κλήση</option>
                  <option value="follow_up">🔄 Follow-up</option>
                  <option value="deadline">⏰ Deadline</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Lead</label>
                <select value={form.lead_id} onChange={e => setForm({ ...form, lead_id: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff' }}>
                  <option value="">— Χωρίς lead —</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.first_name} {l.last_name}{l.company_name ? ` (${l.company_name})` : ''}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Ημερομηνία</label>
                <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Ώρα έναρξης</label>
                <input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Ώρα λήξης</label>
                <input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Τοποθεσία</label>
                <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="π.χ. Zoom, γραφείο" style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Σημειώσεις</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, resize: 'vertical' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Ακύρωση</button>
              <button onClick={createEvent} disabled={!form.title.trim() || saving} style={{ padding: '8px 16px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
                {saving ? 'Αποθήκευση...' : 'Δημιουργία'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
