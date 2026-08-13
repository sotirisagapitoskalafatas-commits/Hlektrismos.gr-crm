/*
# Add GDPR routing, AI Agent configuration, and Market RAG tables

## 1. powerfor_leads — new columns
- `lawful_basis` (text, nullable): 'Consent' or 'Legitimate_Interest' — tracks the GDPR lawful basis for this lead.
- `customer_category` (text, nullable): 'B2C_Household' or 'B2B_Corporate' — used for GDPR routing logic.
- `pipeline_status` (text, default 'new'): 'New', 'Contacted', 'Qualified', 'Closed' — the sales pipeline stage.

## 2. ai_agents — new columns
- `target_region` (text, nullable): the Greek region this agent targets (e.g. 'Attica', 'Crete').
- `base_prompt` (text, nullable): the base LLM prompt template the agent uses.
- `handoff_condition` (text, nullable): when to hand off to a human — 'Interest Confirmed', 'Pricing Requested', 'Angry Lead'.

## 3. New table: market_tariffs
- `id` (uuid, pk)
- `resource` (text): 'Electricity', 'Natural Gas', or 'Photovoltaic'
- `tariff_name` (text): name of the tariff plan
- `price_eur` (numeric): price in EUR per unit
- `unit` (text): e.g. '€/kWh', '€/MWh'
- `updated_at` (timestamptz): last sync timestamp
- Used by the Market RAG dashboard to display live tariffs that AI agents use as knowledge base.

## Security
- market_tariffs: RLS enabled, authenticated-only CRUD (dashboard is behind login).
- No changes to existing policies on powerfor_leads or ai_agents.
*/

-- Add GDPR + pipeline columns to powerfor_leads
ALTER TABLE powerfor_leads
  ADD COLUMN IF NOT EXISTS lawful_basis text,
  ADD COLUMN IF NOT EXISTS customer_category text,
  ADD COLUMN IF NOT EXISTS pipeline_status text DEFAULT 'new';

-- Add agent configuration columns to ai_agents
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS target_region text,
  ADD COLUMN IF NOT EXISTS base_prompt text,
  ADD COLUMN IF NOT EXISTS handoff_condition text;

-- Create market_tariffs table
CREATE TABLE IF NOT EXISTS market_tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource text NOT NULL,
  tariff_name text NOT NULL,
  price_eur numeric(10,4) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT '€/kWh',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE market_tariffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_market_tariffs" ON market_tariffs;
CREATE POLICY "select_market_tariffs" ON market_tariffs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_market_tariffs" ON market_tariffs;
CREATE POLICY "insert_market_tariffs" ON market_tariffs FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_market_tariffs" ON market_tariffs;
CREATE POLICY "update_market_tariffs" ON market_tariffs FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_market_tariffs" ON market_tariffs;
CREATE POLICY "delete_market_tariffs" ON market_tariffs FOR DELETE
  TO authenticated USING (true);

-- Seed initial tariff data
INSERT INTO market_tariffs (resource, tariff_name, price_eur, unit) VALUES
  ('Electricity', 'ΔΕΗ Blue Home', 0.1820, '€/kWh'),
  ('Electricity', 'Protergia Fix 12', 0.1750, '€/kWh'),
  ('Electricity', 'ΗΡΩΝ OnePlan', 0.1890, '€/kWh'),
  ('Natural Gas', 'ΔΕΗ Gas Home', 0.0580, '€/kWh'),
  ('Natural Gas', 'Protergia Gas Fix', 0.0610, '€/kWh'),
  ('Photovoltaic', 'Net Metering Feed-in', 0.0850, '€/kWh'),
  ('Photovoltaic', 'Green Feed-in Premium', 0.0920, '€/kWh')
ON CONFLICT DO NOTHING;
