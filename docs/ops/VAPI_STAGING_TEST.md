# Vapi webhook: controlled delivery test (CRM-only staging)

**Status: not run.** `vapi-webhook` stays a production deployment blocker until this passes. Run it only on a CRM-only staging project. Never on production, and never on the shared hotel project.

Handler tests use fixtures written from the documentation (`supabase/tests/fixtures/vapi/`). The documentation does not fix these details, so a real delivery must confirm them:
- the fields inside `artifact.recording`;
- whether `durationSeconds` is present on the report, and whether it can be fractional;
- whether Vapi retries a delivery that gets a 5xx, and how often;
- the turn labels in `artifact.transcript` for a Greek call.

## Before
1. A staging project with phase1/21b, phase1/21c, phase3/09, phase1/02 applied, and `vapi-webhook`, `make-voice-call` deployed there.
2. `VAPI_WEBHOOK_SECRET` set on staging to a fresh value (`openssl rand -base64 48`), never the production value.
3. A Vapi test number and a phone owned by the tester. One synthetic lead with that phone.
4. Consent, Article 11 screening and the outreach switches set **on staging only**.

## Steps and expected results
| # | Action | Expected |
|---|---|---|
| 1 | `POST` a fixture with no header | 401, no row changes |
| 2 | `POST` a fixture with a wrong `x-vapi-secret` | 401, no row changes |
| 3 | Place one call through `make-voice-call` and answer it | `voice_calls` row moves to `ringing`; `communication_log` has `attempt` and `sent` |
| 4 | Say «έχω ενδιαφέρον», hang up | one `end-of-call-report` arrives; `voice_calls` is `completed` with duration, transcript and recording URL; lead `pipeline_status` is `qualified`; one note |
| 5 | Copy the delivered body from Vapi's webhook logs and replay it with the right header | 200 `already completed`; no second note |
| 6 | Second call; say «μη με ξαναπάρετε» | `contact_objections` has one row for the number; note says it was recorded; a further call is refused by the gate |
| 7 | Revoke the function `record_spoken_objection` on staging, repeat on a new number | note says it was **not** recorded; lead `ai_paused` is true |

## After
Save the delivered body from step 4 with personal data removed, compare it with `fixtures/vapi/end-of-call-report.json`, and correct the fixture and `_shared/vapi-report.ts` if they differ. Remove the staging values of the outreach switches.
