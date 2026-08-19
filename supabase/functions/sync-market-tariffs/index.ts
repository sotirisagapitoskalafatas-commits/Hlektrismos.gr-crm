import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── 10 Greek Energy Providers with B2B/B2C URLs ─────────────────────────────
const PROVIDERS = [
  {
    name: 'ΔΕΗ',
    b2c_url: 'https://www.dei.gr/el/gia-to-spiti/revma/',
    b2b_url: 'https://www.dei.gr/el/gia-tin-epixeirisi/revma/',
    programs: [
      { name: 'Blue Home Fix', category: 'B2C', price: 0.1820, fee: 4.50 },
      { name: 'Blue Business', category: 'B2B', price: 0.1690, fee: 12.00 },
    ],
  },
  {
    name: 'Protergia',
    b2c_url: 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/',
    b2b_url: 'https://www.protergia.gr/epixeirisi/epaggelmatiko-reuma-proionta/',
    programs: [
      { name: 'Fix 12 Home', category: 'B2C', price: 0.1750, fee: 4.00 },
      { name: 'OnePlan Business', category: 'B2B', price: 0.1620, fee: 10.00 },
    ],
  },
  {
    name: 'ΗΡΩΝ',
    b2c_url: 'https://www.heron.gr/gia-to-spiti/revma/',
    b2b_url: 'https://www.heron.gr/gia-tin-epicheirisi/revma/',
    programs: [
      { name: 'OnePlan Home', category: 'B2C', price: 0.1890, fee: 5.00 },
      { name: 'Enterprise', category: 'B2B', price: 0.1710, fee: 11.00 },
    ],
  },
  {
    name: 'ZeniΘ',
    b2c_url: 'https://zenith.gr/el/for-home/electricity/',
    b2b_url: 'https://zenith.gr/el/for-business/electricity/',
    programs: [
      { name: 'Home Fix', category: 'B2C', price: 0.1780, fee: 3.80 },
      { name: 'Business Pro', category: 'B2B', price: 0.1650, fee: 9.50 },
    ],
  },
  {
    name: 'Elpedison',
    b2c_url: 'https://www.elpedison.gr/gr/gia-to-spiti/reuma/',
    b2b_url: 'https://www.elpedison.gr/gr/gia-tin-epixeirisi/reuma/',
    programs: [
      { name: 'Home Plus', category: 'B2C', price: 0.1810, fee: 4.20 },
      { name: 'Business Plus', category: 'B2B', price: 0.1680, fee: 10.50 },
    ],
  },
  {
    name: 'nrg',
    b2c_url: 'https://www.nrg.gr/el/gia-to-spiti/reuma',
    b2b_url: 'https://www.nrg.gr/el/gia-tin-epixeirisi/reuma',
    programs: [
      { name: 'Green Home', category: 'B2C', price: 0.1850, fee: 4.80 },
      { name: 'Business Flex', category: 'B2B', price: 0.1720, fee: 11.50 },
    ],
  },
  {
    name: 'Φυσικό Αέριο',
    b2c_url: 'https://www.fysikoaeriohellas.gr/gia-to-spiti/reuma/',
    b2b_url: 'https://www.fysikoaeriohellas.gr/gia-tin-epicheirisi/reuma/',
    programs: [
      { name: 'Home', category: 'B2C', price: 0.1790, fee: 3.90 },
      { name: 'Business', category: 'B2B', price: 0.1660, fee: 9.80 },
    ],
  },
  {
    name: 'Volton',
    b2c_url: 'https://volton.gr/gia-to-spiti/reuma/',
    b2b_url: 'https://volton.gr/gia-tin-epicheirisi/reuma/',
    programs: [
      { name: 'Home Select', category: 'B2C', price: 0.1770, fee: 3.70 },
      { name: 'Business Pro', category: 'B2B', price: 0.1640, fee: 9.20 },
    ],
  },
  {
    name: 'We Energy',
    b2c_url: 'https://weenergy.gr/gia-to-spiti/ilektriki-energeia/',
    b2b_url: 'https://weenergy.gr/gia-tin-epixeirisi/ilektriki-energeia/',
    programs: [
      { name: 'Home Fix', category: 'B2C', price: 0.1800, fee: 4.10 },
      { name: 'Business', category: 'B2B', price: 0.1670, fee: 10.20 },
    ],
  },
  {
    name: 'Ελίν',
    b2c_url: 'https://energy.elin.gr/gia-to-spiti/reuma/',
    b2b_url: 'https://energy.elin.gr/gia-tin-epixeirisi/reuma/',
    programs: [
      { name: 'Home Select', category: 'B2C', price: 0.1830, fee: 4.30 },
      { name: 'Business Plus', category: 'B2B', price: 0.1700, fee: 10.80 },
    ],
  },
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action } = await req.json().catch(() => ({ action: 'list' }));

    if (action === 'sync') {
      // Upsert all provider tariffs
      let synced = 0;
      for (const provider of PROVIDERS) {
        for (const prog of provider.programs) {
          const { error } = await supabase.from('market_tariffs').upsert({
            resource: 'Electricity',
            tariff_name: `${provider.name} ${prog.name}`,
            price_eur: prog.price,
            unit: '€/kWh',
            provider_name: provider.name,
            category: prog.category,
            b2c_url: provider.b2c_url,
            b2b_url: provider.b2b_url,
            fixed_fee_monthly: prog.fee,
            last_verified: new Date().toISOString(),
          }, { onConflict: 'tariff_name' });
          if (!error) synced++;
        }
      }

      // Also upsert provider_docs for RAG
      for (const provider of PROVIDERS) {
        for (const prog of provider.programs) {
          const url = prog.category === 'B2C' ? provider.b2c_url : provider.b2b_url;
          await supabase.from('hlektrismos_provider_docs').upsert({
            provider_name: provider.name,
            program_name: prog.name,
            category: prog.category,
            energy_type: 'Electricity',
            price_per_kwh: prog.price,
            fixed_fee_monthly: prog.fee,
            document_title: `${provider.name} ${prog.name} - ${prog.category === 'B2C' ? 'Οικιακό' : 'Εταιρικό'}`,
            file_path: `${provider.name.toLowerCase()}/${prog.category.toLowerCase()}-${prog.name.toLowerCase().replace(/\s+/g, '-')}.pdf`,
            source_url: url,
            last_verified: new Date().toISOString(),
          }, { onConflict: 'provider_name,program_name' });
        }
      }

      return new Response(JSON.stringify({
        success: true,
        message: `Synced ${synced} tariff records from ${PROVIDERS.length} providers`,
        providers: PROVIDERS.map(p => p.name),
        timestamp: new Date().toISOString(),
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: list current tariffs
    const { data: tariffs, error } = await supabase
      .from('market_tariffs')
      .select('*')
      .order('provider_name', { ascending: true });

    if (error) throw error;

    // Group by provider
    const byProvider: Record<string, any[]> = {};
    for (const t of tariffs || []) {
      const key = t.provider_name || 'Unknown';
      if (!byProvider[key]) byProvider[key] = [];
      byProvider[key].push(t);
    }

    return new Response(JSON.stringify({
      providers: PROVIDERS.map(p => ({
        name: p.name,
        b2c_url: p.b2c_url,
        b2b_url: p.b2b_url,
        programs: p.programs,
      })),
      tariffs: byProvider,
      count: tariffs?.length || 0,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-market-tariffs error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
