/* Human-readable Greek timing text for work items. Pure (takes `now`), so it is unit-tested. */
import type { WorkItem } from './work';

const rtf = new Intl.RelativeTimeFormat('el', { numeric: 'auto' });
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

/** "5 λεπτά", "3 ώρες", "2 ημέρες" — plain duration, no direction. */
export function durationEl(ms: number): string {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 1) return 'λιγότερο από 1 λεπτό';
  if (m < 60) return m === 1 ? '1 λεπτό' : `${m} λεπτά`;
  const h = Math.round(ms / HOUR);
  if (h < 24) return h === 1 ? '1 ώρα' : `${h} ώρες`;
  const d = Math.round(ms / DAY);
  return d === 1 ? '1 ημέρα' : `${d} ημέρες`;
}

const clock = (t: number) => new Date(t).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hour12: false });

export function formatWhen(item: Pick<WorkItem, 'kind' | 'bucket' | 'due' | 'since'>, now: number): string {
  if (item.kind === 'followup' && item.due !== null) {
    const diff = item.due - now;
    if (item.bucket === 'overdue') {
      const m = Math.round(-diff / MIN);
      if (m < 60) return rtf.format(-Math.max(m, 1), 'minute');
      const h = Math.round(-diff / HOUR);
      return h < 24 ? rtf.format(-h, 'hour') : rtf.format(-Math.round(-diff / DAY), 'day');
    }
    if (item.bucket === 'today') return `Σήμερα, ${clock(item.due)}`;
    const d = new Date(item.due).toLocaleDateString('el-GR', { weekday: 'short', day: 'numeric', month: 'short' });
    return `${d}, ${clock(item.due)}`;
  }
  if (item.kind === 'lead' && item.since !== null) return `Περιμένει ${durationEl(now - item.since)}`;
  if (item.kind === 'case' && item.since !== null) {
    const age = now - item.since;
    return age < DAY ? 'Ενημερώθηκε σήμερα' : `Χωρίς κίνηση ${durationEl(age)}`;
  }
  return '';
}
