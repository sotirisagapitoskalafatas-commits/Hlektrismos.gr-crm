# ATLAS CRM — UX increment 2: navy shell, Lead details, Atlas AI (CRM), document-type-first uploads

Branch `ux/atlas-navy-lead-details` (from `main` @ `be02741`, PR #30 merged). UI only: **no database, RLS, migration, permission, campaign or stored-value changes.**

## What changed
| Area | Change |
|---|---|
| Design tokens | Reference tokens from the approved concept image as CSS variables in `src/styles/atlas-ux.css` (navy `#0B1F3A`, primary `#1677FF`, background `#F5F7FA`, text `#14233B`, muted `#64748B`). Sidebar is now **dark navy** with a solid blue active item. CRM dialogs are opaque and readable. |
| Lead details (new) | `src/components/leads/LeadDetail.tsx`, opened from My Work, the Leads list (click the name) or Atlas AI; the URL-less deep link is `go('leads', { lead: id })`. Identity header with plain-Greek status, details, **recommended next action** with the reason (`src/lib/lead-next.ts`), contact block, related Case, and history. |
| Lead actions (real only) | Record first contact → `contacted`, mark qualified → `qualified`, convert → existing `convert_lead_to_case` RPC, edit → existing edit form, status select (all existing values; unknown stored values stay selectable and are not rewritten). Status changes are recorded with the existing `logAudit` helper. History reads `activity_log` (read-only helper `fetchEntityActivity`); if that read fails the screen says so. |
| Atlas AI for the CRM (new) | The public visitor chatbot is **no longer shown inside the CRM** (`#/app`); it stays on the public site. Staff get **Atlas AI** in the top bar (`src/components/assistant/CrmAssistant.tsx`, logic in `src/lib/crm-assistant.ts`): "Τι έχω σήμερα;", overdue follow-ups, leads awaiting contact, accent-insensitive search for customers/leads/cases, open a section (only sections in the role's navigation), team summary for managers/admins. It uses only data the employee already loaded, makes **no external AI call** and never writes. The pre-existing field-sales tools (route, nearby, today's visits, check-in, note) still work; for field staff they answer first, for others they are a fallback. Their writes still require their existing confirmation step. |
| Documents (redesigned) | Case → Έγγραφα (`src/components/documents/CaseDocuments.tsx`, catalog in `src/lib/documents.ts`). Every upload asks **"Τι έγγραφο ανεβάζετε;" first** (ID/passport, ΑΦΜ proof, Ε9, lease, free-use, electricity bill, gas bill, ΚΟΤ, ΓΕΜΗ, tax start, legal representative, IBAN, solemn declaration, provider application, signed contract, offer, provider document, site photos, property title, field photo, other), then the file or camera (PDF/images, ≤15 MB). A checklist shows the typical documents for the case (service + residential/business) and what is missing, with a one-click "Ανέβασμα" per missing item. Old categories (`identity`, `bill`, …) keep their labels and still count, flagged as less specific. The list is labelled as typical; each provider's exact requirements must be confirmed. |
| Mobile/tablet | Header no longer overflows at 820 px (account name and Atlas AI label collapse). |

## Results (local)
| Check | Result |
|---|---|
| `npm test` | **50 / 50** (adds 13: lead next action, pipeline counts, assistant, documents) |
| Quality gate | type errors **20**, lint **281 / 32** — equal to baseline, no new failures |
| `npm run build` | passes |
| `npm run qa:ui` (mock Supabase, synthetic data) | **91 / 91** — previous 77 plus: no visitor bot in CRM / still on public site; Atlas AI answers from real work items and refuses pages outside the role; lead detail opens from My Work, records first contact (PATCH + audit), advances, converts via the RPC; documents: file blocked until a type is chosen, saved with the chosen category, checklist updates |
The mock performs no authorization: these checks prove behaviour and rendering, not data isolation.

## Known limitations
* Leads have no follow-ups/timeline in the data model (those belong to Cases), so "schedule follow-up" for a lead is not offered — not faked.
* `pipelineByStage` (dashboard pipeline stepper) is implemented and tested but not placed on Home yet.
* The document checklist is guidance; it does not block stage changes (server-side rules unchanged).
* Atlas AI is deterministic. An LLM-backed mode needs a staff-authorised, policy-gated backend function — not built.
* Real devices, screen readers and live data were not tested.

## Security / production items still OPEN
Unchanged from PR #29/#30: production RLS/grants verification, staged SQL on staging, WordPress→CRM form path, customer-data access policy, tariff-cron and function-version verification, campaigns disabled, Actions workflow enablement.
