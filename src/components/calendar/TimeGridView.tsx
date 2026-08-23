import { CalendarEvent, CalendarSettings } from '@/types/calendar';
import { PositionedEvent, layoutDayEvents, fmtTime, sameDay } from './shared';

const HOUR_HEIGHT = 48;

export default function TimeGridView({ days, events, settings, onSlotClick, onEventClick }: {
  days: Date[];
  events: CalendarEvent[];
  settings: CalendarSettings;
  onSlotClick: (slot: Date) => void;
  onEventClick: (ev: CalendarEvent) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const now = new Date();
  const showNowLine = days.some(d => sameDay(d, now));
  const nowTop = (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_HEIGHT;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex min-w-fit">
        {/* Hour gutter */}
        <div className="w-16 shrink-0 border-r border-gray-200 select-none" style={{ paddingTop: 44 }}>
          <div style={{ height: HOUR_HEIGHT * 24 }} className="relative text-[10px] text-gray-400 pr-2">
            {hours.map(h => (
              <div key={h} className="absolute right-2 -translate-y-1/2" style={{ top: h * HOUR_HEIGHT }}>
                {settings.timeFormat === '12h'
                  ? (h === 0 ? '12 πμ' : h < 12 ? `${h} πμ` : h === 12 ? '12 μμ' : `${h - 12} μμ`)
                  : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>
        </div>

        {/* Day columns */}
        <div className="flex flex-1" style={{ minWidth: days.length * 140 }}>
          {days.map((day, di) => {
            const isToday = sameDay(day, now);
            const positioned: PositionedEvent[] = layoutDayEvents(events, day, HOUR_HEIGHT);
            return (
              <div key={di} className="flex-1 border-r border-gray-200 last:border-r-0 min-w-[140px]">
                {/* Day header */}
                <div className={`sticky top-0 z-10 bg-white border-b border-gray-200 h-11 flex flex-col items-center justify-center ${isToday ? '' : ''}`}>
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">
                    {day.toLocaleDateString('el-GR', { weekday: 'short' })}
                  </div>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium ${isToday ? 'bg-blue-600 text-white' : 'text-gray-700'}`}>
                    {day.getDate()}
                  </div>
                </div>

                {/* Slots */}
                <div className="relative bg-white cursor-pointer"
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const minutes = Math.floor(((e.clientY - rect.top) / HOUR_HEIGHT) * 60 / 15) * 15;
                    const slot = new Date(day);
                    slot.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
                    onSlotClick(slot);
                  }}
                >
                  {hours.map(h => (
                    <div key={h} className="border-b border-gray-100 hover:bg-blue-50/40 transition-colors" style={{ height: HOUR_HEIGHT }} />
                  ))}

                  {/* Current time indicator */}
                  {showNowLine && isToday && (
                    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowTop }}>
                      <div className="h-px bg-red-500" />
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 -mt-[5px] -ml-1" />
                    </div>
                  )}

                  {/* Events */}
                  {positioned.map(({ ev, top, height, leftPct, widthPct }) => (
                    <div
                      key={ev.id}
                      onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                      title={`${ev.title} · ${fmtTime(new Date(ev.start_time), settings.timeFormat)}`}
                      className="absolute rounded px-1.5 py-1 text-[10px] leading-tight overflow-hidden shadow-sm hover:shadow transition-shadow cursor-pointer z-10 text-white"
                      style={{
                        top, height, left: `${leftPct}%`, width: `calc(${widthPct}% - 4px)`,
                        background: ev.color,
                        opacity: ev.status === 'cancelled' ? 0.5 : ev.status === 'completed' ? 0.75 : 1,
                        textDecoration: ev.status === 'cancelled' ? 'line-through' : 'none',
                      }}
                    >
                      <div className="font-semibold truncate">{ev.title}</div>
                      {height > 28 && (
                        <div className="opacity-90 truncate">
                          {fmtTime(new Date(ev.start_time), settings.timeFormat)} – {fmtTime(new Date(ev.end_time || ev.start_time), settings.timeFormat)}
                          {ev.location && height > 42 && <> · {ev.location}</>}
                        </div>
                      )}
                      {ev.guests.length > 0 && height > 56 && (
                        <div className="opacity-80">👥 {ev.guests.length}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
