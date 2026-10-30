// Profile photo: cropped to a square and shrunk to 256×256 JPEG in the browser, stored in the PRIVATE `avatars` bucket
// at `{user_id}/avatar.jpg`, shown through short-lived signed URLs (never a public link).
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export const AVATAR_SIZE = 256;
export const AVATAR_QUALITY = 0.85;
export const AVATAR_BUCKET = 'avatars';
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const SIGNED_SECONDS = 3600;

export const avatarPath = (userId: string) => `${userId}/avatar.jpg`;

/** Centered square crop of a w×h image (the largest square that fits). */
export function squareCrop(w: number, h: number): { sx: number; sy: number; side: number } {
  const side = Math.max(1, Math.min(w, h));
  return { sx: Math.floor((w - side) / 2), sy: Math.floor((h - side) / 2), side };
}

export function checkAvatarFile(file: { type: string; size: number }): string | null {
  if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(file.type)) return 'Επιλέξτε εικόνα JPEG, PNG ή WebP.';
  if (file.size > MAX_INPUT_BYTES) return 'Η εικόνα είναι πολύ μεγάλη (έως 15 MB).';
  return null;
}

/** File → 256×256 JPEG blob (white background so transparent PNGs do not turn black). */
export async function cropToAvatarBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { sx, sy, side } = squareCrop(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE; canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unavailable');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', AVATAR_QUALITY));
    if (!blob) throw new Error('encode failed');
    return blob;
  } finally { bitmap.close?.(); }
}

export type AvatarResult = { ok: true; path: string } | { ok: false; message: string };

export async function uploadAvatar(userId: string, blob: Blob): Promise<AvatarResult> {
  if (!supabase) return { ok: false, message: 'Η βάση δεν είναι διαθέσιμη.' };
  const path = avatarPath(userId);
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' });
  if (error) {
    const missing = /bucket not found|not found/i.test(error.message);
    return { ok: false, message: missing ? 'Η αλλαγή φωτογραφίας δεν είναι ακόμη διαθέσιμη.' : 'Η φωτογραφία δεν αποθηκεύτηκε. Δοκιμάστε ξανά.' };
  }
  return { ok: true, path };
}

export async function removeAvatar(userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath(userId)]);
  return !error;
}

const cache = new Map<string, { url: string; until: number }>();

/** Signed URL for a stored avatar path (cached until shortly before it expires). null = no photo / not available. */
export async function signedAvatarUrl(path: string | null | undefined, bust?: string): Promise<string | null> {
  if (!supabase || !path || !/^[0-9a-f-]{36}\/avatar\.jpg$/i.test(path)) return null;
  const key = path + (bust ?? '');
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, SIGNED_SECONDS);
  if (error || !data?.signedUrl) return null;
  cache.set(key, { url: data.signedUrl, until: Date.now() + (SIGNED_SECONDS - 120) * 1000 });
  return data.signedUrl;
}

/** Drop the cached link and tell every avatar on the page to reload (after upload or removal). */
export function forgetAvatar(path: string) {
  for (const k of [...cache.keys()]) if (k.startsWith(path)) cache.delete(k);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('atlas:avatar'));
}

export function useAvatarUrl(path: string | null | undefined, bust?: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener('atlas:avatar', bump);
    return () => window.removeEventListener('atlas:avatar', bump);
  }, []);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (path) void signedAvatarUrl(path, bust).then((u) => { if (alive) setUrl(u); }, () => undefined);
    return () => { alive = false; };
  }, [path, bust, version]);
  return url;
}
