# Wireframes: Field Visit workspace, Application wizard, Customer 360, Back Office queue

For review **before** the UI is built. Greek labels are the ones the screens will use; layout is indicative. Every screen has the five states: loading, empty, error, permission-denied, success. Desktop first columns collapse to one column below 640 px; touch targets ≥ 44 px; visible focus; no horizontal scroll.

Principles shown here: a **visit never needs a Case**; an **Application is not a Case**; a **Customer has many Supply Points, each with its own applications, documents and history**; missing documents are **work and warnings**, not blockers.

## 1. Field Visit workspace (extends «Ημέρα μου», reachable from the Map)

```
┌ Ημέρα μου ───────────────────────────────────────────── [+ Νέα επίσκεψη] ┐
│ ● Σε εξέλιξη (1)   ○ Σήμερα (4)   ○ Εκπρόθεσμες (2)   ○ Επόμενες   ○ Ολοκληρωμένες │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 10:30  Καφέ «Άστρο»   [Lead]  ·  Γνωριμία             ▸ Έτοιμη (στον χώρο)│ │
│ │        Παροχή: Γ21 · Λεωφ. Αθηνών 12                                    │ │
│ │        [Πλοήγηση] [Check In] [Επαναπρογραμματισμός] [Ακύρωση]            │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ ┌ 12:00  Μ. Παπαδοπούλου [Πελάτης] · Παροχή 2/3 · Case #1042 ──────────┐ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ Ένδειξη συγχρονισμού: ✓ συγχρονισμένο · ⏳ 1 σε αναμονή · ⚠ 0 απέτυχαν      │
└─────────────────────────────────────────────────────────────────────────┘
```
- Chips: **Lead / Πελάτης / Νέος υποψήφιος / Case** show what the visit is linked to. A visit with no Case simply has no Case chip.
- «Έτοιμη (στον χώρο)» is derived from time + position, never stored.
- Buttons by state: planned → Πλοήγηση, Check In, Επαναπρογραμματισμός, Ακύρωση, Δεν εμφανίστηκε; in progress → Check Out, σημείωση, φωτογραφία.

### 1a. Schedule a visit (sheet)
```
Νέα επίσκεψη
  Με ποιον;  (•) Υπάρχον Lead/Πελάτης  [ αναζήτηση… ]      ( ) Νέος υποψήφιος
             └ Νέος υποψήφιος: Όνομα* · Τηλέφωνο · Διεύθυνση  → «Έλεγχος διπλοτύπων»
               ⚠ «Υπάρχει ήδη Lead με αυτό το τηλέφωνο (δικό σας)  [Άνοιγμα]»
               ⚠ «Υπάρχει εγγραφή άλλου πωλητή  [Αίτημα ανάθεσης στο Back Office]»  (χωρίς στοιχεία)
  Παροχή (προαιρετικά): [ επιλογή / προσθήκη ]
  Ημερομηνία & ώρα* · Σκοπός · Σημειώσεις
  [Αποθήκευση]  [Ακύρωση]
```
Nothing is merged automatically. A prospect stays a prospect on the visit until the agent converts it to a Lead (the visit and its history stay attached).

### 1b. Check Out and outcome
```
Check Out · Καφέ «Άστρο»
  Αποτέλεσμα*:  ( ) Νέο Sale  ( ) Ενδιαφέρεται — συνέχεια  ( ) Follow-up από υπεύθυνο
                ( ) Δεν βρέθηκε/απών  ( ) Χωρίς πώληση ▾λόγος  ( ) Δεν ενδιαφέρεται ▾λόγος
  → Νέο Sale:        «Συνέχεια στην Αίτηση»  (ανοίγει τον οδηγό με Lead/Πελάτη + Παροχή προσυμπληρωμένα)
  → Follow-up:       Λόγος* · Υπεύθυνος* · Ημερομηνία*    (δημιουργεί follow-up χωρίς Case)
  → Από υπεύθυνο:    ουρά Admin / Back Office
  → Απών/μη επαφή:   «Νέα επίσκεψη» (επαναπρογραμματισμός)
  Σημειώσεις · Φωτογραφίες (αν επιτρέπεται)             [Ολοκλήρωση]
```

## 2. Application wizard (five steps; progress saved as a draft after every step)

```
Αίτηση ενεργειακής υπηρεσίας                    ① Πελάτης ─ ② Παροχή ─ ③ Υπηρεσία ─ ④ Έγγραφα ─ ⑤ Επιβεβαίωση
                                               [Αποθήκευση πρόχειρου]  «Αποθηκεύτηκε 14:32»
```
1. **Πελάτης:** search existing Customer / pick eligible Lead (chip shows the choice). «Νέος πελάτης» only appears when the search found nothing, with the duplicate check; a Lead is converted at submission, not here.
2. **Παροχή:** list of the customer's connections (usage, address, number, tariff, `⚠ Προς έλεγχο`) or «Προσθήκη παροχής» (Κατοικία/Επαγγελματική, διεύθυνση, 11ψήφιος αριθμός, μετρητής, τιμολόγιο). A duplicate number shows a warning, never a block. The history of the chosen supply (past applications, cases) is shown beside it.
3. **Υπηρεσία:** type from the configurable list; only that service's fields; provider / program / tariff only if known (free text, «Άγνωστο» is valid). No invented offers or prices.
4. **Έγγραφα:** checklist for the service (indicative, as everywhere in the CRM); each row: file name, type, version `v2 · τρέχουσα`, upload / «Νέα έκδοση», history popover (`v1 αντικαταστάθηκε 12/11`). Missing ones: ⚠ warning, the draft can still be saved/submitted.
5. **Επιβεβαίωση:** read-only summary (Πελάτης, Παροχή, Υπηρεσία, Έγγραφα n/m) → [Αποθήκευση πρόχειρου] [Υποβολή]. After submit: «Η αίτηση υποβλήθηκε. Επόμενο βήμα: το Back Office την ελέγχει.» + link to the Case and the timeline.

## 3. Customer 360 (inside the existing customer page)

```
┌ Μ. Παπαδοπούλου · Πελάτης ──────────────── Υπεύθυνος: Α. Πωλητής ─┐
│ [Επισκόπηση] [Παροχές (3)] [Αιτήσεις (2)] [Cases (2)] [Επισκέψεις] [Έγγραφα] [Δραστηριότητα] │
│ Παροχές:                                                              │
│  ▸ Κατοικία · Σόλωνος 5 · 12345678901 · Γ1     Αίτηση #A-2026-00012 (σε έλεγχο) · Case #1042 │
│  ▸ Κατάστημα · Ερμού 9  · —             ⚠ Προς έλεγχο  Αίτηση — · Case —               │
└──────────────────────────────────────────────────────────────────────┘
```
Documents and cases are grouped **by supply point** (never mixed). The timeline merges visits, applications, cases, follow-ups and documents with the actor shown as the *account* (the shared Admin login is never shown as a named employee).

## 4. Back Office «Αιτήσεις & επισκέψεις» queue (inside Διεκπεραίωση)

```
Φίλτρα: Όλα · Νέες υποβολές · Ελλιπή έγγραφα · Αιτήματα ανάθεσης · Follow-up υπεύθυνου · Επισκέψεις προς έλεγχο · Εκπρόθεσμα
┌ A-2026-00012 · Μ. Παπαδοπούλου · Κατοικία Σόλωνος 5 · Ενέργεια ──────────────┐
│ Υποβλήθηκε 14/11 από Α. Πωλητής · Έγγραφα 3/4 ⚠ λείπει: Λογαριασμός ρεύματος │
│ [Άνοιγμα αίτησης] [Case #1042] [Ζητήστε έγγραφα] [Σε επεξεργασία] [Απόρριψη…] │
└───────────────────────────────────────────────────────────────────────┘
```
Opening an application shows the customer, the supply point, the visits that led to it, the documents (with versions) and the Case, in one screen. The Case workflow below is unchanged.
