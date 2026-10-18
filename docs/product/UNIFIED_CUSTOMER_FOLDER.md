# Unified customer folder («Φάκελος πελάτη») — audit and proposal

**Status:** proposal for review (Part A). No code, no database change, nothing applied.
**Scope of the audit:** the three detail screens as they are on `main` (commit `ece2034`):
- `src/components/leads/LeadDetail.tsx` (Lead)
- `src/components/app/CaseDetailPage.tsx` with `src/components/cases/CaseOverview.tsx` (Case)
- `src/components/customers/CustomerDetail.tsx` (Customer)

I read the code and the database functions they call. I did not look at live data.

## Why one person shows up three times

When an office user converts a lead, `convert_lead_to_case` (migration `20260909200000`):
1. finds or creates a **customer**;
2. creates a **case** for that customer;
3. marks the **lead** as «Μετατράπηκε».

All three records remain, and each has its own screen:
- **Leads → lead**: «Επιστροφή στα leads»
- **Cases → case**: «Επιστροφή στα cases»
- **Πελάτες → customer**: «Επιστροφή στους πελάτες»

They are reached from different menus and show different data. Contact details are also copied, not shared. The lead keeps its own phone, email and address, and the customer gets a copy. Editing one does not change the other.

---

## 1. Inventory: what each screen shows today

| | **Lead detail** | **Case detail** | **Customer detail** |
|---|---|---|---|
| **Reached from** | Leads list | Cases list, Home, My Work, Λειτουργίες, a lead's «Άνοιγμα Case» | Πελάτες list; the case's «Προφίλ πελάτη →» |
| **Back link** | «Επιστροφή στα leads» | «Επιστροφή στα cases» | «Επιστροφή στους πελάτες» |
| **Header: name** | lead name | customer name (falls back to case title) | customer name |
| **Header: badge** | lead status (Νέο, Επικοινωνία, … **Μετατράπηκε**) | case stage (Νέο … Ολοκληρώθηκε) + priority | **none** |
| **Header: subtitle** | «Lead · Ενέργεια · Υπεύθυνος: … / Χωρίς υπεύθυνο» | «Case CS-… · Ρεύμα · πηγή · από 12/10» | «Πελάτης · πόλη · από 12/10 · 1 ενεργά από 1 cases» |
| **Header: value** | — | value, or «Χωρίς καταχωρημένη αξία» | — (only in «Με μια ματιά») |
| **Header: actions** | Διαγραφή (trash), Επεξεργασία, status dropdown | — (no delete) | Διαγραφή (trash), Επεξεργασία |
| **Tabs** | **none** (one long page) | Ιστορικό · Follow Ups · Έγγραφα · Επισκέψεις · Προσφορές · Υπογραφές · Back Office (BO only) | Σύνοψη · Cases · Έγγραφα · Ιστορικό |
| **Progress** | — | 9-step stepper «Πορεία» + stage buttons | per case row: «Αίτηση · βήμα 4 από 9» |
| **Contact block** | «Στοιχεία» (11 fields) + «Επικοινωνία» (phone, email, address) | «Στοιχεία επαφής» card with pencil edit + «Προέλευση · Lead» | «Επικοινωνία» (phone, email, address, notes) |
| **Edit contact** | lead edit form (in the Leads page); hidden after conversion | pencil: edits **customer** (full name only) + case address; **errors ignored** | customer form; first/last name once phase4/11 is applied |
| **Consent block** («Επικοινωνία & συγκαταθέσεις») | yes | **no** | yes |
| **Next action** | «Προτεινόμενη ενέργεια» (suggestion; «Τίποτα δεν γίνεται αυτόματα») | «Επόμενη ενέργεια» card + «Επόμενες ενέργειες» list | «Επόμενο βήμα» (from the most urgent case) |
| **History** | lead's `activity_log` only | that case's `timeline_events`, team filter, add-entry box | events of all the customer's cases, comms types only, read-only; **no lead events** |
| **Documents** | «Αρχεία από τη φόρμα» (website files) | full checklist + upload + website files | read-only list across cases |
| **Follow-ups** | — (not possible: `follow_ups.case_id` is required) | tab, create / complete / later | only «Επόμενο follow-up» in a summary |
| **Visits / Offers / Signatures** | — | tabs | — |
| **Convert** | «Μετατροπή σε Case» (suggested action) | — | — |
| **Link to the others** | «Σχετικό Case → Άνοιγμα Case» (no customer link) | «Προφίλ πελάτη →», lead source text (no lead link) | case rows (no lead link) |
| **Wording** | «Lead», «Case» | «Case», «Follow Ups», English panel labels («Timeline», «Offers», «Signatures», «Field sales», «Back office») | «Πελάτης», «cases» |
| **Width** | 1040 px | 1120 px | 1040 px |

---

## 2. Proposed model: one «Φάκελος πελάτη»

### What it is
One screen per **person or business**, the customer folder. Everything about that person lives in it: the lead it came from, all cases, documents, history, follow-ups, visits, offers, signatures and Back Office work.

Each folder has one consistent header and the same tabs. Only what a role may not see is hidden.

### Header (same everywhere)
- avatar initials, **name**, **phone** (tap to call), **email**
- **one status badge**, computed and never typed in:

| Badge | When |
|---|---|
| **Lead** | not converted yet (no customer record) |
| **Case σε εξέλιξη** | at least one case that is not Ολοκληρώθηκε / Χάθηκε / Ακυρώθηκε |
| **Πελάτης** | no open case and at least one case Ολοκληρώθηκε (active supply) |
| **Ολοκληρωμένο** | shown on a **case** card when that case is completed. For the folder, see question 3 in section 5 |

- subtitle: πόλη · υπεύθυνος (the next-action owner of the open case) · «από 12/10»
- actions: Επεξεργασία στοιχείων (one form, writes the customer record) · Διαγραφή (only where it is allowed: see bugs B5/B6)

### Tabs (same order everywhere)
**Σύνοψη · Cases · Έγγραφα · Ιστορικό · Follow-ups · Επισκέψεις · Προσφορές · Υπογραφές · Back Office**

- **Σύνοψη**:
  - the next action of the most urgent open case;
  - the stepper of the selected case;
  - contact details;
  - consent block;
  - «Με μια ματιά»;
  - origin («Από lead · Ιστοσελίδα · 12/10»).
- **Cases**: one row per case, with progress. Selecting a case scopes the next five tabs (Επισκέψεις … Back Office) to it. With one case, it is preselected.
- **Έγγραφα**: the checklist and upload for the selected case. Below it: documents of other cases, and the website-form files.
- **Ιστορικό**: **one timeline**. It merges the lead's events (`activity_log`) and all cases' events (`timeline_events`), each labelled «Lead» or «CS-2026-006». Team filter and add-entry stay.
- **Follow-ups, Επισκέψεις, Προσφορές, Υπογραφές**: same lists as today. New items go to the selected case.
- **Back Office**: only for roles that have it today, unchanged in content.

### Before and after conversion
- **Stays separate (before conversion):**
  - the **Leads list**;
  - lead-only actions: change lead status, «Μετατροπή σε Case», edit lead, Διαγραφή lead;
  - routing to Back Office.

  An unconverted lead opens as a folder with badge **Lead**. Tabs that need a case (Cases, Follow-ups, Επισκέψεις, Προσφορές, Υπογραφές, Back Office) show «Διαθέσιμο μετά τη μετατροπή σε Case» instead of being missing.
- **After conversion:** opening the lead **redirects to the customer folder**. A one-line notice says «Το lead μετατράπηκε στις 14/10 — εδώ συνεχίζεται η εργασία». The lead's own data stays visible, read-only, in Σύνοψη → «Προέλευση» and in Ιστορικό.
  - In the Leads list, a converted row says «Μετατράπηκε → Φάκελος» and opens the folder.
  - No second copy offers status changes, delete or suggested actions.
- **Shared:** the header, contact details (one record: the customer), the consent block, history, documents and the next action.
- **Cases** keep their own address (the supply point can differ from the customer's address) and their own stepper, owner and value.

### Wireframe (desktop, folder with one open case)

```
← Πελάτες
┌──────────────────────────────────────────────────────────────────────────────┐
│ (ΤΤ)  Test Test                     [Case σε εξέλιξη]      [Επεξεργασία] [⋯] │
│       ☎ 6900000000   ✉ test@example.gr   Αθήνα · Υπεύθυνος: Εύα · από 12/10  │
└──────────────────────────────────────────────────────────────────────────────┘
 Σύνοψη | Cases 1 | Έγγραφα 3 | Ιστορικό 12 | Follow-ups 1 | Επισκέψεις | Προσφορές | Υπογραφές | Back Office
┌───────────────────────────────────────────────┐ ┌──────────────────────────┐
│ ✦ Επόμενη ενέργεια                            │ │ Στοιχεία επαφής        ✎ │
│ Έλεγχος εγγράφων — λείπει: Ταυτότητα (πίσω)   │ │ ☎ 6900000000             │
│ Case CS-2026-006 · Back Office                │ │ ✉ test@example.gr        │
│ [Ανέβασμα εγγράφου]  [Παράδοση]               │ │ ⌂ Οδός 1, Αθήνα          │
├───────────────────────────────────────────────┤ ├──────────────────────────┤
│ Πορεία · CS-2026-006 Ρεύμα   Βήμα 6 από 9     │ │ Επικοινωνία &            │
│ ●─●─●─●─●─◉─○─○─○                             │ │ συγκαταθέσεις            │
│ Νέο … Έλεγχος εγγράφων … Ολοκληρώθηκε         │ ├──────────────────────────┤
├───────────────────────────────────────────────┤ │ Προέλευση                │
│ Επόμενες ενέργειες                            │ │ Lead · Ιστοσελίδα · 12/10│
│ • Follow-up αύριο 10:00 — Υπενθύμιση εγγράφων │ │ μετατροπή 14/10          │
└───────────────────────────────────────────────┘ └──────────────────────────┘
```

Phone width: the header stacks, the tabs scroll sideways, and the right column moves under the left one.

---

## 3. Inconsistency bugs found

Severity: **H** = wrong data or a privacy risk; **M** = confusing or misleading; **L** = cosmetic.

### Data and logic
| # | Sev. | Where | What |
|---|---|---|---|
| D1 | **H** | `convert_lead_to_case` + website form | A website lead without an email is stored with the placeholder `not-provided@hlektrismos.local` (`LandingPage.tsx:547` and the `insert_website_lead` functions). Conversion then reuses a customer by exact phone **or email**. So two different people who both left the email blank are joined to **the same customer record**: the second person's case appears in the first person's folder, and the customer page shows the first person's name. The fix is SQL (ignore the placeholder, compare normalised phones) and needs approval as a staged migration. I recommend a read-only count on live first, only with your authorization. |
| D2 | M | conversion | Phones are compared as typed. «6900000000» and «+30 690 000 0000» create two customers for one person. |
| D3 | M | Lead ↔ Customer | Contact details are copied at conversion and then drift. Editing the customer does not update the lead, and the reverse is also true. |
| D4 | M | Case → «Στοιχεία επαφής» → save | The pencil save ignores errors. A failed save closes the form as if it worked. It also writes only the full name, while the Customer page writes first and last name once phase4/11 is applied. |
| D5 | M | Case → Επισκέψεις → Προγραμματισμός | The planner's **own current GPS position** is saved as the visit's «Σημείο συνάντησης». An office user who plans a visit records the office location. |
| D6 | L | Case → Ιστορικό | The team filter uses the event's `role`, but the grey label uses the activity type's team. An event can be labelled «Σύστημα» yet appear under the «Back Office» filter. |

### History wording and duplicates
| # | Sev. | Where | What |
|---|---|---|---|
| W1 | M | Case & Customer → Ιστορικό | Raw English stage codes: «Στάδιο: new → contacted» (`updateCase` in `api.ts:531–535`), instead of «Νέο → Επικοινωνία». |
| W2 | M | Case & Customer → Ιστορικό | One stage change writes **2–4 entries**: «Στάδιο: x → y», then «Ενημέρωση Case» with the same text, plus «Σημείωση αλλαγής σταδίου» when a note is typed, plus «Μετάβαση με ελλείψεις εγγράφων» in warn mode. Completing a case writes «Case ολοκληρώθηκε», «Ενημέρωση Case» and «Σχόλιο ολοκλήρωσης». The proposal is one entry per change, with the note and any missing documents in its description. |
| W3 | M | Lead → Ιστορικό | Unknown action codes are shown raw. The staged functions write `trashed`, `restored`, `routed_to_backoffice` and contact-eligibility actions to the lead's log, and these would appear as English codes. Only `status_change`, `converted`, `updated` and `created` are translated. |
| W4 | L | Case → Ιστορικό | Tab «Ιστορικό», panel «Χρονολόγιο», small label «Timeline»: three names for one thing. |

### Developer text shown to users
| # | Sev. | Where | What |
|---|---|---|---|
| T1 | M | Consent block (Lead, Customer) | «Ο έλεγχος επικοινωνίας ενεργοποιείται μετά την εφαρμογή της migration phase3/09 (εκκρεμεί έγκριση).» Proposal: hide the block until the capability exists, or show «Ο έλεγχος συγκαταθέσεων δεν είναι ακόμη διαθέσιμος.» |
| T2 | M | Stage errors, trash, B2B, Back Office assignee, gate modes, exceptions | The same «…migration phase2/06 / phase2/07 / phase3/08 / phase4/12 / phase4/13 (εκκρεμεί έγκριση)» pattern (`case-return.ts:52`, `trash.ts:45`, `b2b.ts:37`, `lead-intake.ts:26/35`, `api.ts:586/601`). For staff users, use one neutral sentence: «Η λειτουργία δεν είναι ακόμη ενεργή.» Keep the technical detail only in Διαχείριση → Ασφάλεια/Κατάσταση for admins. |
| T3 | L | Case → Back Office | «Κατάσταση αίτησης: {raw value}»: the application and activation status are shown as stored. |

### Labels and wording
| # | Sev. | Where | What |
|---|---|---|---|
| L1 | M | Stage names | Two label sets exist. The stepper and history use «Έλεγχος εγγράφων», «Καταχώρηση παρόχου» (`case-flow.ts`). Lists, filters and dialogs use «Έλεγχος Εγγράφων», «Καταχώρηση Παρόχου» (`roles.ts STAGES`). Proposal: one set (sentence case). The new Back Office button message already uses the stepper set. |
| L2 | L | Case → Πορεία | The stepper's text reads «4Αίτηση», «5Υπογραφή»: the step number and label sit side by side with no separator. This shows when the text is copied, read by a page reader, or exported. Proposal: a visually hidden «Βήμα 4: » for readers, and no bare number in the text. |
| L3 | M | Lead header (converted) | A converted lead still shows «Διαγραφή», «Χωρίς υπεύθυνο» and a «Προτεινόμενη ενέργεια» card, plus a second «Σχετικό Case» card that does the same thing. |
| L4 | L | Customer header | «1 ενεργά από 1 cases»: wrong agreement (1 ενεργό) and English «cases». Proposal: «1 ενεργό case» / «2 ενεργά από 3 cases» → «Cases: 1 σε εξέλιξη · 2 ολοκληρωμένα». |
| L5 | L | Customers list | The same count is written «1 ενεργά / 1», a third wording. |
| L6 | L | Case → Προσφορές | Offer status is shown raw: «draft», «sent», «accepted», «rejected». |
| L7 | L | Case → Υπογραφές | Signature status is shown raw: «captured», «received», «verified». |
| L8 | L | Case tabs and panels | «Follow Ups» (tab and title) vs «Follow-ups» / «follow-up» elsewhere. English panel labels: «Timeline», «Follow ups», «Offers», «Signatures», «Field sales», «Back office». |
| L9 | L | Lead status vs case stage | Both start with «Νέο» and both have «Επικοινωνία», but they mean different things (lead status vs case stage). In one folder the badge must not repeat them; see the badge rule in section 2. |
| L10 | L | Case → Back Office | Document chips use monospace, upper-case Greek («ΤΑΥΤΟΤΗΤΑ — ΕΜΠΡΟΣ ΟΨΗ»), unlike every other document list. |

### Missing or uneven features
| # | Sev. | Where | What |
|---|---|---|---|
| B1 | M | Case | No consent block on the case, which is the screen where most calls start. |
| B2 | M | Customer → Ιστορικό | Shows only the cases' events (with the duplicates of W2), and none of the lead's. You cannot see where the customer came from or what happened before conversion. |
| B3 | L | Customer → Έγγραφα | Read-only, with no checklist. You must open each case to see what is missing. |
| B4 | L | Links | Lead → Case exists. Case → Lead exists only as text, and Customer → Lead does not exist at all. |
| B5 | M | Lead (converted) → Διαγραφή | The lead can be moved to the Κάδος while its case stays live. The case then shows «Προέλευση · Lead» for a lead the user can no longer open. Proposal: no delete on a converted lead (the folder is deleted, or not, as a whole). |
| B6 | L | Case | No delete or Κάδος for a case, while lead and customer have one. This may be intended (cases close as Χάθηκε/Ακυρώθηκε), but the folder should say so. |

---

## 4. «Freedom to configure customer folders»: options, not built

**What is configurable today (already delivered):**
- required documents per service (`document_requirements`, admin-writable, staged 07);
- document gate per stage, warn or block (07);
- the default Back Office assignee (12);
- case exceptions (13).

There is **no** configuration of folder tabs, sections or fields. **Everything below is an extension and needs a change request.**

| | (a) Show/hide and reorder tabs and sections per role | (b) Custom fields per customer type (energy, insurance, web) | (c) Folder templates per service |
|---|---|---|---|
| **What the user can do** | An admin opens Διαχείριση → «Φάκελος πελάτη» and, per role, ticks which tabs and Σύνοψη sections are visible and drags their order. Permissions are **not** changed: a role still cannot see what RLS hides. | An admin defines extra fields per type (e.g. energy: «Αρ. παροχής», «Τιμολόγιο»; insurance: «Λήξη συμβολαίου»; web: «Domain»), each with a type (text, number, date, list, yes/no), required or not, and order. Staff fill them in a «Στοιχεία» section of the folder or case. | An admin creates a template per service: which tabs, which custom fields, which documents and stages apply. A new case of that service uses it. |
| **Database change (additive only)** | One row in the existing `crm_settings` (`folder_layout` JSON per role). **No new table**, admin-write policy only. | New table `custom_field_definitions` (service, key, label, type, options, required, sort, active). New column `cases.custom_fields jsonb default '{}'` (and `customers.custom_fields` for person-level fields). A validation function checks values against the definitions. RLS: staff read, admin write. | New table `folder_templates` (service, tabs, field keys, document set). It references (a) and (b) and the existing `document_requirements`. |
| **Effort** | **2–3 days** (settings UI, folder reads layout, tests) | **6–9 days** (definitions admin UI, form renderer, validation in the database, history entries, reports/export, tests) | **4–6 days** on top of (a) and (b) |
| **Risks** | Hiding a tab can hide a blocker («I never saw the missing document»). Mitigation: the next-action card is always shown. | Field sprawl and duplicate fields. Values that reports and filters cannot use without more work. Data minimisation (GDPR): every new personal field needs a purpose. Renaming or deleting a field already holding data. | It depends on (a) and (b), so mistakes multiply. Changing a template while cases are open needs a rule (the old template stays on old cases). |
| **Scope** | Extension: change request | Extension: change request | Extension: change request |

**Recommended minimal first step:**
1. Deliver Part B, the unified folder with fixed tabs and the wording fixes (in scope: it fixes delivered screens).
2. Then do **(a) only**, using the existing `crm_settings` table. It is the smallest change (2–3 days, no new table) and it shows what each role really needs.
3. Decide on (b) after Mr. Fitros answers the questions below, starting with **one** service.

---

## 5. Questions for Mr. Fitros

1. **Who configures?** Only the admin, or also a manager per team? Should changes be logged (who changed the layout and when)?
2. **Per role or per service?** Should Field Sales and Back Office see different tabs, different services see different fields, or both?
3. **Status names:** are «Lead / Case σε εξέλιξη / Πελάτης / Ολοκληρωμένο» the right four? What should the folder say when every case was lost or cancelled?
4. **How many folder types?** Energy (ρεύμα, αέριο), solar, insurance, web: which exist today, and which in the next 6 months?
5. **Which extra fields** does each type really need (name, type, required or not)? Who fills each one: Sales, Field or Back Office?
6. **One person, many cases:** can one customer have an energy case and an insurance case at the same time? Should they appear in one folder?
7. **Businesses:** is a business (ΑΦΜ, ΓΕΜΗ, contact person) one folder with several people, or one folder per contact?
8. **Delete:** may anyone other than the admin remove a lead that was converted? Should cases ever go to the Κάδος, or only close as Χάθηκε/Ακυρώθηκε?
9. **Duplicates:** when the same phone or email comes in again, should the system join the person to the existing folder automatically, or ask the user first?
10. **Visibility:** should Field Sales see offers and Back Office notes, or only their own visits and documents?
11. **Reports:** must custom fields appear in reports and exports from day one?

---

## Next step

Approve, change or reject Part A. Part B (UI unification and wording bugs, with tests, no database change and no configuration feature) starts only after approval.

D1 is a database fix and is **not** part of Part B: it needs a staged migration that you approve separately.

---

## Status 18/10/2026 — queue item 6
The **Case** screen now uses the same folder layout and tabs as the Lead and the Customer (`folderTabs()` in `src/lib/folder.ts`, one list, one order): **Σύνοψη · Παροχές · Έγγραφα · Υποθέσεις · Ιστορικό**, then the case tabs Follow-ups · Επισκέψεις · Προσφορές · Υπογραφές · Back Office (Back Office only for the roles that have it). Only the badge (here the case stage) and the actions differ. The old «Cases» tab is now **«Υποθέσεις»** and «Έγγραφα» comes before it. Width is 1040 px everywhere. On the case, Σύνοψη holds what used to sit above the tabs (progress, next step, contact, consent); «Παροχές» and «Υποθέσεις» are the customer's connections and cases.
