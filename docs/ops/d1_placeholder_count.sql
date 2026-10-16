-- D1 — COUNT ONLY, READ-ONLY. Run it yourself in the Supabase SQL editor (production). It returns numbers only:
-- no names, phones or emails. It changes nothing.
--   customers_with_placeholder        customers whose email is the website placeholder (or any …@hlektrismos.local)
--   placeholder_customers_multi_lead  of those, how many are linked to MORE THAN ONE lead (through their cases)
--   likely_two_people                 of those, how many have leads with DIFFERENT phones (last 10 digits)
--                                     → most likely two different people joined into one customer
with placeholder as (
  select c.id
  from public.customers c
  where lower(btrim(coalesce(c.email, ''))) like '%@hlektrismos.local'
),
links as (
  select p.id as customer_id, l.id as lead_id,
         nullif(right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10), '') as phone_key
  from placeholder p
  join public.cases k on k.customer_id = p.id
  join public.leads l on l.id = k.lead_id
),
per_customer as (
  select customer_id, count(distinct lead_id) as leads, count(distinct phone_key) as phones
  from links group by customer_id
)
select
  (select count(*) from placeholder)                                   as customers_with_placeholder,
  (select count(*) from per_customer where leads > 1)                  as placeholder_customers_multi_lead,
  (select count(*) from per_customer where leads > 1 and phones > 1)   as likely_two_people;
