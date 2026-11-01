import { fieldCheckin, fieldCheckout, fieldCheckoutWithOutcome } from '@/lib/api';
import { listQueue, removeQueued } from './queue';
import { classifyReplay } from '@/lib/field-visits';

/** done = synchronised; failed = still queued, will be retried; conflicts = the visit was cancelled / removed meanwhile, so the action was dropped (reported, never retried). */
export async function flushQueue(): Promise<{ done: number; failed: number; conflicts: number }> {
  const items = listQueue();
  let done = 0;
  let failed = 0;
  let conflicts = 0;
  for (const item of items) {
    try {
      if (item.kind === 'check_in') {
        const p = item.payload as { visitId: string; coords?: { lat: number; lng: number; accuracy?: number } };
        const res = await fieldCheckin(p.visitId, p.coords);
        const v = classifyReplay(res);
        if (v === 'conflict') { removeQueued(item.id); conflicts++; continue; }
        if (v === 'retry') throw new Error(res.message ?? 'OUTSIDE_RADIUS');
      } else if (item.kind === 'check_out') {
        const p = item.payload as { visitId: string; coords?: { lat: number; lng: number; accuracy?: number }; notes?: string; outcomeKey?: string; outcomeReason?: string; result?: string };
        const res = p.outcomeKey
          ? await fieldCheckoutWithOutcome(p.visitId, p.coords, p.notes ?? '', p.outcomeKey, p.outcomeReason, p.result)
          : await fieldCheckout(p.visitId, p.coords, p.notes);
        const v = classifyReplay(res);
        if (v === 'conflict') { removeQueued(item.id); conflicts++; continue; }
        if (v === 'retry') throw new Error(res.message ?? 'OUTSIDE_RADIUS');
      } else {
        removeQueued(item.id);
        continue;
      }
      removeQueued(item.id);
      done++;
    } catch {
      failed++;
    }
  }
  return { done, failed, conflicts };
}