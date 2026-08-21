-- ============================================================
-- Migration: 20260821010000_customers_and_switching.sql
-- hlektrismos_customers table + convert_lead_to_customer RPC
-- + switching_status + contract expiry tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hlektrismos_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.hlektrismos_leads(id) ON DELETE SET NULL,
    customer_type TEXT CHECK (customer_type IN ('B2C', 'B2B')) DEFAULT 'B2C',
    full_name TEXT NOT NULL,
    company_name TEXT,
    afm TEXT UNIQUE,
    doy TEXT,
    email TEXT,
    phone TEXT NOT NULL,
    address TEXT,
    postal_code TEXT,
    city TEXT,

    active_provider TEXT NOT NULL,
    active_program TEXT NOT NULL,
    supply_number TEXT,
    unit_rate_kwh NUMERIC(8,4),
    fixed_fee_monthly NUMERIC(8,2),
    estimated_monthly_kwh NUMERIC(10,2),
    contract_start_date DATE,
    contract_end_date DATE,
    contract_status TEXT CHECK (contract_status IN ('active', 'pending_switch', 'expiring_soon', 'expired', 'churned')) DEFAULT 'active',
    switching_status TEXT CHECK (switching_status IN (
        'docs_pending',
        'submitted_to_provider',
        'deddie_meter_reading',
        'activated',
        'rejected_debt',
        'rejected_docs'
    )) DEFAULT 'docs_pending',

    assigned_agent_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_afm ON public.hlektrismos_customers(afm);
CREATE INDEX IF NOT EXISTS idx_customers_contract_end ON public.hlektrismos_customers(contract_end_date);
CREATE INDEX IF NOT EXISTS idx_customers_status ON public.hlektrismos_customers(contract_status);
CREATE INDEX IF NOT EXISTS idx_customers_switching ON public.hlektrismos_customers(switching_status);

ALTER TABLE public.hlektrismos_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cust_auth_all ON public.hlektrismos_customers;
CREATE POLICY cust_auth_all ON public.hlektrismos_customers FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS cust_service ON public.hlektrismos_customers;
CREATE POLICY cust_service ON public.hlektrismos_customers FOR ALL USING (auth.role() = 'service_role');

-- RPC: Convert Lead to Customer
CREATE OR REPLACE FUNCTION convert_lead_to_customer(
    p_lead_id UUID,
    p_provider TEXT,
    p_program TEXT,
    p_supply_number TEXT DEFAULT NULL,
    p_rate NUMERIC DEFAULT NULL,
    p_fixed_fee NUMERIC DEFAULT NULL,
    p_monthly_kwh NUMERIC DEFAULT NULL,
    p_contract_months INT DEFAULT 12
) RETURNS UUID AS $$
DECLARE
    v_lead RECORD;
    v_customer_id UUID;
BEGIN
    SELECT * INTO v_lead FROM public.hlektrismos_leads WHERE id = p_lead_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lead not found';
    END IF;

    INSERT INTO public.hlektrismos_customers (
        lead_id, customer_type, full_name, company_name, afm, email, phone, address,
        active_provider, active_program, supply_number, unit_rate_kwh, fixed_fee_monthly,
        estimated_monthly_kwh, contract_start_date, contract_end_date, contract_status,
        assigned_agent_id
    ) VALUES (
        v_lead.id,
        COALESCE(v_lead.customer_category, 'B2C'),
        COALESCE(v_lead.first_name || ' ' || v_lead.last_name, 'Άγνωστος'),
        v_lead.company,
        NULL,
        v_lead.email,
        v_lead.phone,
        v_lead.address,
        p_provider,
        p_program,
        p_supply_number,
        p_rate,
        p_fixed_fee,
        p_monthly_kwh,
        CURRENT_DATE,
        CURRENT_DATE + (p_contract_months || ' months')::INTERVAL,
        'active',
        v_lead.assigned_agent
    )
    RETURNING id INTO v_customer_id;

    UPDATE public.hlektrismos_leads
    SET status = 'won', updated_at = NOW()
    WHERE id = p_lead_id;

    RETURN v_customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
