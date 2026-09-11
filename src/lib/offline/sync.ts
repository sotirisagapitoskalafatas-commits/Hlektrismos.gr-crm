import { fieldCheckin, fieldCheckout } from '@/lib/api';
import { listQueue, removeQueued } from './queue';

export async function flushQueue(): Promise<{ done: number; failed: number }> {
  const items = listQueue();
  let done = 0;
  let failed = 0;
  for (const item of items) {
    try {
      if (item.kind === 'check_in') {
        const p = item.payload as { visitId: string; coords?: { lat: number; lng: number; accuracy?: number } };
        const res = await fieldCheckin(p.visitId, p.coords);
        if (!res.accepted && res.code !== 'IDEMPOTENT') throw new Error(res.message ?? 'OUTSIDE_RADIUS');
      } else if (item.kind === 'check_out') {
        const p = item.payload as { visitId: string; coords?: { lat: number; lng: number; accuracy?: number }; notes?: string };
        const res = await fieldCheckout(p.visitId, p.coords, p.notes);
        if (!res.accepted && res.code !== 'IDEMPOTENT') throw new Error(res.message ?? 'OUTSIDE_RADIUS');
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
  return { done, failed };
}