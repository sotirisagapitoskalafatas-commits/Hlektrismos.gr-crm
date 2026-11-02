import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

test('public form uploads use an isolated anonymous client; CRM uploads retain the staff session', () => {
  const storage = source('../../src/lib/storage.ts');

  assert.match(storage, /import\s*\{\s*anonymousClient\s*,\s*supabase\s*\}\s*from\s*['"]@\/lib\/supabase['"]/);
  assert.match(storage, /const\s+storageClient\s*=\s*leadId\s*\?\s*supabase\s*:\s*anonymousClient\(\)/);
  assert.match(storage, /storageClient\.storage[\s\S]*?\.upload\(path,\s*file/);
  assert.match(storage, /const\s+folder\s*=\s*leadId\s*\?\s*`leads\/\$\{leadId\}`\s*:\s*['"]contact-forms['"]/);
  assert.match(storage, /upsert:\s*false/);
});

test('anonymousClient cannot persist, refresh, or inherit a staff session and remains preview-guarded', () => {
  const supabase = source('../../src/lib/supabase.ts');

  assert.match(supabase, /global:\s*\{\s*fetch:\s*guardedFetch\s*\}/);
  assert.match(supabase, /persistSession:\s*false/);
  assert.match(supabase, /autoRefreshToken:\s*false/);
  assert.match(supabase, /detectSessionInUrl:\s*false/);
});
