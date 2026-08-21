-- ============================================================
-- Migration: 20260821030000_production_readiness.sql
-- ============================================================

-- 1. SALES AGENTS
CREATE TABLE IF NOT EXISTS public.sales_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    afm TEXT,
    agent_type TEXT CHECK (agent_type IN ('employee', 'independent_contractor')) NOT NULL DEFAULT 'independent_contractor',
    base_salary NUMERIC(10,2) DEFAULT 0.00,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.sales_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sa_auth_all ON public.sales_agents;
CREATE POLICY sa_auth_all ON public.sales_agents FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS sa_service ON public.sales_agents;
CREATE POLICY sa_service ON public.sales_agents FOR ALL USING (auth.role() = 'service_role');

-- 2. CUSTOMER METERS
CREATE TABLE IF NOT EXISTS public.customer_meters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.hlektrismos_customers(id) ON DELETE CASCADE,
    supply_number TEXT NOT NULL,
    meter_type TEXT CHECK (meter_type IN ('single_phase', 'three_phase', 'night_meter_G1N')) DEFAULT 'single_phase',
    property_address TEXT,
    is_main_meter BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meters_customer ON public.customer_meters(customer_id);
ALTER TABLE public.customer_meters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cm_auth_all ON public.customer_meters;
CREATE POLICY cm_auth_all ON public.customer_meters FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS cm_service ON public.customer_meters;
CREATE POLICY cm_service ON public.customer_meters FOR ALL USING (auth.role() = 'service_role');

-- 3. CUSTOMER DOCUMENTS
CREATE TABLE IF NOT EXISTS public.customer_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.hlektrismos_customers(id) ON DELETE CASCADE,
    document_type TEXT CHECK (document_type IN ('gov_id', 'e9_tax', 'rental_contract', 'energy_bill', 'authorization_form')) NOT NULL,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size_bytes INT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_docs_customer ON public.customer_documents(customer_id);
ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cd_auth_all ON public.customer_documents;
CREATE POLICY cd_auth_all ON public.customer_documents FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS cd_service ON public.customer_documents;
CREATE POLICY cd_service ON public.customer_documents FOR ALL USING (auth.role() = 'service_role');

-- 4. AGENT PROVIDER COMMISSIONS
CREATE TABLE IF NOT EXISTS public.agent_provider_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES public.sales_agents(id) ON DELETE CASCADE,
    provider_name TEXT NOT NULL,
    tariff_category TEXT CHECK (tariff_category IN ('B2C', 'B2B', 'ALL')) DEFAULT 'ALL',
    commission_type TEXT CHECK (commission_type IN ('flat_rate', 'per_kwh', 'percentage')) DEFAULT 'flat_rate',
    commission_value NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_id, provider_name, tariff_category)
);
ALTER TABLE public.agent_provider_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS apc_auth_all ON public.agent_provider_commissions;
CREATE POLICY apc_auth_all ON public.agent_provider_commissions FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS apc_service ON public.agent_provider_commissions;
CREATE POLICY apc_service ON public.agent_provider_commissions FOR ALL USING (auth.role() = 'service_role');

-- 5. CUSTOMER-AGENT ATTRIBUTION
CREATE TABLE IF NOT EXISTS public.customer_agent_attribution (
    customer_id UUID REFERENCES public.hlektrismos_customers(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES public.sales_agents(id) ON DELETE CASCADE,
    split_percentage NUMERIC(5,2) DEFAULT 100.00,
    PRIMARY KEY (customer_id, agent_id)
);
ALTER TABLE public.customer_agent_attribution ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS caa_auth_all ON public.customer_agent_attribution;
CREATE POLICY caa_auth_all ON public.customer_agent_attribution FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS caa_service ON public.customer_agent_attribution;
CREATE POLICY caa_service ON public.customer_agent_attribution FOR ALL USING (auth.role() = 'service_role');

-- 6. COMMISSION LEDGER
CREATE TABLE IF NOT EXISTS public.customer_commissions_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.hlektrismos_customers(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES public.sales_agents(id) ON DELETE SET NULL,
    provider_name TEXT NOT NULL,
    expected_amount NUMERIC(10,2) NOT NULL,
    payment_status TEXT CHECK (payment_status IN ('pending', 'paid', 'disputed')) DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.customer_commissions_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ccl_auth_all ON public.customer_commissions_ledger;
CREATE POLICY ccl_auth_all ON public.customer_commissions_ledger FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS ccl_service ON public.customer_commissions_ledger;
CREATE POLICY ccl_service ON public.customer_commissions_ledger FOR ALL USING (auth.role() = 'service_role');

-- 7. DNC BLACKLIST
CREATE TABLE IF NOT EXISTS public.dnc_article11_blacklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT UNIQUE NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    source TEXT DEFAULT 'eett_import'
);
CREATE INDEX IF NOT EXISTS idx_dnc_phone ON public.dnc_article11_blacklist(phone);
ALTER TABLE public.dnc_article11_blacklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dnc_auth_all ON public.dnc_article11_blacklist;
CREATE POLICY dnc_auth_all ON public.dnc_article11_blacklist FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS dnc_service ON public.dnc_article11_blacklist;
CREATE POLICY dnc_service ON public.dnc_article11_blacklist FOR ALL USING (auth.role() = 'service_role');

-- 8. EXTEND LEADS (website, social, enrichment)
ALTER TABLE public.hlektrismos_leads
ADD COLUMN IF NOT EXISTS website TEXT,
ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'pending';

-- 9. EXTEND CUSTOMERS (pipeline_stage)
ALTER TABLE public.hlektrismos_customers
ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'intro';

-- 10. SEED PROVIDER COMMISSIONS
INSERT INTO public.crm_settings (setting_key, setting_value, category, description) VALUES
  ('PROVIDER_COMMISSIONS', '[{"provider":"DEH","b2c":50,"b2b":0.006},{"provider":"Protergia","b2c":90,"b2b":0.012},{"provider":"Hrwn","b2c":95,"b2b":0.011},{"provider":"nrg","b2c":85,"b2b":0.010},{"provider":"Zenith","b2c":75,"b2b":0.008},{"provider":"Volton","b2c":80,"b2b":0.010},{"provider":"FysikoAerio","b2c":70,"b2b":0.008},{"provider":"Elin","b2c":60,"b2b":0.007},{"provider":"Enerwave","b2c":65,"b2b":0.008},{"provider":"Eunice Power","b2c":70,"b2b":0.009}]'::jsonb, 'commissions', 'Default provider commission rates')
ON CONFLICT (setting_key) DO NOTHING;

-- 11. FIX convert_lead_to_customer
DROP FUNCTION IF EXISTS public.convert_lead_to_customer(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, INT);
DROP FUNCTION IF EXISTS public.convert_lead_to_customer(UUID);

CREATE OR REPLACE FUNCTION public.convert_lead_to_customer(p_lead_id UUID)
RETURNS UUID AS $FUNC$
DECLARE
    v_lead RECORD;
    v_customer_id UUID;
    v_full_name TEXT;
BEGIN
    SELECT * INTO v_lead FROM public.hlektrismos_leads WHERE id = p_lead_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lead not found';
    END IF;

    v_full_name := TRIM(COALESCE(v_lead.first_name, '') || ' ' || COALESCE(v_lead.last_name, ''));
    IF v_full_name = '' OR v_full_name = ' ' THEN
        v_full_name := COALESCE(v_lead.company, 'Unknown');
    END IF;

    INSERT INTO public.hlektrismos_customers (
        lead_id, customer_type, full_name, company_name, email, phone,
        address, active_provider, active_program, pipeline_stage, assigned_agent_id
    ) VALUES (
        v_lead.id,
        CASE WHEN v_lead.customer_category = 'B2B_Corporate' THEN 'B2B' ELSE 'B2C' END,
        v_full_name, v_lead.company, v_lead.email, v_lead.phone,
        v_lead.address, COALESCE(v_lead.current_provider, 'Unknown'),
        COALESCE(v_lead.program_name, 'No Program'), 'active', v_lead.assigned_to
    ) RETURNING id INTO v_customer_id;

    UPDATE public.hlektrismos_leads SET status = 'won', updated_at = NOW() WHERE id = p_lead_id;
    RETURN v_customer_id;
END;
$FUNC$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. SET USER ROLE RPC
CREATE OR REPLACE FUNCTION public.set_user_role(target_user_id UUID, new_role TEXT)
RETURNS void AS $FUNC$
BEGIN
    IF (auth.jwt() -> 'app_metadata' ->> 'role' != 'admin')
       AND (current_setting('role') != 'service_role') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can change roles.';
    END IF;
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', new_role)
    WHERE id = target_user_id;
END;
$FUNC$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 13. DNC CHECK RPC
CREATE OR REPLACE FUNCTION public.check_dnc_status(p_phone TEXT)
RETURNS BOOLEAN AS $FUNC$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.dnc_article11_blacklist
        WHERE phone = regexp_replace(p_phone, '[^\d]', '', 'g')
    );
END;
$FUNC$ LANGUAGE plpgsql SECURITY DEFINER;

-- 14. B2B BULK UPSERT RPC
CREATE OR REPLACE FUNCTION public.upsert_scraped_b2b_leads(p_leads JSONB)
RETURNS TABLE (inserted_count INT, duplicate_count INT) AS $FUNC$
DECLARE
    v_lead JSONB;
    v_clean_phone TEXT;
    v_inserted INT := 0;
    v_duplicates INT := 0;
BEGIN
    FOR v_lead IN SELECT * FROM jsonb_array_elements(p_leads)
    LOOP
        v_clean_phone := regexp_replace(v_lead->>'phone', '[^\d]', '', 'g');
        IF length(v_clean_phone) >= 10 THEN
            v_clean_phone := right(v_clean_phone, 10);
        ELSE
            v_clean_phone := NULL;
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.hlektrismos_leads
            WHERE (v_clean_phone IS NOT NULL
                   AND right(regexp_replace(COALESCE(phone,''), '[^\d]', '', 'g'), 10) = v_clean_phone)
        ) OR EXISTS (
            SELECT 1 FROM public.hlektrismos_customers
            WHERE (v_clean_phone IS NOT NULL
                   AND right(regexp_replace(COALESCE(phone,''), '[^\d]', '', 'g'), 10) = v_clean_phone)
        ) THEN
            v_duplicates := v_duplicates + 1;
        ELSE
            INSERT INTO public.hlektrismos_leads (
                first_name, phone, email, address, city,
                customer_category, status, source, comments
            ) VALUES (
                v_lead->>'company_name', COALESCE(v_lead->>'phone', ''),
                v_lead->>'email', v_lead->>'address', v_lead->>'city',
                'B2B_Corporate', 'new', 'google_maps_scrape',
                concat('Category: ', v_lead->>'category', ' | Website: ', v_lead->>'website', ' | Rating: ', v_lead->>'rating')
            );
            v_inserted := v_inserted + 1;
        END IF;
    END LOOP;
    RETURN QUERY SELECT v_inserted, v_duplicates;
END;
$FUNC$ LANGUAGE plpgsql SECURITY DEFINER;

-- 15. COMMISSION TRIGGER
CREATE OR REPLACE FUNCTION calculate_agent_commission()
RETURNS TRIGGER AS $FUNC$
DECLARE
    v_comm RECORD;
BEGIN
    IF NEW.pipeline_stage = 'active' AND (OLD.pipeline_stage IS DISTINCT FROM 'active') THEN
        FOR v_comm IN
            SELECT apc.agent_id, apc.commission_value, caa.split_percentage
            FROM public.agent_provider_commissions apc
            JOIN public.customer_agent_attribution caa ON caa.agent_id = apc.agent_id
            WHERE caa.customer_id = NEW.id
              AND apc.provider_name = NEW.active_provider
              AND (apc.tariff_category = NEW.customer_type OR apc.tariff_category = 'ALL')
        LOOP
            INSERT INTO public.customer_commissions_ledger (
                customer_id, agent_id, provider_name, expected_amount, payment_status
            ) VALUES (
                NEW.id, v_comm.agent_id, NEW.active_provider,
                v_comm.commission_value * (v_comm.split_percentage / 100.00), 'pending'
            );
        END LOOP;
    END IF;
    RETURN NEW;
END;
$FUNC$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_calculate_commission ON public.hlektrismos_customers;
CREATE TRIGGER trigger_calculate_commission
    AFTER UPDATE ON public.hlektrismos_customers
    FOR EACH ROW EXECUTE FUNCTION calculate_agent_commission();

-- 16. ENRICHMENT pg_cron JOB
SELECT cron.schedule(
    'enrich-pending-leads-15m',
    '*/15 * * * *',
    $$UPDATE public.hlektrismos_leads
SET enrichment_status = 'processing'
WHERE id IN (
    SELECT id FROM public.hlektrismos_leads
    WHERE website IS NOT NULL AND website != ''
      AND (email IS NULL OR email = '')
      AND enrichment_status = 'pending'
    LIMIT 20
)$$
);
