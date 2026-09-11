import { useEffect, useMemo, useState } from 'react';
import type { RoutePlan, RouteStop } from '@/lib/routing/types';
import { planRoute } from '@/lib/routing/routing-provider';
import { formatDistance, formatDuration } from '@/lib/geo/distance';
import NavigationButton from '@/components/navigation/NavigationButton';
import { Btn, Card, Micro, Spinner } from '@/lib/ui';
import { Route as RouteIcon, X } from 'lucide-react';

export type RouteStopInput = {
  id: string;
  label: string;
  subtitle?: string;
  lat: number;
  lng: number;
  scheduledAt?: string | null;
};

function toInternal(s: RouteStopInput): RouteStop {
  return { id: s.id, label: s.label, position: { lat: s.lat, lng: s.lng }, scheduledAt: s.scheduledAt };
}

export default function RoutePanel({ stops, onPlan, onClose }: {
  stops: RouteStopInput[];
  onPlan?: (plan: RoutePlan, ordered: RouteStop[]) => void;
  onClose?: () => void;
}) {
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ordered = useMemo(() => {
    const withCoords = stops.filter(s => s.lat != null && s.lng != null && !Number.isNaN(s.lat));
    return [...withCoords].sort((a, b) => {
      if (a.scheduledAt && b.scheduledAt) return +new Date(a.scheduledAt) - +new Date(b.scheduledAt);
      if (a.scheduledAt) return -1;
      if (b.scheduledAt) return 1;
      return 0;
    });
  }, [stops]);

  useEffect(() => {
    let alive = true;
    if (ordered.length < 2) {
      setPlan(null);
      setError(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setError(null);
    setPlan(null);
    const internal = ordered.map(toInternal);
    planRoute(internal)
      .then(p => {
        if (!alive) return;
        setPlan(p);
        onPlan?.(p, internal);
      })
      .catch(e => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Δεν ήταν δυνατή η δρομολόγηση της διαδρομής.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [ordered, onPlan]);

  const navigateStops = ordered.length < 2
    ? null
    : {
        destination: { lat: ordered[ordered.length - 1].lat, lng: ordered[ordered.length - 1].lng, label: ordered[ordered.length - 1].label },
        waypoints: ordered.slice(1, -1).map(s => ({ lat: s.lat, lng: s.lng, label: s.label })),
      };

  return (
    <Card className="!p-0" pad={false}>
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div>
          <Micro tone="brand">Route planner</Micro>
          <h3 className="text-[15px] font-semibold text-ink tracking-tight mt-0.5 flex items-center gap-2">
            <RouteIcon className="w-4 h-4 text-ink/40" /> Δρομολόγιο
          </h3>
        </div>
        {onClose && <Btn variant="ghost" aria-label="Κλείσιμο δρομολογίου" onClick={onClose}><X className="w-4 h-4" /></Btn>}
      </div>

      {ordered.length < 2 && (
        <p className="px-5 pb-4 text-xs text-ink/45">
          Χρειάζονται τουλάχιστον 2 στάσεις με γεωγραφική θέση για την κατασκευή διαδρομής.
        </p>
      )}

      {loading && <div className="flex items-center justify-center py-8"><Spinner /></div>}

      {!loading && plan && (
        <>
          <div className="px-5 pb-2 flex items-center gap-2 flex-wrap">
            <span className="pill bg-ok-100 text-ok-600">{formatDistance(plan.totalDistanceMeters / 1000)}</span>
            <span className="pill bg-brand-100 text-brand-600">{formatDuration(plan.totalDurationSeconds)}</span>
            <span className="pill bg-ink/10 text-ink/70">{plan.source === 'osrm' ? 'OSRM' : plan.source === 'ors' ? 'openrouteservice' : 'Εκτίμηση ευθείας γραμμής'}</span>
          </div>
          {plan.estimated && (
            <p className="px-5 pb-2 text-[11px] text-warn-600">
              {plan.error ?? 'Δεν έχει ρυθμιστεί υπηρεσία δρομολόγησης — η απόσταση είναι οδική εκτίμηση χωρίς χάρτη δρόμων.'}
            </p>
          )}

          <div className="px-3 pb-3 space-y-1">
            {ordered.map((s, i) => {
              const leg = plan.legs.find(l => l.fromIndex === i);
              return (
                <div key={s.id} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-ink/[0.03]">
                  <span className="w-5 h-5 rounded-full bg-ink text-paper text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium text-ink truncate">{s.label}</span>
                    {s.subtitle && <span className="block text-xs text-ink/45 truncate">{s.subtitle}</span>}
                    <span className="block text-[10px] text-ink/35">
                      {s.scheduledAt ? `Προγραμματισμένη: ${new Date(s.scheduledAt).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })}` : 'Δεν έχει ώρα'}
                    </span>
                  </span>
                  {leg && <span className="text-[11px] text-ink/45 shrink-0">{formatDistance(leg.distanceMeters / 1000)}</span>}
                </div>
              );
            })}
          </div>

          <div className="px-5 pb-4">
            {navigateStops && (
              <NavigationButton variant="primary" label="Πλοήγηση διαδρομής" className="w-full justify-center" showSelector={false} {...navigateStops} />
            )}
          </div>
        </>
      )}

      {!loading && error && (
        <p className="px-5 pb-4 text-xs text-bad-600">{error} — εμφανίζεται εκτίμηση κατά προσέγγιση στη λίστα.</p>
      )}
    </Card>
  );
}