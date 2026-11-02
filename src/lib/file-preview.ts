export type FilePreviewKind = 'image' | 'pdf' | 'unsupported';

/** Decide which common private CRM uploads can be previewed inline by the browser. */
export function filePreviewKind(mimeType?: string | null, fileName?: string | null): FilePreviewKind {
  const mime = (mimeType ?? '').split(';')[0].trim().toLowerCase();
  const name = (fileName ?? '').trim().toLowerCase();

  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (
    (mime.startsWith('image/') && !['image/heic', 'image/heif', 'image/tiff'].includes(mime)) ||
    /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name)
  ) return 'image';
  return 'unsupported';
}
