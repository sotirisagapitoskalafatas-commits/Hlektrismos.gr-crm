-- Fix: get_active_tariff_prices has ambiguous column reference
-- "tariff_id" clashes between the output parameter and energy_tariff_prices.tariff_id
-- Fix: use explicit table alias in lateral subquery

CREATE OR REPLACE FUNCTION get_active_tariff_prices(p_month TEXT DEFAULT NULL)
RETURNS TABLE (
  tariff_id UUID,
  provider_name TEXT,
  program_name TEXT,
  customer_type TEXT,
  tariff_color TEXT,
  energy_type TEXT,
  official_url TEXT,
  base_price_day NUMERIC,
  base_price_night NUMERIC,
  unit_rate_kwh NUMERIC,
  fixed_fee_monthly NUMERIC,
  discounted_price_day NUMERIC,
  discounted_price_night NUMERIC,
  discount_conditions TEXT,
  validity_from DATE,
  validity_until DATE,
  verification_status TEXT,
  requires_dual_zone_meter BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    et.id AS tariff_id,
    et.provider_name,
    et.program_name,
    et.customer_type::TEXT,
    et.tariff_color::TEXT,
    et.energy_type::TEXT,
    et.official_url,
    sub.base_price_day,
    sub.base_price_night,
    sub.unit_rate_kwh,
    sub.fixed_fee_monthly,
    sub.discounted_price_day,
    sub.discounted_price_night,
    sub.discount_conditions,
    sub.validity_from,
    sub.validity_until,
    sub.verification_status::TEXT,
    et.requires_dual_zone_meter
  FROM energy_tariffs et
  LEFT JOIN LATERAL (
    SELECT
      tp.base_price_day,
      tp.base_price_night,
      tp.unit_rate_kwh,
      tp.fixed_fee_monthly,
      tp.discounted_price_day,
      tp.discounted_price_night,
      tp.discount_conditions,
      tp.validity_from,
      tp.validity_until,
      tp.verification_status
    FROM energy_tariff_prices tp
    WHERE tp.tariff_id = et.id
      AND tp.validity_from <= COALESCE(
            (p_month || '-01')::DATE,
            CURRENT_DATE
          )
      AND (tp.validity_until IS NULL OR tp.validity_until >= COALESCE(
            (p_month || '-01')::DATE,
            CURRENT_DATE
          ))
    ORDER BY tp.validity_from DESC
    LIMIT 1
  ) sub ON true
  WHERE et.is_active = true
  ORDER BY et.provider_name, et.program_name;
END;
$$ LANGUAGE plpgsql;
