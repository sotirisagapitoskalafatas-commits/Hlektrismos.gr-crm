import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useNav } from '@/lib/nav';
import { SERVICES, stageLabel } from '@/lib/roles';
import { Case, CaseVisit, fetchCases, fetchVisits } from '@/lib/api';
import { Card, Micro, Spinner } from '@/lib/ui';
import { MapPin } from 'lucide-react';

const CASE_COLORS: Record<string, string> = {
  new: '#d6d1ca', contacted: '#2f5fd8', offer: '#2f5fd8', application: '#2f5fd8',
  signed: '#d99b28', document_check: '#d99b28', submitted: '#d99b28',
  activation: '#1c6f52', completed: '#1c6f52',
};

export default function MapPage() {
  const { openCase } = useNav();
  const [cases, setCases] = useState<Case[]>([]);
  const [visits, setVisits] = useState<CaseVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [map, setMap] = useState<L.Map | null>(null);

  useEffect(() => {
    (async () => {
      const [c, v] = await Promise.all([fetchCases({ includeDone: true }), fetchVisits()]);
      setCases(c);
      setVisits(v);
      setLoading(false);
    })();
  }, []);

  const markers = useMemo(
    () => cases.filter(c => c.lat != null && c.lng != null),
    [cases],
  );

  useEffect(() => {
    if (map) {
      map.invalidateSize();
      const allCoords: [number, number][] = markers.map(m => [m.lat!, m.lng!]);
      const visitCoords = visits.filter(v => v.location?.lat != null && v.location.lng != null).map(v => [v.location!.lat!, v.location!.lng!] as [number, number]);
      if (allCoords.length > 0) {
        const bounds = L.latLngBounds([...allCoords, ...visitCoords]);
        map.fitBounds(bounds.pad(0.4), { maxZoom: 13 });
      }
    }
  }, [map, markers, visits]);

  useEffect(() => {
    if (!map) return;
    const ic: L.Marker[] = [];
    markers.forEach(m => {
      const icon = L.divIcon({
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        html: `<div style="width:12px;height:12px;border-radius:50%;background:${CASE_COLORS[m.current_stage] ?? '#d6d1ca'};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
      });
      const mk = L.marker([m.lat!, m.lng!], { icon })
        .addTo(map)
        .bindPopup(
          `<div style="font-family:system-ui;font-size:12px;min-width:140px">
            <div style="font-weight:600">${m.case_no} · ${stageLabel(m.current_stage)}</div>
            <div style="margin:2px 0 4px">${m.customer?.full_name ?? m.title}</div>
            <div style="opacity:.6">${SERVICES[m.service_type] ?? m.service_type}${m.address ? ' · ' + m.address : ''}</div>
          </div>`,
        );
      ic.push(mk);
    });
    const iv: L.Marker[] = [];
    visits.filter(v => v.location?.lat != null && v.location.lng != null).forEach(v => {
      const icon = L.divIcon({
        className: '',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
        html: `<div style="width:8px;height:8px;border-radius:50%;background:#2f5fd8;outline:2px solid #2f5fd833"></div>`,
      });
      iv.push(L.marker([v.location!.lat!, v.location!.lng!], { icon }).addTo(map)
        .bindPopup(`<div style="font-family:system-ui;font-size:12px">Επίσκεψη — ${v.purpose || v.case?.customer?.full_name || ''}</div>`));
    });
    return () => {
      ic.forEach(m => m.remove());
      iv.forEach(m => m.remove());
    };
  }, [map, markers, visits]);

  useEffect(() => {
    const container = document.getElementById('peak-map');
    if (!container) return;
    if (map) return;
    const m = L.map(container, { zoomControl: true, scrollWheelZoom: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      detectRetina: true,
      maxZoom: 19,
    }).addTo(m);
    setMap(m);
    return () => { m.remove(); setMap(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Spinner /></div>;
  }

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Micro tone="brand">Field sales</Micro>
          <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">Χάρτης · Πωλήσεις πεδίου</h2>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-ink/50">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-500" /> Cases (κατά στάδιο)</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-500/40" /> Επισκέψεις</span>
        </div>
      </div>

      <Card className="!p-0 !border-0 !shadow-none" pad={false}>
        <div id="peak-map" className="h-[480px] rounded-[10px] overflow-hidden border border-line" />
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {markers.slice(0, 9).map(m => (
          <button key={m.id} onClick={() => openCase(m.id)}
            className="text-left p-3 rounded-xl border border-line bg-white hover:border-ink/25 transition-colors flex items-center gap-3">
            <span className="w-7 h-7 rounded-lg bg-ink/5 flex items-center justify-center shrink-0">
              <MapPin className="w-3.5 h-3.5 text-ink/50" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-medium text-ink truncate">{m.customer?.full_name ?? m.title}</span>
              <span className="block text-xs text-ink/45 truncate">{m.case_no} · {SERVICES[m.service_type] ?? m.service_type}</span>
            </span>
            <span className="text-[11px] font-mono uppercase text-ink/40 shrink-0">{stageLabel(m.current_stage)}</span>
          </button>
        ))}
      </div>
      {markers.length === 0 && (
        <p className="text-center text-xs text-ink/40 py-4">
          Δεν υπάρχουν cases με αποθηκευμένη γεωγραφική θέση — προσθέστε lat/lng στο case ή χρησιμοποιήστε το Check In για GPS.
        </p>
      )}
    </div>
  );
}