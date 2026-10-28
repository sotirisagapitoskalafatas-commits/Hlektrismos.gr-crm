import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authorizeRecord, getCaller, serviceClient } from "../_shared/authz.ts";
import { safeFetch, denoResolver } from "../_shared/safe-fetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const SOCIAL_PATTERNS: Record<string, RegExp> = {
  facebook: /https?:\/\/(www\.)?(facebook|fb)\.com\/[a-zA-Z0-9._%-]+\/?/i,
  instagram: /https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._%-]+\/?/i,
  linkedin: /https?:\/\/(www\.)?linkedin\.com\/(company|in)\/[a-zA-Z0-9._%-]+\/?/i,
};
const IGNORED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".svg", ".gif", ".webp", ".css", ".js"];
const IGNORED_DOMAINS = ["sentry.io", "wixpress.com", "schema.org", "example.com"];

function extractEmails(html: string): string[] {
  const raw = html.match(EMAIL_REGEX) || [];
  const valid = new Set<string>();
  for (const email of raw) {
    const lower = email.toLowerCase();
    if (!IGNORED_EXTENSIONS.some((ext) => lower.endsWith(ext)) &&
        !IGNORED_DOMAINS.some((dom) => lower.includes(dom))) {
      valid.add(lower);
    }
  }
  return Array.from(valid);
}

function extractSocials(html: string): Record<string, string> {
  const socials: Record<string, string> = {};
  for (const [platform, pattern] of Object.entries(SOCIAL_PATTERNS)) {
    const match = html.match(pattern);
    if (match) socials[platform] = match[0];
  }
  return socials;
}

// Every page fetch (the lead's website and any followed contact link) goes through safeFetch: public
// addresses only (checked after DNS, on every redirect hop), 3 redirects, 8 s, 2 MB.
// http is allowed ONLY because the existing behaviour falls back to http:// for small-business sites without
// TLS; the same address/redirect/size rules apply, so this does not open internal destinations.
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await safeFetch(url, {
      resolve: denoResolver(),
      allowHttp: true,
      maxRedirects: 3,
      timeoutMs: 8000,
      maxBytes: 2 * 1024 * 1024,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (res.status < 200 || res.status >= 300) return null;
    return res.text();
  } catch {
    // SafeFetchError (blocked / too large / timeout) or network failure => "could not enrich", not a 500.
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Staff (or service role) only, and only for a lead the caller may access.
  const supabaseAdmin = serviceClient();
  const caller = await getCaller(req, supabaseAdmin);
  if (caller instanceof Response) return caller;

  try {
    const { lead_id, website } = await req.json().catch(() => ({}));
    if (!lead_id || !website || typeof website !== "string") {
      return new Response(JSON.stringify({ error: "Missing lead_id or website" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lead = await authorizeRecord(supabaseAdmin, caller, "legacy_lead", lead_id, null);
    if (lead instanceof Response) return lead;

    let targetUrl = website.trim();
    if (!targetUrl.startsWith("http")) targetUrl = `https://${targetUrl}`;

    let html = await fetchHtml(targetUrl);
    if (!html && targetUrl.startsWith("https://")) {
      targetUrl = targetUrl.replace("https://", "http://");
      html = await fetchHtml(targetUrl);
    }

    if (!html) {
      return new Response(JSON.stringify({ success: false, reason: "Unreachable website" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let emails = extractEmails(html);
    const socials = extractSocials(html);

    if (emails.length === 0) {
      const contactMatch = html.match(/href=["']([^"']*(?:contact|epikoinonia|about)[^"']*)["']/i);
      if (contactMatch?.[1]) {
        let contactUrl = contactMatch[1];
        if (contactUrl.startsWith("/")) {
          try { contactUrl = new URL(contactUrl, targetUrl).toString(); } catch { contactUrl = ""; }
        }
        if (contactUrl.startsWith("http")) {
          const contactHtml = await fetchHtml(contactUrl);
          if (contactHtml) emails = extractEmails(contactHtml);
        }
      }
    }

    const updatePayload: Record<string, any> = {
      enrichment_status: "completed",
      social_links: socials,
    };

    if (emails.length > 0) {
      const primary = emails.find((e) =>
        e.startsWith("info@") || e.startsWith("contact@") || e.startsWith("sales@")
      ) || emails[0];
      updatePayload.email = primary;
    } else {
      updatePayload.enrichment_status = "failed";
    }

    await supabaseAdmin
      .from("hlektrismos_leads")
      .update(updatePayload)
      .eq("id", lead_id);

    return new Response(JSON.stringify({
      success: true,
      lead_id,
      email_found: updatePayload.email || null,
      socials_found: socials,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[enrich-lead] Error: ${(err as Error)?.name ?? "unknown"}`);
    return new Response(JSON.stringify({ error: "Enrichment failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
