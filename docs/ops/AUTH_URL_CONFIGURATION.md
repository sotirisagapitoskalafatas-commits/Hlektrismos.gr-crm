# Supabase Auth — URL, sign-up and e-mail configuration

CRM origin: **`https://hlektrismos-crm.vercel.app`**. The public site `hlektrismos.gr` is WordPress and must never appear in Auth settings.
Do the steps in the Dashboard (Supabase Dashboard → your project), then run the read-only check at the end and tell me; **no invitation or recovery e-mail is sent until the owner confirms the configuration is complete and approves onboarding.**

## Required end state
Public sign-up **disabled**, e-mail auto-confirm **off**, only the e-mail provider enabled. Verify at any time (read-only, public settings document): `node scripts/ops/auth-settings-check.mjs --ref <project ref>` — expect 4 × PASS.

## Steps (Dashboard labels as of 2026; names can differ slightly)
1. **Authentication → URL Configuration**
   - **Site URL:** `https://hlektrismos-crm.vercel.app` (no trailing path).
   - **Redirect URLs:** add `https://hlektrismos-crm.vercel.app/**`. Remove any entry for `hlektrismos.gr`, `localhost` or unknown preview domains (Vercel preview domains are only needed if you want to test e-mail flows on previews).
2. **Edge Functions → Secrets** (or Project Settings → Edge Functions): add **`SITE_URL`** = `https://hlektrismos-crm.vercel.app`. Exactly the origin — no path, no `#`, no query, no port. The function refuses anything else (and refuses the WordPress site).
3. **Authentication → Sign In / Providers** (older Dashboards: Authentication → Providers / Settings)
   - Turn **OFF** "Allow new users to sign up" (User Signups). Invitations sent from the Dashboard or by `admin-users` are admin actions and still work.
   - Under **Email**: keep the provider **enabled**, turn **ON** "Confirm email" (so auto-confirm is off), keep "Secure email change" **ON**. Keep every other provider off (only Email is enabled today).
4. **Authentication → Emails → Templates** — open **Invite user**, **Reset password**, and **Change email address**. Each must still contain `{{ .ConfirmationURL }}` (the link Supabase builds with your Site/Redirect URL). Do not replace it with a hard-coded address. (Magic link / Confirm signup templates are unused.)
5. **Authentication → Emails → SMTP Settings**: the built-in mailer is limited to a few messages per hour and returns `429`; configure a custom SMTP sender for the client domain before inviting people.
6. Optional but recommended: **Authentication → Rate Limits**, and **Project Settings → Add-ons / Backups**: enable daily backups (PITR if the plan allows) — there is no platform backup today.

## Verify (read-only) — then tell me
```
node scripts/ops/auth-settings-check.mjs --ref <project ref>
```
Expected: 4 × PASS (sign-up disabled, auto-confirm off, phone auto-confirm off, only the e-mail provider). The script cannot see Site URL, redirect list, templates or SMTP — confirm those by screenshot or by telling me they are done.

## What a correct link looks like (check before clicking the first real e-mail)
`https://<project-ref>.supabase.co/auth/v1/verify?token=…&type=invite&redirect_to=https://hlektrismos-crm.vercel.app/`
- host is the Supabase project, `redirect_to` is the CRM origin (hover the button; do not paste the link anywhere).
- Clicking it signs the person in and lands on `https://hlektrismos-crm.vercel.app/#access_token=…&type=invite`; the app records only `type=invite`, then shows **«Νέος κωδικός»** (choose a password, 10+ characters with letters and numbers). Recovery links behave the same with `type=recovery`.
- If `redirect_to` is not allow-listed Supabase falls back to the **Site URL** — still the CRM; if you see `hlektrismos.gr` anywhere, stop.
