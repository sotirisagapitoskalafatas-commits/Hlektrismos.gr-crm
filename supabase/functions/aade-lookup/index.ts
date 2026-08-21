import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { afm } = await req.json();
    if (!afm || !/^\d{9}$/.test(afm)) {
      return new Response(JSON.stringify({ error: "Invalid AFM - must be 9 digits" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const username = Deno.env.get("AADE_USERNAME");
    const password = Deno.env.get("AADE_PASSWORD");

    if (!username || !password) {
      return new Response(JSON.stringify({ error: "AADE credentials not configured in Supabase Secrets" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const xmlBody = `
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:rg="http://gr/gsis/rgwseps/RgWsPublic/RgWsPublic">
         <soapenv:Header/>
         <soapenv:Body>
            <rg:rgWsPublicAfmMethod>
               <rg:INPUT_REC>
                  <rg:afm_called_by>${username}</rg:afm_called_by>
                  <rg:afm_called_for>${afm}</rg:afm_called_for>
               </rg:INPUT_REC>
            </rg:rgWsPublicAfmMethod>
         </soapenv:Body>
      </soapenv:Envelope>`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(
      "https://www.gsis.gr/webtax2/wsafm/RgWsPublic/RgWsPublicSoapEngine",
      {
        method: "POST",
        headers: { "Content-Type": "text/xml;charset=UTF-8" },
        body: xmlBody,
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    const xmlText = await response.text();

    const companyName = xmlText.match(/<onomasia>(.*?)<\/nomasia>/)?.[1]
      || xmlText.match(/<onomasia>([^<]*)<\/onomasia>/)?.[1]
      || "";
    const doy = xmlText.match(/<doy_descr>([^<]*)<\/doy_descr>/)?.[1] || "";
    const postalAddr = xmlText.match(/<postal_address>([^<]*)<\/postal_address>/)?.[1] || "";
    const postalNum = xmlText.match(/<postal_address_no>([^<]*)<\/postal_address_no>/)?.[1] || "";
    const city = xmlText.match(/<postal_addressd>([^<]*)<\/postal_addressd>/)?.[1] || "";

    if (!companyName && !doy) {
      return new Response(JSON.stringify({
        afm,
        found: false,
        message: "AFM not found in AADE registry or AADE service unavailable",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      afm,
      found: true,
      company_name: companyName,
      doy,
      address: [postalAddr, postalNum, city].filter(Boolean).join(" ").trim(),
      customer_type: "B2B",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(`[aade-lookup] Error: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
