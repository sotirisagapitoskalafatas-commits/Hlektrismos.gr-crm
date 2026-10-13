/** Escape text for safe interpolation into HTML (element content and quoted attribute values). */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"'`]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' } as Record<string, string>
  )[c]);
}
