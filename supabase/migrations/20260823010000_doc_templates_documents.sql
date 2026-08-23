-- Document templates + saved documents for Έγγραφα module

CREATE TABLE IF NOT EXISTS doc_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'custom',
  customer_type TEXT NOT NULL DEFAULT 'both' CHECK (customer_type IN ('b2c', 'b2b', 'both')),
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  footer TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE doc_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage doc_templates" ON doc_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS crm_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES hlektrismos_leads(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  footer TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE crm_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage crm_documents" ON crm_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);
