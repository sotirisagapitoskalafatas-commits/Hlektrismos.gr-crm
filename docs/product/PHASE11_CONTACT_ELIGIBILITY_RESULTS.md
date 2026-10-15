# ATLAS CRM — Contact eligibility (consent · objection · Article 11, per channel)

Branch `feat/contact-eligibility` (from `main` @ `663ba00`). **No production change, no deployment, nothing sent.**

The server part is `supabase/staged-migrations/phase3/09_contact_eligibility.sql`. It needs the owner's approval to apply, after phase1/01–04 and phase3/08.

## Audit of what existed (before building)

| Existing piece | Evidence | Gap | Now |
|---|---|---|---|
| Pure decision function, fail-closed: email / SMS / WhatsApp / Viber / AI voice, master switches, consent with evidence, suppression, frequency, hours | `_shared/eligibility.ts` (PR #29) | No rule for **a person phoning** (the B2B leads are called by agents). No objection list separate from consent | New channel `call`; objections checked for every channel |
| Per-lead permission table `contact_permissions` | staged `phase1/02` (never applied) | Keyed to the **legacy** `hlektrismos_leads` id. A «no» on one record did not follow the person to the new `leads` / `customers` / B2B prospects | Replaced by `contact_consents` / `contact_objections` / `article11_screenings`, keyed to the phone and email |
| `consent_records` (customer + channel) | migration `20260821…`; used only by `AutomationPage`, which no screen opens | Not reachable; no evidence fields | Left as is (not used by the gate) |
| `email_suppressions` + unsubscribe link | migration `20261001000200` | Email only | Still used. Objections and email withdrawals add to it |
| Website form consent (`leads.gdpr_consent`) | `insert_website_lead` | Consent to be contacted about **their request**, not marketing consent | Deliberately **not** treated as marketing consent |
| B2B: «Article 11 screening not done» note on each distributed lead; `b2b_prospects.phone_screening` | phase3/08 | No way to record a screening | `record_article11_screening` records it and updates `phone_screening` |

No new provider, scraper or campaign tool was added.

## What the CRM shows: «Επικοινωνία & συγκαταθέσεις» on lead and customer pages

| Row | Rule (same code the server enforces) |
|---|---|
| Τηλεφωνική προώθηση από πωλητή | No objection, **and** a «not listed» Article 11 screening from the last 30 days (or consent for calls with evidence). A «listed» number is always refused. Calls are allowed 09:00–20:00 Athens time |
| SMS / Email προώθησης | Consent with evidence for that channel, no objection, not suppressed (email) |
| Αυτόματη κλήση (AI) | As SMS, plus a fresh Article 11 screening |

- Below the rows, a fixed line: automated sends are **closed system-wide** until legal approval, whatever the person's row says.
- Answering someone about their own request is not marketing. Only a «καμία επικοινωνία» objection stops that.

| Action | Who | Notes |
|---|---|---|
| Δεν θέλει επικοινωνία | everyone on staff | Reason required. Marketing only or all contact; all channels or chosen ones. Applies to the number and the email on **every** record. The email is also added to the «μη αποστολή» list |
| Ανάκληση συγκατάθεσης | everyone on staff | Reason required. Takes effect at once |
| Έλεγχος Άρθρου 11 | Back Office, manager, admin | Result, the register checked, optional evidence, a date within the last year |
| Καταγραφή συγκατάθεσης | Back Office, manager, admin | Evidence reference and date are mandatory. The database refuses a grant without them |
| Άρση αντίρρησης | admin | Reason required. Lifts the phone and email rows together and removes only the suppression that the objection itself created |

Every action is written to `activity_log`. During a role demo, only reading is allowed (`contact_facts` was added to the read-only list).

## Server side

- **Shared rule check:** `supabase/functions/_shared/eligibility.ts`. It is bundled into the CRM for display and used by the outreach gate for enforcement.
- **Gate data:** `outreach-loaders.ts` now reads consents, objections and the latest screening by the lead's phone and email. If any lookup fails, everyone is denied.
- **Address matching:** `contact-keys.ts` and the SQL normalisation functions; a test checks that both give the same result.
- **Function deployment:** the edge functions that use the gate (`send-sms`, `send-campaign-email`, `make-voice-call`, `campaign-scheduler`) must be deployed **after** 09 is applied. Before that they refuse everything, which is fail-closed.

## Validation (local only)

| Check | Result |
|---|---|
| `npm test` | **125 / 125**. New: 6 PGlite tests for 09, 6 rule tests, 2 gate tests, 2 role-preview checks. The phase1 RLS test was adapted to the renamed 02 |
| Quality gate (`scripts/quality-gate.mjs`) | 18 / 281 / 32: unchanged |
| `npm run build` | passes |
| UI section 2g (mock backend, synthetic data) | **10 / 10**: card per role, objection, Article 11 screening, consent with evidence, admin lift, field sales on mobile (no horizontal scroll), nothing sent |

Screenshots: `docs/product/screenshots/after/contact-eligibility-1440.jpg`, `contact-eligibility-390.jpg`, `contact-objection-dialog-1440.jpg`.

**Limits:**
- The mock backend has no real permission rules (RLS). Database permissions are verified only in PGlite.
- Nothing has been verified on staging or production.

## Needs legal / business confirmation

These rules are a conservative engineering default, not legal advice. See the phase3 README for the full list:

- the screening validity and contact hours;
- whether call consent may replace screening;
- how the register is checked in practice;
- «existing customer» as a basis;
- consent wording and versions;
- consent for B2B email.

## Next (not in this PR)

- **Campaign Center:** audience preview from these rules, approval, dry run, scheduling, emergency stop. It stays disabled until legal approval.
- **Optional:** a warning when someone logs a call to a number with an objection, and a bulk import of register screening results.
