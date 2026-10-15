-- STAGED (Phase 4 / 14) — NOT APPLIED. Additive only.
-- A proper flag for «Follow-up από υπεύθυνο» instead of recognising it by the text of the reason.
-- null = an ordinary follow-up; 'manager' = escalated from a field visit to the manager / Back Office queue.
alter table public.follow_ups add column if not exists kind text check (kind in ('manager'));
create index if not exists follow_ups_kind_idx on public.follow_ups (kind) where kind is not null;
-- Mark follow-ups the app created before this column existed (they carry the fixed prefix). Fills nulls only.
update public.follow_ups set kind = 'manager' where kind is null and reason like 'Follow-up από υπεύθυνο%';
-- ROLLBACK: alter table public.follow_ups drop column if exists kind;
