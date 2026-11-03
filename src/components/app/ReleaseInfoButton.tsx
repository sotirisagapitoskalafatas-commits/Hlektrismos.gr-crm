import { CalendarDays, GitBranch, GitCommit, Info } from 'lucide-react';
import { useState } from 'react';
import { Modal, Pill } from '@/lib/ui';
import type { PillTone } from '@/lib/ui';
import {
  formatBuildDate,
  releaseEnvironmentLabel,
  releaseEnvironmentTone,
  releaseInfo,
} from '@/lib/release';
import { RELEASE_NOTES } from '@/lib/release-notes';

export default function ReleaseInfoButton() {
  const [open, setOpen] = useState(false);
  const environmentTone = releaseEnvironmentTone(releaseInfo.environment) as PillTone;

  return (
    <>
      <button type="button" role="menuitem" className="shell-menu__item" onClick={() => setOpen(true)}>
        <Info className="w-4 h-4" aria-hidden="true" /> Έκδοση &amp; ενημερώσεις
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Έκδοση & ενημερώσεις" micro="ATLAS CRM · HLEKTRISMOS.GR">
        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="micro text-ink/40">Τρέχουσα έκδοση</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight text-ink">v{releaseInfo.version}</div>
                <p className="mt-1 text-xs text-ink/45">ATLAS CRM · Hlektrismos.gr</p>
              </div>
              <Pill tone={environmentTone}>{releaseEnvironmentLabel(releaseInfo.environment)}</Pill>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-paper/60 p-4">
            <div className="mb-3 text-[13px] font-semibold text-ink">Στοιχεία build</div>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-2.5">
                <GitCommit className="mt-0.5 h-4 w-4 shrink-0 text-ink/40" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-[11px] text-ink/40">Git commit</dt>
                  <dd className="truncate font-mono text-xs text-ink" title={releaseInfo.commitSha ?? undefined}>
                    {releaseInfo.commitSha ? releaseInfo.commitSha.slice(0, 12) : 'Δεν παρέχεται'}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-ink/40" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-[11px] text-ink/40">Git branch</dt>
                  <dd className="truncate text-xs text-ink" title={releaseInfo.branch ?? undefined}>
                    {releaseInfo.branch ?? 'Δεν παρέχεται'}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5 sm:col-span-2">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-ink/40" aria-hidden="true" />
                <div>
                  <dt className="text-[11px] text-ink/40">Χρόνος δημιουργίας build</dt>
                  <dd className="text-xs text-ink">{formatBuildDate(releaseInfo.builtAt)}</dd>
                </div>
              </div>
            </dl>
            <p className="mt-3 text-[11px] leading-relaxed text-ink/40">
              Τα στοιχεία προέρχονται από το build. Ο χρόνος που εμφανίζεται είναι ο χρόνος δημιουργίας του build,
              όχι εκτίμηση της ώρας δημοσίευσης.
            </p>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-[13px] font-semibold text-ink">Ιστορικό εκδόσεων</h3>
              <span className="micro text-ink/35">{RELEASE_NOTES.length} καταγεγραμμένη έκδοση</span>
            </div>
            <div className="space-y-3">
              {RELEASE_NOTES.map((note) => (
                <article key={note.version} className="rounded-2xl border border-line bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm text-ink">v{note.version} · {note.title}</strong>
                    <time className="text-[11px] text-ink/40" dateTime={note.date}>
                      {new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium' }).format(new Date(note.date))}
                    </time>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-ink/55">{note.summary}</p>
                  <ul className="mt-3 space-y-1.5 pl-4 text-xs leading-relaxed text-ink/65 list-disc">
                    {note.changes.map((change) => <li key={change}>{change}</li>)}
                  </ul>
                </article>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink/40">
              Το ιστορικό αρχίζει από την πρώτη καταγεγραμμένη baseline έκδοση. Δεν ανακατασκευάζονται αυθαίρετα
              παλαιότερες εκδόσεις ή ημερομηνίες.
            </p>
          </section>
        </div>
      </Modal>
    </>
  );
}
