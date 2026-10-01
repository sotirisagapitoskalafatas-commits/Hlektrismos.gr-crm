// Public one-click unsubscribe endpoint (verify_jwt = false in config.toml).
//
//   POST  — RFC 8058 one-click from the mail client (List-Unsubscribe-Post).
//   GET   — the footer link. Suppresses immediately, then redirects to the
//           site's confirmation page (Supabase serves function HTML as
//           text/plain, so the page lives in the web app at #/unsubscribed).
//
// The link carries an HMAC-signed address, so nobody can unsubscribe someone
// else. Suppression is immediate: every commercial send checks the list first.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { suppress, verifyUnsubscribeToken } from "../_shared/email-compliance.ts";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const site = Deno.env.get("SITE_URL") ?? "https://hlektrismos.gr";
  const email = await verifyUnsubscribeToken(url.searchParams.get("e"), url.searchParams.get("t"))
    .catch(() => null);

  if (!email) {
    if (req.method === "POST") return new Response("invalid link", { status: 400 });
    return Response.redirect(`${site}/#/unsubscribed?status=invalid`, 302);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "",
  );
  await suppress(admin, email, req.method === "POST" ? "list-unsubscribe-post" : "footer-link");

  if (req.method === "POST") return new Response("unsubscribed", { status: 200 });
  return Response.redirect(`${site}/#/unsubscribed`, 302);
});
