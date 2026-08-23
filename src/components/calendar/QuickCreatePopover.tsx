import { useState } from 'react';
import { X, Clock, User, Video, Bell } from 'lucide-react';
import { CalendarEvent, CRMContact, CalendarEventType, CalendarSettings } from '@/types/calendar';
import { fmtTime, fmtDateBySetting } from './shared';

const ROLE_STYLES: Record<string, string> = {
  lead: 'bg-amber-100 text-amber-800',
  customer: 'bg-emerald-100 text-emerald-800',
  agent: 'bg-purple-100 text-purple-800',
};

const KIND_TABS: { key: CalendarEventType; label: string }[] = [
  { key: 'event', label: 'Γεγονός' },
  { key: 'task', label: 'Εργασία' },
  { key: 'appointment_schedule', label: 'Ραντεβού' },
];

export default function QuickCreatePopover({ event, contacts, settings, onClose, onSave, onMoreOptions }: {
  event: CalendarEvent;
  contacts: CRMContact[];
  settings: CalendarSettings;
  onClose: () => void;
  onSave: (ev: CalendarEvent) => void;
  onMoreOptions: (ev: CalendarEvent) => void;
}) {
  const [draft, setDraft] = useState<CalendarEvent>(event);
  const [contactSearch, setContactSearch] = useState('');

  const filteredContacts = contactSearch.trim() === '' ? [] : contacts.filter(c =>
    c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.email.toLowerCase().includes(contactSearch.toLowerCase())
  );

  const handleAddGuest = (contact: CRMContact) => {
    if (!draft.guests.some(g => g.id === contact.id)) {
      setDraft({ ...draft, guests: [...draft.guests, contact], color: draft.event_kind === 'event' && draft.guests.length === 0 ? '#3f51b5' : draft.color });
    }
    setContactSearch('');
  };

  const start = new Date(draft.start_time);
  const end = new Date(draft.end_time || draft.start_time);
  const dateLabel = `${start.toLocaleDateString('el-GR', { weekday: 'long' })} ${fmtDateBySetting(start, settings.dateFormat)} · ${fmtTime(start, settings.timeFormat)} – ${fmtTime(end, settings.timeFormat)}`;

  return (
    <div className="fixed inset-0 bg-black/20 z-[9000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[460px] p-6 space-y-4 border border-gray-100" onClick={e => e.stopPropagation()}>
        {/* Type tabs */}
        <div className="flex justify-between items-center border-b pb-3">
          <div className="flex gap-2">
            {KIND_TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setDraft({ ...draft, event_kind: t.key, color: t.key === 'task' ? '#0b8043' : t.key === 'appointment_schedule' ? '#8e24aa' : '#039be5' })}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${draft.event_kind === t.key ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>

        {/* Title */}
        <input
          type="text"
          autoFocus
          placeholder="Προσθήκη τίτλου"
          value={draft.title}
          onChange={e => setDraft({ ...draft, title: e.target.value })}
          onKeyDown={e => { if (e.key === 'Enter' && draft.title.trim()) onSave(draft); }}
          className="w-full text-xl font-medium border-b border-gray-300 focus:border-blue-600 focus:outline-none pb-1 placeholder-gray-400"
        />

        {/* Date/time */}
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <Clock className="w-4 h-4 text-gray-400" />
          <span>{dateLabel}</span>
        </div>

        {/* Guest auto-suggest */}
        <div className="relative">
          <div className="flex items-center gap-3">
            <User className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Επισκέπτες (Leads, Πελάτες, Πωλητές)"
              value={contactSearch}
              onChange={e => setContactSearch(e.target.value)}
              className="w-full border-b border-gray-200 py-1 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          {(filteredContacts.length > 0 || draft.guests.length > 0) && (
            <div className="absolute left-7 right-0 bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto z-10 mt-1">
              {draft.guests.length > 0 && (
                <div className="px-2 pt-1.5 flex flex-wrap gap-1">
                  {draft.guests.map(g => (
                    <span key={g.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${ROLE_STYLES[g.role]}`}>
                      {g.name}<button onClick={() => setDraft({ ...draft, guests: draft.guests.filter(x => x.id !== g.id) })}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              {filteredContacts.map(contact => (
                <div
                  key={contact.id}
                  onClick={() => handleAddGuest(contact)}
                  className="p-2 hover:bg-blue-50 cursor-pointer text-xs flex justify-between items-center"
                >
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

        {/* Meet button */}
        <button
          onClick={() => setDraft({
            ...draft,
            meeting_platform: draft.meeting_platform === 'google_meet' ? 'none' : 'google_meet',
            meeting_link: draft.meeting_platform === 'google_meet' ? '' : `https://meet.google.com/${Math.random().toString(36).slice(2, 5)}-${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 5)}`,
          })}
          className={`flex items-center gap-3 w-full text-left text-xs p-2 rounded-md font-medium transition-colors ${draft.meeting_platform === 'google_meet' ? 'bg-blue-50 text-blue-700' : 'text-blue-600 hover:bg-blue-50'}`}
        >
          <Video className="w-4 h-4" />
          {draft.meeting_platform === 'google_meet'
            ? <span className="truncate">{draft.meeting_link}</span>
            : <span>Προσθήκη Google Meet βιντεοδιάσκεψης</span>}
        </button>

        {/* Notification hint */}
        {draft.notifications.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-500 pl-1">
            <Bell className="w-3.5 h-3.5" />
            {draft.notifications[0].minutes} λεπτά πριν — {draft.notifications[0].type === 'email' ? 'email' : 'ειδοποίηση'}
          </div>
        )}

        <div className="flex justify-between items-center pt-4 border-t">
          <button onClick={() => onMoreOptions(draft)} className="text-xs text-blue-600 font-semibold hover:underline">
            Περισσότερες επιλογές
          </button>
          <button
            onClick={() => onSave(draft)}
            disabled={!draft.title.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-6 py-2 rounded-full shadow transition-colors"
          >
            Αποθήκευση
          </button>
        </div>
      </div>
    </div>
  );
}
