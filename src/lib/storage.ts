import { supabase } from '@/lib/supabase';

const BUCKET = 'hlektrismos_docs';

export type UploadedFile = {
  path: string;
  name: string;
  type: string;
  size: number;
  url?: string;
};

/**
 * Upload a file to the hlektrismos_docs bucket and return the file metadata.
 * Supports PDF, JPG, PNG, WebP, Excel, CSV up to 25MB.
 */
export async function uploadDocument(
  file: File,
  leadId?: string,
): Promise<{ data: UploadedFile | null; error: string | null }> {
  // Validate file size (25MB max)
  if (file.size > 25 * 1024 * 1024) {
    return { data: null, error: 'Το αρχείο υπερβαίνει το όριο 25MB.' };
  }

  // Validate file type
  const allowed = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
  ];
  if (!allowed.includes(file.type)) {
    return { data: null, error: 'Μη υποστηριζόμενος τύπος αρχείου. Επιτρέπονται: PDF, JPG, PNG, WebP, Excel, CSV.' };
  }

  // Build path: lead-specific or anonymous contact form
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const folder = leadId ? `leads/${leadId}` : 'contact-forms';
  const path = `${folder}/${timestamp}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return { data: null, error: `Σφάλμα μεταφόρτωσης: ${uploadError.message}` };
  }

  const fileData: UploadedFile = {
    path,
    name: file.name,
    type: file.type,
    size: file.size,
  };

  return { data: fileData, error: null };
}

/**
 * Get a signed URL for viewing/downloading a stored file.
 */
export async function getFileUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  return data?.signedUrl || null;
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(path: string): Promise<{ error: string | null }> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  return { error: error?.message || null };
}

/**
 * Update a lead's bill_files JSONB array.
 */
export async function updateLeadBillFiles(
  leadId: string,
  billFiles: UploadedFile[],
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('hlektrismos_leads')
    .update({ bill_files: billFiles })
    .eq('id', leadId);
  return { error: error?.message || null };
}
