-- ============================================================
-- RAEYE-compliant Market RAG Pipeline
-- Enums, rag_document_endpoints, expanded market_tariffs,
-- pgvector embeddings, chat_threads, chat_messages,
-- and full provider endpoint seed (10 providers + RAEYE hubs)
-- ============================================================

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE tariff_color_enum AS ENUM ('green', 'blue', 'yellow', 'orange');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE customer_type_enum AS ENUM ('B2C', 'B2B');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 3. RAG Document Endpoints (scraper targets)
CREATE TABLE IF NOT EXISTS rag_document_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL,
  customer_type customer_type_enum NOT NULL DEFAULT 'B2C',
  tariff_color tariff_color_enum,
  endpoint_label TEXT NOT NULL,
  endpoint_url TEXT NOT NULL,
  file_type TEXT DEFAULT 'html',
  sync_frequency TEXT DEFAULT 'monthly',
  last_synced_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Expanded Market Tariffs (RAEYE color-coded)
-- Drop existing market_tariffs and recreate with new schema
DROP TABLE IF EXISTS market_tariffs CASCADE;

CREATE TABLE market_tariffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL,
  program_name TEXT NOT NULL,
  customer_type customer_type_enum NOT NULL DEFAULT 'B2C',
  tariff_color tariff_color_enum NOT NULL DEFAULT 'green',
  unit_rate_kwh NUMERIC(8,5) NOT NULL,
  fixed_fee_monthly NUMERIC(6,2) NOT NULL DEFAULT 0,
  validity_month VARCHAR(7) NOT NULL,
  source_url TEXT NOT NULL,
  category TEXT DEFAULT 'B2C',
  resource TEXT DEFAULT 'ρεύμα',
  last_verified TIMESTAMPTZ,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(provider_name, program_name, validity_month)
);

CREATE INDEX IF NOT EXISTS idx_market_tariffs_color ON market_tariffs(tariff_color);
CREATE INDEX IF NOT EXISTS idx_market_tariffs_provider ON market_tariffs(provider_name);
CREATE INDEX IF NOT EXISTS idx_market_tariffs_validity ON market_tariffs(validity_month);
CREATE INDEX IF NOT EXISTS idx_market_tariffs_embedding ON market_tariffs USING hnsw (embedding vector_cosine_ops);

-- 5. HNSW index for fast semantic search
-- (already created above inline)

-- 6. match_tariffs function for pgvector similarity search
CREATE OR REPLACE FUNCTION match_tariffs(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  provider_name text,
  program_name text,
  customer_type text,
  tariff_color text,
  unit_rate_kwh numeric,
  fixed_fee_monthly numeric,
  validity_month text,
  source_url text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    provider_name,
    program_name,
    customer_type::text,
    tariff_color::text,
    unit_rate_kwh,
    fixed_fee_monthly,
    validity_month,
    source_url,
    1 - (market_tariffs.embedding <=> query_embedding) AS similarity
  FROM market_tariffs
  WHERE 1 - (market_tariffs.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- 7. Chat threads (persisted Market RAG conversations)
CREATE TABLE IF NOT EXISTS chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  title TEXT NOT NULL DEFAULT 'Νέα Συζήτηση',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  sources JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id);

-- 8. Scraper logs (health monitoring)
CREATE TABLE IF NOT EXISTS scraper_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID REFERENCES rag_document_endpoints(id),
  provider_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  records_synced INT DEFAULT 0,
  error_message TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scraper_logs_provider ON scraper_logs(provider_name);

-- 9. RLS Policies
ALTER TABLE rag_document_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated read endpoints" ON rag_document_endpoints FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role manage endpoints" ON rag_document_endpoints FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated read tariffs" ON market_tariffs FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role manage tariffs" ON market_tariffs FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated manage threads" ON chat_threads FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated manage messages" ON chat_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated read scraper logs" ON scraper_logs FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role manage scraper logs" ON scraper_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
END $$;

-- ============================================================
-- SEED: RAG Document Endpoints (10 providers + 2 RAEYE hubs)
-- ============================================================
INSERT INTO rag_document_endpoints (provider_name, customer_type, tariff_color, endpoint_label, endpoint_url, file_type) VALUES
-- ΔΕΗ (PPC)
('ΔΕΗ', 'B2C', 'green', 'Ειδικό Τιμολόγιο (Πράσινο)', 'https://www.dei.gr/el/gia-to-spiti/revma/eidiko-timologio/', 'html'),
('ΔΕΗ', 'B2C', 'blue', 'myHome Enter (Μπλε Σταθερό)', 'https://www.dei.gr/el/gia-to-spiti/revma/myhome-enter/', 'html'),
('ΔΕΗ', 'B2C', 'yellow', 'myHome 4All (Κίτρινο Κυμαινόμενο)', 'https://www.dei.gr/el/gia-to-spiti/revma/myhome-4all/', 'html'),
('ΔΕΗ', 'B2B', NULL, 'Επιχείρηση Ρεύμα (B2B)', 'https://www.dei.gr/el/gia-tin-epixeirisi/revma/', 'html'),
('ΔΕΗ', 'B2C', NULL, 'Τιμολόγια & Χρεώσεις Archive', 'https://www.dei.gr/el/gia-to-spiti/revma/timologies-xrewseis/', 'html'),
-- Protergia
('Protergia', 'B2C', 'green', 'Οικιακό Ειδικό Τιμολόγιο', 'https://www.protergia.gr/eidiko-timologio-oikiako/', 'html'),
('Protergia', 'B2B', 'green', 'Επαγγελματικό Ειδικό Τιμολόγιο', 'https://www.protergia.gr/eidiko-timologio-epaggelmatiko/', 'html'),
('Protergia', 'B2C', 'blue', 'Value Safe (Σταθερό)', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/', 'html'),
('Protergia', 'B2B', NULL, 'Επαγγελματικό Ρεύμα', 'https://www.protergia.gr/epixeirisi/epaggelmatiko-reuma-proionta/', 'html'),
('Protergia', 'B2C', NULL, 'Ανακοινώσεις Τιμών Archive', 'https://www.protergia.gr/anakoinoseis-timon-reuma/', 'html'),
-- Ήρων (Heron)
('Ήρων', 'B2C', 'green', 'Ειδικό Τιμολόγιο (EN.A)', 'https://www.heron.gr/eidiko-timologio/', 'html'),
('Ήρων', 'B2C', 'blue', 'Simply Safe (Σταθερό)', 'https://www.heron.gr/gia-to-spiti/revma/', 'html'),
('Ήρων', 'B2B', NULL, 'Επαγγελματικά Προγράμματα', 'https://www.heron.gr/gia-tin-epicheirisi/revma/', 'html'),
('Ήρων', 'B2C', NULL, 'Τιμές & Χρεώσεις Archive', 'https://www.heron.gr/prices/', 'html'),
-- ZeniΘ
('ZeniΘ', 'B2C', 'green', 'Power Home Start (Ειδικό)', 'https://zenith.gr/el/for-home/electricity/eidiko-timologio/', 'html'),
('ZeniΘ', 'B2C', 'blue', 'Power Home Choice (Σταθερό)', 'https://zenith.gr/el/for-home/electricity/', 'html'),
('ZeniΘ', 'B2B', NULL, 'Ηλεκτρική Ενέργεια Επιχείρηση', 'https://zenith.gr/el/for-business/electricity/', 'html'),
('ZeniΘ', 'B2C', NULL, 'Τιμοκατάλογοι & Ανακοινώσεις', 'https://zenith.gr/el/prices/', 'html'),
-- Elpedison
('Elpedison', 'B2C', 'green', 'Ειδικό Οικιακό Τιμολόγιο', 'https://www.elpedison.gr/gr/gia-to-spiti/reuma/eidiko-oikiako-timologio/', 'html'),
('Elpedison', 'B2C', 'blue', 'Bright / Economy Blue', 'https://www.elpedison.gr/gr/gia-to-spiti/reuma/', 'html'),
('Elpedison', 'B2B', NULL, 'Επαγγελματικά Προγράμματα', 'https://www.elpedison.gr/gr/gia-tin-epixeirisi/reuma/', 'html'),
('Elpedison', 'B2C', NULL, 'Ανακοινώσεις Τιμών Archive', 'https://www.elpedison.gr/gr/anakoinoseis-timon-reumatos/', 'html'),
-- nrg
('nrg', 'B2C', 'green', 'nrg Special (Ειδικό)', 'https://www.nrg.gr/el/eidiko-timologio-nrg', 'html'),
('nrg', 'B2C', 'blue', 'Prime / Smart / Fixed', 'https://www.nrg.gr/el/gia-to-spiti/reuma', 'html'),
('nrg', 'B2B', NULL, 'Επιχείρηση Ρεύμα', 'https://www.nrg.gr/el/gia-tin-epixeirisi/reuma', 'html'),
('nrg', 'B2C', NULL, 'Ανακοινώσεις Τιμών', 'https://www.nrg.gr/el/anakoinoseis-timon', 'html'),
-- Φυσικό Αέριο
('Φυσικό Αέριο', 'B2C', 'green', 'Ειδικό Οικιακό Τιμολόγιο', 'https://www.fysikoaeriohellas.gr/eidiko-oikiako-timologio/', 'html'),
('Φυσικό Αέριο', 'B2C', 'blue', 'MAXI (Σταθερό)', 'https://www.fysikoaeriohellas.gr/gia-to-spiti/reuma/', 'html'),
('Φυσικό Αέριο', 'B2B', NULL, 'Ρεύμα Επιχείρηση', 'https://www.fysikoaeriohellas.gr/gia-tin-epicheirisi/reuma/', 'html'),
('Φυσικό Αέριο', 'B2C', NULL, 'Ανακοινώσεις Τιμών Archive', 'https://www.fysikoaeriohellas.gr/anakoinoseis-timon-reumatos/', 'html'),
-- Volton
('Volton', 'B2C', 'green', 'Volton Special (Ειδικό)', 'https://volton.gr/eidiko-oikiako-timologio/', 'html'),
('Volton', 'B2C', 'blue', 'Volton Unique (Σταθερό)', 'https://volton.gr/gia-to-spiti/reuma/', 'html'),
('Volton', 'B2B', NULL, 'Προγράμματα Επιχείρηση', 'https://volton.gr/gia-tin-epicheirisi/reuma/', 'html'),
('Volton', 'B2C', NULL, 'Τιμολόγια Archive', 'https://volton.gr/timologia-reumatos/', 'html'),
-- We Energy
('We Energy', 'B2C', 'green', 'We Green Special (Ειδικό)', 'https://weenergy.gr/eidiko-oikiako-timologio/', 'html'),
('We Energy', 'B2C', 'blue', 'Home Products', 'https://weenergy.gr/gia-to-spiti/ilektriki-energeia/', 'html'),
('We Energy', 'B2B', NULL, 'Επιχείρηση', 'https://weenergy.gr/gia-tin-epixeirisi/ilektriki-energeia/', 'html'),
('We Energy', 'B2C', NULL, 'Ανακοινώσεις Τιμών', 'https://weenergy.gr/anakoinoseis-timon/', 'html'),
-- Ελίν Energy
('Ελίν', 'B2C', 'green', 'Power On Green (Ειδικό)', 'https://energy.elin.gr/eidiko-oikiako-timologio/', 'html'),
('Ελίν', 'B2C', 'blue', 'Home Products', 'https://energy.elin.gr/gia-to-spiti/reuma/', 'html'),
('Ελίν', 'B2B', NULL, 'Επιχείρηση', 'https://energy.elin.gr/gia-tin-epixeirisi/reuma/', 'html'),
('Ελίν', 'B2C', NULL, 'Ανακοινώσεις Τιμών', 'https://energy.elin.gr/anakoinoseis-timon/', 'html'),
-- RAEYE Central Hubs
('RAEYE', 'B2C', NULL, 'EnergyCost.gr (Κρατικός Συγκριτής)', 'https://www.energycost.gr/', 'html'),
('RAEYE', 'B2C', NULL, 'RAE.gr Οικιακά Τιμολόγια', 'https://www.rae.gr/oikiaka-timologia/', 'html')
ON CONFLICT DO NOTHING;
