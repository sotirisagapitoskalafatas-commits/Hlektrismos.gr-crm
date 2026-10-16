# Modules visible to users: scope, feature flag, wording

**Status:** proposal. No code, **no deletion**.

## 1. What belongs to Hlektrismos and what does not

**How each module was classified:**
- against the field-sales CRM brief (leads → cases → field visit → documents → provider submission → activation);
- against git history: when each module was added and with what commit message.

Git does not record whether code was copied from another project, so the "Origin" column says what the commits say. Commit messages call the AI and automation work «CRM OS» / «AI workforce» / «autonomous outreach engine». That is a generic platform, not the Hlektrismos brief.

### In scope (keep visible)

| Module | Menu | Notes |
|---|---|---|
| Αρχική, Η εργασία μου, Follow-ups | all | core |
| Leads, Πελάτες, Cases (+ Φάκελος πελάτη, proposal #48) | sales + office | core |
| Πάροχοι & Προγράμματα | sales + office | provider catalogue, needed for offers |
| Ημέρα μου, Χάρτης | field | core of the field brief |
| Λειτουργίες → «Διεκπεραίωση» | office | Back Office queue |
| Διαχείριση (Admin centre) | office | users, documents, gates, security |
| Αναφορές | office | basic reporting |
| Λογαριασμός, Προτιμήσεις | all | — |

### In scope but unfinished (hide for non-admins until ready)

| Module | Origin (git) | What is missing |
|---|---|---|
| **B2B Prospecting** (scraper) | `35ebe5e` 18/08 «B2B scraper, integrations settings, AI developer agent»; restored `16846b6` 11/09; pipeline rewritten for staged phase3/08 | Staged **08** not applied. Legal review pending (retention; Article 11 before any call). The live `scrape-b2b` version must be checked (`PENDING_MIGRATIONS.md`) |
| **Λειτουργία Πεδίου** (`field`, marked beta) | — | Overlaps with «Ημέρα μου». Decide whether it stays |
| **Έσοδα** (`revenue`) | `454e05a` 11/09 «from redesign» | Uses case value and probability; commission rules are not modelled. Confirm it is wanted |

### Not part of the Hlektrismos brief (generic «CRM OS» platform features)

| Module | Origin (git) | Visible to | Notes |
|---|---|---|---|
| **AI Εργατικό Δυναμικό** (`aiworkforce`) | `c992274` 15/09 «AI workforce v1 over real tools+policy+tool_call_log backend» | admin, manager | English tool descriptions from the `tools` table; English labels («Shadow», «Work Queue», «Memory») |
| **Αυτοματισμοί** (Automation Builder, `automations`) | `2cf2f61` / `c201c1d` 15/09 «CRM OS AI workforce (event bus v2, policy engine…)» | admin, manager | Edits `policy_rules` for the AI agents |
| Edge functions `orchestrator`, `agent-worker`, `ai-developer` | `435d636`, `0a3b332` 17/08; `35ebe5e` 18/08 | — (server) | **Auto-deployed** on merge (`supabase/config.toml`). No user screen in the current shell. Should be reviewed before anything else is enabled |
| Outreach engine: `campaign-scheduler`, `make-voice-call`, `send-sms`, `send-campaign-email` | `a82bad8` 19/08 «Autonomous outreach engine — campaigns, SMS, voice AI…» | — | **Must stay off** until counsel and the owner approve (standing rule). Fails closed without staged 02/09 |
| Old dashboard (`src/pages/DashboardPage.tsx`, `SettingsPanel`, `EntityDetailWindow`, `LeadDetailSlideout`) | `40f9131` 13/08 «DashboardPage with GDPR routing, agent config drawer, Market RAG» | **nobody: not routed** (`App.tsx` has no route to it) | Dead code. Its SettingsPanel stores API keys in `crm_settings`. It is the reason admins can still read credentials (finding 4). Remove in a later, separate PR once agreed |

## 2. Proposal: hide unfinished modules behind an admin-only feature flag
- **Flag:** «Πειραματικές λειτουργίες» in *Προτιμήσεις*, shown **only to admins**. It is off by default and stored per browser (`localStorage`). No database change.
- **Rule:** a menu item marked `beta` or `planned` (already a field on every menu item: `maturity`) is shown only when **role = admin and the flag is on**.
  - Non-admins never see these modules.
  - Opening the address directly shows Αρχική. This is the same check `AppShell` already does for «Λειτουργία Πεδίου».
- **Today's `beta` items:** Αυτοματισμοί, AI Εργατικό Δυναμικό, Λειτουργία Πεδίου. B2B Prospecting is marked `live` and should become `beta` until 08 and the legal review are done.
- **The flag only hides; it does not secure.** The data behind these screens stays protected by RLS and server checks. It hides unfinished work; it is not access control.
- **The «Live / Beta / Planned / Blocked» dots** in the menu have English tooltips. Change them to «Σε λειτουργία / Δοκιμαστικό / Προγραμματισμένο / Μπλοκαρισμένο», or hide them for non-admins.
- **Effort:** about 1 day including tests.

## 3. Neutral wording for non-admins; Greek everywhere

**Rule.** When a capability waits for a staged migration:
- non-admins see one neutral sentence, «Η λειτουργία δεν είναι ακόμη διαθέσιμη.», or the block is hidden;
- admins see the technical status only in **Διαχείριση → Ασφάλεια / Κατάσταση**, in plain Greek, e.g. «Εκκρεμεί η ενημέρωση της βάσης “Κάδος” (phase2/06)».

The Admin centre is visible to manager and back_office too, so the technical lines inside it also need this rule.

| Where | Today (shown to users) | Proposal |
|---|---|---|
| `contact-eligibility.ts:100` (consent block on Lead / Customer) | «…ενεργοποιείται μετά την εφαρμογή της migration phase3/09 (εκκρεμεί έγκριση).» | hide the block for non-admins; admins see «Ο έλεγχος συγκαταθέσεων δεν είναι ακόμη ενεργός.» |
| `case-return.ts:52` (stage errors) | «…migration phase2/07 (εκκρεμεί έγκριση).» | «Η λειτουργία δεν είναι ακόμη διαθέσιμη.» |
| `trash.ts:45` | «Ο κάδος ενεργοποιείται μετά την εφαρμογή της migration phase2/06…» | «Ο κάδος δεν είναι ακόμη διαθέσιμος.» |
| `b2b.ts:37` | «Η ροή B2B ενεργοποιείται μετά την εφαρμογή της migration phase3/08…» | module hidden (§2) |
| `lead-intake.ts:26, 35` | «…migration phase4/12.» | «Η αυτόματη ανάθεση στο γραφείο δεν είναι ακόμη ενεργή.» |
| `api.ts:586, 601` (gate modes, exceptions) | «…migration phase2/07 / phase4/13.» | neutral sentence |
| `staff-admin.ts:48` | «…(εκκρεμεί η migration phase2/05).» | neutral sentence |
| `AdminCenter.tsx:102` | «Απαιτεί migration phase2/05 και function admin-users.» | «Εκκρεμεί ενημέρωση της βάσης» (detail for admins only) |
| `AdminCenter.tsx:153` | «…μετά την εφαρμογή της migration phase2/05.» | same |
| `StaffAdmin.tsx:75–76` | «…όταν εφαρμοστεί η migration `staged-migrations/phase2/05` και αναπτυχθεί η function `admin-users` (εκκρεμεί έγκριση).» | «Μόνο προβολή. Η διαχείριση χρηστών ενεργοποιείται μετά την επόμενη ενημέρωση.» |
| `GateModes.tsx:41`, `BackofficeAssignee.tsx:36` | «…migration phase2/07 / phase4/12 (εκκρεμεί)…» | same pattern |
| `AdminReference.tsx:86` | «…(staged phase2/07, trigger στο στάδιο)…» | «Επιβάλλονται από τη βάση μετά την ενημέρωση· ως τότε τις περιορίζει η εφαρμογή.» |
| `admin-checks.ts` source findings | file names and line numbers (`20260910103000 (γρ. 586)`, `staged-migrations/phase2/05`) | keep for **admins only**, in a «Τεχνικές λεπτομέρειες» fold; Greek summary first |
| AI Εργατικό Δυναμικό | English labels («Shadow», «Work Queue», «Memory») and English tool descriptions from the database | hidden by §2. If kept: Greek labels in the app and a Greek description map by tool name (no DB change) |
| Case tabs and panels (from #48, L8) | «Timeline», «Offers», «Signatures», «Field sales», «Back office», «Follow Ups» | Greek labels (part of Part B) |

**Effort:** about 1 day (one helper for "not yet available", the strings above, tests). It can go together with Part B or before it.

## 4. Decisions for you
1. Approve the admin-only flag (§2), and whether **B2B Prospecting** becomes `beta` until 08 is applied.
2. Keep or drop «Λειτουργία Πεδίου» and «Έσοδα».
3. Whether the generic modules (AI Εργατικό Δυναμικό, Αυτοματισμοί, agent edge functions) should be **removed** in a later PR, after a review of what the agent functions can do on live. Not deleted now.
4. Whether the old, unrouted `DashboardPage` and `SettingsPanel` can be removed (separate PR). This also lets admins stop reading credentials in the browser (finding 4).
