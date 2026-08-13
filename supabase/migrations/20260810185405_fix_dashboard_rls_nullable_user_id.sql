/*
# Make user_id nullable on ai_agents and lead_sources + fix RLS + seed demo

## What changes
1. `ai_agents.user_id` and `lead_sources.user_id` made nullable (was NOT NULL).
   These tables are now company-wide (shared CRM data), so user_id is no longer required.
2. RLS policies changed from per-user to company-wide for authenticated users.
3. Seed demo data into all three dashboard tables.
*/

-- ===== Make user_id nullable =====
ALTER TABLE ai_agents ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE lead_sources ALTER COLUMN user_id DROP NOT NULL;

-- ===== ai_agents: company-wide for authenticated =====
DROP POLICY IF EXISTS "select_own_agents" ON ai_agents;
CREATE POLICY "select_all_agents" ON ai_agents FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_agents" ON ai_agents;
CREATE POLICY "insert_all_agents" ON ai_agents FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_agents" ON ai_agents;
CREATE POLICY "update_all_agents" ON ai_agents FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_own_agents" ON ai_agents;
CREATE POLICY "delete_all_agents" ON ai_agents FOR DELETE
  TO authenticated USING (true);

-- ===== lead_sources: company-wide for authenticated =====
DROP POLICY IF EXISTS "select_own_sources" ON lead_sources;
CREATE POLICY "select_all_sources" ON lead_sources FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_sources" ON lead_sources;
CREATE POLICY "insert_all_sources" ON lead_sources FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_sources" ON lead_sources;
CREATE POLICY "update_all_sources" ON lead_sources FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_own_sources" ON lead_sources;
CREATE POLICY "delete_all_sources" ON lead_sources FOR DELETE
  TO authenticated USING (true);

-- ===== Seed demo data =====
INSERT INTO ai_agents (name, channel, status, leads_contacted, replies, meetings_booked)
VALUES
  ('Αθήνα Email Bot', 'email', 'active', 342, 87, 23),
  ('Θεσσαλονίκη SMS Agent', 'sms', 'active', 218, 54, 15),
  ('Νησιωτικό Voice Agent', 'voice', 'paused', 156, 31, 8),
  ('B2B Outbound Email', 'email', 'active', 489, 112, 41)
ON CONFLICT DO NOTHING;

INSERT INTO lead_sources (name, type, lawful_basis, leads_this_month, status)
VALUES
  ('Website Form', 'opt-in', 'consent', 142, 'active'),
  ('Referral Program', 'referral', 'consent', 68, 'active'),
  ('Event Leads', 'event', 'consent', 34, 'paused'),
  ('Partner Network', 'partner', 'legitimate_interest', 91, 'active')
ON CONFLICT DO NOTHING;

INSERT INTO powerfor_leads (first_name, last_name, email, phone, region, customer_type, provider, status, consent)
VALUES
  ('Γιάννης', 'Παπαδόπουλος', 'giannis.pap@email.gr', '+30 690 123 4567', 'Αττική', 'Ιδιώτης (νοικοκυριό)', 'Ρεύμα', 'new', true),
  ('Μαρία', 'Γεωργίου', 'maria.g@email.gr', '+30 698 234 5678', 'Θεσσαλονίκη', 'Ιδιώτης (νοικοκυριό)', 'Φυσικό Αέριο', 'contacted', true),
  ('Νίκος', 'Δημητρίου', 'nikos.d@email.gr', '+30 697 345 6789', 'Κρήτη', 'Εταιρεία (B2B)', 'Φωτοβολταϊκά', 'qualified', true),
  ('Ελένη', 'Νικολάου', 'eleni.n@email.gr', '+30 694 456 7890', 'Ιόνια Νησιά', 'Ιδιώτης (νοικοκυριό)', 'Ρεύμα', 'closed', true),
  ('Κώστας', 'Αντωνίου', 'kostas.a@email.gr', '+30 699 567 8901', 'Πελοπόννησος', 'Επαγγελματίας / Καταστηματάρχης', 'Ηλεκτροκίνηση', 'new', true),
  ('Σοφία', 'Παπαδάκη', 'sofia.p@email.gr', '+30 690 678 9012', 'Νησιά Αιγαίου', 'Ιδιώτης (νοικοκυριό)', 'Ρεύμα', 'contacted', true),
  ('Δημήτρης', 'Σπύρου', 'dim.spiros@email.gr', '+30 698 789 0123', 'Θεσσαλία', 'Αγροτικός / Αγροτέχνης', 'Φωτοβολταϊκά', 'qualified', true),
  ('Αγγέλα', 'Μαρίνου', 'angela.m@email.gr', '+30 697 890 1234', 'Ήπειρος', 'Εταιρεία (B2B)', 'Φυσικό Αέριο', 'new', true)
ON CONFLICT DO NOTHING;
