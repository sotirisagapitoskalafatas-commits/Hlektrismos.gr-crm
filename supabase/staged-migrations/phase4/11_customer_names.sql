-- STAGED (Phase 4 / 11) — NOT APPLIED. Additive only.
-- Customers get separate first / last name. full_name stays the display name and is still written by the app
-- (first + last), so every existing screen, query and export keeps working. Existing rows are NOT rewritten:
-- the new columns stay null until someone edits the customer.
alter table public.customers
  add column if not exists first_name text,
  add column if not exists last_name text;
-- ROLLBACK: alter table public.customers drop column if exists first_name, drop column if exists last_name;
