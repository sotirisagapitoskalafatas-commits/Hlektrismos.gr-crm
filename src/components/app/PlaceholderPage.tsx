import { Card, Micro } from '@/lib/ui';
import { Building2, Gauge, Settings, Users } from 'lucide-react';
import type { IconType } from '@/lib/ui';

const DEFS: Record<string, { title: string; desc: string; icon: IconType }> = {
  customers: { title: 'Customers', desc: 'Πλήρες μητρώο πελατών με ιστορικό, συμβόλαια και σχέσεις.', icon: Users },
  providers: { title: 'Πάροχοι', desc: 'Διαχείριση παρόχων, προγραμμάτων και τιμοκαταλόγων ενέργειας.', icon: Building2 },
  reports: { title: 'Reports', desc: 'Αναλυτικά reports απόδοσης πωλήσεων και pipeline.', icon: Gauge },
  admin: { title: 'JARVIS', desc: 'AI πράκτορας που αναλύει το δίκτυο Sales και προτείνει ενέργειες.', icon: Settings },
};

export default function PlaceholderPage({ kind }: { kind: string }) {
  const d = DEFS[kind] ?? DEFS.reports;
  return (
    <div className="max-w-3xl">
      <Card>
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-ink/5 flex items-center justify-center">
            <d.icon className="w-5 h-5 text-ink/50" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Micro tone="warn">Planned module</Micro>
            </div>
            <h2 className="text-[17px] font-semibold text-ink tracking-tight">{d.title}</h2>
            <p className="text-sm text-ink/50 mt-1 max-w-lg">{d.desc}</p>
            <div className="mt-4 flex items-center gap-2">
              <span className="dot dot-planned" />
              <span className="text-xs text-ink/40">Αυτή η μονάδα βρίσκεται σε προγραμματισμό.</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}