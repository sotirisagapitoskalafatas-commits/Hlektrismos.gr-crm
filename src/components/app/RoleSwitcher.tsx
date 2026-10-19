/* «Επίδειξη ρόλου (demo)» — presentation-only role preview.
   Rendered ONLY when the server allows it for this account (role_preview_status: QA Admin presentation
   account, until 16/10/2026 00:00 Athens). Read-only; never changes real permissions; not a security test.
   PreviewBanner is the persistent notice shown while a preview runs. */

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { ROLE_COLOR, ROLES, accessGroupLabel } from '@/lib/roles';
import type { Role } from '@/lib/roles';
import { rgbaOf } from '@/lib/ui';
import { useToast } from '@/lib/toast';
import { PREVIEW_BLOCKED_EVENT } from '@/lib/role-preview';
import { Eye, LogOut } from 'lucide-react';

const endLabel = (ms: number | null) => (ms ? new Date(ms).toLocaleString('el-GR', { timeZone: 'Europe/Athens', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '');

export default function RoleSwitcher({ onPicked }: { onPicked?: () => void }) {
  const { profile, preview, startPreview, endPreview } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (!preview.allowed || !profile) return null;
  const current = preview.role ?? profile.role;

  const pick = async (r: Role) => {
    setBusy(true);
    const ok = r === profile.role ? (await endPreview(), true) : await startPreview(r);
    setBusy(false);
    if (!ok) toast('Η επίδειξη ρόλου δεν είναι διαθέσιμη για αυτόν τον λογαριασμό.', 'bad');
    else onPicked?.();
  };

  return (
    <div aria-label="Επίδειξη ρόλου (demo)">
      <div className="flex items-center justify-between mb-1.5">
        <span className="micro">Επίδειξη ρόλου (demo)</span>
        <span className="text-[10.5px] text-ink/40">έως {endLabel(preview.expiresAt)}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Επίδειξη ρόλου">
        {ROLES.map(r => {
          const c = ROLE_COLOR[r.id];
          const active = current === r.id;
          return (
            <button key={r.id} role="radio" aria-checked={active} type="button" disabled={busy}
              onClick={() => void pick(r.id)} title={r.hint}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-60"
              style={active
                ? { background: rgbaOf(c, 0.14), color: c, boxShadow: `inset 0 0 0 1px ${rgbaOf(c, 0.35)}` }
                : { background: 'rgba(15,23,42,0.04)', color: '#334155' }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                style={{ background: c }} aria-hidden="true">{r.short}</span>
              <span className="truncate">{r.label}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-ink/45 leading-snug">Μόνο για την παρουσίαση· μόνο ανάγνωση. Δεν αλλάζει τα πραγματικά δικαιώματα του λογαριασμού.</p>
    </div>
  );
}

/** Persistent banner while a preview runs; also explains blocked writes. */
export function PreviewBanner() {
  const { profile, preview, endPreview } = useAuth();
  const { toast } = useToast();
  useEffect(() => {
    const h = () => toast('Προεπισκόπηση ρόλου: μόνο ανάγνωση — η ενέργεια δεν εκτελέστηκε.', 'bad');
    window.addEventListener(PREVIEW_BLOCKED_EVENT, h);
    return () => window.removeEventListener(PREVIEW_BLOCKED_EVENT, h);
  }, [toast]);
  if (!preview.role || !profile) return null;
  return (
    <div role="status" className="atx-preview-banner">
      <Eye size={16} aria-hidden="true" className="shrink-0" />
      <span className="flex-1 min-w-0">
        <strong>ΠΡΟΕΠΙΣΚΟΠΗΣΗ ΡΟΛΟΥ — DEMO.</strong> Δεν αλλάζει τα πραγματικά δικαιώματα του λογαριασμού.
        <span className="atx-preview-roles"> Προβολή ως: <b>{accessGroupLabel(preview.role)}</b> · Πραγματικός ρόλος: <b>{accessGroupLabel(profile.role)}</b> · μόνο ανάγνωση</span>
      </span>
      <button type="button" className="atx-preview-exit" onClick={() => void endPreview()}>
        <LogOut size={14} aria-hidden="true" /> Επιστροφή στον πραγματικό ρόλο
      </button>
    </div>
  );
}
