import { useRef, useState } from 'react';
import {
  X, Video, MapPin, Bell, Bold, Italic, Underline, List, ListOrdered, Link2, Trash2, CheckCircle, Clock,
} from 'lucide-react';
import { CalendarEvent, CRMContact, CalendarSettings, EVENT_COLORS, TIME_ZONES, MeetingPlatform } from '@/types/calendar';
import { WHATSAPP_BUSINESS_LINE } from './shared';

const ROLE_STYLES: Record<string, string> = {
  lead: 'bg-amber-100 text-amber-800',
  customer: 'bg-emerald-100 text-emerald-800',
  agent: 'bg-purple-100 text-purple-800',
};

const PLATFORMS: { key: MeetingPlatform; label: string; color: string }[] = [
  { key: 'google_meet', label: 'Google Meet', color: '#039be5' },
  { key: 'microsoft_teams', label: 'MS Teams', color: '#4f46e5' },
  { key: 'whatsapp', label: 'WhatsApp', color: '#0b8043' },
  { key: 'vapi_voice', label: 'VAPI Κλήση', color: '#8e24aa' },
];

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(v: string): string {
  return v ? new Date(v).toISOString() : new Date().toISOString();
}

export default function EventEditorModal({ event, isNew, contacts, settings, onClose, onSave, onDelete }: {
  event: CalendarEvent;
  isNew: boolean;
  contacts: CRMContact[];
  settings: CalendarSettings;
  onClose: () => void;
  onSave: (ev: CalendarEvent) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<CalendarEvent>(event);
  const [contactSearch, setContactSearch] = useState('');
  const descRef = useRef<HTMLTextAreaElement>(null);

  const set = (patch: Partial<CalendarEvent>) => setDraft(prev => ({ ...prev, ...patch }));

  const filteredContacts = contactSearch.trim() === '' ? [] : contacts
    .filter(c => !draft.guests.some(g => g.id === c.id))
    .filter(c =>
      c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
      c.email.toLowerCase().includes(contactSearch.toLowerCase())
    );

  const handleAddGuest = (contact: CRMContact) => {
    set({ guests: [...draft.guests, contact] });
    setContactSearch('');
  };

  const handleAddNotification = () => {
    set({ notifications: [...draft.notifications, { type: 'notification', minutes: 10 }] });
  };

  // Rich-text helpers: wrap textarea selection with markers
  const wrapSelection = (before: string, after: string = before) => {
    const ta = descRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const next = value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e);
    set({ description: next });
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + before.length, e + before.length); });
  };
  const prefixLines = (prefix: string | ((i: number) => string)) => {
    const ta = descRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const ls = value.lastIndexOf('\n', s - 1) + 1;
    const le = value.indexOf('\n', e) === -1 ? value.length : value.indexOf('\n', e);
    const lines = value.slice(ls, le).split('\n');
    const next = lines.map((l, i) => (typeof prefix === 'string' ? prefix + l : prefix(i + 1) + l)).join('\n');
    set({ description: value.slice(0, ls) + next + value.slice(le) });
  };
  const insertLink = () => {
    const ta = descRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel = value.slice(s, e) || 'σύνδεσμος';
    const url = window.prompt('URL:', 'https://');
    if (!url) return;
    set({ description: value.slice(0, s) + `[${sel}](${url})` + value.slice(e) });
  };

  const selectPlatform = (key: MeetingPlatform) => {
    if (key === draft.meeting_platform) { set({ meeting_platform: 'none', meeting_link: '' }); return; }
    if (key === 'google_meet') {
      set({ meeting_platform: key, meeting_link: `https://meet.google.com/${Math.random().toString(36).slice(2, 5)}-${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 5)}` });
    } else if (key === 'microsoft_teams') {
      set({ meeting_platform: key, meeting_link: 'https://teams.microsoft.com/l/meetup-join/new' });
    } else if (key === 'whatsapp') {
      set({ meeting_platform: key, meeting_link: `https://wa.me/${WHATSAPP_BUSINESS_LINE}?text=${encodeURIComponent('Συνάντηση: ' + (draft.title || ''))}` });
    } else {
      set({ meeting_platform: key, meeting_link: '' }); // VAPI auto-call — no manual link
    }
  };

  return (
    <div className="fixed inset-0 bg-white z-[9000] overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="p-4 border-b flex justify-between items-center px-8 sticky top-0 bg-white z-10">
        <button onClick={onClose}><X className="w-6 h-6 text-gray-500 hover:text-gray-700" /></button>
        <button
          onClick={() => onSave(draft)}
          disabled={!draft.title.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold px-8 py-2 rounded-full shadow transition-colors"
        >
          Αποθήκευση
        </button>
      </div>

      <div className="max-w-5xl w-full mx-auto p-8 flex-1 grid grid-cols-3 gap-12">
        {/* ═══ LEFT COLUMN ═══ */}
        <div className="col-span-2 space-y-6">
          <input
            type="text"
            autoFocus
            placeholder="Προσθήκη τίτλου"
            value={draft.title}
            onChange={e => set({ title: e.target.value })}
            className="w-full text-3xl font-normal border-b border-gray-200 focus:border-blue-600 focus:outline-none pb-2 placeholder-gray-400"
          />

          {/* Kind tabs */}
          <div className="flex gap-2">
            {([['event', 'Γεγονός'], ['task', 'Εργασία'], ['appointment_schedule', 'Ραντεβού']] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => set({ event_kind: k as CalendarEvent['event_kind'] })}
                className={`px-3 py-1 rounded-md text-xs font-semibold ${draft.event_kind === k ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {l}
              </button>
            ))}
            <select
              value={draft.event_type}
              onChange={e => set({ event_type: e.target.value })}
              className="bg-gray-100 p-1 rounded text-xs ml-auto"
              title="Κατηγορία χρώματος"
            >
              <option value="meeting">📅 Συνάντηση</option>
              <option value="call">📞 Κλήση</option>
              <option value="follow_up">🔄 Follow-up</option>
              <option value="deadline">⏰ Προθεσμία</option>
            </select>
          </div>

          {/* Time pickers & recurrence */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            {draft.is_all_day ? (
              <>
                <input type="date" value={isoToLocalInput(draft.start_time).slice(0, 10)} onChange={e => {
                  const s = isoToLocalInput(draft.start_time).slice(11) || '00:00';
                  set({ start_time: localInputToIso(`${e.target.value}T${s}`) });
                }} className="bg-gray-100 p-2 rounded border-none" />
                <input type="date" value={(draft.end_time ? isoToLocalInput(draft.end_time) : isoToLocalInput(draft.start_time)).slice(0, 10)} onChange={e => {
                  const cur = draft.end_time ? isoToLocalInput(draft.end_time).slice(11) : '23:59';
                  set({ end_time: localInputToIso(`${e.target.value}T${cur}`) });
                }} className="bg-gray-100 p-2 rounded border-none" />
              </>
            ) : (
              <>
                <input type="date" value={isoToLocalInput(draft.start_time).slice(0, 10)} onChange={e => {
                  const t = isoToLocalInput(draft.start_time).slice(11);
                  set({ start_time: localInputToIso(`${e.target.value}T${t}`) });
                }} className="bg-gray-100 p-2 rounded border-none" />
                <input type="time" value={isoToLocalInput(draft.start_time).slice(11)} onChange={e => {
                  const d = isoToLocalInput(draft.start_time).slice(0, 10);
                  set({ start_time: localInputToIso(`${d}T${e.target.value}`) });
                }} className="bg-gray-100 p-2 rounded border-none" />
                <span>–</span>
                <input type="time" value={draft.end_time ? isoToLocalInput(draft.end_time).slice(11) : ''} onChange={e => {
                  const d = isoToLocalInput(draft.start_time).slice(0, 10);
                  set({ end_time: localInputToIso(`${d}T${e.target.value}`) });
                }} className="bg-gray-100 p-2 rounded border-none" />
              </>
            )}
            <label className="flex items-center gap-1 ml-2 cursor-pointer">
              <input type="checkbox" checked={draft.is_all_day} onChange={e => set({ is_all_day: e.target.checked })} />
              Όλη μέρα
            </label>
            <select value={draft.recurrence} onChange={e => set({ recurrence: e.target.value as CalendarEvent['recurrence'] })} className="bg-gray-100 p-2 rounded border-none">
              <option value="none">Δεν επαναλαμβάνεται</option>
              <option value="daily">Καθημερινά</option>
              <option value="weekly">Εβδομαδιαία</option>
              <option value="monthly">Μηνιαία</option>
              <option value="custom">Προσαρμοσμένα…</option>
            </select>
            {draft.recurrence !== 'none' && <span title="Επαναλαμβανόμενο">🔁</span>}
            <select value={draft.time_zone} onChange={e => set({ time_zone: e.target.value })} className="bg-gray-100 p-2 rounded border-none">
              {[...new Set([draft.time_zone, ...TIME_ZONES])].map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>

          {/* Conferencing platform selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700">Διάσκεψη & Κλήσεις</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map(p => (
                <button
                  key={p.key}
                  onClick={() => selectPlatform(p.key)}
                  className={`flex items-center gap-2 text-xs px-3 py-2 rounded-md font-medium border transition-colors ${draft.meeting_platform === p.key ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  <Video className="w-4 h-4" style={{ color: p.color }} /> {p.label}
                </button>
              ))}
            </div>
            {draft.meeting_platform !== 'none' && (
              <div className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-200 p-2.5 rounded-md">
                <Clock className="w-3.5 h-3.5 text-gray-500" />
                {draft.meeting_platform === 'vapi_voice'
                  ? <span>Η VAPI agent θα πραγματοποιήσει αυτόματη κλήση στους επισκέπτες.</span>
                  : draft.meeting_platform === 'whatsapp'
                    ? <a href={draft.meeting_link} target="_blank" rel="noopener noreferrer" className="text-green-700 hover:underline truncate">{draft.meeting_link}</a>
                    : <a href={draft.meeting_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">{draft.meeting_link}</a>}
              </div>
            )}
          </div>

          {/* Location */}
          <div className="flex items-center gap-3 text-xs bg-gray-100 p-2.5 rounded-md">
            <MapPin className="w-4 h-4 text-gray-500" />
            <input type="text" placeholder="Προσθήκη τοποθεσίας" value={draft.location || ''} onChange={e => set({ location: e.target.value })} className="bg-transparent w-full focus:outline-none" />
          </div>

          {/* Notifications */}
          <div className="space-y-2">
            {draft.notifications.map((notif, idx) => (
              <div key={idx} className="flex items-center gap-3 text-xs">
                <Bell className="w-4 h-4 text-gray-500" />
                <select value={notif.type} onChange={e => set({ notifications: draft.notifications.map((n, i) => i === idx ? { ...n, type: e.target.value as 'notification' | 'email' } : n) })} className="bg-gray-100 p-2 rounded border-none">
                  <option value="notification">Ειδοποίηση</option>
                  <option value="email">Email</option>
                </select>
                <select value={notif.minutes} onChange={ev2 => set({ notifications: draft.notifications.map((n, i) => i === idx ? { ...n, minutes: Number(ev2.target.value) } : n) })} className="bg-gray-100 p-2 rounded border-none">
                  {[5, 10, 15, 30, 60, 1440].map(m => <option key={m} value={m}>{m >= 1440 ? '1 ημέρα' : m}{' λεπτά'.slice(0, m >= 1440 ? 99 : 99)}</option>)}
                </select>
                <button onClick={() => set({ notifications: draft.notifications.filter((_, i) => i !== idx) })}><X className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" /></button>
              </div>
            ))}
            <button onClick={handleAddNotification} className="text-xs text-blue-600 font-semibold hover:underline pl-7">
              + Προσθήκη υπενθύμισης
            </button>
          </div>

          {/* Owner / busy / visibility */}
          <div className="flex items-center gap-4 text-xs pt-4 border-t flex-wrap">
            <select value={draft.owner_id} onChange={e => set({ owner_id: e.target.value })} className="bg-gray-100 p-2 rounded border-none font-medium">
              <option>{draft.owner_id}</option>
            </select>
            <select value={draft.busy_status} onChange={e => set({ busy_status: e.target.value as 'busy' | 'free' })} className="bg-gray-100 p-2 rounded border-none">
              <option value="busy">Απασχολημένο</option>
              <option value="free">Ελεύθερο</option>
            </select>
            <select value={draft.visibility} onChange={e => set({ visibility: e.target.value as CalendarEvent['visibility'] })} className="bg-gray-100 p-2 rounded border-none">
              <option value="default">Προεπιλεγμένη ορατότητα</option>
              <option value="public">Δημόσιο</option>
              <option value="private">Ιδιωτικό</option>
            </select>
            {/* Color swatches */}
            <div className="flex items-center gap-1.5">
              {EVENT_COLORS.map(c => (
                <button key={c} onClick={() => set({ color: c })} title={c}
                  className={`w-5 h-5 rounded-full border-2 transition-transform ${draft.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>

          {/* Rich text toolbar & description */}
          <div className="border rounded-lg overflow-hidden">
            <div className="flex items-center gap-1 p-2 bg-gray-50 border-b text-gray-600">
              <button className="p-1 hover:bg-gray-200 rounded" title="Έντονα" onClick={() => wrapSelection('**')}><Bold className="w-4 h-4" /></button>
              <button className="p-1 hover:bg-gray-200 rounded italic" title="Πλάγια" onClick={() => wrapSelection('*')}><Italic className="w-4 h-4" /></button>
              <button className="p-1 hover:bg-gray-200 rounded underline" title="Υπογράμμιση" onClick={() => wrapSelection('_')}><Underline className="w-4 h-4" /></button>
              <div className="h-4 w-px bg-gray-300 mx-1" />
              <button className="p-1 hover:bg-gray-200 rounded" title="Λίστα κουκκίδων" onClick={() => prefixLines('- ')}><List className="w-4 h-4" /></button>
              <button className="p-1 hover:bg-gray-200 rounded" title="Αριθμημένη λίστα" onClick={() => prefixLines(i => `${i}. `)}><ListOrdered className="w-4 h-4" /></button>
              <button className="p-1 hover:bg-gray-200 rounded" title="Σύνδεσμος" onClick={insertLink}><Link2 className="w-4 h-4" /></button>
            </div>
            <textarea
              ref={descRef}
              rows={6}
              placeholder="Προσθήκη περιγραφής"
              value={draft.description || ''}
              onChange={e => set({ description: e.target.value })}
              className="w-full p-3 text-xs focus:outline-none resize-y"
            />
          </div>

          {/* Footer actions */}
          {!isNew && draft.id && (
            <div className="flex items-center gap-3 pt-2">
              <button onClick={() => onDelete(draft.id!)} className="flex items-center gap-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2.5 rounded-md transition-colors">
                <Trash2 className="w-4 h-4" /> Διαγραφή
              </button>
              {draft.status !== 'completed' && (
                <button onClick={() => onSave({ ...draft, status: 'completed' })} className="flex items-center gap-2 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 px-4 py-2.5 rounded-md transition-colors">
                  <CheckCircle className="w-4 h-4" /> Ολοκληρώθηκε
                </button>
              )}
            </div>
          )}
        </div>

        {/* ═══ RIGHT COLUMN: GUESTS & PERMISSIONS ═══ */}
        <div className="space-y-6 border-l pl-8">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Επισκέπτες</h3>
            <div className="relative">
              <input
                type="text"
                placeholder="Προσθήκη επισκεπτών"
                value={contactSearch}
                onChange={e => setContactSearch(e.target.value)}
                className="w-full p-2 bg-gray-100 text-xs rounded focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
              />
              {filteredContacts.length > 0 && (
                <div className="absolute left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto z-10 mt-1">
                  {filteredContacts.map(contact => (
                    <div key={contact.id} onClick={() => handleAddGuest(contact)} className="p-2 hover:bg-blue-50 cursor-pointer text-xs flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-gray-800">{contact.name}</div>
                        <div className="text-gray-400 text-[10px]">{contact.email || '—'}</div>
                      </div>
                      <span className={`px-1.5 py-0.5 text-[9px] rounded uppercase font-bold ${ROLE_STYLES[contact.role]}`}>{contact.role}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Guest pill list */}
            <div className="mt-3 space-y-1">
              {draft.guests.map(guest => (
                <div key={guest.id} className="flex items-center justify-between text-xs bg-gray-50 p-2 rounded border">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{guest.name}</div>
                    <div className="text-[10px] text-gray-400 truncate">{guest.email || '—'}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className={`px-1.5 py-0.5 text-[9px] rounded uppercase font-bold ${ROLE_STYLES[guest.role]}`}>{guest.role}</span>
                    <button onClick={() => set({ guests: draft.guests.filter(g => g.id !== guest.id) })}><X className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Guest permissions */}
          <div className="space-y-2 pt-4 border-t text-xs">
            <span className="font-semibold text-gray-700">Δικαιώματα επισκεπτών</span>
            {([
              ['modify_event', 'Τροποποίηση γεγονότος'],
              ['invite_others', 'Πρόσκληση άλλων'],
              ['see_guest_list', 'Προβολή λίστας επισκεπτών'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.guest_permissions[key]}
                  onChange={e => set({ guest_permissions: { ...draft.guest_permissions, [key]: e.target.checked } })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          {draft.source_email_id && (
            <div className="pt-4 border-t text-[11px] text-gray-400">
              📧 Δημιουργήθηκε από email (#…{String(draft.source_email_id).slice(-6)})
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
