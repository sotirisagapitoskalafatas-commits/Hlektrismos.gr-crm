ATLAS CRM — Hlektrismos Master Implementation Prompt
Purpose: Safely extend and correct the existing ATLAS CRM for Hlektrismos.gr, based on the company meeting requirements. This is an implementation brief for Claude Code to use inside the actual existing repository.
Primary directive: Audit first, then implement the confirmed requirements in the current application. Preserve the existing product, architecture, data, authentication, integrations, routes, permissions, and business functionality. A focused visual simplification is explicitly in scope for the global sidebar/navigation, dashboard, and Leads/Customers list and detail screens. Do not replace the CRM with a new application, mock UI, or simplified prototype.
0. Working rules and priority order
You are operating in the repository that contains the existing ATLAS CRM. Work from its root directory.
Follow this priority order:
1. Protect current production functionality and data.
2. Reproduce and diagnose the Lead-creation failure from evidence in the existing implementation.
3. Implement the confirmed Field Sales, route planning, customer folder, duplicate approval, and Back Office requirements.
4. Simplify and professionalize the global navigation, dashboard, and Leads/Customers screens with a consistent Apple-inspired design while preserving all functionality; do not redesign unrelated pages.
5. Validate changes with real project checks and document any unverified item honestly.
Non-negotiable constraints
- Do not begin editing until you have inspected the relevant repository structure, the current dashboard and CRM workflows, data access, authentication, authorization, integrations, and tests.
- Do not assume the screenshots or this prompt completely describe the existing architecture. The codebase and deployed configuration are the source of truth for how the application currently works. The supplied screenshots are visual evidence of the current problems: an over-complicated sidebar, a dashboard content column that wastes available width, and Lead detail content that leaves large unused areas.
- Preserve every existing feature, page, route, deep link, API endpoint, server action, database relationship, query, mutation, notification, integration, filter, search function, report, export, and workflow unless a change is explicitly required below.
- Preserve the current framework, package manager, UI library, application architecture, and coding conventions unless the audit establishes a concrete reason to change something.
- Preserve the existing authentication provider and authorization approach. Do not bypass permissions, weaken row-level security (RLS), expose secrets, or move privileged operations to an untrusted client.
- Treat security as an implementation requirement, not a visual feature: explicitly audit and test database RLS, server-side authorization, private file access, secret handling, and the Admin/Back Office-only Sales Agent account-creation rule. Do not describe the system as “fully protected”; report verified protections and residual risks accurately.
- Do not delete data, reset databases, rewrite migrations, rename existing database objects, or perform destructive schema changes.
- For genuinely new persistence needs, prefer backward-compatible, additive database migrations only. Migrations must preserve all existing records and have a clear deployment/rollback strategy. If a confirmed requirement cannot safely be implemented under this constraint, explain the blocker and propose the smallest safe additive approach rather than silently making a destructive change.
- Do not use hardcoded production KPI values, fake businesses, fabricated visits, placeholder records, or mock responses as implementation substitutes.
- Do not invent unconfirmed business rules. Use the confirmed defaults below, inspect existing behavior, and list unresolved assumptions explicitly in the final report.
- When the active task explicitly authorizes implementation, do not stop after an audit or plan: implement the safe, confirmed changes, run the available checks, and report exactly what did and did not work. If the active user/session instruction limits the current phase to audit or planning only, obey that execution gate, make no implementation changes, and stop with the requested report.
1. Phase One — repository and production-behavior audit
Before editing, inspect and map the existing implementation. Read relevant source files rather than guessing from filenames alone.
Inspect at minimum:
- The application framework, routing, layouts, and current dashboard/CRM entry points.
- Lead creation screens, forms, validation schemas, form state, submission handlers, and error rendering.
- Lead/customer/business/case data models and their database relationships.
- API routes, server actions, edge functions, background jobs, webhook handlers, and third-party integrations involved in leads, files, maps, and pipeline status.
- The existing authentication provider, roles, session handling, access guards, and RLS/database policies.
- Existing map, geocoding, directions, or route-planning integrations, including relevant environment variable names and documentation.
- Existing storage buckets, upload flows, file access policies, signed-URL handling, and document metadata.
- Field Sales pages, “Ημέρα μου”, map pages, follow-up functionality, Back Office/Operations pages, customer folders, pipeline views, and navigation destinations.
- Current component library, styling conventions, localization, notifications, and responsive behavior.
- Existing database migrations, seed scripts, test setup, lint/type-check/build scripts, and relevant tests.
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
- Required program/provider selection despite the confirmed rule that a Lead can be created without an energy program.
- Mismatch between front-end validation, server validation, and database constraints.
- Missing or incorrect authenticated user/agent assignment.
- RLS or permission rejection.
- Invalid enum/status, foreign key, or required-field values.
- API/server-action errors that are swallowed or displayed poorly.
- Incorrect payload mapping or form field names.
- Database write succeeds but list query, cache invalidation, filters, or ownership scoping hides the record.
- Upload failure incorrectly prevents a lead record from being created, if the existing implementation couples these operations.
Use the available logs, errors, tests, and local/dev environment. Never expose credentials, ID images, energy bills, emails, phone numbers, or other sensitive record data in logs. Log safe diagnostic metadata only.
Required result: Fix the root cause(s) that can be confirmed. Show meaningful, localized errors in the UI while preserving safe diagnostic details for developers. Add or update regression tests where feasible. If a cause cannot be reproduced or verified, do not claim it is fixed; describe the remaining diagnostic step in the final report.
1.2 Optional program at Lead creation
A program/tariff must not be required merely to create a Lead. The program should be selected later when preparing the offer, in line with the existing provider/offer workflow.
- Inspect client validation, server validation, type definitions, DB defaults, constraints, and any forms that create leads.
- Do not insert a fake provider/program merely to satisfy validation.
- Do not silently weaken unrelated data integrity rules.
- If an existing non-null database constraint prevents a program-less Lead, document the conflict and determine whether a safe, backward-compatible additive compatibility approach exists. Do not make a destructive schema alteration without a clearly justified and documented plan.
- Do not make the program mandatory at a later stage unless that requirement is already implemented or is explicitly supported by the existing provider/application rules. The confirmed requirement is to defer the choice until offer preparation, not to invent provider rules.
2. Confirmed user and permission model
The target business setup has exactly two application-level user roles:
1. Admin / Back Office — one shared authenticated login used by the office team. This role handles Back Office processing, approvals, configuration, manager follow-ups, and team-route oversight.
2. Sales Agent — multiple individual authenticated users, each with their own identity and assigned work. Field Sales and any existing Inside Sales distinctions are not separate application roles unless a verified, unavoidable existing authorization dependency requires a compatibility mapping; they may remain team labels or profile metadata, not a third role.
Implement this using the current authentication system and authorization patterns. Do not create a new authentication system. Do not expose additional application roles such as Director, Manager, Inside Sales, or Field Sales as separate selectable roles in the target user model. During the audit, map any existing role values to these two effective roles. Preserve legacy enum values or stored data when needed for backward compatibility; do not destructively delete or rewrite roles without an approved additive migration and verified policy/test impact.
2.1 Shared Back Office account
- Preserve/configure one shared authenticated Admin/Back Office account for office staff as required by the business.
- Do not hardcode its username, password, tokens, or credentials in source code, SQL migrations, client bundles, documentation, or .env.example values.
- Do not bypass the existing authentication provider to simulate a shared login.
- The shared account has the existing administrative/Back Office permissions needed to process cases, manage workflow configuration, review approval requests, handle manager follow-ups, and see/reassign team routes, subject to the application’s existing authorization model.
- Be truthful about audit attribution: operations completed through one shared login can be attributed to that shared account, but cannot distinguish which staff member physically used it. Do not invent individual identities or impersonate another user.
- If the current authentication or deployment setup cannot support this requirement without compromising security, document the exact limitation and offer a secure compatible path; do not quietly bypass security.
2.2 Sales Agent accounts
- Each sales agent has an individual authenticated account.
- Attribute assigned businesses, route plans, visits, leads, follow-ups, and sales cases to the real authenticated agent.
- Agents can view and manage their own routes and assigned work as allowed by current permissions.
- The Admin/Back Office user can see and reassign team routes and handle approval queues.
- Preserve all existing authorization checks and RLS. Avoid accidental exposure of other agents’ private work beyond the specific team/manager visibility explicitly required here.
- Keep current navigation, account controls, and role-based access behavior intact.
2.3 Approval ownership
The shared Admin/Back Office account handles:
- Duplicate/ownership approval requests.
- Manager follow-ups escalated by Sales.
- Relevant route reassignment and operational exceptions.
- Existing and newly required Back Office review actions.
Do not add a third required user category merely to implement these duties. Reuse the current role model as far as possible.
2.4 Sales Agent account provisioning — Admin/Back Office only
Only the authenticated Admin / Back Office account may create, invite, activate, deactivate, or initiate credential recovery for Sales Agent accounts. Sales Agents must not be able to create accounts for themselves or other users.
- Audit the current identity provider and account-management flow before implementation. Use the provider's supported server-side administrative/invitation APIs; do not invent an auth mechanism.
- Disable public/self-service registration if it is currently enabled and this can be done without disrupting existing legitimate users. If the provider has separate signup settings, verify the effective setting rather than only hiding a registration button.
- Provide an account-management screen to the Admin/Back Office user only, using the existing design system. It must support creating/inviting a Sales Agent, viewing the agent list, and the account lifecycle actions already supported by the provider and current application.
- Enforce the permission on the server for every account-management operation. A hidden button or client-side role check is not sufficient. Verify the authenticated session and the authoritative effective role/permission server-side before calling the identity provider's admin API.
- Sales Agents must be unable to call the account-creation endpoint directly, change their own role, set another user's role, elevate their own permissions, deactivate other accounts, enumerate sensitive auth metadata, or use mass assignment to set protected fields.
- Never expose an identity-provider service/admin key in browser code, client-visible environment variables, source control, logs, or responses. Administrative identity-provider operations must remain on a trusted server-side boundary.
- Do not return or store plaintext passwords. Prefer the identity provider's supported invitation, email verification, or secure initial-password setup flow. Do not choose or promise a particular invitation channel until the current provider and configured capabilities have been inspected.
- A newly provisioned account must be assigned the Sales Agent effective role by trusted server-side logic, not by a client-supplied role value. The client must not be able to submit admin, back_office, or another privileged role in the request payload.
- Validate and normalize permitted account fields on the server. Prevent duplicate/inconsistent profiles, handle identity-provider/database partial failures safely, and provide clear actionable feedback without leaking internal errors.
- Record account creation, invitation/activation, deactivation, and role/permission changes in the existing audit mechanism if one exists, or propose a minimal additive event record if genuinely required. A shared Back Office login only identifies the shared account, not the individual office employee.
- Preserve existing valid accounts during rollout. Do not mass-delete, disable, or rewrite accounts as a shortcut to achieving two effective roles. Map legacy role values to the two effective roles compatibly and document any migration needed.
- If public registration cannot be disabled safely with the current provider/configuration, do not claim it is disabled. Report the exact provider setting/action required and keep server-side account creation restricted in the application meanwhile.
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
- Inspect whether the current CRM uses status enums, database lookup tables, configurable metadata, or code-defined transitions.
- Reuse current pipeline/status definitions where possible.
- Provide a controlled way for authorized users to manage additional outcomes, reasons, and branches where genuinely needed.
- Store configurable definitions using the existing safe configuration/metadata approach. Do not create database columns or migrations every time a business adds a new reason.
- Keep existing records readable if status labels or configuration change. Avoid deleting or renaming existing status values unless a backward-compatible migration is fully justified and verified.
- Keep a clear history of outcome/status changes, timestamps, visit linkage, and agent attribution using existing audit/history patterns or an additive extension if necessary.
- Do not invent mandatory reasons, approvals, or field requirements beyond the rules in this prompt and existing validated business rules.
3.3 Follow-ups and branches
- Follow-ups must have a clear responsible agent, due date/time if supported by the current model, reason/context, and completion/rescheduling state.
- Due follow-ups should automatically appear in the agent’s daily work and proposed route when applicable.
- Manager follow-ups route to the Admin/Back Office queue and retain the agent’s notes and originating visit.
- “No contact” or absent decision-maker outcomes should not create an unintended duplicate customer or active Lead.
- Not-interested outcomes should preserve visit history and reason. Keep future revisit/contact behavior configurable or consistent with current rules; do not invent an automatic blacklist or mandatory cooling-off period.
- Support branches from a visit into new sale, follow-up, manager follow-up, no contact, and not interested. Keep the UI fast for agents in the field.
3.4 Explicit Field Sales branch model
Use the following as the concrete conceptual branch map for the initial Field Sales experience. It describes the required paths and outcomes; it is not a mandate to replace the current schema with these literal status strings. Map it onto the repository’s existing status model and preserve existing records.
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
Implementation requirements for these branches:
- Outcomes and reasons are initial defaults; authorized users must be able to configure additional outcome/reason choices and supported branches, using the existing permissions and configuration approach.
- Selecting New Sale must not erase the visit event or any previous follow-up history. A case can have a history of multiple visits and follow-ups.
- A lead/sale must remain associated with its originating Sales Agent even after handover to Back Office. The current operational queue/stage may change; origin attribution must not.
- A follow-up can lead to a New Sale or another valid configured outcome. Do not build a one-way flow that makes an earlier follow-up terminal.
- A No Sale outcome requires recording the configured reason where the workflow supports it. The listed reasons are examples/default branches, not an exhaustive hardcoded list.
- Do not create a second active Lead just because an agent records another visit or schedules a follow-up for an existing record.
- Duplicate/ownership approval is a separate control: when a business is already owned by or visited by another agent, record the visit as appropriate, but require Admin/Back Office approval before creating a duplicate Lead or taking over the opportunity.
- Missing documents are checklist items/warnings only and must not prevent creating or handing off a sale, or moving between pipeline stages.
- The UI must make the next valid actions visible to a field agent on a mobile-sized screen, without requiring the agent to understand internal database status codes.
4. Daily route planning, map discovery, and navigation
Create or extend a practical route-planning workflow for each individual Sales Agent. The intention is that every morning the agent can organize a day of multiple business visits, often 40–60 stops or more, navigate from stop to stop, record outcomes, and retain the route history.
4.1 Inspect and reuse the existing map stack
- Determine which mapping, geocoding, place-search, direction, and routing provider (if any) the repository already uses.
- Reuse the existing provider and components when possible. Do not assume Google Maps or introduce a paid provider without checking existing integrations, project configuration, usage requirements, and necessary environment variables.
- If a map provider is missing or required credentials are not configured, implement only the safe portions supported by the project and report exactly what configuration is needed. Do not show fake maps, fabricate route geometry, or claim real navigation works without it.
- Keep map integration credentials server-side where appropriate. Update .env.example with variable names and safe explanations only; never include real secrets.
- Respect the provider’s documented waypoint limits, terms, and rate limits. Because routes may contain 40–60 or more stops, do not assume one navigation deep link or one directions request can handle the entire route. Use sensible route segments/batches or stop-by-stop navigation if required by the actual provider.
4.2 Businesses available for route planning
The route planner must combine:
- Businesses already stored in the CRM.
- New business candidates discovered through the configured map/place-search provider.
Map-discovered places must not immediately create duplicate permanent CRM businesses or Leads. Present candidate details, run duplicate checks, and persist/import records only through the intended user action and existing application patterns.
4.3 Each morning’s route
- Every Sales Agent can create, view, edit, save, resume, and complete their own route for a specific date.
- Automatically include relevant due follow-ups, assigned businesses, and unfinished visits using the current CRM’s actual assignment and due-date data.
- Let the agent add more businesses from existing CRM records or map-discovered candidates.
- Allow the agent to define the search/visit area and starting address/location, where supported by the current mapping implementation.
- Support a target number of visits, including 40–60 or more. Do not hard-code 60 as a maximum; accommodate provider constraints using safe segmentation or route batching.
- Optimize stop order when the configured routing provider supports it. Allow manual changes to the proposed order before saving.
- Show each stop clearly, with its order, business identity/address, relevant prior outcome, follow-up status, and visit status.
- Persist the saved route and stop order against the correct agent and date. Reloading, navigating away, or returning later must not silently lose the route or its recorded progress.
- Display useful progress, such as total stops, completed stops, remaining stops, skipped stops, and follow-ups, using real persisted data.
- Allow an agent to resume an unfinished route and carry unfinished work into a later day through an explicit scheduling action, preserving history.
- Provide navigation to the next stop using the real integration. Do not misrepresent an external navigation app as a built-in turn-by-turn navigation system.
4.4 Arrival and visit check-in
The confirmed behavior is manual Arrived / Check in, not automatic geofence arrival detection.
- Each stop must have a clear manual Άφιξη / Check in action.
- Check-in records a visit event linked to the route, stop, business, and authenticated sales agent, with an appropriate timestamp and the data supported by the existing system.
- On check-in, open or prominently present the visit/Lead capture form for that business. Do not silently create a new Lead merely because the agent checked in.
- Do not require background GPS tracking or claim that the browser automatically detects arrival.
- If location permission or GPS is not available, check-in must still work manually.
- Provide a clear status transition from planned to checked-in/visited and then the selected visit outcome, without losing earlier history.
4.5 Previously visited businesses
When an agent selects a business for a route or checks in:
- Show available visit history: date/time, agent, recorded outcome, notes permitted to the current user, and any existing follow-up status.
- If the current agent previously visited the business and a follow-up is due, offer the existing follow-up action and preserve its link to the prior visit/Lead.
- If the business was owned or visited by a different sales agent, show a duplicate/ownership warning and require Admin/Back Office approval before creating a new Lead or taking over the business opportunity.
- Preserve legitimate separate supply points as separate connection records; do not merge their energy connection details simply because they belong to the same physical business/customer.
- Do not generate a duplicate Lead as a side effect of route import, manual check-in, or reopening a customer folder.
- An agent must still be able to record an actual visit when a duplicate approval is pending; the visit should be recorded without silently bypassing the approval requirement for creating/taking ownership of a Lead.
4.6 Route ownership, handover, and Admin/Back Office access
- Each Sales Agent sees and manages their own routes and stop progress.
- Admin/Back Office can view team routes, reassign routes/stops where authorized, and handle related requests.
- Record reassignment in the existing audit/history pattern so the application shows who changed the assignment and when, as far as the current shared-account model allows.
- Reassignment must not rewrite historical visit ownership or make it look as though another agent completed a visit.
- Preserve the visit agent attribution separately from the currently assigned lead/case owner.
5. Duplicate detection and Admin/Back Office approval
Duplicate detection is required for businesses that are already owned by or have been visited by another agent.
5.1 Matching and warnings
- Inspect the existing business/customer/contact/supply-point model and duplicate-checking behavior first.
- Use available evidence such as normalized business/customer name, address, phone, location coordinates, existing CRM IDs, and a known supply number. Use only fields that exist and are appropriate.
- Avoid declaring records identical based only on a weak name match. Distinguish a potential match from a confirmed duplicate and show enough context for an authorized user to decide.
- Check candidates from the map provider against the CRM before creating a permanent business/Lead.
- A supply point is a distinct connection record. The same customer can legitimately have multiple supply points and separate associated application/contract information.
5.2 Required approval behavior
- If a business is already owned by or visited by another agent, a new Lead or ownership takeover must trigger an Admin/Back Office approval request before proceeding.
- The Sales Agent must see a clear pending-approval status instead of a generic failure.
- The request should include the candidate business, matching record(s), current owner, relevant visit history, known supply point if applicable, requesting agent, and a concise explanation/intent.
- Admin/Back Office can approve or reject the request. Rejection should leave existing ownership and lead data intact.
- Record the decision, timestamp, and actor available through the current authentication model. Because Back Office uses one shared login, do not claim to identify the individual staff member behind that login.
- On approval, permit the authorized new Lead/assignment while preserving legitimate existing records and keeping distinct supply points separate.
- Prevent accidental duplicate active Leads for the same underlying opportunity/supply point where the existing data model can identify it. When it is unclear whether two records represent the same supply point, flag for review rather than silently merging or deleting records.
- Do not allow a UI-only bypass. Enforce duplicate approval on the server/data-access path as well as in the interface.
- Keep duplicate checking and approval separate from document completion: a missing document must not block stage progression, but a pending duplicate approval remains an ownership/lead-creation control.
6. Customer folder — standard fields and globally configurable custom fields
The customer folder must support sales and Back Office operations throughout the lifecycle. The standard information below must remain available, and both Sales Agent and Admin/Back Office users must be able to add custom field definitions globally when needed.
6.1 Standard customer information
Preserve existing fields and add only what is genuinely missing. The folder should support:
Customer identity and contact details
- Όνομα (first name).
- Επώνυμο (family name).
- Εικόνα/αντίγραφο ταυτότητας — front side.
- Εικόνα/αντίγραφο ταυτότητας — back side.
- Διεύθυνση κατοικίας (home address).
- Τηλέφωνο επικοινωνίας (optional if unavailable).
- Email (optional if unavailable).
Keep customer personal/contact information distinct from the business visit address and from each energy supply point’s property address.
Customer documents/checklist
- Identification document — front.
- Identification document — back.
- Current electricity bill.
- Photograph of the electricity meter / supply meter.
- E9 document.
- Additional documents required by the actual provider, tariff, application type, or business process.
Where a document relates to a particular energy supply point/application, attach it to that relevant connection or case. Do not keep every bill/meter image only at customer level if that would make it ambiguous which supply point it represents.
6.2 Multiple electricity supply-point records
One customer folder can contain many separate electricity connection/supply-point records, including a mixture of residential/home and business/commercial connections. This is a per-connection classification, not a single classification for the whole customer: the same customer may have a home supply point and one or more business supply points at different addresses. Do not store several supply numbers or addresses in one text field.
Treat Αριθμός Παροχής as the 11-digit identifier for a specific electricity network connection associated with ΔΕΔΔΗΕ, when available. It belongs to the individual supply-point record, not just to the overall customer. Keep it distinct from the physical electricity meter (Μετρητής / Ρολόι ΔΕΗ) and any meter serial/identifier. Do not use “meter number” and “supply number” as interchangeable labels or fields.
Each supply-point record should support:
- Connection usage/type: residential/home (Οικιακό) or business/commercial (Επαγγελματικό), selected independently for each connection.
- Property/supply address: the address to which this specific supply number belongs. Keep this distinct from the customer’s home address and the business visit address.
- Αριθμός Παροχής Ρεύματος: the 11-digit supply number, stored independently for each connection when known.
- Meter details: the electricity meter / Μετρητής / Ρολόι ΔΕΗ, and a separate meter serial/identifier field if the current model or workflow captures it. A meter photograph must be stored as a document, not used as a substitute for the identifier field.
- Tariff category/code: support the connection’s category, independently of the supplier’s commercial tariff/product name.
- Tariff/contract name: Ονομασία τιμολογίου ρεύματος.
- Application date: Ημερομηνία αίτησης.
- Contract duration: Διάρκεια σύμβασης.
- Documents linked to this specific connection/application: including the applicable current electricity bill and meter photograph; any ID/E9 or other documents should be linked at the appropriate customer, connection, or case level without duplicating files unnecessarily.
- Provider/program details: use existing fields and verified rules, or configurable provider-specific fields where supported. A program must not be required merely to create a Lead; the program is selected later when preparing an offer.
- Related application, offer, contract, case, status, and history: each must remain linked to the correct supply point where applicable.
Connection/tariff category options
The following are the initial examples supplied for the business workflow. Inspect the repository’s existing tariff/provider data and configuration first. Reuse those definitions where present; otherwise offer these as configurable options rather than embedding provider eligibility or pricing logic in code:
- Γ1 — Residential / Home (Οικιακό), standard household connection.
- Γ1Ν — Residential with night tariff.
- Γ21 — Small business (Επαγγελματικό), described in the supplied requirements as up to 25 kVA.
- Γ22 — Medium/large business, described in the supplied requirements as above 25 kVA and often two-zone billing.
- Γ23 — Business connection with night/off-peak tariff.
Keep the connection category/code separate from the free-text or configured commercial tariff/product name. Do not infer eligibility, kVA requirements, billing terms, or provider availability beyond verified existing product data or explicit business configuration. Authorized Sales and Back Office users should be able to choose from the configured options; changes to available options must not rewrite historic connection records.
Multiple connections and data integrity
- The customer folder must present a clear list of all supply points, with a way to open, add, and edit each connection independently using the existing UI conventions and permissions.
- Creating or editing one connection must not overwrite another connection’s supply number, address, category, tariff, application date, contract duration, documents, or case links.
- A customer may have multiple residential connections, multiple commercial connections, or a mixture of both.
- Use the supply number as a strong duplicate/matching signal for a connection when available. Inspect existing records before adding strict database uniqueness constraints; flag existing duplicates or uncertain matches for review instead of silently merging or deleting data.
- Validate that a newly entered supply number has 11 digits when it is supplied, using a user-friendly error or warning consistent with the existing form patterns. Do not corrupt or silently discard legacy values.
- Do not make the supply number mandatory at Lead creation or at any pipeline stage unless an existing, verified business rule requires it. If it is not yet available, preserve the record and surface missing information clearly.
- Preserve the existing rule that missing documents never block stage transitions. Missing supply-point information should likewise not introduce a new blocking rule unless explicitly confirmed by the business.
- If the existing workflow/data includes a separate Αριθμός Μετρητή ΔΕΔΔΗΕ or meter serial/identifier, preserve it separately from the 11-digit Αριθμός Παροχής. Do not invent an unconfirmed format for an additional meter identifier.
- If existing legacy data has another format, do not corrupt it; document the validation/compatibility approach and test existing records.
6.3 Global custom fields added by Sales and Back Office
The confirmed requirement is that Sales and Back Office users can add fields globally whenever needed so the customer folder can be configured for sales or Back Office needs.
- Add a custom-field configuration interface using the existing application design and permissions.
- Both user categories can create global field definitions as requested. Do not silently restrict field creation to administrators only.
- Use a safe metadata-driven implementation compatible with the existing persistence layer. Prefer an existing custom-field mechanism; otherwise consider an additive metadata/configuration table or existing JSON/metadata field where technically appropriate.
- Do not perform a new database schema migration for every user-created custom field. Custom fields should be definitions plus per-record values, not dynamically created SQL columns.
- Support sensible field types that match existing UI patterns, such as short text, long text, number, date, single-select, multi-select, checkbox, and URL only if appropriate to the current form system. Do not build an unnecessarily complex form builder if a simpler reusable model satisfies the requirement.
- Store field label, stable key/ID, type, configuration/options, relevant folder section, and display order. Preserve old values if a label changes; do not use the editable label itself as the permanent data key.
- Custom fields should be optional by default unless an authorized workflow configuration explicitly sets a requirement consistent with the company’s rules. Do not make requiredness a surprise that breaks existing records or prevents pipeline progression.
- Avoid duplicate field keys, unsupported types, unsafe code execution, arbitrary HTML/script, and unvalidated option values.
- Render custom fields consistently in the customer folder and relevant Sales/Back Office views. Preserve values through edit/save/reload.
- Where supported, make custom fields searchable/filterable without degrading existing queries. If a field cannot be indexed or searched safely in the current architecture, document that limitation rather than promising it.
- Preserve historical values when a field definition is disabled or archived; do not delete customer data when a custom field is removed from the UI.
- Consider field visibility or section placement only where supported by a clear existing permission model. Do not expose sensitive customer data to users who lack access under current authorization rules.
6.4 Provider-, tariff-, and application-specific fields
The folder must be extensible to different provider/tariff/application requirements without inventing a list of providers or document rules.
- Audit existing provider and program data/models first.
- Reuse existing provider-specific fields and configuration where present.
- Allow the existing or newly created custom-field configuration to associate optional fields with relevant folder sections or applicable provider/tariff/application context only if the current model supports it safely.
- Do not fabricate provider rules or hardcode a list of providers not found in the application or supplied by the business.
- Missing provider-specific information should be represented clearly as unconfigured/unknown rather than guessed.
7. Documents and workflow progression
The confirmed document policy is:
Missing documents must produce visible warnings/checklists, but must never by themselves block a workflow-stage transition. This explicitly includes moving from Προσφορά to Αίτηση and handing an incomplete case to Back Office.
7.1 Required behavior
- Allow a Lead/sale case to be handed to Back Office while the file is incomplete.
- Display a per-customer/per-supply-point/per-application document checklist so Back Office can see what has been received and what is still missing.
- Distinguish not provided, uploaded, review-needed, accepted, and rejected states only where these states already exist or can be added safely and meaningfully. Do not invent approval rules that make progression impossible.
- Show which missing items are relevant to the current provider/tariff/application only when configured or supported by verified existing rules.
- Allow Back Office to follow up with the Sales Agent/customer and record progress through existing workflow/task functionality.
- Do not block progression, assignment, or a stage change merely because an ID image, bill, meter photo, E9, signature, or other document is missing.
- Do not fake a document as complete, substitute a placeholder upload, or mark documents accepted automatically.
- Preserve upload errors so users know if an upload actually failed. A failed optional upload must not silently delete or corrupt a Lead record.
- Keep a clear document history if supported by the current system.
7.2 Sensitive file security
Identity images, electricity bills, E9, and contracts can contain sensitive personal information.
- Use the current secure file-storage integration and access policies.
- Do not make private customer files publicly accessible to simplify rendering.
- Preserve or correctly extend authentication checks and storage RLS/policies.
- Prefer short-lived signed URLs or the current secure authorized-download pattern.
- Validate file size/type using existing standards and safe server-side checks. Do not trust client-provided MIME types alone.
- Avoid logging file contents, access tokens, document URLs with long-lived secrets, or personal data.
- Do not broaden access to all CRM users beyond the existing intended roles.
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
- Back Office must be able to receive/open a case and place or resume it at the appropriate current stage based on the actual case status and work already completed. A case may legitimately enter Back Office at a later stage than “Παραλαβή από Sales” when the data/process already supports that position.
- Do not force staff to mark every earlier stage complete just to access work that needs doing now. Do not automatically move a case through stages to simulate completed work.
- Provide controlled stage selection and supported branch/return paths using existing workflow configuration and permissions. If the current CRM has no configurable transition model, implement the smallest safe approach that lets authorized Back Office users choose the appropriate stage while recording who/when changed it. Do not assume every possible transition between every pair of stages is automatically valid.
- From the current stage, Back Office may take the relevant next action, such as prospecting/review, sending an offer, waiting for customer response or missing information, creating an application, sending documents/contract for signature, registering with the energy provider, or completing activation.
- Support alternative branches and returns, including a case that needs missing details, a revised offer, a customer follow-up, a signature reminder, provider clarification, or correction after provider rejection. Preserve previous actions and stage history instead of overwriting them.
- A case may remain at its current stage while a parallel follow-up or document request is pending, where the existing data model supports it. Do not force unrelated workflow actions to be completed in a single rigid sequence.
- Reuse existing case stage transition and audit patterns. Record stage changes, timestamps, and the actor available through the current authentication model where supported.
- Preserve the originating Sales Agent and visit/lead history while Back Office processes the case. Operational ownership/queue may change according to the existing model; original-agent attribution must not be erased.
- Keep missing-document warnings/checklists visible but never block a stage transition, including offer-to-application and handover, solely because documents are missing.
- Do not invent automatic transitions, SLA deadlines, payment calculations, provider rules, commission rules, or approval conditions that are not already present or explicitly confirmed.
8.3 Exception branches that must be representable
The workflow must be able to record and manage at least these cases:
- Offer declined.
- Customer/Lead does not respond.
- Missing documents or customer information.
- Contract/application sent but unsigned.
- Application rejected by provider.
- Case requires clarification, correction, revision, or another attempt.
Use existing exception statuses if present. Otherwise add safe, configurable status/reason choices consistent with the current architecture. These conditions should not destroy the case or its history. Make it possible for Back Office to resume work, schedule a follow-up, return the case to a suitable stage, close it using an existing supported outcome, or record the rejection/decline outcome.
Do not invent exact legal/customer-contact rules or mandatory reasons for each exception. Use existing functionality where possible and keep additional reason lists configurable.
8.4 Back Office queue and assignment
- Provide a clear view of cases received from Sales, cases requiring action, missing-document cases, outstanding responses/signatures, provider issues, and other applicable current stages.
- Use actual database values and existing query/permission logic.
- Include useful filters/search where the existing UI supports them; preserve existing filters and actions.
- Support the shared Admin/Back Office account as the responsible office identity while retaining the originating Sales Agent on each opportunity.
- Keep the customer folder, energy connection records, document checklist, case stages, and relevant activity/history accessible from the case.
9. Lead, business, customer, and supply-point relationships
Audit the existing data model before deciding whether “business”, “lead”, “customer”, “case”, and “supply point” are separate tables/objects or linked representations.
- Reuse existing entities and IDs wherever possible.
- Do not create duplicate parallel models if the current CRM already represents the same thing.
- Maintain clear relationships between the business being visited, the customer/contact, the Lead/opportunity, the Sales Agent, the route stop/visit, the Back Office case, the energy supply point, the application/contract, and relevant documents.
- One customer can have multiple separate energy supply points.
- A visit does not automatically mean a new Lead should be created.
- A Lead created from an existing business must retain the correct source business and originating/assigned agent.
- A sale/application must remain linked to the specific energy supply point it concerns.
- Preserve historical visits and prior records if a customer, business, agent assignment, or supply point is edited.
- Do not merge records automatically when the match is ambiguous. Flag uncertain candidates for review.
If the existing model does not support a required relationship, propose and implement the smallest backward-compatible additive database change that solves the problem, using explicit migrations and appropriate indexes/constraints. Do not alter or drop existing objects.
10. UX, localization, and performance
Maintain the current ATLAS CRM design language and navigation. Make the changed workflows practical on desktop and mobile; Field Sales users may use a phone while visiting businesses.
- Use the current component system and styling conventions.
- Keep Greek UI labels and correct Greek diacritics consistent with the existing product. Preserve any existing English labels where currently used.
- Use concise forms with clear field labels, helpful validation, loading states, saved states, and actionable error messages.
- Separate customer home address, business visit address, and supply-point property address to avoid data-entry confusion.
- Keep route check-in and the visit form easy to reach on mobile.
- Support a large route list (40–60+ stops) efficiently. Avoid rendering every stop with expensive redundant requests. Use existing query patterns and add pagination/virtualization or batching only if necessary and compatible with the stack.
- Prevent duplicate form submissions and repeated visit/Lead creation from double-clicks or retries.
- Avoid unbounded provider API calls when searching or optimizing routes. Use debounce, pagination, caching, batching, or rate limiting in line with existing architecture/provider rules.
- Preserve all current dashboard features, navigation destinations, and unrelated CRM pages. A focused redesign of the sidebar/global shell, dashboard, Leads list/detail, and Customers list/detail screens is explicitly required by this prompt.
- Do not undertake a broad visual rewrite of unrelated modules or an unrelated backend refactor.
10.1 Confirmed UI/UX redesign scope — simplify, do not remove
The supplied screenshots show three usability problems that are now explicitly in scope:
1. The sidebar has too many visually competing groups and long labels, so users struggle to find the right destination.
2. The dashboard content is constrained to a narrow centered column even on a wide desktop screen, leaving substantial unused space.
3. Lead detail pages have a crowded header/tab area, uneven card hierarchy, and large blank areas despite important information and actions being available.
Redesign the presentation of these areas so the CRM feels calm, professional, cohesive, and Apple-inspired: clear typography, restrained colors, consistent spacing, soft borders, subtle shadows, clear focus states, and obvious primary actions. This is a UI/UX simplification only; do not delete backend features, routes, data, workflow steps, or actions to make the interface look simpler.
Use the existing UI framework, icon library, components, and design tokens where possible. Prefer refactoring/reusing shared components instead of adding a large new UI dependency. Avoid copying an Apple product interface literally; take inspiration from its clarity and hierarchy.
10.2 Sidebar and navigation — reorganize the information architecture
Keep every existing authorized destination reachable, but organize the sidebar into a small number of clear, collapsible groups with consistent Greek labels. Audit the real current routes and use them rather than inventing new paths. Suggested grouping, subject to the actual repository:
- Εργασία: Αρχική, Η εργασία μου, Follow-ups.
- Πελάτες & Leads: Leads, Πελάτες.
- Πωλήσεις: Cases, and existing related offer/signature/provider/program destinations that exist in the app.
- Πεδίο: Ημέρα μου, Χάρτης, Λειτουργία Πεδίου and existing field-sales/dispatch destinations.
- Back Office: existing operations, document checks, approvals, and handover destinations where those are separate routes.
- Αναφορές: existing reports and revenue/insights pages.
- Ρυθμίσεις: existing preferences, account, administration, workflow, and custom-field configuration pages, subject to access.
This is a suggested information architecture, not permission to rename or remove routes. If a destination is already within another group, avoid showing duplicate sidebar links unless the app intentionally supports contextual shortcuts. Preserve current route URLs, deep links, permissions, counters, search, and keyboard behavior.
Requirements:
- Use one clearly highlighted active item; avoid multiple competing highlight treatments.
- Use short labels, restrained section headings, aligned icons, consistent row heights, and sensible spacing.
- Use notification/count badges only where meaningful; avoid displaying zero badges everywhere.
- Long labels must remain understandable using sensible wrapping, truncation with tooltip, or a wider/collapsible sidebar rather than overlapping other controls.
- Support collapsed/expanded navigation on desktop and a usable mobile drawer on small screens.
- Keep account/profile and sign-out controls in a predictable bottom/account area.
- Keep Atlas AI as a clear existing top-bar action and preserve any separate AI automation destination that already exists; do not create duplicate or dead links.
- Show the same two effective user roles throughout the app: Admin / Back Office and Sales Agent. Navigation is permission-filtered within those two roles. Do not present five separate job titles as five application roles.
- The shared Admin / Back Office login can access the intended office tools. Individual Sales Agents see their own assigned work and approved shared information, not other agents' restricted records.
10.3 Dashboard — use the available width and prioritize work
Rework the existing dashboard layout, not its underlying data definitions. The screenshots show an overly narrow content area on a wide viewport. Use a fluid grid that occupies the available main-content width after the sidebar, with sensible gutters and a readable maximum width only when needed. Do not leave a large blank right side because of an unnecessarily small fixed-width container.
Prioritize the information a user needs immediately:
- Compact greeting/date and today's task summary.
- Core live metrics for overdue follow-ups, follow-ups today, new leads awaiting contact, cases awaiting the current user, and pipeline values where those metrics already exist.
- A useful, compact “Τι να κάνετε τώρα” / daily task list with existing actions.
- Pipeline overview and “Η ομάδα” / Back Office alerts appropriate to the current role.
- Supporting metrics, operations, document/signature checks, top cases, and recent notifications in compact responsive panels below or alongside the primary workspace.
Implementation rules:
- Reuse existing components and data hooks. Never hardcode sample numbers, names, or case records.
- Consolidate repeated visual summaries where safe, but preserve every unique metric, action, filter, destination, and panel capability.
- Do not make all dashboard cards equally prominent. Establish a clear hierarchy: urgent work first, pipeline and operational risks next, reference information after that.
- Use desktop columns intelligently and reflow to two columns/tablet and one column/mobile as appropriate.
- Minimize unnecessary page scrolling on normal desktop displays, but do not shrink text or controls below usable sizes just to force every panel into one viewport. Secondary content may remain below the fold.
- Avoid excessively tall empty-state cards; show concise empty states and keep the relevant action/navigation available.
- Preserve loading, error, unavailable, and true-zero states distinctly. Do not show unavailable monetary values as €0.
10.4 Leads list and Lead detail — reduce clutter while preserving all workflows
Redesign the Leads list/detail presentation to make returning to the list, identifying a Lead, understanding its state, and taking its next action straightforward.
Lead detail header
- Keep a clear, accessible back link such as “Επιστροφή στα leads”. It must navigate to the correct existing list/return destination and preserve useful filters or context when supported.
- Present the lead name, lead identifier/initials where already available, current status, phone/email, service interest, and assigned/originating agent in a compact, consistently aligned header.
- Group secondary actions (for example, edit and delete) so they do not compete with the main next action. Keep destructive actions visually distinct and preserve any existing confirmation behavior.
- Retain the existing qualification/next-action panel and call action, but make the recommended action clear, contextual, and accessible. Do not trigger a business action automatically merely because the UI suggests it.
- Do not claim consent management is available if the underlying consent checker is still unavailable; show the truthful current status/error and preserve the existing implementation.
Tabs and information layout
- Preserve every existing tab and function, including Σύνοψη, Cases, Έγγραφα, Ιστορικό, Follow-ups, Επισκέψεις, Προσφορές, Υπογραφές, and Back Office wherever those tabs currently exist.
- Use one consistent, compact tab/navigation row with clear active state and accessible keyboard/focus behavior. On smaller screens, allow an intentional horizontally scrollable tab strip or an appropriate responsive selector; do not clip tabs without a way to reach them.
- Use the available main width with a responsive grid rather than a narrow fixed-width content column. On desktop, use a balanced main-details and side-actions layout; collapse cleanly on tablet/mobile.
- Arrange summary information into coherent cards (lead/customer details, contact, next action, status/history, and any relevant alerts). Avoid repeated copies of the same phone/email/status in multiple large cards unless a repeated item has a clear operational purpose.
- Reduce empty whitespace and oversized cards, while retaining sufficient spacing and readable text. Do not fill blank space with decorative content or fake data.
- Preserve the existing rule that a case’s pipeline stage is changed from the case page when that is how the current implementation works. Do not create a separate Lead status control that conflicts with the case pipeline.
- Preserve existing call, qualify, edit, delete, history, case-opening, and other actions. If an action is moved into a menu, it must remain discoverable, accessible, and fully functional.
Leads list
- Keep search, current filters, status information, owner/agent information, create action, and existing list actions.
- Improve scanability with consistent columns/rows or responsive cards, restrained status badges, and clear empty/loading/error states.
- Preserve pagination, sorting, filtering, URL query parameters, exports, and any bulk actions already implemented.
- Do not hide a Lead from the authorized user's view merely to simplify the screen.
10.5 Customer folder — same design system and multiple supply points
Use the same header, spacing, tab, card, and action patterns as the Lead detail page so users do not have to relearn the interface.
- Keep “Επιστροφή στους πελάτες” visible and preserve its existing navigation/return context where supported.
- Separate the customer identity/contact summary from the customer’s many electricity supply-point records.
- Show supply points as compact, clearly differentiated records with their own residential/business type, address, 11-digit Αριθμός Παροχής when known, meter details, tariff category and product name, application/contract details, documents, and related cases.
- Provide an obvious “Προσθήκη παροχής” action and independent view/edit actions for each connection. Editing one supply point must never overwrite another.
- Keep identity documents and personal contact information at the appropriate customer level, and connection-specific bills/meter photographs and application documents linked to the applicable supply point or case.
- Keep globally configured custom fields visible in a logically named section without letting custom fields overwhelm the core customer data.
- Keep the customer folder useful when optional data is missing. Display “Δεν έχει καταχωρηθεί” or the existing empty-state convention instead of presenting missing data as an error or forcing fake values.
- Preserve all existing tabs, history, document permissions, follow-up actions, case links, and audit behavior.
10.6 Visual design and interaction rules
- Use a restrained Apple-inspired SaaS aesthetic: light neutral app background, clean white/near-white surfaces, dark readable text, one principal blue accent, subtle borders, soft shadows, consistent radii, and restrained status colors.
- Follow existing project tokens and brand choices first; do not introduce a second unrelated theme.
- Use a consistent spacing scale and typography hierarchy. Secondary metadata must remain readable; do not solve density by making text tiny.
- Keep primary actions obvious, secondary actions quieter, and destructive actions separate.
- Maintain accessible contrast, keyboard focus, semantic buttons/links, accessible names for icon-only buttons, and reduced-motion support.
- Use small, consistent icons. Avoid excessive badges, gradients, nested cards, ornamental graphics, unnecessary animations, and one-off colors.
- Make the interface responsive, including a usable sidebar, dashboard, Lead detail and customer supply-point list at mobile widths.
- Avoid broad global CSS selectors that accidentally alter unrelated routes. Use existing scoped styling conventions/shared tokens.
10.7 UI/UX acceptance and screenshot validation
Before declaring the UI changes complete, visually inspect the actual app (when browser/screenshot tooling is available) at 1440×900, 1280×720, 1024×768, 820×1180, and 390×844. Review at minimum:
- Dashboard at wide desktop size: the content should use the available width rather than remaining a small narrow column in the center.
- Sidebar in expanded, collapsed, active-route, long-label, and mobile states.
- Leads list and a Lead detail page, including “Επιστροφή στα leads”, tabs, the next-action panel, contact details, and empty states.
- Customer detail with multiple residential and commercial supply points.
Check for overlapping controls, clipped tabs, excessive blank space, accidental duplicated navigation, unreadable metadata, horizontal page overflow, wrong active links, missing functions, and broken mobile actions. Make corrections based on what the screenshot/browser actually shows. If visual tooling is unavailable, state that it was not visually verified rather than claiming success.
11. Persistence and migration policy
Before adding persistence, determine what current tables/collections and metadata mechanisms already exist.
Potential new functionality that may need persistence includes:
- Saved daily routes and ordered stops.
- Check-in/visit history linked to agents and business records.
- Duplicate approval requests and decisions.
- Configurable workflow outcomes/reasons/branches, if not supported already.
- Global custom-field definitions and per-customer/per-connection values, if not supported already.
- Additional connections/supply points, if not supported already.
- Per-connection document associations or document checklist state, if not supported already.
These are areas to audit, not instructions to blindly create all of these tables. Reuse existing models where practical.
For any necessary new database objects:
- Use additive, versioned migrations.
- Do not remove/rename columns or tables, change existing record meaning, or force destructive data transformations.
- Add safe indexes/foreign keys/constraints only after reviewing data compatibility and write paths.
- Design for existing records to continue functioning when new fields or tables are absent/empty.
- Implement appropriate RLS/authorization policies and test them for both user categories.
- Ensure saved routes, visit history, custom fields, documents, and approval actions cannot be read/modified outside the authorized scope.
- Keep migration scripts idempotent where the project convention permits it and test against the available development/test environment.
- If the current schema fundamentally conflicts with a requirement (for example, an existing non-null constraint preventing a program-less Lead), do not secretly make a breaking change. State the conflict, propose the safest backward-compatible migration, and clearly report whether it was applied.
12. Testing and acceptance criteria
Run the checks actually supported by the repository. Do not invent command names or claim tests passed if they were not run.
At minimum, test or verify the following cases using the project’s real test setup where feasible.
12.1 Authentication and permissions
- A Sales Agent can sign in through the existing provider and see/operate only on routes and leads allowed by their access rules.
- The shared Admin/Back Office login can access the intended Back Office processing and approval functions.
- Admin/Back Office can view/reassign team routes as permitted.
- Authorization is enforced server-side/data-side, not only by hiding buttons.
- RLS and file access restrictions remain in effect.
12.2 Lead creation
- A Lead can be created without selecting an energy program.
- The record is saved and appears in the correct list/pipeline/view.
- Invalid payloads and server/database errors are reported safely and meaningfully.
- The verified root cause of previously observed failures is covered by a regression test where feasible.
- Lead creation retries do not silently create duplicate records.
12.3 Field Sales workflow
- Each initial default outcome can be recorded.
- Follow-up has a responsible agent/date and appears when due.
- Manager follow-up reaches the Back Office queue and retains agent/visit context.
- No-contact and not-interested outcomes retain history without generating unintended duplicate leads.
- Additional configured reasons/branches persist and render correctly.
- A follow-up can branch into New Sale or another configured outcome without losing prior visit/follow-up history.
- No Sale permits a configured reason and appropriate branch, including manager follow-up, not interested, or a scheduled follow-up.
- New Sale can be handed to Back Office with incomplete documents; the missing items appear as checklist warnings only.
12.4 Routes and visits
- The agent can build a route that automatically includes applicable due work and assigned businesses.
- The agent can add CRM businesses and map-discovered candidates after duplicate checks.
- The route supports 40–60+ stops subject to the actual map provider’s limits, with safe segmentation/batching where necessary.
- The route can be optimized, reordered, saved for a date, reopened, and resumed.
- Manual check-in records the correct agent and stop, and opens/presents the visit form.
- Previously visited businesses show history and due follow-up options.
- A business owned/visited by another agent requires Back Office approval before a new Lead or takeover; the visit itself can still be recorded.
- Route reassignment does not rewrite historical visit attribution.
12.5 Customer folder and documents
- Standard customer/contact fields save and reload correctly.
- A customer can have multiple supply-point records, including a mix of residential and business connections, without overwriting one connection with another.
- Every connection has its own property address, 11-digit Αριθμός Παροχής when known, separate meter details where applicable, configurable tariff category/code, commercial tariff name, application date, contract duration, and appropriately linked documents/cases.
- The customer folder can list, open, add, and edit multiple connections independently; information on one connection cannot overwrite another.
- Γ1, Γ1Ν, Γ21, Γ22, and Γ23 are handled as configurable tariff-category options unless equivalent verified configuration already exists; the UI does not conflate these codes with the commercial tariff/product name.
- When provided, a supply number is validated as 11 digits and used as a duplicate/matching signal, while legacy data is preserved and uncertain duplicates are flagged for review.
- A missing supply number or document does not block a Lead creation or pipeline transition unless an existing, verified business rule requires it.
- Global custom field definitions can be created by both Sales and Back Office users as required, and values save/reload against customer folders.
- Renaming/archiving a custom field does not accidentally erase existing values.
- Missing documents display a checklist/warning but do not block stage transitions or Back Office handoff.
- Actual uploaded files remain private and are accessible only through authorized paths.
12.6 Back Office workflow
- Back Office can manage a case from its current/appropriate stage without being forced through every earlier stage.
- Back Office can open a case already at an appropriate later stage and work from there without falsifying earlier stage completion.
- Back Office can take supported alternative/return branches while preserving the stage and activity history.
- Main stages and exception branches can be represented using existing or safely extended statuses.
- Missing documents do not block transitions.
- Declined offers, nonresponses, unsigned contracts, provider rejection, and missing information retain the case and its history.
- The originating Sales Agent remains correctly attributed throughout Back Office processing.
12.7 General project checks
Run available:
- TypeScript/type checks.
- Linting.
- Production build.
- Unit/integration tests relevant to changed flows.
- Migration/policy checks when available.
- Browser/manual smoke tests if the project has an available local browser environment.
Inspect changed pages at practical desktop and mobile sizes, particularly route planning and visit capture on a phone. Check for console errors, failed network requests, horizontal overflow, clipped controls, missing loading/empty/error states, and regressions to existing navigation.
If a check cannot run because a service, account, API key, local environment, or test fixture is unavailable, state that limitation precisely. Do not mark it as passed.
13. Suggested implementation sequence
Work incrementally and validate each related area:
1. Complete the repository audit and write a concise implementation plan grounded in actual files/data models, including a mapping of existing roles to the two target roles.
2. Reproduce and fix the confirmed Lead creation failure(s), including optional program selection, then add regression coverage.
3. Simplify the shared sidebar/global shell, dashboard, Leads list/detail, and Customers list/detail using §10.1–§10.7, preserving every route and action.
4. Verify/configure the shared Admin/Back Office account and individual Sales Agent access using current authentication; map legacy role values to exactly two effective application roles without destructive changes.
5. Implement/adapt Field Sales visit outcomes, follow-ups, and configurable branches.
6. Implement/adapt route planning, CRM/map business candidates, daily saved routes, manual check-in, navigation/stop sequencing, visit history, and route permissions.
7. Implement duplicate detection and the Admin/Back Office approval queue, protecting server-side data paths.
8. Extend the customer folder and multiple supply-point records, adding safe global custom-field definitions and values only if needed.
9. Implement/adapt document checklists and secure uploads with no stage-transition blocking due solely to missing documents.
10. Implement/adapt flexible Back Office stage management and exception branches.
11. Run migrations and project checks in the supported environment, fix regressions, and perform available UI smoke tests.
12. Provide the final implementation report and any required deployment/configuration steps.
Do not treat this sequence as a rigid dependency graph if the current application provides a safer order. Do not deploy to production or run destructive data operations without explicit authorization already provided through the current workflow.
14. Required final report
After implementation, report:
1. Repository audit: the relevant architecture, files, models, and existing integrations discovered.
2. Lead error root cause: what was reproduced, what evidence identified the cause, the fix, and tests; clearly state anything still unverified.
3. User model: how the shared Admin/Back Office login and individual Sales Agent accounts are handled within the existing authentication system.
4. Field Sales workflow: default outcomes, branches, follow-ups, and configuration implemented.
5. Routes and visits: how route generation, map-discovered businesses, optimization/segmentation, saving, manual check-in, history, and reassignment work; identify any map-provider or API-key requirement.
6. Duplicate approval: matching logic, approval behavior, and how it is enforced beyond the UI.
7. Customer folder: standard fields, multiple residential/commercial supply points, 11-digit supply-number handling, separate meter identification, tariff category versus commercial tariff name, configurable custom fields, and document associations.
8. Back Office: supported stages, non-linear progression, exception branches, and document warning behavior.
9. Files changed: principal modified/created files and migrations.
10. Validation: exact commands/checks run and actual outcomes.
11. UI/UX redesign: sidebar grouping, dashboard width/layout, Lead/Customer list and detail improvements, responsive sizes visually checked, and any features intentionally not visually verified.
12. Role simplification: how existing role values map onto the two target application roles, including any compatibility constraints.
13. Unresolved items: external credentials/configuration needed, assumptions, provider-dependent details not configured, tests not run, limitations, and any scope that remains incomplete.
Do not claim functionality works merely because it renders. Do not claim a map route is optimized if no functioning provider integration supports it. Do not claim a fix is complete if the root cause was not reproduced or verified.
15. Full-stack architecture and code-connectivity audit
The visual mockups are references for information hierarchy and interaction design. The implementation must be built from the real application components, data, APIs, authorization policies, and business logic. Do not treat the mockups as a specification for an entirely new codebase.
Before any implementation, build a source-grounded map of how the existing application is connected. Inspect the actual repository; do not assume it uses a particular folder structure or framework beyond what the files prove.
15.1 Repository and framework foundation
Identify and report to yourself:
- Framework, runtime, language, build tooling, package manager, lockfile, and supported Node/runtime version where applicable.
- Entry points, route tree, nested layouts, shared shell, navigation, global styles, theme/tokens, and design-system/component library.
- Feature/module boundaries for dashboard, Leads, Customers, Cases, Sales, Field Sales, routes/maps, follow-ups, Back Office, documents, reports/insights, settings, and Atlas AI.
- Shared types, validation schemas, formatting/localization utilities, API clients, query/cache layer, server-only utilities, and error-handling patterns.
- Database client initialization, authentication/session setup, storage clients, RLS policies, SQL migration conventions, generated types, and test fixtures.
- External service integrations, background processing, webhooks, email/SMS/telephony integrations, maps/geocoding/directions, and required configuration names.
- Existing route guards, permission helpers, feature flags, environment validation, logging, analytics, and error-reporting tools.
Use the current conventions unless an evidence-based problem requires a targeted change. Do not reorganize the whole repository just to match an idealized folder tree.
15.2 Build a code and dependency map
For each in-scope screen, trace its complete path through the code:
route/page → layout/shell → feature component → form or interaction → state/query hook → typed API/server action → authorization → business/service logic → database/storage/provider → response → UI cache/state refresh.
Map at least:
- Dashboard metrics and work queues.
- Leads list, create form, edit form, detail screen, qualification/outcome controls.
- Customer list, customer detail, custom fields, supply-point list/detail, document attachments.
- Cases and the Back Office pipeline/stage-change path.
- Follow-ups and manager follow-up queue.
- Daily route creation, map candidates, optimized order, saved route, stop navigation, manual check-in, visit outcome, route history, and reassignment.
- Duplicate detection, approval request, approval/rejection, and post-approval creation/assignment.
- File upload, private file access, checklist state, signed URLs/downloads, and document association.
- Authentication, role resolution, page access, server authorization, and data policies.
Identify all callers, dependencies, consumers, and side effects of any function or component that will change. Search for imports and call sites before renaming or editing shared code. Use repository-wide references and tests to avoid breaking connected code.
Create or update architecture documentation only when the active execution scope authorizes file changes. If the current phase is audit-only, deliver this map in the report and do not create/modify repository files.
15.3 Source of truth and data ownership
For every displayed value or form field, establish which persisted field or computed business rule is authoritative. Do not maintain a second conflicting copy in local state, custom JSON, a different table, or a mock store when the existing model already owns that fact.
Distinguish clearly between:
- Authenticated identity and the app-level effective role.
- Current assignment/operational owner and original Sales Agent attribution.
- Business being visited, customer/contact, Lead/opportunity, Case, energy supply point, application/contract, route, route stop, visit, follow-up, document, and approval request.
- Customer home address, business visit address, and the address attached to an electricity supply point.
- The 11-digit Αριθμός Παροχής and the physical meter’s serial/identifier.
- Tariff category/code and the supplier’s commercial tariff/product name.
- UI state, persisted state, derived metrics, and cached state.
Where the present model combines concepts, do not split it blindly. Map the real schema and choose the smallest compatible extension that maintains established relationships and history.
15.4 Avoid disconnected or dead UI
Every new control shown in the finished UI must have a real behavior:
- Buttons must call the existing or newly implemented authorized action.
- Links must navigate to valid existing routes or explicitly approved new routes.
- Forms must validate, submit, display server errors, and reflect saved values after reload.
- Filters and search must affect the real data set, not only client-side mock rows unless the current architecture intentionally uses client filtering.
- Status changes must update the authoritative backend and activity history.
- Counts, progress indicators, badges, and charts must derive from real data.
- Menus, tabs, pagination, sorting, empty-state actions, and dialogs must be usable with keyboard and touch.
Do not create buttons that only look interactive, dead navigation entries, decorative charts presented as live metrics, or actions that succeed visually without a persisted result.
16. Frontend engineering standards
16.1 Component strategy
- Reuse the existing framework, component library, styling solution, routing, and form/query patterns.
- Reuse existing components when they already meet the need. Extract shared components when that prevents genuine duplication; do not create abstractions for a single trivial element merely to increase component count.
- Keep components focused: visual presentation, form state, data loading, and domain mutations should have clear responsibilities according to existing conventions.
- Keep server-only code and secrets out of client components and bundles.
- Avoid introducing global styles that unexpectedly affect unrelated screens. Prefer scoped styles, component classes, design tokens, or the project's current styling pattern.
- Keep business rules out of purely visual components when the current architecture has domain/service modules for them.
- Avoid fragile DOM querying, arbitrary timeouts, duplicated fetch logic, and useEffect-driven data mutations where framework-supported patterns already exist.
- Preserve existing accessibility semantics and keyboard behavior as components are restyled.
16.2 Forms and interactions
All Lead, Customer, supply-point, document, custom-field, visit-outcome, follow-up, route, stage, and duplicate-approval forms must:
- Use a single clear source of truth for field values.
- Reuse client/server validation rules where the current stack allows it, without trusting client-side validation alone.
- Show field-specific validation messages in Greek consistent with the product.
- Preserve entered data after recoverable errors where safe.
- Disable duplicate submission while a request is in progress and handle retry/idempotency as appropriate.
- Indicate saving, success, loading, empty, and error states honestly.
- Avoid marking changes saved until the server/database confirms success.
- Keep optional customer fields optional, and do not require a program at Lead creation.
- Keep missing-document warnings non-blocking for stage transitions.
16.3 Data fetching and UI state
- Follow the existing query/cache/server-data conventions; do not add a second competing cache layer.
- Ensure create/update/stage-change/upload actions invalidate or refresh the appropriate data and preserve relevant filters and selected records.
- Prevent stale detail views and dashboard counts after mutations.
- Handle loading/error/empty states consistently and avoid showing zero when the value is unknown or unavailable.
- Use pagination, server filtering, batching, or virtualization for large collections when justified by the current data volume and implementation.
- Keep route planning for 40–60+ stops performant without issuing redundant requests per stop.
- Preserve URL parameters, direct links, browser back/forward behavior, and current search/filter states where applicable.
17. Design system and visual direction from the supplied mockups
Use the supplied ATLAS CRM screen mockups as references for a coherent visual system: quiet light surfaces, restrained blue accents, clear card/table hierarchy, compact but readable controls, generous alignment, minimal decoration, and simple navigation. They are not a reason to copy inaccurate sample values or rebuild the app as a static image.
17.1 Visual foundations
Prefer existing tokens. If a compatible system already exists, improve and reuse it rather than introducing a second palette. Where tokens are missing, use the following as a starting direction, subject to existing brand constraints:
- App canvas: pale cool gray such as #F5F7FB.
- Primary surface: white #FFFFFF.
- Primary text: dark navy such as #17263C.
- Secondary text: muted blue-gray such as #66778F.
- Primary action: clear medium blue such as #1677F8.
- Sidebar: deep navy such as #0B203A, or a similarly restrained accessible shade.
- Borders: light cool gray such as #E3E9F1.
- Status accents: restrained green, amber, red, and violet used consistently for meaning, not decoration.
Use a spacing scale based on 4/8px increments, consistent corner radii, restrained borders and shadows, and clear typographic hierarchy. Avoid excessive glassmorphism, gradients, oversized cards, unused white space, tiny metadata, heavy dark outlines, and large colorful icon treatments. Blue should indicate the primary action and selected state, not every element.
17.2 Design tokens and shared primitives
Audit and consolidate, where appropriate, reusable tokens for:
- Color and semantic status.
- Typography, weights, line heights, and truncation.
- Spacing, page gutters, gaps, and control sizes.
- Borders, radii, shadows, surfaces, focus rings, and overlays.
- Sidebar dimensions and navigation states.
- Buttons, icon buttons, input/select/textarea, badges, tabs, tables, cards, dropdowns, dialogs, tooltips, toasts, and skeletons.
Do not mechanically replace all CSS or introduce a design-system dependency without need. Implement only the shared primitives relevant to the in-scope screens and preserve pages outside the agreed redesign scope.
17.3 Sidebar and application shell
Make the sidebar calmer and easier to scan. Consolidate navigation under clear group labels without removing any existing destination. Prefer short labels, consistent icons, a clear selected state, and restrained badges. Use collapsible groups or a compact/collapsed desktop mode only if it fits existing navigation conventions and remains discoverable.
Keep the primary shell predictable:
- Sidebar for destination navigation.
- Compact top bar for page context, global search, primary + Νέο action, Atlas AI, notifications, and the current account menu, preserving whichever controls the current app supports.
- Main content area uses the width available after the sidebar, instead of an unnecessarily narrow centered column.
- Keep breadcrumb and page title alignment consistent across Leads, Customers, Cases, Routes, and Back Office.
The target model has two effective user roles: shared Admin/Back Office and individual Sales Agent. Role-specific navigation must be derived from effective authorization, not from untrusted client-supplied role labels.
17.4 Dashboard visual reference
The dashboard mockup suggests this hierarchy:
1. Compact greeting/date and daily work context.
2. High-priority KPI row with real data.
3. Main work area containing actionable tasks, pipeline overview, and team health where authorized.
4. Secondary compact panels for funnel, Back Office operations, document/signature status, top cases, and notifications.
Use real screen width and responsive CSS Grid/Flexbox. Eliminate large empty areas and redundant duplicate KPI cards where metrics can be consolidated without losing distinct meaning or actions. Do not hardcode the mockup's illustrative numbers. Prioritize the tasks the user must act on, but retain all existing dashboard information and destinations.
17.5 Leads list and details visual reference
The Leads list should be easy to scan, filter, search, and act on. Preserve all existing filters, sort options, bulk actions, pagination, exports, route destinations, and permissions. Use a readable table on desktop and a well-structured responsive presentation on smaller screens.
The Lead detail view should:
- Keep Επιστροφή στα leads visible and functional.
- Present identity/name, status, key contact methods, and responsible Sales Agent clearly.
- Make the next recommended action easy to understand without allowing a recommendation card to replace underlying workflow logic.
- Keep existing tabs (including Σύνοψη, Cases, Έγγραφα, Ιστορικό, Follow-ups, Επισκέψεις, Προσφορές, Υπογραφές, Back Office and any others found in the repository) accessible with consistent overflow handling on small screens.
- Consolidate duplicate contact displays when they represent the same data, but keep each unique action and information source available.
- Use a balanced main/details layout at desktop widths, with cards sized to their content; avoid a narrow column surrounded by unused page space.
- Retain real status changes, delete/edit operations, call links, qualification actions, history, and authorization rules.
17.6 Customer profile and electricity connections
The customer page should clearly separate:
- Personal/customer identity and contact details.
- Residential/business connection cards or rows.
- Cases, offers, contracts, applications, documents, history, and follow-ups.
- Custom fields and any additional data sections configured by Sales or Back Office.
Each electricity connection card should visibly distinguish its usage category (home/residential or business/commercial), address, Αριθμός Παροχής, physical meter identifier where present, tariff category/code, commercial tariff name, application/contract details, and document checklist. Keep the supply-point record independently editable. Avoid forcing the user to scroll through one enormous ungrouped form to manage several connections.
17.7 Responsive breakpoints and screen validation
Inspect existing breakpoints first and follow the current design system. Test the in-scope screens at a minimum of:
- 1920×1080 and 1680×1050.
- 1440×900 and 1280×720.
- 1024×768 and 820×1180.
- 390×844.
Desktop should use space efficiently without shrinking text to force every panel into one viewport. Tablet should reflow columns. Mobile should prioritize main actions and support natural vertical scrolling. Avoid whole-page horizontal overflow; contain it only inside components where necessary and usable.
If screenshot/browser tooling is available, capture before/after screenshots with the same viewport and compare alignment, readable font sizes, scroll length, focus states, console/network errors, and visible actions. Do not claim visual QA was performed if it was not.
18. Backend, API, data-access, and integration foundations
18.1 Server-side boundaries
- Follow the existing backend framework and API/server-action conventions; do not introduce a separate backend server unless the repository and requirements justify it.
- Treat every client request as untrusted. Validate input server-side and enforce authentication/authorization at the authoritative backend/data layer.
- Keep service-role credentials and other secrets on the server. Never embed them in frontend code, source-controlled files, logs, or screenshots.
- Reuse shared validation schemas and types where appropriate, but ensure server-side checks remain authoritative.
- Keep business operations such as duplicate approval, ownership changes, stage changes, custom-field definition changes, file authorization, route reassignment, and role resolution on trusted server/data paths.
- Return consistent safe error shapes using the project's existing conventions. Do not expose SQL errors, secrets, full sensitive records, or internal stack traces to ordinary users.
- Make state-changing operations safe against double-clicks and retries where practical. Reuse existing idempotency patterns; avoid creating duplicate leads, visits, route stops, or approval requests on repeated submissions.
18.2 Database and repository access
- Audit the existing Supabase/database client and data-access paths before changing them.
- Reuse existing tables, views, RPCs, relationships, indexes, RLS policies, and generated types where appropriate.
- Keep queries scoped to the authorized current user/team and use server-side pagination/filtering for large lists.
- Avoid N+1 query patterns and repeated provider calls, especially for daily routes and dashboard metrics.
- Keep data mutations and follow-up queries coherent. If a mutation succeeds but UI refresh fails, report the mutation result honestly and allow recovery without creating duplicates.
- Do not disable or weaken RLS to make a new screen function. Design policies around the two effective application roles and route/record ownership required by the business.
- If schema/type generation is used, follow the current repository workflow and note whether generated artifacts need updating.
18.3 Storage and document services
Trace upload → metadata persistence → association with customer/connection/case → secure retrieval. Preserve access boundaries and use the existing storage provider. Documents can be related to the customer, a specific supply point, or a case/application according to the actual model. Avoid redundant copies unless the existing storage model requires them. A checklist item is metadata/status; it is not proof that a file exists.
18.4 External integrations
Create an inventory of integrations with:
- The function served (map/place search, geocoding, directions/optimization, email, telephony, AI, storage, etc.).
- The code paths calling it.
- Required environment variable names (never their secret values).
- Server/client responsibility.
- Rate/waypoint/file-size constraints known from existing documentation/configuration.
- Development/test behavior and required user configuration.
Reuse current integrations whenever suitable. If a required capability is missing, report the options, cost/credential/terms considerations, and a recommended next step in the audit. Do not silently select a paid vendor, invent credentials, or display a fake success state.
18.5 Observability and privacy
Use the existing logging/error-monitoring approach. Logs should help trace failed operations using safe identifiers, correlation/request IDs, error categories, and timing where appropriate, without recording identity images, E9, bills, passwords, access tokens, sensitive full request bodies, or long-lived signed URLs. Make expected validation errors distinguishable from infrastructure failures.
19. End-to-end business flows and data contracts
Use these flow maps as business acceptance criteria. Map them onto the existing data model and route structure; do not force the codebase to adopt these exact table or file names.
19.1 Lead creation without a program
Lead form → client validation → authorized server endpoint/action → server validation → permitted database insert → safe response → list/detail cache refresh → visible Lead with correct owner/source.
Program/tariff is optional at Lead creation. Verify every layer; a UI-only fix is insufficient. If a Lead save and an optional file upload are separate operations, handle partial failure without silently losing the Lead or pretending the upload succeeded.
19.2 Field Sales visit and qualification
Saved route stop → manual Check in → visit event → visit form → configured outcome → follow-up / manager follow-up / no contact / not interested / New Sale → related Lead/case and ownership → history update → route progress update.
A check-in records a visit but does not automatically create a Lead. A repeated visit links to the existing business and history where appropriate. Another agent's existing ownership/visit triggers a Back Office approval before a duplicate Lead or takeover, while still allowing the actual visit to be recorded.
19.3 New Sale handover
Interested / New Sale → customer identity/contact details → select/create relevant supply-point record → upload available ID front/back, bill, meter photograph, E9 → visible missing-doc checklist → Sales Agent attribution → handover to Admin/Back Office → Back Office queue.
The handover remains possible when any document is missing. Do not invent mandatory fields at the handoff or Lead stage beyond confirmed requirements and existing verified business rules. Missing details remain visible for later collection.
19.4 Back Office case management
Back Office opens received case → inspect actual current stage and history → choose the appropriate permitted action/stage → offer / wait for response / collect missing information / create application / request signature / register provider / activate, or follow a supported exception branch → persist status + event history → update queues and relevant views.
Do not mark earlier steps complete merely to reach a later stage. Preserve case history, offer/application state, originating Sales Agent, supply-point linkage, document checklist, and pending follow-ups. Missing documents alone never block transitions.
19.5 Customer, supply point, and document relationship
Customer → 0..N supply-point records → each supply point has its own address + optional 11-digit Αριθμός Παροχής + separate meter details where applicable + tariff category + commercial tariff name + application/contract metadata → documents/cases/applications associated at the correct level.
A single customer may have residential and commercial connections. Never treat the physical meter serial as the supply number. A missing supply number at early lead stages should be represented as unknown/not yet supplied, not invented.
19.6 Global custom fields
Authorized authenticated user from either effective role → validate field definition (label/key/type/options/section/order) → persist configuration metadata → show field in appropriate customer folder forms → validate/save per-customer value → reload/search where supported.
Do not create SQL columns for each custom field. Do not allow executable code, arbitrary HTML, unsafe field types, duplicated stable keys, or unauthorized configuration changes. Renaming/archiving a definition must not silently delete historical values.
19.7 Route and ownership approvals
Due work + assigned businesses + unfinished visits → candidate discovery → duplicate checks → route proposal/order → agent edits and saves date-specific route → manual check-in and outcome → persisted visit history/progress.
For cross-agent ownership/visit matches: candidate/request → warning and pending state → Admin/Back Office reviews evidence → approve/reject → server-side authorization recheck → permitted create/assignment or unchanged existing owner.
19.8 Flow integrity
For every flow, document and test:
- The source component and interaction.
- Request/action name and input/output shape.
- Authentication and authorization check.
- Business validation and persistence path.
- Side effects, audit/history events, storage/provider calls, and cache invalidation.
- Error/loading/success UI behavior.
- Duplicate submission and retry behavior.
- Relevant regression tests.
Keep API contracts and shared TypeScript/domain types aligned. Update callers, validation, tests, generated types, and documentation together when a genuinely necessary contract changes. Do not change a shared function signature without auditing every caller.
20. Code quality, change control, and deliverables
20.1 Implementation discipline
- Keep changes focused and logically grouped.
- Prefer small, reviewable commits or PRs consistent with the current user-approved workflow.
- Do not revert, overwrite, reset, or reformat unrelated uncommitted work.
- Inspect git status, current branch, diffs, staged changes, existing PR/task instructions, and repository conventions before editing.
- Follow the user's current explicit PR/phase instructions if they are narrower than this master prompt. The master prompt does not authorize pushing, merging, deploying, applying database changes to shared environments, or starting a later phase by itself.
- If Part B PRs 1–6 or another staged plan is actively in progress, honor that sequence. A full screen suite that crashed or stopped early is not a pass; rerun the entire suite successfully before pushing/opening a PR when that is the agreed gate.
- If the current authorized phase is audit-only, make no implementation edits and stop after reporting the audit, root cause findings, role mapping, conflicts, scope/cost estimates, assumptions, and implementation plan requested for that phase.
20.2 SQL and migration restrictions
For this project, a database change must be provided as a staged SQL migration only, following the repository's naming conventions. Each genuinely required migration must be:
- Additive and backward-compatible.
- Idempotent where the project's conventions allow.
- Supplied with a rollback strategy/instructions.
- Tested locally with the project's supported database test harness, including PGlite where specified by the active task.
- Reviewed for RLS, indexes, constraints, existing data compatibility, and application code dependencies.
Never apply a migration to staging or production unless the user explicitly authorizes that specific action. Do not merge or deploy on behalf of the user unless expressly authorized. Do not run a destructive reset or data migration to make tests pass.
20.3 Implementation report must map UI to code
When implementation is authorized and completed, report more than a list of visual changes. Include a concise technical traceability map:
Feature/flow	Frontend route/components	API/server action/service	Data model/table/storage	Auth/RLS rule	Tests/status


Fill this table with actual file names, actual database objects, and actual test results discovered in the repository. Do not invent file names, endpoints, tables, or policies. If a connection cannot be verified, mark it unverified and state what is needed.
Also include:
- Actual files changed and why.
- Existing features and routes checked for regressions.
- Any migration files staged and whether they were tested; explicitly state nothing was applied/deployed/merged if that is the case.
- UI viewports/screenshots tested and known visual limitations.
- Tests run with exact commands, results, failures, and skips.
- Provider keys, setup steps, external costs/limits, or manual configuration needed.
- Assumptions and unresolved decisions clearly separated from confirmed business rules.
20.4 Definition of done
The work is done only when both the visible design and the connected functionality have been validated. A polished screen with fake/static data is not done. Working backend code with a confusing, cramped, inaccessible interface is not done. A passing build alone is not proof that the workflows are correct. Each change must fit the current architecture, retain existing permissions, preserve data, provide honest loading/error/empty states, and have appropriate test evidence.
21. Security engineering, authorization, and Row-Level Security (RLS)
Security is a release requirement. Implement defense in depth using the actual application stack, identity provider, database, storage service, and deployment environment discovered during the audit. Do not promise absolute or “100%” security; produce evidence-based security checks and list residual risks.
21.1 Security audit before changing policies
Inspect and map:
- Authentication configuration, public registration settings, session lifecycle, password/verification/recovery flow, callback URLs, cookie/session settings where applicable, and current identity-provider administrative capabilities.
- Every role/permission source: auth claims, profile/user tables, role enums, helper functions, route guards, server middleware, API/server actions, Edge Functions, database grants, and RLS policies.
- All tables, views, materialized views, RPCs/functions, triggers, storage buckets, object policies, and client-exposed database endpoints that handle CRM or personal data.
- Existing policies by command/operation (SELECT, INSERT, UPDATE, DELETE), including whether updates can change ownership, tenant/scope identifiers, role fields, agent IDs, or approval states.
- Privileged credentials and environment-variable use. Identify any service-role/admin key reachable from browser bundles or NEXT_PUBLIC_*/equivalent client variables without printing secret values.
- Existing logging, error reporting, rate limiting, dependency/security checks, backup/restore documentation, and incident/secret-rotation procedures where available.
Do not assume RLS is enabled merely because Supabase is used, or that a policy is correct because one screen works. Verify the real schema and policy definitions. Keep the audit focused on relevant security surfaces and report unrelated pre-existing risks separately.
21.2 Authorization principles
- Deny access by default and grant only the minimum access needed for each of the two effective application roles.
- Authentication answers who the user is; authorization must independently determine what that authenticated user can do.
- Enforce authorization on trusted server/API/data-access boundaries and at the database/storage layer where supported. Client-side conditional rendering is for UX only and never the security boundary.
- Resolve the effective role and record ownership from trusted session/database state. Never trust a role, agent_id, created_by, owner_id, is_admin, approval status, or other protected field supplied by a browser request without server-side validation.
- For update operations, explicitly protect immutable or privileged fields such as effective role, original Sales Agent attribution, visit actor, approval decision actor, and audit fields.
- Do not expose more cross-agent information than the requirements need. An agent may see the limited ownership/visit history necessary to prevent duplicates, but access to other agents' sensitive notes, customer documents, unrelated routes, or full case details must follow the existing verified permission model.
- A shared Admin/Back Office login can be authorized for office-wide work but cannot provide individual staff attribution. Never fabricate individual actor identities.
- Preserve all unrelated existing permissions and integrations. Do not broadly loosen policies to make a new screen work.
21.3 Row-Level Security policy inventory and design
For every relevant table and storage bucket, document the intended access for:
1. Anonymous/unauthenticated users.
2. Admin / Back Office.
3. Sales Agent A acting on their own records.
4. Sales Agent B attempting to access Agent A's records directly.
5. A user attempting to update ownership, role, assignment, approval, or audit fields.
At minimum, inspect applicable objects for users/profiles, leads, customers/contacts, businesses, cases, sales opportunities, supply points, routes, route stops, visits, follow-ups, workflow configuration, custom-field definitions and values, duplicate approval requests, documents/metadata, and any audit/activity tables that actually exist in the repository. This list is a review checklist, not an instruction to create missing tables blindly.
Use the existing database helper functions and policy conventions when correct. For each required new policy:
- Define explicit allowed operations and ownership/role predicates.
- Scope Sales Agent records to the authenticated agent and explicit assignments supported by the data model.
- Allow Admin/Back Office the office-wide functions confirmed in this specification.
- Prevent unauthorized creation of a lead on another agent's behalf, arbitrary reassignment, approval self-granting, role elevation, and modification of immutable history.
- Protect cross-table joins/views/RPCs so a permissive parent query does not leak restricted child records.
- Ensure inserts and updates are checked against both the old row and proposed row where the database supports such checks, so an agent cannot transfer a row into a scope they are not allowed to write.
- Review SECURITY DEFINER functions carefully: fix/search-path hardening and grants as required by the actual implementation; never grant execute to broader roles than needed.
- Do not apply a blanket policy or enable/force RLS across every table without checking current application dependencies, service jobs, triggers, and migration/test harness behavior.
- Do not disable or remove an existing policy solely to make a test pass. Explain and prove any policy change.
Any policy change must be delivered only as a staged additive SQL migration (per the project rules), include rollback instructions and be tested locally/PGlite or with the repository's supported RLS test harness. Do not apply it to staging or production.
21.4 Sensitive document and file security
Customer ID images, electricity bills, E9, meter photographs, contracts, contact details, and customer folders are sensitive.
- Keep storage private by default. Never solve an access error by making a bucket or object public.
- Check both metadata-row authorization and underlying object access. A secure CRM row with a publicly accessible file is still a security failure.
- Use the current signed-URL or authenticated-download pattern with short expiration and authorization at generation time, where supported.
- Validate file size and file type on the server, enforce an allowlist based on the actual business requirements, use safe object names/paths, and prevent users from overwriting another customer's/connection's files.
- Never store raw file contents, secrets, long-lived signed URLs, ID numbers, or other personal data in diagnostic logs.
- Do not expose full document URLs in list APIs when a secured document ID is sufficient.
- Ensure deletion/replacement behavior cannot orphan references, expose old files, or delete documents attached to another supply point.
- If malware scanning is unavailable, say so and document the residual limitation instead of claiming files are scanned.
21.5 Trusted server boundaries, input validation, and API protections
- Keep service-role/administrative keys, database passwords, map-provider secret keys, and identity-provider admin credentials server-side only. Do not ship them in client bundles, source maps, rendered HTML, public env variables, logs, or API responses.
- For every mutation/API/server action, perform authentication, authorization, schema validation, business-rule validation, and safe error mapping on the server.
- Use the repository's existing validation library/conventions; avoid duplicating conflicting validation schemas. Client validation may mirror server rules for usability but cannot replace them.
- Validate IDs, enums/status values, field types/options, uploaded file metadata, supply-number formats when provided, pagination/sort values, and nested/mass-assigned fields.
- Prevent SQL injection, unsafe dynamic filters, XSS through custom field values, open redirects, unauthorized object access/IDOR, request forgery where relevant to the stack, and unsafe URL fetching/SSRF if server-side integrations accept URLs.
- Apply existing or appropriately scoped rate limiting to sensitive endpoints such as account provisioning, authentication-related flows, duplicate approval submission, and expensive map/place-search requests. Do not add a dependency or infrastructure requirement without auditing the existing stack.
- Use idempotency or server-side duplicate guards for repeated lead/visit/account creation where appropriate; a double-click or retry must not silently create duplicate records.
- Avoid leaking database stack traces, policy definitions, provider secrets, account existence details, or private record contents through user-visible errors.
- Use structured, privacy-conscious logs with correlation/request IDs where supported, and ensure logs do not become a second database of sensitive customer data.
21.6 Database and secret safeguards
- Keep the existing RLS baseline and database grants intact; inspect every required change for least privilege.
- Ensure test fixtures and seeds use clearly synthetic data and never copy production personal data.
- Never print .env contents. Audit tracked files for accidentally committed secrets using available repository tooling and report findings without reproducing secret values.
- Inspect dependency audit tooling available to the project. Report vulnerabilities and avoid broad breaking dependency upgrades unless explicitly authorized and tested.
- Use staged SQL only for changes to schema, RLS, grants, policies, or database functions. Migrations must be additive, idempotent where supported, include rollback instructions, and receive local test coverage.
- Do not run SQL directly against staging or production, deploy, merge, or perform destructive account/data operations without explicit authorization for that action.
- Where practical and consistent with the current operational setup, document backup/restore expectations and identify whether restore has actually been tested. Never claim a backup is restorable without evidence.
21.7 Security test matrix — required evidence
Create or extend tests using the real project's supported test approach. Include both positive and negative cases:
- Anonymous user cannot read or mutate private CRM data.
- Sales Agent A can access their own assigned records according to current rules.
- Sales Agent B cannot read or mutate Agent A's private route, lead, follow-up, customer documents, custom-field values, or case by guessing/changing an identifier.
- Sales Agents cannot grant themselves a role, reassign someone else's records, approve their own duplicate request where approval belongs to Back Office, or access the identity provider's administrative API.
- Only Admin/Back Office can provision a Sales Agent account. A Sales Agent calling the same API/action directly receives a safe denial and creates no auth user/profile side effect.
- Public/self-service registration is disabled or the provider limitation and required operator action are explicitly reported. Hiding the UI button alone does not pass.
- Back Office can create/invite a Sales Agent through the trusted server flow and the resulting account has the correct Sales Agent effective role, no extra privileges, and an auditable creation event where supported.
- A client-supplied role=admin, is_admin=true, alternate agent_id, or crafted profile field cannot elevate or transfer privileges.
- Duplicate approval cannot be bypassed by calling the underlying mutation/API directly.
- Private documents remain inaccessible without authorization, including when a user knows an object path or metadata ID.
- RLS policy tests cover SELECT/INSERT/UPDATE/DELETE where the table supports those operations; check both old-row and new-row ownership/scope behavior.
- Custom-field definitions/options are validated, arbitrary executable content is not interpreted, and access follows the intended scope.
- Errors and logs do not reveal secrets or personal document contents.
Run the available unit, integration, RLS/database policy, API authorization, and browser smoke tests. If a category of tests is unavailable, report it as unverified and state the specific tooling/environment needed. A successful build alone does not pass the security review.
21.8 Security findings and release gate
Before describing the CRM as ready, provide a concise security report with:
- Surfaces/policies reviewed, named by actual table/function/bucket/route and actual file path.
- Existing vulnerabilities found and whether they were fixed, left unchanged, or require approval.
- Exact tests executed and results for both allowed and denied actions.
- Service/admin key locations verified as server-only (without printing values).
- Account provisioning and public registration state verified.
- RLS policy and storage access changes in staged migration files, with local test and rollback status.
- Any residual risks, provider limitations, or required manual console configuration.
Do not state “fully secure,” “fully protected,” or “all access is safe” unless a qualified, evidence-based review supports the exact bounded claim. Prefer clear claims such as “the tested policies prevent Agent B from accessing Agent A's private route in the covered API and database test cases.”
22. Role and account-management acceptance criteria
The role model is exactly two effective application roles: Admin / Back Office and Sales Agent. Team labels such as Field Sales/Inside Sales may remain metadata if they are needed by current features, but must not become additional effective authorization roles.
- The shared Admin/Back Office account is the only account type permitted to create/invite Sales Agent users.
- Account creation is performed only through an authenticated, authorized server-side flow that uses the current identity provider's administrative API safely.
- There is no public self-registration path for Sales Agents. Do not rely solely on hiding registration UI; verify provider behavior and server endpoints.
- The account-creation form cannot choose arbitrary roles. The server assigns the Sales Agent role itself.
- Sales Agents cannot create/invite users, modify roles, change protected profile fields, or call admin APIs even if they bypass the UI.
- If a provider admin key is necessary, it remains server-only and is not exposed to the browser.
- Preserve the existing identity provider, current users, historical actor fields, and compatibility with legacy roles. Do not delete stored role values or accounts without explicit approval.
- Test successful creation by Back Office, denied creation by Sales Agent, direct-endpoint abuse, duplicate email/account behavior according to the provider, and safe handling of identity-provider/database partial failures.
- Report the limitation of audit attribution for the shared Back Office login honestly.
23. Source-code delivery and repository-specific implementation
The requested deliverable is working code in the existing repository—not only a plan, mockup, sample snippet, generated screen, or disconnected scaffold.
When implementation is authorized:
1. Inspect the repository and current worktree, then follow the existing framework, language, package manager, lint rules, file conventions, UI primitives, auth provider, database client, API patterns, and test setup.
2. Trace each modified user action through the full code path: screen/component → form/hook/state → validation → API/server action/service → authorization → database/storage/provider → return type/error handling → cache/state refresh → tests.
3. Modify the real, connected files and their actual callers. Do not create a parallel application, pretend endpoints, placeholder service classes, sample-only components, or hardcoded successful API responses.
4. Define or update shared typed contracts and validation together. Update every caller when a real signature changes. Do not fabricate file paths, tables, API routes, or provider SDK interfaces before examining the code.
5. Add actual automated tests for business logic, API authorization, RLS/policies where the harness supports it, form behavior, and regression cases. Mock only external systems at the test boundary; do not ship test mocks as production implementations.
6. Create staged SQL migration files only when repository inspection proves new persistence is needed. Include additive SQL, RLS/grants, idempotency consistent with project conventions, rollback instructions, and local/PGlite tests where specified. Do not run migrations against shared environments.
7. Run the real project checks and verify actual UI screens at desktop and mobile sizes. Fix regressions introduced by the work.
8. Report actual changed files, code paths, database objects, API endpoints, authorization rules, test commands/results, and unimplemented items. Do not claim work is finished if only the frontend or only the backend is connected.
If the current execution gate permits only the staged Part B PR work or Phase One audit/report, do not generate or change implementation code outside that gate. Follow the active task instructions and stop at their required checkpoint.
Final instruction to Claude Code
Start by inspecting the existing repository, working tree, relevant task/PR instructions, and the complete UI-to-backend paths described above. Treat the existing code and database as the source of truth for architecture and present behavior; treat the screenshots as visual direction and the confirmed business rules in this prompt as the target behavior.
Follow the currently authorized execution phase exactly. If the active task says to finish a staged PR sequence first or to perform Phase One/audit only, obey that restriction and stop at the specified gate. Do not infer permission to implement, push, merge, deploy, apply migrations, or change shared environments from this master prompt alone.
When implementation is authorized, make focused, reviewable changes in the existing ATLAS CRM. Simplify the visual hierarchy, navigation, dashboard, Leads, and Customers screens; map every in-scope frontend screen to its real APIs/server actions, authorization policies, database/storage records, external integrations, and tests; implement only confirmed behavior; and preserve unrelated features and historical data.
The target is one cohesive, professional, Apple-inspired CRM with exactly two effective application roles (one shared Admin/Back Office login and individual Sales Agent accounts), configurable branching Field Sales outcomes, flexible non-linear Back Office case processing, daily multi-stop routes and manual check-in, visit history, secure duplicate approvals, global custom customer fields, and multiple residential/commercial electricity supply-point records per customer. Each connection must keep its own address, optional 11-digit Αριθμός Παροχής, separate physical meter details where applicable, tariff category/code, commercial tariff name, application/contract details, cases, and linked documents. Missing documents must show checklists/warnings and must never by themselves block stage transitions.
Only Admin/Back Office may create or invite Sales Agent accounts. Enforce this at the server and identity-provider boundary; public self-registration must not remain available for Sales Agents. Protect every relevant database table, view/function, storage bucket, and mutation with reviewed least-privilege authorization and RLS where supported, then test both allowed and denied cross-agent access. Keep all privileged credentials server-side. Report actual security evidence and residual risks rather than promising absolute security.
Do not invent business rules, fabricate data, build disconnected controls, weaken authentication/RLS, destroy or silently transform data, add unnecessary architecture/dependencies, or redesign unrelated areas. Inspect dependencies before changing shared code. Test the full relevant flows, report facts and uncertainties separately, and map the finished UI back to the actual connected code. The requested implementation deliverable is working, connected source code and tests in the existing repository, when the active execution gate authorizes implementation—not merely a mockup or proposal.
