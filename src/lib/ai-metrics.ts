/** Counts derived strictly from persisted execution logs. Never negative, never a placeholder. */
export function countByStatus(logs: ReadonlyArray<{ status?: string | null }>, status: string): number {
  let n = 0;
  for (const l of logs) if (l.status === status) n++;
  return n;
}
