import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import type { Role } from '@/lib/roles';
import { Micro, Btn } from '@/lib/ui';
import { ArrowUpRight, Briefcase, CalendarClock, Compass, LayoutDashboard, Map } from 'lucide-react';
import type { IconType } from '@/lib/ui';
import { DashboardLoader } from '@/components/dashboards/shared';
import AdminDashboard from '@/components/dashboards/AdminDashboard';
import ManagerDashboard from '@/components/dashboards/ManagerDashboard';
import InsideSalesDashboard from '@/components/dashboards/InsideSalesDashboard';
import FieldSalesDashboard from '@/components/dashboards/FieldSalesDashboard';
import BackOfficeDashboard from '@/components/dashboards/BackOfficeDashboard';
import { todayLabel } from '@/lib/ui';

type QuickAction = { icon: IconType; label: string; onClick: () => void };

function useQuickActions(go: (p: 'cases' | 'followups' | 'leads' | 'myday' | 'map' | 'backoffice') => void, role: Role) {
  const all: QuickAction[] = [
    { icon: Briefcase, label: 'Νέο Case', onClick: () => go('cases') },
    { icon: CalendarClock, label: 'Follow Ups', onClick: () => go('followups') },
  ];
  const extra: QuickAction[] = [];
  if (role === 'field_sales') {
    extra.push({ icon: Compass, label: 'Ημέρα μου', onClick: () => go('myday') });
    extra.push({ icon: Map, label: 'Χάρτης', onClick: () => go('map') });
  }
  if (role === 'back_office') {
    extra.push({ icon: LayoutDashboard, label: 'Operations', onClick: () => go('backoffice') });
  }
  if (role === 'inside_sales' || role === 'admin' || role === 'manager') {
    extra.push({ icon: ArrowUpRight, label: 'Leads', onClick: () => go('leads') });
  }
  return [...all, ...extra];
}

export default function HomePage() {
  const { role } = useAuth();
  const { go } = useNav();

  const quick = useQuickActions(go, role);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Καλημέρα' : hour < 18 ? 'Καλησπέρα' : 'Καλησπέρα';

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <Micro tone="brand">Command Center</Micro>
          <h2 className="text-xl font-semibold text-ink tracking-tight mt-1">{greeting} · {todayLabel()}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {quick.map(a => (
            <Btn key={a.label} variant="outline" onClick={a.onClick}>
              <a.icon className="w-3.5 h-3.5" /> {a.label}
            </Btn>
          ))}
        </div>
      </div>

      <DashboardLoader>
        {d => role === 'admin'
          ? <AdminDashboard d={d} />
          : role === 'manager'
            ? <ManagerDashboard d={d} />
            : role === 'inside_sales'
              ? <InsideSalesDashboard d={d} />
              : role === 'field_sales'
                ? <FieldSalesDashboard d={d} />
                : <BackOfficeDashboard d={d} />}
      </DashboardLoader>
    </div>
  );
}