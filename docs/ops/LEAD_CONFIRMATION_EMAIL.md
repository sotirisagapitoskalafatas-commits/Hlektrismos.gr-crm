# Public website lead-confirmation email

The landing-page form in `src/pages/LandingPage.tsx` saves the lead first, then invokes the public Edge Function `send-lead-confirmation`. The visitor's confirmation is a **separate** mail path from Supabase Auth (invite, recovery, confirmation, security notifications).

## Production configuration

After deploying the updated `send-lead-confirmation` function, add these project-level secrets in Supabase Dashboard → Edge Functions → Secrets:

| Secret | Demo Gmail value |
|---|---|
| `LEAD_CONFIRMATION_SMTP_HOST` | `smtp.gmail.com` |
| `LEAD_CONFIRMATION_SMTP_PORT` | `465` |
| `LEAD_CONFIRMATION_SMTP_USER` | Full Gmail address |
| `LEAD_CONFIRMATION_SMTP_PASSWORD` | Gmail App Password (not the normal account password) |
| `LEAD_CONFIRMATION_FROM_EMAIL` | Same Gmail address as the SMTP username |
| `LEAD_CONFIRMATION_FROM_NAME` | `Hlektrismos.gr (Demo)` |

Port 465 is implicit TLS and is supported by the function. Do not use port 587: Supabase Edge Functions cannot reach outbound port 587. Port 2587 is only for a provider that supports STARTTLS there.

The Gmail App Password must be stored directly in Supabase Secrets. Never put it in GitHub, a chat message, a normal `crm_settings` field or a browser environment variable.

These secrets are separate from Supabase Auth's SMTP configuration. It is okay to reuse the same Gmail App Password, but it must be entered as the Edge Function secret too. The visitor will see the Gmail address as the sender during the demo.

## Other required project secret

The existing `OUTREACH_LIMITS` secret must remain present and valid. This function uses it to enforce per-address email limits. Do not replace it with a partial JSON object.

## Behaviour and verification

- The form saves the lead before it attempts the acknowledgement email.
- If the sender is unavailable, the page must say the lead was recorded but the acknowledgement could not be sent. It must never claim that an email was delivered.
- The function only sends a confirmation to the visitor. It does not send an internal notification to staff.
- A successful function response means the SMTP provider accepted the message; it cannot guarantee final inbox placement. Check Spam/Junk as well as Inbox.
- Verify in Supabase Edge Function logs that `send-lead-confirmation` returned HTTP 200, and verify receipt in a controlled test mailbox.
