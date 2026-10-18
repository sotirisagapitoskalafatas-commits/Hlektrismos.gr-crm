import { supabase } from '@/lib/supabase';
import { classifyUpload, storageName } from '@/lib/upload-files';

const BUCKET = 'hlektrismos_docs';

export type UploadedFile = {
  path: string;
  name: string;
  type: string;
  size: number;
  url?: string;
  /** The electricity connection this file belongs to (staged phase5/18), set by the lead form. */
  supply_point_id?: string;
};

/**
 * Upload a file to the hlektrismos_docs bucket and return the file metadata.
 * Supports PDF, JPG, PNG, WebP, HEIC/HEIF, Excel, CSV up to 25MB.
 */
export async function uploadDocument(
  file: File,
  leadId?: string,
): Promise<{ data: UploadedFile | null; error: string | null }> {
  // Accept by MIME type or extension: phones send HEIC photos and, on some Android pickers, an empty type.
  const check = classifyUpload(file);
  if (!check.ok) return { data: null, error: check.error ?? 'Μη υποστηριζόμενο αρχείο.' };

  // Build path: lead-specific or anonymous contact form
  const folder = leadId ? `leads/${leadId}` : 'contact-forms';
  const path = `${folder}/${storageName(file.name, check.ext)}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: check.contentType,
      upsert: false,
    });

  if (uploadError) {
    return { data: null, error: `Σφάλμα μεταφόρτωσης: ${uploadError.message}` };
  }

  const fileData: UploadedFile = {
    path,
    name: file.name,
    type: check.contentType,
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
