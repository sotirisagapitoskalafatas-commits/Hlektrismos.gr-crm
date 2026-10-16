-- D1 — REVIEW LIST, READ-ONLY. Run only after the count (d1_placeholder_count.sql) shows likely_two_people > 0.
-- It shows personal data (names, phones) to the person running it: run it as the admin, do not export or share
-- the result outside the office. One row per lead on a possibly merged customer, for MANUAL review.
-- Nothing is split automatically. Repair is a manual decision per customer (see docs/ops/D1_PLACEHOLDER_EMAIL.md).
with placeholder as (
  select c.id, c.full_name, c.phone, c.created_at
  from public.customers c
  where lower(btrim(coalesce(c.email, ''))) like '%@hlektrismos.local'
),
links as (
  select p.id as customer_id, p.full_name as customer_name, p.phone as customer_phone,
         k.id as case_id, k.case_no, k.current_stage,
         l.id as lead_id, coalesce(nullif(btrim(l.full_name), ''), l.client_name) as lead_name, l.phone as lead_phone,
         l.created_at as lead_created_at,
         nullif(right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10), '') as phone_key
  from placeholder p
  join public.cases k on k.customer_id = p.id
  join public.leads l on l.id = k.lead_id
),
suspect as (
  select customer_id from links group by customer_id
  having count(distinct lead_id) > 1 and count(distinct phone_key) > 1
)
select l.customer_id, l.customer_name, l.customer_phone, l.case_no, l.current_stage,
       l.lead_id, l.lead_name, l.lead_phone, l.lead_created_at
from links l join suspect s using (customer_id)
order by l.customer_id, l.lead_created_at;
