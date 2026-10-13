# ATLAS CRM — UX Blueprint v1

Status: **proposal for review**. Nothing here is implemented yet; implementation is a separate branch/PR after the Phase 1 security work is merged and verified (Part C order in §12). Every mapping below was derived from the current code (`src/lib/roles.ts`: `PageKey`, `LEAD_STATUSES`, `STAGES`, timeline event types).

> **Principle:** every employee immediately understands what needs attention, what to do next, and how to finish the task without hunting through screens.
> Visual direction: Apple-inspired *clarity* — space, restraint, consistency, one primary action — without copying Apple assets or sacrificing daily-work speed.

## 1. Navigation: 19 pages → 9 destinations (routes and deep links preserved)

Existing `PageKey`s: `home, mywork, leads, prospecting, providers, cases, followups, customers, map, myday, field, backoffice, reports, revenue, admin, automations, aiworkforce, account, preferences`.

| Destination | Contains (existing page → role in new layout) | Admin | Manager | Inside | Field | Back Office |
|---|---|:-:|:-:|:-:|:-:|:-:|
| **Αρχική** | `home` | ✔ | ✔ | ✔ | ✔ | ✔ |
| **Η εργασία μου** | `mywork` + `followups` (as tabs "Σήμερα / Εκκρεμή / Επόμενα") | ✔ | ✔ | ✔ | ✔ | ✔ |
| **CRM** | `leads`, `customers` (+ universal search, contact history) | ✔ | ✔ | ✔ | assigned | assigned |
| **Πωλήσεις** | `cases` (pipeline/stepper), `providers` (services & programs), `prospecting` (B2B) | ✔ | ✔ | ✔ (no prospecting import) | — | — |
| **Πεδίο** | `myday`, `map`, `field` as three views of one workflow | ✔ | ✔ | — | ✔ | — |
| **Λειτουργίες** | `backoffice` (prioritized queue; documents, signatures, submission, activation) | ✔ | ✔ | — | — | ✔ |
| **Insights** | `reports`, `revenue` | ✔ | ✔ | own stats | own stats | queue stats |
| **Atlas AI** | contextual panel for everyone; `aiworkforce`, `automations` only for Admin (+ read-only monitoring for Manager) | ✔ | monitor | panel | panel | panel |
| **Ρυθμίσεις** | `preferences`, `account` (everyone); `admin` split into the sections of §10 | ✔ | team | personal | personal | personal |

Rules: (1) visibility is derived from the **real** role (`profile.role`), never the simulator; (2) hiding is convenience — every action remains enforced server-side (Phase 1 guards); (3) old routes keep working and redirect into the grouped destination; (4) secondary pages appear as compact sub-navigation (tabs), not new top-level items.

## 2. Top bar (only five things)
1. Universal search — `Ctrl+K` (Windows) / `⌘K` (macOS): leads, customers, cases, tasks; results grouped, keyboard navigable.
2. One primary **`+ Νέο`**: lead, customer, case, task, note — only types the role may create.
3. Notifications + pending approvals (one bell, two sections).
4. Atlas AI entry (opens the contextual side panel).
5. Profile & preferences.
Removed: duplicated counters, repeated navigation labels, competing secondary buttons. The demo role switcher moves to Settings → Advanced (admin only, labelled "View as — display only").

## 3. Status models (display layer only — **no data migration, no silent reinterpretation**)

### Lead (today: 9 stored values)
| Stored `LEAD_STATUSES.id` | Shown as | Notes |
|---|---|---|
| `new` | **Νέο** | needs first contact |
| `contacted` | **Σε επικοινωνία** | |
| `qualified` | **Ειδικευμένο** | |
| `meeting`, `offer` | **Ειδικευμένο** (+ activity chip "Συνάντηση"/"Προσφορά") | these are activities on the way to a case, not separate lead stages |
| `converted` | **Μετατράπηκε** | links to Case/Customer |
| `lost` | **Χάθηκε** + required reason | reason list defined in §10 |
| `unqualified` | **Χάθηκε** with reason "Μη επιλέξιμο" | **confirm with owner** |
| `duplicate` | quality flag **Διπλότυπο** (not a stage) | detection + merge review |
Quality flags (separate from status): Διπλότυπο, Άκυρα στοιχεία, Λείπουν στοιχεία επικοινωνίας.
The abbreviations (`ΝΕΟ ΕΠΙ QLF ΣΥΝ ΠΡΟ ΜΕΤ ΧΑΣ ΜΗΔ ΔΙΠ`) are removed from the UI everywhere; full Greek labels only.

### Case (today: 11 stored stages — already named; only the short codes go)
Stepper: `Νέο → Επικοινωνία → Προσφορά → Αίτηση → Υπογραφή → Έλεγχος εγγράφων → Καταχώρηση παρόχου → Ενεργοποίηση → Ολοκληρώθηκε`; terminal outcomes **Χάθηκε / Ακυρώθηκε** shown separately with a reason. Each step shows: owner team, required items, what is missing, due date.
Stage prerequisites are enforced **server-side**; an authorized exception requires a reason and creates a timeline event.

## 4. One Case, three departments, one timeline
The timeline model already exists (event types carry a `team`: inside_sales / field_sales / back_office / system). Blueprint additions (data wiring is Phase 2 work, not UI-only):
* A **handover** is an explicit timeline event: from team/owner → to team/owner, reason, what is required next, who is responsible.
* The case header always shows: current stage, responsible team, owner, next action + due date, blocker (if any).
* No duplicate customer/case on handover; duplicate detection on normalized phone/email/ΑΦΜ before creation.
* Source-of-truth decision needed (§9): `leads` vs `hlektrismos_leads`, `customers` vs `hlektrismos_customers`.

## 5. Screen blueprints (one primary action each)

| Screen | Shows | Primary action | Data |
|---|---|---|---|
| **Αρχική** | "Χρειάζεται προσοχή σήμερα": overdue tasks, new unassigned leads (managers), blocked cases; 3–4 meaningful metrics | Open the most urgent item | tasks, leads, cases (§9 definitions) |
| **Η εργασία μου** | One prioritized list: item, next action, deadline, owner, status; filters Σήμερα/Εκκρεμή/Επόμενα | Do the next action | `follow_ups`, assigned leads/cases |
| **Lead** | Contact info, status, owner, source, recent activity, **recommended next action** (labelled as a suggestion); quality flags | **Καταγραφή κλήσης** → outcome (Δεν απάντησε / Ενδιαφέρεται / Δεν ενδιαφέρεται / Νέο follow-up) → *must* set next action before closing | lead + timeline |
| **Πελάτης** | Overview, related cases, documents, communication history — each item shown once | Open active case / log interaction | customer, cases, docs |
| **Case** | Progress stepper, required documents with missing items, responsible team, next action, shared timeline | Complete the next step | case, docs, timeline |
| **Πεδίο** (mobile-first) | Today's visits → Navigate → Check-in (GPS or manual fallback) → meeting outcome, notes, documents → set next action → Check-out | Check in / Navigate | visits, check-ins, map |
| **Λειτουργίες** | Prioritized queue (due date, blocker reason, owner, age), not empty stage columns | Open next case to process | cases by stage + blockers |
| **Ρυθμίσεις** | §10 | — | — |
Every screen defines: empty state (what to do next), loading, success confirmation, and plain-language error with a retry.

## 6. Role procedures (guided steps, same underlying Case)
* **Inside Sales:** My Work → open lead → contact → choose result → set next action → (qualified) create offer/case. After any contact the app prompts to log the outcome and schedule the next action; it never auto-sends promotional messages.
* **Field Sales:** My Day → visit → Navigate → Check-in → outcome/notes/documents → next action or handover to Back Office → Check-out.
* **Back Office:** queue → open case → checklist → verify or record exactly what is missing → return blocked work (reason + due date) or advance → provider submission (truthful result) → activation evidence → close.
* **Manager (default view answers 4 questions):** what needs attention today; which leads have no first contact within the SLA; where cases are stuck and why; who is overloaded / has capacity.
* **Admin:** users & roles, integrations (status only — never secret values), AI/automation policies, audit logs, security events, backups/health.

## 7. Visual & interaction system
Neutral soft background, white surfaces, dark readable type (Greek-friendly), **one** primary blue, subtle borders, restrained shadows, one icon set, generous spacing, 44 px touch targets, visible focus, WCAG AA contrast, `prefers-reduced-motion` respected, responsive desktop + phone. No competing accent colors, no decorative KPI cards, no oversized charts. Reuse existing components (`Card`, `Btn`, `Pill`, `CardHeader`); introduce tokens, not a rewrite.

## 8. Atlas AI
* **Everyone (contextual):** summarize customer · explain this case/blockers · recommend next step · prepare follow-up (draft) · prepare message (draft for review).
* **Admin (+ manager monitoring):** AI Workforce: tools, policies, execution history, failures, approvals, limits.
* Action levels enforced by backend policy (never by the model): **read-only** · **internal reversible write** (draft/task/note) · **external communication** (needs eligibility gate + approval) · **high impact** (bulk campaign, integrations, role changes, exports, provider submission — explicit permission, often separate approval) · **prohibited**.
* Suggestions are labelled as suggestions; the UI never shows an AI recommendation as a completed action.

## 9. Metrics: one source of truth before any dashboard redesign
Findings from the code:
* **Fixed (Phase 1):** AI Workforce error count was `length-1` (0 errors showed −1). Now derived from persisted logs by a tested helper.
* **Open:** lead totals are computed independently in at least six places (`AdminDashboard`, `ManagerDashboard`, `DashboardPage` `leadCounts`, provider usage in `api.ts`, etc.) over two lead tables, with no shared definition → counts can disagree.
Definitions to agree and then implement once (shared query/view used by every screen):
| Metric | Definition (proposal) |
|---|---|
| Νέα leads | created in period, not deleted, any source, both lead tables unified via a view |
| Ενεργά leads | status ∈ {Νέο, Σε επικοινωνία, Ειδικευμένο}, not deleted |
| Ανοιχτά cases | stage not in {Ολοκληρώθηκε, Χάθηκε, Ακυρώθηκε} |
| Αξία pipeline | sum of case value where value is **known**; unknown ≠ €0 (shown as "—") |
| Follow-ups | overdue (due < now, open) · today · upcoming · completed — mutually exclusive |
| AI/automation counts | count of persisted execution records by state: queued / pending approval / running / success / retryable failure / permanent failure / cancelled; never negative, never placeholders |
Acceptance: each dashboard number reconciles with one documented SQL query.

## 10. Settings structure and first-run checklist
| Section | Contents | Access |
|---|---|---|
| Το προφίλ μου | name, contact, language, time zone, accessibility, display | everyone |
| Ομάδα & Ρόλοι | users, active status, teams, permissions (`role_permissions`) | admin; managers: own team |
| Διαδικασία πωλήσεων | stages, required fields/documents, SLA & follow-up defaults, lost-reason list | admin |
| Υπηρεσίες & Πάροχοι | services, providers, programs | authorized staff |
| Ενσωματώσεις | website intake, SerpApi, email/SMS/voice providers — **status only** in UI, secrets server-side | admin |
| AI & Αυτοματισμοί | rules, approvals, limits, kill switches, history | admin; manager monitor |
| Αναφορές & Logs | audit history, security events | role-restricted |
| Προχωρημένα | view-as, technical/high-impact operations | admin only |
Each setting states what it changes, who it affects, whether it is safe, and whether confirmation is needed; high-impact changes are audited.
First-run checklist (7 items: company/services · employees & roles · providers · website intake connected **and test lead received** · stages/required documents · AI approval policy · synthetic lead→activation test). Items turn green only from **verified state** (e.g. a test lead actually arrived), never from a manual tick.

## 11. Preconditions and risks
* Security Phase 1 merged and verified on staging first; role-aware UI depends on the server-side permissions.
* The two-lead-table decision (§4/§9) gates the Home/My Work counts.
* Status display mapping must be reviewed by the owner (esp. `unqualified`, `meeting`, `offer`).
* Mobile Field Work depends on GPS permission handling and an offline/slow-network fallback; test on real devices.

## 12. Part C — implementation order (separate branches, small PRs)
1. **Foundations:** design tokens, shared status-label mapping (display), metric queries, search + `+ Νέο`, grouped navigation shell (old routes redirect).
2. **Αρχική + Η εργασία μου.**
3. **Lead & Customer details** (call-outcome flow with required next action).
4. **Case details + shared workflow** (stepper, missing items, handover events).
5. **Πεδίο + Λειτουργίες.**
6. **Settings split, Atlas AI areas.**
Per phase: role walkthroughs (Admin, Manager, Inside, Field, Back Office), keyboard + mobile tests, Playwright journeys on staging with synthetic data, and a reconciliation check that dashboard numbers equal their SQL definitions.

## 13. Decisions needed from the owner
1. Approve the lead-status mapping in §3 (especially `unqualified`, `meeting`, `offer`).
2. Which lead/customer table is canonical (or approve a unifying view).
3. First-contact SLA (e.g. 15 min in working hours?) and lost-reason list.
4. Visibility rules: colleagues' leads, ID documents, exports, campaign approvals.
5. Priority order among Part C screens if time is limited.
