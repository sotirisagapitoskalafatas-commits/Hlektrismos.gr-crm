import { X } from 'lucide-react';
import { CalendarSettings, TIME_ZONES } from '@/types/calendar';

export default function CalendarSettingsModal({ settings, onChange, onClose }: {
  settings: CalendarSettings;
  onChange: (s: CalendarSettings) => void;
  onClose: () => void;
}) {
  const set = (patch: Partial<CalendarSettings>) => onChange({ ...settings, ...patch });
  const sel = 'w-full border border-gray-300 p-2 rounded bg-gray-50 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 bg-black/30 z-[9000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[620px] max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-800">Ρυθμίσεις Ημερολογίου</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-700" /></button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 text-xs">
          {/* Language & region */}
          <section className="space-y-3">
            <h3 className="font-bold text-sm text-blue-600 uppercase tracking-wider">Γλώσσα & Περιοχή</h3>
            <div>
              <label className="block text-gray-600 mb-1">Γλώσσα</label>
              <select className={sel} value={settings.language} onChange={e => set({ language: e.target.value })}>
                <option>Greek (Ελληνικά)</option>
                <option>English (US)</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-600 mb-1">Χώρα</label>
              <select className={sel} value={settings.country} onChange={e => set({ country: e.target.value })}>
                <option>Greece (Ελλάδα)</option>
                <option>Cyprus (Κύπρος)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-600 mb-1">Μορφή Ημερομηνίας</label>
                <select className={sel} value={settings.dateFormat} onChange={e => set({ dateFormat: e.target.value as CalendarSettings['dateFormat'] })}>
                  <option value="DD/MM/YYYY">31/12/2026</option>
                  <option value="MM/DD/YYYY">12/31/2026</option>
                  <option value="YYYY-MM-DD">2026-12-31</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-600 mb-1">Μορφή Ώρας</label>
                <select className={sel} value={settings.timeFormat} onChange={e => set({ timeFormat: e.target.value as '12h' | '24h' })}>
                  <option value="24h">13:00</option>
                  <option value="12h">1:00 μμ</option>
                </select>
              </div>
            </div>
          </section>

          {/* Time zones */}
          <section className="space-y-3 border-t pt-4">
            <h3 className="font-bold text-sm text-blue-600 uppercase tracking-wider">Ζώνη Ώρας</h3>
            <div>
              <label className="block text-gray-600 mb-1">Κύρια ζώνη ώρας</label>
              <select className={sel} value={settings.primaryTimeZone} onChange={e => set({ primaryTimeZone: e.target.value })}>
                {[...new Set([settings.primaryTimeZone, ...TIME_ZONES])].map(tz => <option key={tz}>{tz}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={settings.showWorldClock} onChange={e => set({ showWorldClock: e.target.checked })} />
              <span>Εμφάνιση δευτερεύουσας ζώνης ώρας (παγκόσμιο ρολόι)</span>
            </label>
            {settings.showWorldClock && (
              <div>
                <label className="block text-gray-600 mb-1">Δευτερεύουσα ζώνη ώρας</label>
                <select className={sel} value={settings.secondaryTimeZone || ''} onChange={e => set({ secondaryTimeZone: e.target.value || undefined })}>
                  <option value="">— Κανένα —</option>
                  {TIME_ZONES.map(tz => <option key={tz}>{tz}</option>)}
                </select>
              </div>
            )}
          </section>

          {/* Event settings */}
          <section className="space-y-3 border-t pt-4">
            <h3 className="font-bold text-sm text-blue-600 uppercase tracking-wider">Ρυθμίσεις Γεγονότων</h3>
            <div>
              <label className="block text-gray-600 mb-1">Προεπιλεγμένη διάρκεια</label>
              <select className={sel} value={settings.defaultDuration} onChange={e => set({ defaultDuration: Number(e.target.value) })}>
                <option value={15}>15 λεπτά</option>
                <option value={30}>30 λεπτά</option>
                <option value={45}>45 λεπτά</option>
                <option value={60}>60 λεπτά</option>
                <option value={90}>90 λεπτά</option>
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={settings.speedyMeetings} onChange={e => set({ speedyMeetings: e.target.checked })} />
              <span>Γρήγορες συναντήσεις (τα 30λεπτα λήγουν στα 25', τα 60λεπτα στα 50')</span>
            </label>
          </section>

          {/* Display options */}
          <section className="space-y-3 border-t pt-4">
            <h3 className="font-bold text-sm text-blue-600 uppercase tracking-wider">Επιλογές Προβολής</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={settings.showWeekends} onChange={e => set({ showWeekends: e.target.checked })} />
              <span>Εμφάνιση Σαββατοκύριακου</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={settings.showDeclinedEvents} onChange={e => set({ showDeclinedEvents: e.target.checked })} />
              <span>Εμφάνιση ακυρωμένων γεγονότων</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={settings.showCompletedTasks} onChange={e => set({ showCompletedTasks: e.target.checked })} />
              <span>Εμφάνιση ολοκληρωμένων εργασιών</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={settings.showWeekNumbers} onChange={e => set({ showWeekNumbers: e.target.checked })} />
              <span>Εμφάνιση αριθμών εβδομάδων</span>
            </label>
            <div>
              <label className="block text-gray-600 mb-1">Έναρξη εβδομάδας</label>
              <select className={sel} value={settings.startWeekOn} onChange={e => set({ startWeekOn: e.target.value as 'Sunday' | 'Monday' })}>
                <option value="Monday">Δευτέρα</option>
                <option value="Sunday">Κυριακή</option>
              </select>
            </div>
          </section>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end">
          <button onClick={onClose} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-full text-xs transition-colors">
            Τέλος
          </button>
        </div>
      </div>
    </div>
  );
}
