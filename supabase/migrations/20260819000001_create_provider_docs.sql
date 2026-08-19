-- hlektrismos_provider_docs: Provider program documents for Market RAG
-- Stores metadata about uploaded PDFs from energy providers (DEH, HERON, Protergia, etc.)
-- The extracted_text field holds the Gemini-processed summary for RAG retrieval

CREATE TABLE IF NOT EXISTS hlektrismos_provider_docs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_name TEXT NOT NULL,
  program_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'B2C',
  -- category: 'B2B' or 'B2C'
  energy_type TEXT NOT NULL DEFAULT 'Electricity',
  -- energy_type: 'Electricity', 'Natural Gas', 'Photovoltaic', 'EV Charging'
  price_per_kwh NUMERIC(10,4),
  fixed_fee_monthly NUMERIC(10,2) DEFAULT 0.00,
  document_title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  -- file_path: path in Supabase Storage bucket 'provider-documents'
  extracted_text TEXT,
  -- extracted_text: Gemini-processed summary of the PDF for RAG retrieval
  source_url TEXT,
  last_verified TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_docs_provider ON hlektrismos_provider_docs(provider_name);
CREATE INDEX IF NOT EXISTS idx_provider_docs_category ON hlektrismos_provider_docs(category);
CREATE INDEX IF NOT EXISTS idx_provider_docs_energy ON hlektrismos_provider_docs(energy_type);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_provider_docs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_provider_docs_updated_at ON hlektrismos_provider_docs;
CREATE TRIGGER trigger_update_provider_docs_updated_at
  BEFORE UPDATE ON hlektrismos_provider_docs
  FOR EACH ROW EXECUTE FUNCTION update_provider_docs_updated_at();

-- RLS
ALTER TABLE hlektrismos_provider_docs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated full access provider_docs' AND tablename = 'hlektrismos_provider_docs') THEN
    CREATE POLICY "Authenticated full access provider_docs" ON hlektrismos_provider_docs FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access provider_docs' AND tablename = 'hlektrismos_provider_docs') THEN
    CREATE POLICY "Service role full access provider_docs" ON hlektrismos_provider_docs FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Seed initial provider document data
INSERT INTO hlektrismos_provider_docs (provider_name, program_name, category, energy_type, price_per_kwh, fixed_fee_monthly, document_title, file_path, extracted_text) VALUES
  ('ΔΕΗ', 'Blue Home Fixed', 'B2C', 'Electricity', 0.1820, 5.00, 'Blue Home Fixed 12μηνος', 'deh/blue-home-fixed.pdf', 'Τιμή ρεύματος 0.182 €/kWh. Πάγιο 5€/μήνα. Δεσμευτικό 12 μήνες. Χωρίς κατάθεση.'),
  ('ΔΕΗ', 'Blue Home Flex', 'B2C', 'Electricity', 0.1950, 3.00, 'Blue Home Flex', 'deh/blue-home-flex.pdf', 'Μεταβλητή τιμή ανάλογα με την αγορά. Πάγιο 3€/μήνα. Χωρίς δέσμευση.'),
  ('Protergia', 'Fix 12', 'B2C', 'Electricity', 0.1750, 4.50, 'Fix 12 Μήνες', 'protergia/fix-12.pdf', 'Σταθερή τιμή 0.175 €/kWh για 12 μήνες. Πάγιο 4.50€. Κατάθεση 100€.'),
  ('Protergia', 'Dynamiki', 'B2C', 'Electricity', 0.1680, 2.00, 'Dynamiki Online', 'protergia/dynamiki.pdf', 'Online-only πρόγραμμα. Τιμή 0.168 €/kWh. Εξοικονόμηση έως 10% σε σχέση με το Fix.'),
  ('ΗΡΩΝ', 'OnePlan', 'B2C', 'Electricity', 0.1890, 6.00, 'OnePlan 12μηνος', 'heron/oneplan.pdf', 'Ενιαίο πρόγραμμα 0.189 €/kWh. Πάγιο 6€/μήνα. Περιλαμβάνει έκπτωση πίστωσης.'),
  ('ΗΡΩΝ', 'Business Pro', 'B2B', 'Electricity', 0.1620, 25.00, 'Business Pro B2B', 'heron/business-pro.pdf', 'Β2Β πρόγραμμα 0.162 €/kWh. Πάγιο 25€/μήνα. Ειδικός αντιπρόσωπος. Invoice με προθεσμία.'),
  ('ΔΕΗ', 'Enterprise Solutions', 'B2B', 'Electricity', 0.1550, 50.00, 'Enterprise B2B', 'deh/enterprise.pdf', 'B2B λύσεις για μεγάλες επιχειρήσεις. Τιμή 0.155 €/kWh. Πάγιο 50€/μήνα. Custom contract.'),
  ('Protergia', 'Solar Business', 'B2B', 'Photovoltaic', 0.0920, 0.00, 'Solar Business B2B', 'protergia/solar-business.pdf', 'B2B φωτοβολταϊκό πρόγραμμα. Feed-in premium 0.092 €/kWh. Χωρίς πάγιο.')
ON CONFLICT DO NOTHING;

-- Also add the provider_name and program_name columns to market_tariffs if missing
DO $$ BEGIN
  ALTER TABLE market_tariffs ADD COLUMN IF NOT EXISTS provider_name TEXT;
  ALTER TABLE market_tariffs ADD COLUMN IF NOT EXISTS program_name TEXT;
  ALTER TABLE market_tariffs ADD COLUMN IF NOT EXISTS last_verified TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

COMMENT ON TABLE hlektrismos_provider_docs IS 'Provider program documents for Market RAG. Stores metadata and Gemini-extracted text for RAG retrieval.';
COMMENT ON COLUMN hlektrismos_provider_docs.extracted_text IS 'Gemini-processed summary of the PDF document for RAG retrieval by AI agents.';
