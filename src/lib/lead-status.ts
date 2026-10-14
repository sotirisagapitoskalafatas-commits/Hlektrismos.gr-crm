/* Display-only mapping for stored lead statuses (src/lib/roles.ts LEAD_STATUSES).
   NOTHING is migrated or rewritten: the stored value stays as-is; this only decides how it is SHOWN.
   Mapping follows docs/product/ATLAS_UX_BLUEPRINT.md §3 and is pending owner approval for
   `unqualified`, `meeting`, `offer`. Unknown historical values are shown verbatim, never hidden or guessed. */

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface LeadStatusDisplay {
  /** Plain-Greek primary label. */
  label: string;
  /** Optional finer detail, e.g. «Συνάντηση» under «Ειδικευμένο». */
  detail?: string;
  tone: StatusTone;
  /** true when the stored value is one of the nine defined statuses. */
  known: boolean;
  /** duplicate is a quality flag in the target model, not a sales stage. */
  isQualityFlag?: boolean;
  /** Unmodified stored value (null when absent). */
  raw: string | null;
}

const MAP: Record<string, Omit<LeadStatusDisplay, 'raw' | 'known'>> = {
  new: { label: 'Νέο', tone: 'info' },
  contacted: { label: 'Σε επικοινωνία', tone: 'info' },
  qualified: { label: 'Ειδικευμένο', tone: 'success' },
  meeting: { label: 'Ειδικευμένο', detail: 'Συνάντηση', tone: 'success' },
  offer: { label: 'Ειδικευμένο', detail: 'Προσφορά', tone: 'success' },
  converted: { label: 'Μετατράπηκε', tone: 'success' },
  lost: { label: 'Χάθηκε', tone: 'neutral' },
  unqualified: { label: 'Χάθηκε', detail: 'Μη επιλέξιμο', tone: 'neutral' },
  duplicate: { label: 'Διπλότυπο', tone: 'warning', isQualityFlag: true },
};

export function leadStatusDisplay(status: string | null | undefined): LeadStatusDisplay {
  const raw = status ?? null;
  const hit = raw ? MAP[raw] : undefined;
  if (hit) return { ...hit, known: true, raw };
  return {
    label: raw ? raw : 'Χωρίς κατάσταση',
    detail: raw ? 'Μη αναγνωρισμένη τιμή' : undefined,
    tone: 'warning',
    known: false,
    raw,
  };
}
