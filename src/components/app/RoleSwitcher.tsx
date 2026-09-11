/* ------------------------------------------------------------------ */
/*  RoleSwitcher — demo role simulator (CRM Shell Redesign).          */
/*  Colored role chips with short codes; simulation is temporary and   */
/*  never persists beyond local override. No permission changes.       */
/* ------------------------------------------------------------------ */

import { useAuth } from '@/lib/auth';
import { DEFAULT_ROLE, ROLE_COLOR, ROLES, roleLabel } from '@/lib/roles';
import { rgbaOf } from '@/lib/ui';
import { RefreshCcw } from 'lucide-react';

export default function RoleSwitcher() {
  const { role, profile, setRoleOverride, clearRoleOverride } = useAuth();
  const physical = profile?.role ?? DEFAULT_ROLE;
  const sim = role !== physical;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="micro">Επίδειξη ρόλου (demo)</span>
        {sim && (
          <button onClick={clearRoleOverride} title="Επιστροφή στον φυσικό ρόλο"
            className="micro text-brand-600 hover:underline inline-flex items-center gap-1">
            <RefreshCcw className="w-3 h-3" /> Επαναφορά
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Επίδειξη ρόλου">
        {ROLES.map(r => {
          const c = ROLE_COLOR[r.id];
          const active = role === r.id;
          return (
            <button key={r.id} role="radio" aria-checked={active} type="button"
              onClick={() => setRoleOverride(r.id)} title={r.hint}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors"
              style={active
                ? { background: rgbaOf(c, 0.14), color: c, boxShadow: `inset 0 0 0 1px ${rgbaOf(c, 0.35)}` }
                : { background: 'rgba(15,23,42,0.04)', color: '#334155' }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                style={{ background: c }} aria-hidden="true">
                {r.short}
              </span>
              <span className="truncate">{r.label}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <span className="pill text-[10px]" style={{ background: rgbaOf(ROLE_COLOR[physical], 0.12), color: ROLE_COLOR[physical] }}>
          φυσικός ρόλος · {roleLabel(physical)}
        </span>
        <span className="text-[11px] text-ink/40">προσωρινή προσομοίωση, μόνο για επίδειξη</span>
      </div>
    </div>
  );
}