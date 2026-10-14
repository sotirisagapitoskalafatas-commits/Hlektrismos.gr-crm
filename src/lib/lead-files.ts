/* Files a visitor attached on the public contact form. The form stores them in the private `hlektrismos_docs`
   bucket and lists them on the lead (`leads.attached_files`); the CRM never showed them, so they looked lost.
   A case document that points to one of these files keeps the bucket in its reference (`hlektrismos_docs/<path>`),
   so filing it under a document type needs no copy or re-upload. Pure helpers, unit-tested. */

export interface LeadFile { path: string; name: string; type: string; size: number }

export const LEAD_FILES_BUCKET = 'hlektrismos_docs';
const PREFIX = `${LEAD_FILES_BUCKET}/`;

/** Reference stored in case_documents.file_url for a website file. */
export const leadFileRef = (path: string) => PREFIX + path;
/** The website-bucket path, or null when the reference belongs to the normal case-documents bucket. */
export const leadFilePath = (fileUrl: string | null | undefined) => (fileUrl && fileUrl.startsWith(PREFIX) ? fileUrl.slice(PREFIX.length) : null);

/** Valid entries only: the column is free-form jsonb written by the public form. */
export function leadFiles(raw: unknown): LeadFile[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object' && typeof (f as { path?: unknown }).path === 'string')
    .map(f => ({ path: String(f.path), name: String(f.name ?? String(f.path).split('/').pop()), type: String(f.type ?? ''), size: Number(f.size) || 0 }));
}

/** Website files not yet filed as a case document. */
export function unfiledLeadFiles(files: LeadFile[], docs: { file_url: string | null }[]): LeadFile[] {
  const filed = new Set(docs.map(d => leadFilePath(d.file_url)).filter(Boolean));
  return files.filter(f => !filed.has(f.path));
}

export const fileSizeText = (bytes: number) =>
  bytes <= 0 ? '' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
