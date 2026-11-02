/** Selection helpers for the Admin Leads bulk-action toolbar. */
export function toggleVisibleLeadSelection(current: ReadonlySet<string>, visibleIds: readonly string[]): Set<string> {
  const next = new Set(current);
  if (visibleIds.length > 0 && visibleIds.every(id => next.has(id))) {
    visibleIds.forEach(id => next.delete(id));
  } else {
    visibleIds.forEach(id => next.add(id));
  }
  return next;
}

/** Keep cross-filter selections, but remove IDs that no longer exist in the active Leads dataset. */
export function pruneLeadSelection(current: ReadonlySet<string>, existingIds: readonly string[]): Set<string> {
  const existing = new Set(existingIds);
  return new Set([...current].filter(id => existing.has(id)));
}
