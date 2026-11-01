# Account password change (every signed-in user)

Where: **Ο λογαριασμός μου → Προφίλ → Ασφάλεια λογαριασμού → Αλλαγή κωδικού πρόσβασης**. Admin / Back Office and Sales Agent alike; each user changes only their own password.

## How it works
- `supabase.auth.updateUser({ password, current_password, nonce? })` on the user's own session (`src/lib/password-change.ts`, `src/components/app/PasswordChangeCard.tsx`).
- Needs `@supabase/supabase-js >= 2.102.0`, the release the official password guide documents for `current_password`. The branch uses **exactly 2.102.0** (auth-js 2.102.0), the smallest documented version. The installed typings show the field is **snake_case** (`current_password`; there is no `currentPassword`); the typing first appears in 2.98.0 and `updateUser` is identical in 2.98.0 and 2.102.0, so nothing is lost by following the documentation. Node >= 20. Production Auth is GoTrue v2.197.0.
- The browser never verifies the current password: Auth does, when «Require current password when updating» is on.
- Nothing is stored, logged or audited by the CRM. (Auth keeps its own `user_updated`-type audit entry without the password.)

## What Auth does (GoTrue v2.197.0, from its source)
| Situation | Auth code | The form says |
|---|---|---|
| Wrong current password | `current_password_invalid` | «Ο τρέχων κωδικός δεν είναι σωστός» |
| Current password missing (setting on) | `current_password_required` | asks for it |
| Weak password | `weak_password` (+ reasons `length`, `characters`, `pwned`) | explains the reasons in Greek |
| Same as the current one | `same_password` | «πρέπει να διαφέρει» |
| Session older than 24 h and «Secure password change» on | `reauthentication_needed` | offers, in this order: **sign out and sign in again (no email)**, or `reauthenticate()` → code by email → `nonce` |
| The built-in sender cannot mail the account | `email_address_not_authorized` / `email_address_invalid` | «Δεν χρειάζεται email: αποσυνδεθείτε και συνδεθείτε ξανά» |
| Wrong / old code | `reauthentication_not_valid` | asks for a new code |
| MFA session required | `insufficient_aal` | says extra verification is needed |
| Session gone | `session_not_found`, `bad_jwt`, … | «Συνδεθείτε ξανά» |
| Rate limit | `over_request_rate_limit`, HTTP 429 | «Περιμένετε λίγο» (no invented countdown) |

Order on the server: reauthentication is checked **before** the current password.

After a successful change Auth keeps **this** session and signs out **every other session** of that user (`LogoutAllExceptMe`).

**The shared Admin / Back Office login.** It is one account used by the whole office, so changing its password signs out **every other office device**; each needs a new sign-in with the new password. The card says so before the change (a second click is required), and again after it, and asks the Admin to pass the new password on through a secure channel. Sales Agent accounts are individual: nobody else is affected. A password change also clears all pending one-time tokens of the user, **including a pending e-mail-change confirmation**: the card warns when `new_email` is set.

## Dashboard settings this feature depends on (owner only; not read or changed by the repository)
Authentication → Sign In / Providers → Email, and Authentication → Policies / Attack protection (names vary by Dashboard version):

| Setting | Recommended | Why it matters here |
|---|---|---|
| Secure password change | ON | requires a recent session or a code before a password update |
| Require current password when updating | **ON** | **Without it Auth ignores `current_password`** and the field is decorative. |
| Minimum password length | **12** | the form and the reset page require 12 (`MIN_PASSWORD_LENGTH`); a lower value in the Dashboard still lets Auth accept 12+, a higher one makes Auth the stricter authority: it always has the last word and its refusal (`weak_password`) is explained in Greek |
| Password requirements | letters + digits (+ symbols) | matches the form's guidance |
| Leaked password protection | ON if the plan offers it | maps to the `pwned` reason |
| Confirm email | ON (as configured) | unrelated to this form |

These values are **not exposed** by `GET /auth/v1/settings`, so whether they are on is **unverified** from the repository and from Production; the owner confirms them in the Dashboard.

## Not part of this feature
No Admin API password change, no SQL on `auth.users`, no email-provider change, no SMTP/Resend work.

## Why re-authentication does not depend on e-mail
Supabase's built-in sender mails only project team members and has an hourly quota. A Sales Agent outside the team, or an exhausted quota, would otherwise make a >24 h session unable to change its password. A fresh sign-in creates a new session, which needs no code, so the card always offers **«Αποσύνδεση και νέα σύνδεση (χωρίς email)»** next to the code request.

## Is the current-password check real?
Yes, on the server: with «Require current password when updating» on, GoTrue v2.197.0 answers an empty current password with `current_password_required` and a wrong one with `current_password_invalid` (HTTP 400) and changes nothing (`internal/api/user.go`, read at that tag). The browser only checks that the field is filled; it never compares passwords. **With the setting off, Auth ignores the field**, so the setting is the one thing this feature cannot enforce from the repository (it is not exposed by `/auth/v1/settings`); it is on the dashboard's manual checks.
