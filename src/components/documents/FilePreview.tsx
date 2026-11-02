import { ExternalLink, FileText } from 'lucide-react';
import { filePreviewKind } from '@/lib/file-preview';

export default function FilePreview({ url, name, mimeType, className = '' }: {
  url: string | null | undefined;
  name: string;
  mimeType?: string | null;
  className?: string;
}) {
  const kind = filePreviewKind(mimeType, name);
  if (!url) return (
    <div className={`rounded-xl border border-dashed border-[var(--atx-line)] bg-[var(--atx-panel)] px-4 py-5 text-[13px] text-[var(--atx-muted)] ${className}`}>
      Η προεπισκόπηση δεν είναι διαθέσιμη αυτή τη στιγμή.
    </div>
  );

  return (
    <div className={`overflow-hidden rounded-xl border border-[var(--atx-line)] bg-white ${className}`} data-file-preview={kind}>
      {kind === 'image' ? (
        <a href={url} target="_blank" rel="noreferrer" aria-label={`Άνοιγμα εικόνας ${name} σε νέο παράθυρο`}
          className="block bg-slate-50">
          <img src={url} alt={name} loading="lazy" decoding="async"
            className="block w-full max-h-[380px] object-contain" />
        </a>
      ) : kind === 'pdf' ? (
        <iframe src={url} title={`Προεπισκόπηση PDF: ${name}`} loading="lazy"
          className="block h-[420px] w-full bg-slate-100" />
      ) : (
        <div className="flex items-center gap-2 px-3 py-4 text-[13px] text-[var(--atx-muted)]">
          <FileText size={18} aria-hidden="true" /> Δεν υποστηρίζεται ενσωματωμένη προεπισκόπηση για αυτόν τον τύπο αρχείου.
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-[var(--atx-line)] px-3 py-2">
        <span className="min-w-0 truncate text-[12px] text-[var(--atx-muted)]">{name}</span>
        <a href={url} target="_blank" rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-[var(--atx-blue)] hover:underline">
          Άνοιγμα <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
