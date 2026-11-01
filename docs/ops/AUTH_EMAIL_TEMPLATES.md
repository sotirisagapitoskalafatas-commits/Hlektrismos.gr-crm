# ATLAS Auth e-mail templates: design, installation, limits

Source: `emails/` (components, templates, build). Rendered files: `emails/dist/` (HTML, plain text, and `supabase-auth-templates.json`). Change the source, run `node emails/build.mjs`, commit both: a test fails if they differ.

## What exists (and what does not)
| Item | State |
|---|---|
| Templates created and tested as text (variables, links, Greek, no script/external resource) | yes, 10: confirmation, invite, magic link, recovery, **change email**, reauthentication, password changed, email changed, MFA added, MFA removed |
| Installed in the hosted Supabase project | **no**: a merge to GitHub does not update hosted Auth templates. Install by the dashboard or the script below |
| Visual check in real mail clients (Gmail, Outlook, Apple Mail, phone) | **not done**: markup is table based with inline CSS only |
| CRM transactional e-mails (application received, missing documents, offer, signature, activation, lead/case assignment, reminders) | **not built**: they need a real business event, consent checks, duplicate-send protection and a sender; the supply, application and case model they refer to is not finished |
| Custom SMTP (Resend) | **pending**: needs the client's domain and DNS access. Nothing here assumes `hlektrismos.gr` |

## Rules the templates follow
- The one action link is exactly `{{ .ConfirmationURL }}`: never rebuilt, never hard-coded, never localhost.
- Each template uses only the variables Supabase supports for it (`{{ .NewEmail }}` only in *Change email address*; `{{ .OldEmail }}` only in *Email address changed*; `{{ .FactorType }}` only in the two MFA notifications). A test enforces this.
- With **Secure email change** on, the *Change email address* template is sent to both the current and the new address, so it says that the change completes only after both are confirmed and that nothing has changed yet. A completed change has its own *Email address changed* notification.
- No logo image (there is no approved logo URL), so the brand is a text wordmark. No tracking, no external stylesheet, no script.

## Install (choose one)
**Dashboard:** Authentication, Email Templates. For each template paste the subject and the HTML from `emails/dist/<key>.html` (subjects are in `supabase-auth-templates.json`).
**Script (account owner):** `node scripts/ops/push-auth-email-templates.mjs` is a dry run. To install, set `SUPABASE_ACCESS_TOKEN` (a personal access token from the dashboard's Account, Access Tokens) and `PROJECT_REF`, and add `--apply`. It sends only subjects and templates: it does not switch on notification e-mails, and it never prints the token.
**Notification e-mails** (password changed, email changed, MFA): leave them OFF until custom SMTP exists. They add mail to a sender that already has a small hourly limit.

## Known limits of the hosted sender
- The built-in sender has a project-wide hourly limit and sends only to addresses of the project's team members; it is for testing, not for staff or customers in production. Secure email change sends **two** mails per request.
- **Link pre-fetching:** some mail systems (for example Microsoft Safe Links) open links before the person does, which consumes the one-time link and produces «Token has expired or is invalid». If a mailbox does this, the links in that mailbox will keep expiring; the fix is a code-entry flow (`{{ .Token }}`), not a longer expiry.
- Hosted Supabase templates carry HTML only; the `.txt` files are for a sender that supports a text part.
