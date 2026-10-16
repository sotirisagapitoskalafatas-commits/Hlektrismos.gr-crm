# Role model: from five roles to two

**Status:** proposal. No code, no SQL.

**Requirement (client):**
1. **Γραφείο (Admin / Back Office):** one office user who does everything.
2. **Πωλητής (Sales agent):** many users.

**Today** the app and the database know **five** roles:
- `admin`: Διαχειριστής
- `manager`: Διευθυντής
- `inside_sales`: Inside Sales
- `field_sales`: Field Sales
- `back_office`: Back Office

The database allows exactly these values (`profiles_role_check`, migrations `20260908180000` / `20260909120000`). Role values appear about 200 times in live SQL, 150 times in staged SQL and 230 times in the app.

## 1. Proposed mapping

| Today | Becomes | Why |
|---|---|---|
| `admin` | **Γραφείο** | already has every permission, including the Back Office tab, user management and settings |
| `back_office` | **Γραφείο** (move the user to `admin`) | the office user must also manage users and settings, which `back_office` cannot |
| `manager` | **Γραφείο**, or kept as a hidden supervisor role | see question Q2 |
| `inside_sales` | **Πωλητής** | the agent calls, makes offers, converts leads |
| `field_sales` | **Πωλητής** | the same agent visits, checks in, collects signatures |

## 2. Two paths

### Path A (recommended): keep the old values in the database; collapse them in screens and permissions
- **Database:** no schema change. The office user's row gets `role = 'admin'` (one data update, done by an admin through «Χρήστες»). Agents keep `inside_sales` or `field_sales`. New agents are created as `field_sales`, the canonical value for «Πωλητής». `manager` and `back_office` stay valid but unused.
- **App:** one function maps a stored role to a **display role** (`office` | `sales`). Every screen, menu and permission check uses the display role:
  - `ROLES` shows two labels;
  - `PERMS` becomes the table in §3;
  - `navForRole` uses the two roles;
  - the role picker in «Χρήστες» offers two choices, which write `admin` / `field_sales`.
- **Edge functions:** they read capabilities from `crm_settings.role_permissions`. The rows for `inside_sales` and `field_sales` must be made identical (a settings change).
- **Effort:** about 3–4 days (map function, permissions, menus, handover/return wording, «Υπεύθυνη ομάδα», tests).
- **Risk:** low.
  - Reversible: the stored values never change for agents.
  - Two stored values mean the same thing, so reports grouped by stored role must use the display role. One place, tested.

### Path B: change the database to two values
- **Database:** new values (e.g. `office`, `sales`) in `profiles_role_check`. All rows are migrated. **Every** `is_role(...)` and `role in (...)` is rewritten: about 200 occurrences in live migrations, plus about 150 in the staged files (05, 06, 07, 08, 09, 10, 12, 13). The `role_permissions` settings, the edge-function guard and the RLS policies change too.
- **Non-additive:** the constraint change, the data migration and the rewritten policies need a maintenance window and a full rollback script.
- **Effort:** about 8–12 days, including re-testing every policy.
- **Risk:** high.
  - One missed `is_role('back_office')` silently denies or allows the wrong user.
  - Every staged file must be rewritten **before** it is applied.

**Recommendation: Path A.** It meets the requirement on screen and in permissions, needs no schema change, and keeps every staged file valid. Path B can still follow later, once nothing depends on the old values.

## 3. New permissions table (display roles)

| Action | Γραφείο | Πωλητής |
|---|---|---|
| Leads: see, create, edit, convert to Case | ✔ | ✔ (scope: Q1) |
| Cases: create, edit, log call / email / SMS / WhatsApp / note | ✔ | ✔ |
| Offers: create, send | ✔ | ✔ |
| Follow-ups: create, complete | ✔ | ✔ |
| Visits: plan, check in / out, photos, meeting | ✔ | ✔ |
| Customer signature | ✔ | ✔ |
| Upload document | ✔ | ✔ |
| **Verify** document | ✔ | — |
| Application, submission to provider | ✔ | — |
| Change stage | ✔ any allowed move | ✔ only sales stages (Νέο → Υπογραφή) + handover to the office |
| Assign / hand over | ✔ | ✔ only to the office or to themselves |
| Return for correction (07) | ✔ | — |
| Override document gate (07) | ✔ | — |
| Κάδος: move, restore (06) | ✔ | — |
| Κάδος: permanent delete (06) | ✔ | — |
| Users, settings, document rules, gate modes | ✔ | — |
| Reports, revenue | ✔ | own figures only (Q3) |
| Διεκπεραίωση (Back Office queue) | ✔ | — |
| Ημέρα μου, Χάρτης | ✔ | ✔ |

## 4. What changes in the screens
- **Menu:** Γραφείο sees everything. Πωλητής sees:
  - Αρχική, Η εργασία μου, Follow-ups;
  - Leads, Πελάτες, Cases;
  - Ημέρα μου, Χάρτης, Πάροχοι;
  - Λογαριασμός, Προτιμήσεις.

  Today a field agent has no «Leads» and an inside agent has no «Ημέρα μου»; after the change one agent has both.
- **«Υπεύθυνη ομάδα»** (`teamForStage` in `case-flow.ts`):
  - Νέο, Επικοινωνία, Προσφορά, Υπογραφή → **Πωλητής**: the case's agent, i.e. `field_sales_owner`, else `inside_sales_owner`;
  - Αίτηση, Έλεγχος εγγράφων, Καταχώρηση παρόχου, Ενεργοποίηση → **Γραφείο**.

  Labels «Inside Sales / Field Sales / Back Office» become «Πωλητής / Γραφείο».
- **Handover dialog:** today the team choice is Inside / Field / Back Office. It becomes «Στο Γραφείο» or «Σε πωλητή» (pick the agent).
- **Νέο Sale handover** (`field-handover.ts`): unchanged, except that with one office user the "default Back Office assignee" (12) is simply that user (see §5).
- **Home / My Work:** the per-role dashboards (`InsideSalesDashboard`, field, back office) merge into two.
- **«Χρήστες»** (Admin centre): two role choices. The manager-only branches of the matrix are hidden.

## 5. Effect on the staged SQL (Path A)

| File | Effect under Path A | Change needed before applying? |
|---|---|---|
| **05** staff admin | Matrix: `admin` manages every role (the office user). The manager / back_office branches go unused. "Last active admin" protection: the office user cannot deactivate themselves. **Good**, but there must be a second admin account for emergencies (Q5) | **No** |
| **06** Κάδος | admin/manager move to and restore from the Κάδος; admin purges. The office user does all three; agents none (as in §3) | No |
| **07** guard + return | The transition guard is role-free, so no change. **Return** is allowed for `back_office`/admin/manager, so the office user (admin) can. `p_to_team` must still be `inside_sales` or `field_sales`: the app sends `field_sales` when the case has a field owner, else `inside_sales`. The screen just says «στον πωλητή» | **No SQL change**; the app maps the team |
| **08** B2B | Review: admin / manager / back_office, so the office user can. Distribution goes to "active Inside or Field Sales agents", i.e. every Πωλητής | No |
| **10** check-in review | admin / manager / back_office, so the office user can | No |
| **12** default Back Office assignee | **Requires `role = 'back_office'`**, so an `admin` office user is refused | **Yes, decide:** (a) a one-line staged change so the assignee may be `admin` or `back_office`; or (b) skip 12, since with one office user every routed lead goes to that user anyway |
| **13** exception | any active staff member may set it, so the office user and agents can (role-free) | No (decide in the app whether agents should) |
| **RLS today** | Live policies use mostly `is_staff()`: **every agent sees every lead, case and customer**. That doesn't change under either path. Scoping each agent to their own records is a separate, additive RLS change (Q1) | — |

## 6. Decide before applying 05 and 07
1. **Path A or B.** Under B, 05, 07, 08, 10, 12 and 13 must be rewritten first.
2. **Which stored role the office user gets**: `admin` (recommended). Moving the current `back_office` account to `admin` is a user-management action, recorded in the 05 audit.
3. **Is there a second admin for emergencies?** 05 protects the last active admin, but a single person on holiday is a single point of failure.
4. **Return for correction (07):** confirm it goes "back to the agent who owns the case". This is the app-side mapping above.
5. **12:** accept `admin` as the default assignee (one-line staged change), or skip 12.
6. **Agent visibility (Q1):** this doesn't block 05 or 07, but it decides whether a later RLS change is needed.

## 7. Questions for Mr. Fitros
- **Q1.** Should an agent see **all** leads, cases and customers, or only their own (plus unassigned leads)?
- **Q2.** Do you need a supervisor view (yourself) separate from the office user, e.g. reports without settings? If yes, keep `manager` as a third, hidden role.
- **Q3.** Should agents see reports or revenue for their own work, or none?
- **Q4.** May an agent move a case backwards, or close it as Χάθηκε / Ακυρώθηκε, or only the office?
- **Q5.** Who is the second admin account for emergencies?
- **Q6.** Are external partners («Συνεργάτης» on the lead) users of the CRM, or only a name on the record?
