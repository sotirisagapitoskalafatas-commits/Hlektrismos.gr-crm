/* Public form uploads from phones. Phones hand the browser files the old checks rejected:
   iPhone photos are HEIC/HEIF, and some Android pickers (Drive, Downloads, WhatsApp) give an empty `file.type`.
   `classifyUpload` accepts by MIME type OR extension and always returns a usable content type;
   `prepareForUpload` (browser only) re-encodes large or HEIC photos to JPEG so they upload over mobile data
   and open on any staff computer. If the browser cannot decode a photo, the original is uploaded unchanged. */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Files per public-form request (all pages of a bill, ID front/back, etc.). */
export const MAX_FORM_FILES = 10;

const BY_EXT: Record<string, { type: string; kind: 'pdf' | 'image' | 'sheet' }> = {
  pdf: { type: 'application/pdf', kind: 'pdf' },
  jpg: { type: 'image/jpeg', kind: 'image' },
  jpeg: { type: 'image/jpeg', kind: 'image' },
  png: { type: 'image/png', kind: 'image' },
  webp: { type: 'image/webp', kind: 'image' },
  heic: { type: 'image/heic', kind: 'image' },
  heif: { type: 'image/heif', kind: 'image' },
  xlsx: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'sheet' },
  xls: { type: 'application/vnd.ms-excel', kind: 'sheet' },
  csv: { type: 'text/csv', kind: 'sheet' },
};
const BY_TYPE: Record<string, string> = Object.fromEntries(Object.entries(BY_EXT).map(([ext, v]) => [v.type, ext]));
BY_TYPE['image/jpg'] = 'jpg';
BY_TYPE['image/pjpeg'] = 'jpg';
BY_TYPE['image/heic-sequence'] = 'heic';
BY_TYPE['image/heif-sequence'] = 'heif';

/** What the public contact form accepts (no spreadsheets). `image/*` lets phones offer the camera and gallery. */
export const PUBLIC_FORM_ACCEPT = 'application/pdf,image/*,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif';
export const PUBLIC_FORM_KINDS = ['pdf', 'image'] as const;

export interface UploadCheck {
  ok: boolean;
  /** Content type to store; never empty when ok. */
  contentType: string;
  kind: 'pdf' | 'image' | 'sheet' | null;
  ext: string;
  error?: string;
}

const extOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name.trim())?.[1] ?? '').toLowerCase();

export function classifyUpload(
  file: { name: string; type: string; size: number },
  kinds: readonly ('pdf' | 'image' | 'sheet')[] = ['pdf', 'image', 'sheet'],
): UploadCheck {
  const type = (file.type || '').toLowerCase();
  const fromType = BY_TYPE[type];
  const ext = fromType ?? (BY_EXT[extOf(file.name)] ? extOf(file.name) : '');
  const meta = ext ? BY_EXT[ext] : undefined;
  const label = kinds.includes('sheet') ? 'PDF, φωτογραφίες (JPG, PNG, HEIC), Excel ή CSV' : 'PDF ή φωτογραφίες (JPG, PNG, HEIC)';
  if (!meta || !kinds.includes(meta.kind)) {
    return { ok: false, contentType: '', kind: null, ext: '', error: `Το αρχείο «${file.name}» δεν υποστηρίζεται. Επιτρέπονται ${label}.` };
  }
  if (file.size === 0) {
    return { ok: false, contentType: '', kind: meta.kind, ext, error: `Το αρχείο «${file.name}» είναι κενό ή δεν διαβάστηκε από το κινητό. Δοκίμασε να το επιλέξεις ξανά.` };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, contentType: meta.type, kind: meta.kind, ext, error: `Το αρχείο «${file.name}» υπερβαίνει το όριο 25MB.` };
  }
  return { ok: true, contentType: meta.type, kind: meta.kind, ext };
}

/** Storage key: ASCII-only (Greek or emoji names from phones are replaced), unique, always with the right extension. */
export function storageName(name: string, ext: string, now = Date.now()): string {
  const base = name.replace(/\.[^.]*$/, '').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'file';
  // iPhones name every picked photo «image.jpg»: the random part keeps two uploads from colliding.
  return `${now}_${Math.random().toString(36).slice(2, 8)}_${base}.${ext}`;
}

/** Photos above this size, or in HEIC/HEIF, are re-encoded to JPEG before upload. */
const REENCODE_ABOVE = 3 * 1024 * 1024;
const MAX_EDGE = 2400;

export async function prepareForUpload(file: File): Promise<File> {
  const check = classifyUpload(file);
  if (!check.ok || check.kind !== 'image') return file;
  const heic = check.ext === 'heic' || check.ext === 'heif';
  if (!heic && file.size <= REENCODE_ABOVE) return file;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob || blob.size === 0) return file;
    const name = file.name.replace(/\.[^.]*$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file; // e.g. HEIC on a browser that cannot decode it: upload the original
  }
}
