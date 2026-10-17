ATLAS CRM — Hlektrismos Master Implementation Prompt
Purpose: Safely extend and correct the existing ATLAS CRM for Hlektrismos.gr, based on the company meeting requirements. This is an implementation brief for Claude Code to use inside the actual existing repository.
Primary directive: Audit first, then implement the confirmed requirements in the current application. Preserve the existing product, architecture, data, authentication, integrations, routes, permissions, and unrelated functionality. Do not replace the CRM with a new application, mock UI, or simplified prototype.
0. Working rules and priority order
You are operating in the repository that contains the existing ATLAS CRM. Work from its root directory.
Follow this priority order:

1. Protect current production functionality and data.
2. Reproduce and diagnose the Lead-creation failure from evidence in the existing implementation.
3. Implement the confirmed Field Sales, route planning, customer folder, duplicate approval, and Back Office requirements.
4. Preserve and improve existing UI consistency and usability without redesigning unrelated pages.
5. Validate changes with real project checks and document any unverified item honestly.

Non-negotiable constraints

* Do not begin editing until you have inspected the relevant repository structure, the current dashboard and CRM workflows, data access, authentication, authorization, integrations, and tests.
* Do not assume the screenshots or this prompt completely describe the existing architecture. The codebase and deployed configuration are the source of truth for how the application currently works.
* Preserve every existing feature, page, route, deep link, API endpoint, server action, database relationship, query, mutation, notification, integration, filter, search function, report, export, and workflow unless a change is explicitly required below.
* Preserve the current framework, package manager, UI library, application architecture, and coding conventions unless the audit establishes a concrete reason to change something.
* Preserve the existing authentication provider and authorization approach. Do not bypass permissions, weaken row-level security (RLS), expose secrets, or move privileged operations to an untrusted client.
* Do not delete data, reset databases, rewrite migrations, rename existing database objects, or perform destructive schema changes.
* For genuinely new persistence needs, prefer backward-compatible, additive database migrations only. Migrations must preserve all existing records and have a clear deployment/rollback strategy. If a confirmed requirement cannot safely be implemented under this constraint, explain the blocker and propose the smallest safe additive approach rather than silently making a destructive change.
* Do not use hardcoded production KPI values, fake businesses, fabricated visits, placeholder records, or mock responses as implementation substitutes.
* Do not invent unconfirmed business rules. Use the confirmed defaults below, inspect existing behavior, and list unresolved assumptions explicitly in the final report.
* Do not stop after an audit or plan. Implement the safe, confirmed changes, run the available checks, and report exactly what did and did not work.

1. Phase One — repository and production-behavior audit
Before editing, inspect and map the existing implementation. Read relevant source files rather than guessing from filenames alone.
Inspect at minimum:

* The application framework, routing, layouts, and current dashboard/CRM entry points.
* Lead creation screens, forms, validation schemas, form state, submission handlers, and error rendering.
* Lead/customer/business/case data models and their database relationships.
* API routes, server actions, edge functions, background jobs, webhook handlers, and third-party integrations involved in leads, files, maps, and pipeline status.
* The existing authentication provider, roles, session handling, access guards, and RLS/database policies.
* Existing map, geocoding, directions, or route-planning integrations, including relevant environment variable names and documentation.
* Existing storage buckets, upload flows, file access policies, signed-URL handling, and document metadata.
* Field Sales pages, “Ημέρα μου”, map pages, follow-up functionality, Back Office/Operations pages, customer folders, pipeline views, and navigation destinations.
* Current component library, styling conventions, localization, notifications, and responsive behavior.
* Existing database migrations, seed scripts, test setup, lint/type-check/build scripts, and relevant tests.

Create an internal feature map that records each relevant page, data source, action, permission, and route. Keep the final report concise, but state any important gaps discovered.
1.1 Root-cause investigation: Lead creation errors
The meeting notes report that new Leads sometimes cannot be created or do not appear correctly in the CRM. The exact failure is not yet known. Do not assume the cause.
Trace the full path end-to-end:

1. Form opens and initial data loads.
2. Client-side validation and optional/default fields are evaluated.
3. The authenticated user submits the form.
4. The request/server action/API receives and validates the payload.
5. Authorization, role checks, and RLS policies are evaluated.
6. The database insert/update and foreign-key or other constraints execute.
7. Any file upload runs, if relevant to lead creation.
8. The response returns and the UI refreshes/invalidate caches.
9. The saved lead appears in the correct list, pipeline, agent’s view, and details page according to existing filters and access rules.

Investigate plausible causes only when supported by code or reproducible evidence, including:

* Required program/provider selection despite the confirmed rule that a Lead can be created without an energy program.
* Mismatch between front-end validation, server validation, and database constraints.
* Missing or incorrect authenticated user/agent assignment.
* RLS or permission rejection.
* Invalid enum/status, foreign key, or required-field values.
* API/server-action errors that are swallowed or displayed poorly.
* Incorrect payload mapping or form field names.
* Database write succeeds but list query, cache invalidation, filters, or ownership scoping hides the record.
* Upload failure incorrectly prevents a lead record from being created, if the existing implementation couples these operations.

Use the available logs, errors, tests, and local/dev environment. Never expose credentials, ID images, energy bills, emails, phone numbers, or other sensitive record data in logs. Log safe diagnostic metadata only.
Required result: Fix the root cause(s) that can be confirmed. Show meaningful, localized errors in the UI while preserving safe diagnostic details for developers. Add or update regression tests where feasible. If a cause cannot be reproduced or verified, do not claim it is fixed; describe the remaining diagnostic step in the final report.
1.2 Optional program at Lead creation
A program/tariff must not be required merely to create a Lead. The program should be selected later when preparing the offer, in line with the existing provider/offer workflow.

* Inspect client validation, server validation, type definitions, DB defaults, constraints, and any forms that create leads.
* Do not insert a fake provider/program merely to satisfy validation.
* Do not silently weaken unrelated data integrity rules.
* If an existing non-null database constraint prevents a program-less Lead, document the conflict and determine whether a safe, backward-compatible additive compatibility approach exists. Do not make a destructive schema alteration without a clearly justified and documented plan.
* Do not make the program mandatory at a later stage unless that requirement is already implemented or is explicitly supported by the existing provider/application rules. The confirmed requirement is to defer the choice until offer preparation, not to invent provider rules.

2. Confirmed user and permission model
The target business setup has two kinds of CRM users:

1. One shared Admin / Back Office login used by the office team.
2. Multiple individual Sales Agent users, each with their own identity and assigned work.

Implement this using the current authentication system and authorization patterns. Do not create a new authentication system.
2.1 Shared Back Office account

* Preserve/configure one shared authenticated Admin/Back Office account for office staff as required by the business.
* Do not hardcode its username, password, tokens, or credentials in source code, SQL migrations, client bundles, documentation, or `.env.example` values.
* Do not bypass the existing authentication provider to simulate a shared login.
* The shared account has the existing administrative/Back Office permissions needed to process cases, manage workflow configuration, review approval requests, handle manager follow-ups, and see/reassign team routes, subject to the application’s existing authorization model.
* Be truthful about audit attribution: operations completed through one shared login can be attributed to that shared account, but cannot distinguish which staff member physically used it. Do not invent individual identities or impersonate another user.
* If the current authentication or deployment setup cannot support this requirement without compromising security, document the exact limitation and offer a secure compatible path; do not quietly bypass security.

2.2 Sales Agent accounts

* Each sales agent has an individual authenticated account.
* Attribute assigned businesses, route plans, visits, leads, follow-ups, and sales cases to the real authenticated agent.
* Agents can view and manage their own routes and assigned work as allowed by current permissions.
* The Admin/Back Office user can see and reassign team routes and handle approval queues.
* Preserve all existing authorization checks and RLS. Avoid accidental exposure of other agents’ private work beyond the specific team/manager visibility explicitly required here.
* Keep current navigation, account controls, and role-based access behavior intact.

2.3 Approval ownership
The shared Admin/Back Office account handles:

* Duplicate/ownership approval requests.
* Manager follow-ups escalated by Sales.
* Relevant route reassignment and operational exceptions.
* Existing and newly required Back Office review actions.

Do not add a third required user category merely to implement these duties. Reuse the current role model as far as possible.
3. Field Sales — configurable branching qualification workflow
Implement or adapt the existing Field Sales workflow. Do not replace the CRM’s established pipeline model without first understanding it.
The workflow must support branching rather than forcing every visit through a single linear path. Use the following as the initial default outcomes. Preserve useful existing outcomes and data where they already exist.
3.1 Initial default visit/lead outcomes

1. Interested / New Sale — begin the customer/supply-point details and sale workflow.
2. Follow-up required — record the reason, responsible agent, and follow-up date. Keep the follow-up visible in the agent’s task list and future route suggestions when due.
3. Manager follow-up — escalate to the Admin/Back Office workflow/queue, preserving the originating agent and visit context.
4. No contact / Decision-maker absent — record the visit outcome and allow another attempt or a follow-up date where appropriate.
5. Not interested — record a reason and the outcome for future reference. Do not invent an unsolicited-contact policy or legal rule not present in the current system.

Allow additional reasons and branches. Authorized workflow configuration should use the current application’s permission patterns, with Admin/Back Office responsible for controlled management of workflow definitions unless the current implementation already supports another authorized model. Sales agents select the configured options; they should not be able to bypass approval or change another agent’s lead ownership.
3.2 Workflow configuration

* Inspect whether the current CRM uses status enums, database lookup tables, configurable metadata, or code-defined transitions.
* Reuse current pipeline/status definitions where possible.
* Provide a controlled way for authorized users to manage additional outcomes, reasons, and branches where genuinely needed.
* Store configurable definitions using the existing safe configuration/metadata approach. Do not create database columns or migrations every time a business adds a new reason.
* Keep existing records readable if status labels or configuration change. Avoid deleting or renaming existing status values unless a backward-compatible migration is fully justified and verified.
* Keep a clear history of outcome/status changes, timestamps, visit linkage, and agent attribution using existing audit/history patterns or an additive extension if necessary.
* Do not invent mandatory reasons, approvals, or field requirements beyond the rules in this prompt and existing validated business rules.

3.3 Follow-ups and branches

* Follow-ups must have a clear responsible agent, due date/time if supported by the current model, reason/context, and completion/rescheduling state.
* Due follow-ups should automatically appear in the agent’s daily work and proposed route when applicable.
* Manager follow-ups route to the Admin/Back Office queue and retain the agent’s notes and originating visit.
* “No contact” or absent decision-maker outcomes should not create an unintended duplicate customer or active Lead.
* Not-interested outcomes should preserve visit history and reason. Keep future revisit/contact behavior configurable or consistent with current rules; do not invent an automatic blacklist or mandatory cooling-off period.
* Support branches from a visit into new sale, follow-up, manager follow-up, no contact, and not interested. Keep the UI fast for agents in the field.

3.4 Explicit Field Sales branch model
Use the following as the concrete conceptual branch map for the initial Field Sales experience. It describes the required paths and outcomes; it is not a mandate to replace the current schema with these literal status strings. Map it onto the repository’s existing status model and preserve existing records.

```
Existing/new business visit
  └─ Record visit outcome
      ├─ Follow-up required
      │    ├─ Set reason + responsible Sales Agent + due date
      │    ├─ Add to agent's follow-up list and due-work route suggestions
      │    └─ At a later interaction, may branch to New Sale, another follow-up,
      │       No Sale / reason, Manager Follow-up, or another configured outcome
      │
      ├─ Interested / New Sale
      │    ├─ Open or create the relevant customer/lead/sale record
      │    ├─ Capture customer details
      │    ├─ Collect/upload available documents:
      │    │    ID front + back, current energy bill, meter photograph, E9
      │    ├─ Show checklist/warnings for anything not yet supplied
      │    ├─ Submit/handover to Admin / Back Office even if the file is incomplete
      │    └─ Retain originating Sales Agent attribution throughout processing
      │         └─ Optional follow-up or another configured branch may remain available
      │
      ├─ No Sale
      │    └─ Record a configured reason, with branches such as:
      │         ├─ Manager Follow-up → Admin / Back Office queue
      │         ├─ Not Interested → store reason and visit history
      │         ├─ Follow-up required → set responsible agent and due date
      │         └─ Another configurable reason/outcome
      │
      ├─ No Contact / Decision-maker Absent
      │    └─ Record visit and, where appropriate, schedule another attempt
      │
      └─ Another manager-configured outcome/reason
```

Implementation requirements for these branches:

* Outcomes and reasons are initial defaults; authorized users must be able to configure additional outcome/reason choices and supported branches, using the existing permissions and configuration approach.
* Selecting New Sale must not erase the visit event or any previous follow-up history. A case can have a history of multiple visits and follow-ups.
* A lead/sale must remain associated with its originating Sales Agent even after handover to Back Office. The current operational queue/stage may change; origin attribution must not.
* A follow-up can lead to a New Sale or another valid configured outcome. Do not build a one-way flow that makes an earlier follow-up terminal.
* A No Sale outcome requires recording the configured reason where the workflow supports it. The listed reasons are examples/default branches, not an exhaustive hardcoded list.
* Do not create a second active Lead just because an agent records another visit or schedules a follow-up for an existing record.
* Duplicate/ownership approval is a separate control: when a business is already owned by or visited by another agent, record the visit as appropriate, but require Admin/Back Office approval before creating a duplicate Lead or taking over the opportunity.
* Missing documents are checklist items/warnings only and must not prevent creating or handing off a sale, or moving between pipeline stages.
* The UI must make the next valid actions visible to a field agent on a mobile-sized screen, without requiring the agent to understand internal database status codes.

4. Daily route planning, map discovery, and navigation
Create or extend a practical route-planning workflow for each individual Sales Agent. The intention is that every morning the agent can organize a day of multiple business visits, often 40–60 stops or more, navigate from stop to stop, record outcomes, and retain the route history.
4.1 Inspect and reuse the existing map stack

* Determine which mapping, geocoding, place-search, direction, and routing provider (if any) the repository already uses.
* Reuse the existing provider and components when possible. Do not assume Google Maps or introduce a paid provider without checking existing integrations, project configuration, usage requirements, and necessary environment variables.
* If a map provider is missing or required credentials are not configured, implement only the safe portions supported by the project and report exactly what configuration is needed. Do not show fake maps, fabricate route geometry, or claim real navigation works without it.
* Keep map integration credentials server-side where appropriate. Update `.env.example` with variable names and safe explanations only; never include real secrets.
* Respect the provider’s documented waypoint limits, terms, and rate limits. Because routes may contain 40–60 or more stops, do not assume one navigation deep link or one directions request can handle the entire route. Use sensible route segments/batches or stop-by-stop navigation if required by the actual provider.

4.2 Businesses available for route planning
The route planner must combine:

* Businesses already stored in the CRM.
* New business candidates discovered through the configured map/place-search provider.

Map-discovered places must not immediately create duplicate permanent CRM businesses or Leads. Present candidate details, run duplicate checks, and persist/import records only through the intended user action and existing application patterns.
4.3 Each morning’s route

* Every Sales Agent can create, view, edit, save, resume, and complete their own route for a specific date.
* Automatically include relevant due follow-ups, assigned businesses, and unfinished visits using the current CRM’s actual assignment and due-date data.
* Let the agent add more businesses from existing CRM records or map-discovered candidates.
* Allow the agent to define the search/visit area and starting address/location, where supported by the current mapping implementation.
* Support a target number of visits, including 40–60 or more. Do not hard-code 60 as a maximum; accommodate provider constraints using safe segmentation or route batching.
* Optimize stop order when the configured routing provider supports it. Allow manual changes to the proposed order before saving.
* Show each stop clearly, with its order, business identity/address, relevant prior outcome, follow-up status, and visit status.
* Persist the saved route and stop order against the correct agent and date. Reloading, navigating away, or returning later must not silently lose the route or its recorded progress.
* Display useful progress, such as total stops, completed stops, remaining stops, skipped stops, and follow-ups, using real persisted data.
* Allow an agent to resume an unfinished route and carry unfinished work into a later day through an explicit scheduling action, preserving history.
* Provide navigation to the next stop using the real integration. Do not misrepresent an external navigation app as a built-in turn-by-turn navigation system.

4.4 Arrival and visit check-in
The confirmed behavior is manual Arrived / Check in, not automatic geofence arrival detection.

* Each stop must have a clear manual Άφιξη / Check in action.
* Check-in records a visit event linked to the route, stop, business, and authenticated sales agent, with an appropriate timestamp and the data supported by the existing system.
* On check-in, open or prominently present the visit/Lead capture form for that business. Do not silently create a new Lead merely because the agent checked in.
* Do not require background GPS tracking or claim that the browser automatically detects arrival.
* If location permission or GPS is not available, check-in must still work manually.
* Provide a clear status transition from planned to checked-in/visited and then the selected visit outcome, without losing earlier history.

4.5 Previously visited businesses
When an agent selects a business for a route or checks in:

* Show available visit history: date/time, agent, recorded outcome, notes permitted to the current user, and any existing follow-up status.
* If the current agent previously visited the business and a follow-up is due, offer the existing follow-up action and preserve its link to the prior visit/Lead.
* If the business was owned or visited by a different sales agent, show a duplicate/ownership warning and require Admin/Back Office approval before creating a new Lead or taking over the business opportunity.
* Preserve legitimate separate supply points as separate connection records; do not merge their energy connection details simply because they belong to the same physical business/customer.
* Do not generate a duplicate Lead as a side effect of route import, manual check-in, or reopening a customer folder.
* An agent must still be able to record an actual visit when a duplicate approval is pending; the visit should be recorded without silently bypassing the approval requirement for creating/taking ownership of a Lead.

4.6 Route ownership, handover, and Admin/Back Office access

* Each Sales Agent sees and manages their own routes and stop progress.
* Admin/Back Office can view team routes, reassign routes/stops where authorized, and handle related requests.
* Record reassignment in the existing audit/history pattern so the application shows who changed the assignment and when, as far as the current shared-account model allows.
* Reassignment must not rewrite historical visit ownership or make it look as though another agent completed a visit.
* Preserve the visit agent attribution separately from the currently assigned lead/case owner.

5. Duplicate detection and Admin/Back Office approval
Duplicate detection is required for businesses that are already owned by or have been visited by another agent.
5.1 Matching and warnings

* Inspect the existing business/customer/contact/supply-point model and duplicate-checking behavior first.
* Use available evidence such as normalized business/customer name, address, phone, location coordinates, existing CRM IDs, and a known supply number. Use only fields that exist and are appropriate.
* Avoid declaring records identical based only on a weak name match. Distinguish a potential match from a confirmed duplicate and show enough context for an authorized user to decide.
* Check candidates from the map provider against the CRM before creating a permanent business/Lead.
* A supply point is a distinct connection record. The same customer can legitimately have multiple supply points and separate associated application/contract information.

5.2 Required approval behavior

* If a business is already owned by or visited by another agent, a new Lead or ownership takeover must trigger an Admin/Back Office approval request before proceeding.
* The Sales Agent must see a clear pending-approval status instead of a generic failure.
* The request should include the candidate business, matching record(s), current owner, relevant visit history, known supply point if applicable, requesting agent, and a concise explanation/intent.
* Admin/Back Office can approve or reject the request. Rejection should leave existing ownership and lead data intact.
* Record the decision, timestamp, and actor available through the current authentication model. Because Back Office uses one shared login, do not claim to identify the individual staff member behind that login.
* On approval, permit the authorized new Lead/assignment while preserving legitimate existing records and keeping distinct supply points separate.
* Prevent accidental duplicate active Leads for the same underlying opportunity/supply point where the existing data model can identify it. When it is unclear whether two records represent the same supply point, flag for review rather than silently merging or deleting records.
* Do not allow a UI-only bypass. Enforce duplicate approval on the server/data-access path as well as in the interface.
* Keep duplicate checking and approval separate from document completion: a missing document must not block stage progression, but a pending duplicate approval remains an ownership/lead-creation control.

6. Customer folder — standard fields and globally configurable custom fields
The customer folder must support sales and Back Office operations throughout the lifecycle. The standard information below must remain available, and both Sales Agent and Admin/Back Office users must be able to add custom field definitions globally when needed.
6.1 Standard customer information
Preserve existing fields and add only what is genuinely missing. The folder should support:
Customer identity and contact details

* Όνομα (first name).
* Επώνυμο (family name).
* Εικόνα/αντίγραφο ταυτότητας — front side.
* Εικόνα/αντίγραφο ταυτότητας — back side.
* Διεύθυνση κατοικίας (home address).
* Τηλέφωνο επικοινωνίας (optional if unavailable).
* Email (optional if unavailable).

Keep customer personal/contact information distinct from the business visit address and from each energy supply point’s property address.
Customer documents/checklist

* Identification document — front.
* Identification document — back.
* Current electricity bill.
* Photograph of the electricity meter / supply meter.
* E9 document.
* Additional documents required by the actual provider, tariff, application type, or business process.

Where a document relates to a particular energy supply point/application, attach it to that relevant connection or case. Do not keep every bill/meter image only at customer level if that would make it ambiguous which supply point it represents.
6.2 Multiple electricity supply-point records
One customer can have multiple separate electricity connection/supply-point records. Do not store a list of multiple supply numbers in one text field.
Each supply-point record should support:

* Property/supply address.
* Αριθμός Παροχής Ρεύματος, using the specified 11-digit format when provided.
* Tariff/contract name (Ονομασία τιμολογίου ρεύματος).
* Application date (Ημερομηνία αίτησης).
* Contract duration (Διάρκεια σύμβασης).
* Documents linked to this specific connection/application, including the applicable electricity bill and meter photograph.
* Provider/program details using existing fields and rules, or configured provider-specific fields where available.
* Existing application, offer, contract, status, and history links relevant to this connection.

Keep the property address of each supply point distinct from the customer’s home address.
Do not assume the supply number and physical meter serial/identifier are always interchangeable. If the existing workflow or data includes a separate Αριθμός Μετρητή ΔΕΔΔΗΕ, preserve/support it as a separate field rather than silently renaming one identifier to the other. Do not invent an unconfirmed mandatory format for any additional identifier.
Use appropriate validation for the specified 11-digit supply number when one is provided, but do not let missing documents block workflow transitions. If existing legacy data has another format, do not corrupt it; document the validation/compatibility approach and test existing records.
6.3 Global custom fields added by Sales and Back Office
The confirmed requirement is that Sales and Back Office users can add fields globally whenever needed so the customer folder can be configured for sales or Back Office needs.

* Add a custom-field configuration interface using the existing application design and permissions.
* Both user categories can create global field definitions as requested. Do not silently restrict field creation to administrators only.
* Use a safe metadata-driven implementation compatible with the existing persistence layer. Prefer an existing custom-field mechanism; otherwise consider an additive metadata/configuration table or existing JSON/metadata field where technically appropriate.
* Do not perform a new database schema migration for every user-created custom field. Custom fields should be definitions plus per-record values, not dynamically created SQL columns.
* Support sensible field types that match existing UI patterns, such as short text, long text, number, date, single-select, multi-select, checkbox, and URL only if appropriate to the current form system. Do not build an unnecessarily complex form builder if a simpler reusable model satisfies the requirement.
* Store field label, stable key/ID, type, configuration/options, relevant folder section, and display order. Preserve old values if a label changes; do not use the editable label itself as the permanent data key.
* Custom fields should be optional by default unless an authorized workflow configuration explicitly sets a requirement consistent with the company’s rules. Do not make requiredness a surprise that breaks existing records or prevents pipeline progression.
* Avoid duplicate field keys, unsupported types, unsafe code execution, arbitrary HTML/script, and unvalidated option values.
* Render custom fields consistently in the customer folder and relevant Sales/Back Office views. Preserve values through edit/save/reload.
* Where supported, make custom fields searchable/filterable without degrading existing queries. If a field cannot be indexed or searched safely in the current architecture, document that limitation rather than promising it.
* Preserve historical values when a field definition is disabled or archived; do not delete customer data when a custom field is removed from the UI.
* Consider field visibility or section placement only where supported by a clear existing permission model. Do not expose sensitive customer data to users who lack access under current authorization rules.

6.4 Provider-, tariff-, and application-specific fields
The folder must be extensible to different provider/tariff/application requirements without inventing a list of providers or document rules.

* Audit existing provider and program data/models first.
* Reuse existing provider-specific fields and configuration where present.
* Allow the existing or newly created custom-field configuration to associate optional fields with relevant folder sections or applicable provider/tariff/application context only if the current model supports it safely.
* Do not fabricate provider rules or hardcode a list of providers not found in the application or supplied by the business.
* Missing provider-specific information should be represented clearly as unconfigured/unknown rather than guessed.

7. Documents and workflow progression
The confirmed document policy is:
Missing documents must produce visible warnings/checklists, but must never by themselves block a workflow-stage transition. This explicitly includes moving from Προσφορά to Αίτηση and handing an incomplete case to Back Office.
7.1 Required behavior

* Allow a Lead/sale case to be handed to Back Office while the file is incomplete.
* Display a per-customer/per-supply-point/per-application document checklist so Back Office can see what has been received and what is still missing.
* Distinguish not provided, uploaded, review-needed, accepted, and rejected states only where these states already exist or can be added safely and meaningfully. Do not invent approval rules that make progression impossible.
* Show which missing items are relevant to the current provider/tariff/application only when configured or supported by verified existing rules.
* Allow Back Office to follow up with the Sales Agent/customer and record progress through existing workflow/task functionality.
* Do not block progression, assignment, or a stage change merely because an ID image, bill, meter photo, E9, signature, or other document is missing.
* Do not fake a document as complete, substitute a placeholder upload, or mark documents accepted automatically.
* Preserve upload errors so users know if an upload actually failed. A failed optional upload must not silently delete or corrupt a Lead record.
* Keep a clear document history if supported by the current system.

7.2 Sensitive file security
Identity images, electricity bills, E9, and contracts can contain sensitive personal information.

* Use the current secure file-storage integration and access policies.
* Do not make private customer files publicly accessible to simplify rendering.
* Preserve or correctly extend authentication checks and storage RLS/policies.
* Prefer short-lived signed URLs or the current secure authorized-download pattern.
* Validate file size/type using existing standards and safe server-side checks. Do not trust client-provided MIME types alone.
* Avoid logging file contents, access tokens, document URLs with long-lived secrets, or personal data.
* Do not broaden access to all CRM users beyond the existing intended roles.

8. Back Office workflow — flexible stage management and exception branches
Back Office receives sale opportunities from Sales and manages them according to their current stage. The workflow must not force every case to traverse all stages in a single linear order. An incoming case can begin at the appropriate point in the sequence, based on the actual information/status in the existing record and Back Office’s work.
8.1 Main stages — initial reference sequence
Use the following as the default conceptual sequence, adapting labels to the actual existing statuses and preserving established statuses where present:

1. Παραλαβή από Sales (received from Sales).
2. Έλεγχος / Prospecting (review/prospecting).
3. Αποστολή προσφοράς (send offer).
4. Αναμονή απάντησης και ελλειπόντων εγγράφων (awaiting customer response and any missing information/documents).
5. Δημιουργία αίτησης (create application).
6. Αποστολή για υπογραφή (send offer/contract/application for customer signature, in accordance with the existing workflow).
7. Καταχώριση στον πάροχο (register with the energy provider).
8. Ενεργοποίηση (activation/completion).

This is an initial reference, not a mandatory linear state machine.
8.2 Non-linear management — work from the case's actual current stage
Back Office must manage each case according to where that specific lead/application currently is. The conceptual sequence in §8.1 is a reference for the available work, not a mandatory linear pipeline.

* Back Office must be able to receive/open a case and place or resume it at the appropriate current stage based on the actual case status and work already completed. A case may legitimately enter Back Office at a later stage than “Παραλαβή από Sales” when the data/process already supports that position.
* Do not force staff to mark every earlier stage complete just to access work that needs doing now. Do not automatically move a case through stages to simulate completed work.
* Provide controlled stage selection and supported branch/return paths using existing workflow configuration and permissions. If the current CRM has no configurable transition model, implement the smallest safe approach that lets authorized Back Office users choose the appropriate stage while recording who/when changed it. Do not assume every possible transition between every pair of stages is automatically valid.
* From the current stage, Back Office may take the relevant next action, such as prospecting/review, sending an offer, waiting for customer response or missing information, creating an application, sending documents/contract for signature, registering with the energy provider, or completing activation.
* Support alternative branches and returns, including a case that needs missing details, a revised offer, a customer follow-up, a signature reminder, provider clarification, or correction after provider rejection. Preserve previous actions and stage history instead of overwriting them.
* A case may remain at its current stage while a parallel follow-up or document request is pending, where the existing data model supports it. Do not force unrelated workflow actions to be completed in a single rigid sequence.
* Reuse existing case stage transition and audit patterns. Record stage changes, timestamps, and the actor available through the current authentication model where supported.
* Preserve the originating Sales Agent and visit/lead history while Back Office processes the case. Operational ownership/queue may change according to the existing model; original-agent attribution must not be erased.
* Keep missing-document warnings/checklists visible but never block a stage transition, including offer-to-application and handover, solely because documents are missing.
* Do not invent automatic transitions, SLA deadlines, payment calculations, provider rules, commission rules, or approval conditions that are not already present or explicitly confirmed.

8.3 Exception branches that must be representable
The workflow must be able to record and manage at least these cases:

* Offer declined.
* Customer/Lead does not respond.
* Missing documents or customer information.
* Contract/application sent but unsigned.
* Application rejected by provider.
* Case requires clarification, correction, revision, or another attempt.

Use existing exception statuses if present. Otherwise add safe, configurable status/reason choices consistent with the current architecture. These conditions should not destroy the case or its history. Make it possible for Back Office to resume work, schedule a follow-up, return the case to a suitable stage, close it using an existing supported outcome, or record the rejection/decline outcome.
Do not invent exact legal/customer-contact rules or mandatory reasons for each exception. Use existing functionality where possible and keep additional reason lists configurable.
8.4 Back Office queue and assignment

* Provide a clear view of cases received from Sales, cases requiring action, missing-document cases, outstanding responses/signatures, provider issues, and other applicable current stages.
* Use actual database values and existing query/permission logic.
* Include useful filters/search where the existing UI supports them; preserve existing filters and actions.
* Support the shared Admin/Back Office account as the responsible office identity while retaining the originating Sales Agent on each opportunity.
* Keep the customer folder, energy connection records, document checklist, case stages, and relevant activity/history accessible from the case.

9. Lead, business, customer, and supply-point relationships
Audit the existing data model before deciding whether “business”, “lead”, “customer”, “case”, and “supply point” are separate tables/objects or linked representations.

* Reuse existing entities and IDs wherever possible.
* Do not create duplicate parallel models if the current CRM already represents the same thing.
* Maintain clear relationships between the business being visited, the customer/contact, the Lead/opportunity, the Sales Agent, the route stop/visit, the Back Office case, the energy supply point, the application/contract, and relevant documents.
* One customer can have multiple separate energy supply points.
* A visit does not automatically mean a new Lead should be created.
* A Lead created from an existing business must retain the correct source business and originating/assigned agent.
* A sale/application must remain linked to the specific energy supply point it concerns.
* Preserve historical visits and prior records if a customer, business, agent assignment, or supply point is edited.
* Do not merge records automatically when the match is ambiguous. Flag uncertain candidates for review.

If the existing model does not support a required relationship, propose and implement the smallest backward-compatible additive database change that solves the problem, using explicit migrations and appropriate indexes/constraints. Do not alter or drop existing objects.
10. UX, localization, and performance
Maintain the current ATLAS CRM design language and navigation. Make the changed workflows practical on desktop and mobile; Field Sales users may use a phone while visiting businesses.

* Use the current component system and styling conventions.
* Keep Greek UI labels and correct Greek diacritics consistent with the existing product. Preserve any existing English labels where currently used.
* Use concise forms with clear field labels, helpful validation, loading states, saved states, and actionable error messages.
* Separate customer home address, business visit address, and supply-point property address to avoid data-entry confusion.
* Keep route check-in and the visit form easy to reach on mobile.
* Support a large route list (40–60+ stops) efficiently. Avoid rendering every stop with expensive redundant requests. Use existing query patterns and add pagination/virtualization or batching only if necessary and compatible with the stack.
* Prevent duplicate form submissions and repeated visit/Lead creation from double-clicks or retries.
* Avoid unbounded provider API calls when searching or optimizing routes. Use debounce, pagination, caching, batching, or rate limiting in line with existing architecture/provider rules.
* Preserve all current dashboard features, navigation destinations, and unrelated CRM pages.
* Do not undertake an unrelated dashboard redesign, broad visual rewrite, or backend refactor as part of this work.

11. Persistence and migration policy
Before adding persistence, determine what current tables/collections and metadata mechanisms already exist.
Potential new functionality that may need persistence includes:

* Saved daily routes and ordered stops.
* Check-in/visit history linked to agents and business records.
* Duplicate approval requests and decisions.
* Configurable workflow outcomes/reasons/branches, if not supported already.
* Global custom-field definitions and per-customer/per-connection values, if not supported already.
* Additional connections/supply points, if not supported already.
* Per-connection document associations or document checklist state, if not supported already.

These are areas to audit, not instructions to blindly create all of these tables. Reuse existing models where practical.
For any necessary new database objects:

* Use additive, versioned migrations.
* Do not remove/rename columns or tables, change existing record meaning, or force destructive data transformations.
* Add safe indexes/foreign keys/constraints only after reviewing data compatibility and write paths.
* Design for existing records to continue functioning when new fields or tables are absent/empty.
* Implement appropriate RLS/authorization policies and test them for both user categories.
* Ensure saved routes, visit history, custom fields, documents, and approval actions cannot be read/modified outside the authorized scope.
* Keep migration scripts idempotent where the project convention permits it and test against the available development/test environment.
* If the current schema fundamentally conflicts with a requirement (for example, an existing non-null constraint preventing a program-less Lead), do not secretly make a breaking change. State the conflict, propose the safest backward-compatible migration, and clearly report whether it was applied.

12. Testing and acceptance criteria
Run the checks actually supported by the repository. Do not invent command names or claim tests passed if they were not run.
At minimum, test or verify the following cases using the project’s real test setup where feasible.
12.1 Authentication and permissions

* A Sales Agent can sign in through the existing provider and see/operate only on routes and leads allowed by their access rules.
* The shared Admin/Back Office login can access the intended Back Office processing and approval functions.
* Admin/Back Office can view/reassign team routes as permitted.
* Authorization is enforced server-side/data-side, not only by hiding buttons.
* RLS and file access restrictions remain in effect.

12.2 Lead creation

* A Lead can be created without selecting an energy program.
* The record is saved and appears in the correct list/pipeline/view.
* Invalid payloads and server/database errors are reported safely and meaningfully.
* The verified root cause of previously observed failures is covered by a regression test where feasible.
* Lead creation retries do not silently create duplicate records.

12.3 Field Sales workflow

* Each initial default outcome can be recorded.
* Follow-up has a responsible agent/date and appears when due.
* Manager follow-up reaches the Back Office queue and retains agent/visit context.
* No-contact and not-interested outcomes retain history without generating unintended duplicate leads.
* Additional configured reasons/branches persist and render correctly.
* A follow-up can branch into New Sale or another configured outcome without losing prior visit/follow-up history.
* No Sale permits a configured reason and appropriate branch, including manager follow-up, not interested, or a scheduled follow-up.
* New Sale can be handed to Back Office with incomplete documents; the missing items appear as checklist warnings only.

12.4 Routes and visits

* The agent can build a route that automatically includes applicable due work and assigned businesses.
* The agent can add CRM businesses and map-discovered candidates after duplicate checks.
* The route supports 40–60+ stops subject to the actual map provider’s limits, with safe segmentation/batching where necessary.
* The route can be optimized, reordered, saved for a date, reopened, and resumed.
* Manual check-in records the correct agent and stop, and opens/presents the visit form.
* Previously visited businesses show history and due follow-up options.
* A business owned/visited by another agent requires Back Office approval before a new Lead or takeover; the visit itself can still be recorded.
* Route reassignment does not rewrite historical visit attribution.

12.5 Customer folder and documents

* Standard customer/contact fields save and reload correctly.
* A customer can have multiple supply-point records without overwriting one connection with another.
* Supply-point address, supply number, tariff, application date, duration, and linked documents are kept with the appropriate connection.
* Global custom field definitions can be created by both Sales and Back Office users as required, and values save/reload against customer folders.
* Renaming/archiving a custom field does not accidentally erase existing values.
* Missing documents display a checklist/warning but do not block stage transitions or Back Office handoff.
* Actual uploaded files remain private and are accessible only through authorized paths.

12.6 Back Office workflow

* Back Office can manage a case from its current/appropriate stage without being forced through every earlier stage.
* Back Office can open a case already at an appropriate later stage and work from there without falsifying earlier stage completion.
* Back Office can take supported alternative/return branches while preserving the stage and activity history.
* Main stages and exception branches can be represented using existing or safely extended statuses.
* Missing documents do not block transitions.
* Declined offers, nonresponses, unsigned contracts, provider rejection, and missing information retain the case and its history.
* The originating Sales Agent remains correctly attributed throughout Back Office processing.

12.7 General project checks
Run available:

* TypeScript/type checks.
* Linting.
* Production build.
* Unit/integration tests relevant to changed flows.
* Migration/policy checks when available.
* Browser/manual smoke tests if the project has an available local browser environment.

Inspect changed pages at practical desktop and mobile sizes, particularly route planning and visit capture on a phone. Check for console errors, failed network requests, horizontal overflow, clipped controls, missing loading/empty/error states, and regressions to existing navigation.
If a check cannot run because a service, account, API key, local environment, or test fixture is unavailable, state that limitation precisely. Do not mark it as passed.
13. Suggested implementation sequence
Work incrementally and validate each related area:

1. Complete the repository audit and write a concise implementation plan grounded in actual files/data models.
2. Reproduce and fix the confirmed Lead creation failure(s), including optional program selection, then add regression coverage.
3. Verify/configure the shared Admin/Back Office account and individual Sales Agent access using current authentication.
4. Implement/adapt Field Sales visit outcomes, follow-ups, and configurable branches.
5. Implement/adapt route planning, CRM/map business candidates, daily saved routes, manual check-in, navigation/stop sequencing, visit history, and route permissions.
6. Implement duplicate detection and the Admin/Back Office approval queue, protecting server-side data paths.
7. Extend the customer folder and multiple supply-point records, adding safe global custom-field definitions and values only if needed.
8. Implement/adapt document checklists and secure uploads with no stage-transition blocking due solely to missing documents.
9. Implement/adapt flexible Back Office stage management and exception branches.
10. Run migrations and project checks in the supported environment, fix regressions, and perform available UI smoke tests.
11. Provide the final implementation report and any required deployment/configuration steps.

Do not treat this sequence as a rigid dependency graph if the current application provides a safer order. Do not deploy to production or run destructive data operations without explicit authorization already provided through the current workflow.
14. Required final report
After implementation, report:

1. Repository audit: the relevant architecture, files, models, and existing integrations discovered.
2. Lead error root cause: what was reproduced, what evidence identified the cause, the fix, and tests; clearly state anything still unverified.
3. User model: how the shared Admin/Back Office login and individual Sales Agent accounts are handled within the existing authentication system.
4. Field Sales workflow: default outcomes, branches, follow-ups, and configuration implemented.
5. Routes and visits: how route generation, map-discovered businesses, optimization/segmentation, saving, manual check-in, history, and reassignment work; identify any map-provider or API-key requirement.
6. Duplicate approval: matching logic, approval behavior, and how it is enforced beyond the UI.
7. Customer folder: standard fields, multiple supply-point model, configurable custom fields, and document associations.
8. Back Office: supported stages, non-linear progression, exception branches, and document warning behavior.
9. Files changed: principal modified/created files and migrations.
10. Validation: exact commands/checks run and actual outcomes.
11. Unresolved items: external credentials/configuration needed, assumptions, provider-dependent details not configured, tests not run, limitations, and any scope that remains incomplete.

Do not claim functionality works merely because it renders. Do not claim a map route is optimized if no functioning provider integration supports it. Do not claim a fix is complete if the root cause was not reproduced or verified.
Final instruction to Claude Code
Start by inspecting the existing repository and report the relevant implementation facts to yourself before editing. Then implement the confirmed requirements in the existing ATLAS CRM, using the current architecture and safe additive changes where genuinely necessary. Preserve all existing functionality and data.
The desired result is one cohesive CRM in which individual Sales Agents can plan and save daily multi-stop routes, manually check in, record visit outcomes, create valid Leads without a program selected, manage multiple customer electricity supply points, and submit opportunities for Back Office processing. The shared Admin/Back Office account can process cases from their appropriate current stages, resolve duplicate/ownership approvals, handle manager follow-ups, configure workflow reasons/branches, and see missing-document checklists. Customer folders support standard fields plus global custom fields that Sales and Back Office can add without per-field database migrations.
Do not invent business rules, fabricate data, weaken permissions, make destructive schema changes, or modify unrelated pages. Audit, implement, test, and report honestly.
