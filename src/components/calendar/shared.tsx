import { supabase } from '@/lib/supabase';
import {
  CalendarEvent, CRMContact, CRMContactRole, CalendarSettings,
  DEFAULT_GUEST_PERMISSIONS,
} from '@/types/calendar';

export const OWNER_NAME = 'Sotirisagapitos Kalafatas';
export const WHATSAPP_BUSINESS_LINE = '306977691776';

export type CategoryKey = 'event' | 'task' | 'appointment_schedule' | 'call' | 'follow_up' | 'deadline';

export const CATEGORIES: Record<CategoryKey, { label: string; color: string }> = {
  event: { label: 'Γεγονότα', color: '#039be5' },
  task: { label: 'Εργασίες', color: '#0b8043' },
  appointment_schedule: { label: 'Ραντεβού', color: '#8e24aa' },
  call: { label: 'Κλήσεις', color: '#f4511e' },
  follow_up: { label: 'Follow-ups', color: '#f6bf26' },
  deadline: { label: 'Προθεσμίες', color: '#e67c73' },
};

export function categoryOf(ev: CalendarEvent): CategoryKey {
  if (['task', 'appointment_schedule'].includes(ev.event_kind)) return ev.event_kind as CategoryKey;
  if (['call', 'follow_up', 'deadline'].includes(ev.event_type)) return ev.event_type as CategoryKey;
  return 'event';
}

export function blankEvent(
  settings: CalendarSettings,
  slot?: Date | null,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  const base = slot ? new Date(slot) : new Date();
  base.setSeconds(0, 0);
  if (!slot) base.setHours(9, 0, 0, 0);
  let durationMin = settings.defaultDuration;
  if (settings.speedyMeetings && durationMin === 30) durationMin = 25;
  if (settings.speedyMeetings && durationMin === 60) durationMin = 50;
  const end = new Date(base.getTime() + durationMin * 60000);
  return {
    title: '',
    event_kind: 'event',
    event_type: 'meeting',
    lead_id: null,
    start_time: base.toISOString(),
    end_time: end.toISOString(),
    is_all_day: false,
    recurrence: 'none',
    time_zone: settings.primaryTimeZone,
    location: '',
    meeting_platform: 'none',
    meeting_link: '',
    description: '',
    notes: null,
    owner_id: OWNER_NAME,
    color: CATEGORIES.event.color,
    busy_status: 'busy',
    visibility: 'default',
    status: 'scheduled',
    notifications: [{ type: 'notification', minutes: 30 }],
    guests: [],
    guest_permissions: { ...DEFAULT_GUEST_PERMISSIONS },
    source_email_id: null,
    ...overrides,
  };
}

/** Unified lookup across leads, customers and sales agents. */
export async function fetchContacts(): Promise<CRMContact[]> {
  try {
    const [leadsRes, customersRes, agentsRes] = await Promise.all([
      supabase.from('hlektrismos_leads').select('id, first_name, last_name, email').is('deleted_at', null),
      supabase.from('hlektrismos_customers').select('id, full_name, email'),
      supabase.from('sales_agents').select('id, full_name, email'),
    ]);
    return [
      ...(leadsRes.data || []).map((l: any) => ({
        id: l.id, name: [l.first_name, l.last_name].filter(Boolean).join(' ') || 'Lead', email: l.email || '', role: 'lead' as CRMContactRole,
      })),
      ...(customersRes.data || []).map((c: any) => ({
        id: c.id, name: c.full_name || 'Πελάτης', email: c.email || '', role: 'customer' as CRMContactRole,
      })),
      ...(agentsRes.data || []).map((a: any) => ({
        id: a.id, name: a.full_name || 'Πωλητής', email: a.email || '', role: 'agent' as CRMContactRole,
      })),
    ];
  } catch (err) {
    console.error('Error fetching CRM contacts:', err);
    return [];
  }
}

export function dbToEvent(row: any, fallbackTz: string): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    event_kind: row.event_kind || 'event',
    event_type: row.event_type || 'meeting',
    lead_id: row.lead_id ?? null,
    agent_id: row.agent_id ?? null,
    start_time: row.start_time,
    end_time: row.end_time,
    is_all_day: !!row.is_all_day,
    recurrence: row.recurrence || 'none',
    time_zone: row.time_zone || fallbackTz,
    location: row.location || '',
    meeting_platform: row.meeting_platform || 'none',
    meeting_link: row.meeting_link || '',
    description: row.description || '',
    notes: row.notes ?? null,
    owner_id: row.owner_id || OWNER_NAME,
    color: row.color || '#039be5',
    busy_status: row.busy_status || 'busy',
    visibility: row.visibility || 'default',
    status: row.status || 'scheduled',
    notifications: Array.isArray(row.notifications) ? row.notifications : [],
    guests: Array.isArray(row.guests) ? row.guests : [],
    guest_permissions: row.guest_permissions || { ...DEFAULT_GUEST_PERMISSIONS },
    source_email_id: row.source_email_id ?? null,
  };
}

export function eventToDb(ev: CalendarEvent): Record<string, unknown> {
  return {
    title: ev.title.trim() || '(Χωρίς τίτλο)',
    event_kind: ev.event_kind,
    event_type: ev.event_type,
    lead_id: ev.lead_id || null,
    agent_id: ev.agent_id || null,
    start_time: ev.start_time,
    end_time: ev.end_time,
    is_all_day: ev.is_all_day,
    recurrence: ev.recurrence,
    time_zone: ev.time_zone,
    location: ev.location || null,
    meeting_platform: ev.meeting_platform,
    meeting_link: ev.meeting_link || null,
    description: ev.description || null,
    owner_id: ev.owner_id,
    color: ev.color,
    busy_status: ev.busy_status,
    visibility: ev.visibility,
    notifications: ev.notifications,
    guests: ev.guests,
    guest_permissions: ev.guest_permissions,
    source_email_id: ev.source_email_id || null,
    updated_at: new Date().toISOString(),
  };
}

export function fmtTime(d: Date, timeFormat: '12h' | '24h'): string {
  if (timeFormat === '12h') {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  }
  return d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDateBySetting(d: Date, dateFormat: CalendarSettings['dateFormat']): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  if (dateFormat === 'MM/DD/YYYY') return `${mm}/${dd}/${yyyy}`;
  if (dateFormat === 'YYYY-MM-DD') return `${yyyy}-${mm}-${dd}`;
  return `${dd}/${mm}/${yyyy}`;
}

const WEEKDAY_GR = ['Κυρ', 'Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ'];
const MONTHS_GR = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];

export { WEEKDAY_GR, MONTHS_GR };

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export interface PositionedEvent {
  ev: CalendarEvent;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
}

/** Greedy column layout for overlapping timed events of one day. */
export function layoutDayEvents(events: CalendarEvent[], dayDate: Date, hourHeight: number): PositionedEvent[] {
  const dayStart = new Date(dayDate); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const items = events
    .filter(ev => !ev.is_all_day && new Date(ev.start_time) < dayEnd && (ev.end_time ? new Date(ev.end_time) > dayStart : sameDay(new Date(ev.start_time), dayDate)))
    .map(ev => {
      const s = new Date(Math.max(new Date(ev.start_time).getTime(), dayStart.getTime()));
      const eRaw = ev.end_time ? new Date(ev.end_time) : new Date(new Date(ev.start_time).getTime() + 3600000);
      const e = new Date(Math.min(eRaw.getTime(), dayEnd.getTime()));
      const sM = s.getHours() * 60 + s.getMinutes();
      const eM = Math.max(e.getHours() * 60 + e.getMinutes(), sM + 20);
      return { ev, sM, eM };
    })
    .sort((a, b) => a.sM - b.sM);

  const cols: { ev: CalendarEvent; sM: number; eM: number }[][] = [];
  for (const it of items) {
    let placed = false;
    for (const col of cols) {
      if (col[col.length - 1].eM <= it.sM) { col.push(it); placed = true; break; }
    }
    if (!placed) cols.push([it]);
  }
  const out: PositionedEvent[] = [];
  cols.forEach((col, ci) => {
    col.forEach(it => {
      out.push({
        ev: it.ev,
        top: (it.sM / 60) * hourHeight,
        height: Math.max(((it.eM - it.sM) / 60) * hourHeight - 2, 16),
        leftPct: (ci / cols.length) * 100,
        widthPct: (1 / cols.length) * 100,
      });
    });
  });
  return out;
}
