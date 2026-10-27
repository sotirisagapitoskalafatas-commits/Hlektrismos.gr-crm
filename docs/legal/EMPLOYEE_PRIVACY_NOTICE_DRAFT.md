# Ενημέρωση προσωπικού για την επεξεργασία δεδομένων στο CRM (ΣΧΕΔΙΟ)

**Status: internal draft. Not published, not approved.** Greek labour/privacy counsel must review this before it is given to staff. It replaces the staff paragraph that was removed from the public Privacy Policy on 27 Oct 2026.

Every item below is taken from the repository. Items marked **[owner]** need a decision or confirmation from the company.

## Υπεύθυνος επεξεργασίας
HLEKTRISMOS.GR ΜΟΝΟΠΡΟΣΩΠΗ Ι.Κ.Ε., Ζαλοκώστα 8, Αθήνα, Τ.Κ. 10671, ΑΦΜ 801198034, Αρ. ΓΕΜΗ 151552422000, info@hlektrismos.gr.

## Ποια δεδομένα του προσωπικού επεξεργάζεται το CRM
- **Λογαριασμός:** email, όνομα, ρόλος (Back Office ή Πωλητής), κατάσταση διαθεσιμότητας. Οι λογαριασμοί δημιουργούνται μόνο από διαχειριστή.
- **Δραστηριότητα:** ενέργειες στο CRM (π.χ. αλλαγές σε αιτήματα, πελάτες, έγγραφα), με το αναγνωριστικό του λογαριασμού που τις έκανε. Ο κοινός λογαριασμός Back Office δεν δείχνει ποιος υπάλληλος έκανε κάθε ενέργεια.
- **Επισκέψεις πεδίου:** θέση GPS τη στιγμή του check-in/check-out σε επίσκεψη και οι διαδρομές που σχεδιάζονται. **[owner]** Πόσο ακριβής είναι η θέση, αν καταγράφεται και εκτός επισκέψεων (ο κώδικας δείχνει μόνο check-in/check-out) και ποιος τη βλέπει.
- **Συσκευή:** ο browser αποθηκεύει τη σύνδεση στο CRM, προτιμήσεις οθόνης και ουρά ενεργειών εκτός σύνδεσης.

## Σκοποί και νομική βάση **[counsel]**
Οργάνωση της εργασίας, ανάθεση αιτημάτων και επισκέψεων, ασφάλεια και έλεγχος πρόσβασης. Τη νομική βάση (π.χ. σύμβαση εργασίας/έργου, έννομο συμφέρον) και την αναλογικότητα της καταγραφής θέσης πρέπει να τις αξιολογήσει δικηγόρος.

## Αποδέκτες
Οι πάροχοι φιλοξενίας, βάσης δεδομένων και χαρτών/δρομολόγησης που χρησιμοποιεί το CRM (εσωτερικός κατάλογος: `PROCESSORS` στο `src/lib/legal.ts`).

## Διατήρηση **[owner + counsel]**
Δεν έχει οριστεί περίοδος. Χρειάζεται απόφαση για λογαριασμούς, ιστορικό ενεργειών και δεδομένα θέσης/διαδρομών, καθώς και μηχανισμός διαγραφής, που σήμερα δεν υπάρχει.

## Δικαιώματα
Πρόσβαση, διόρθωση, διαγραφή, περιορισμός, εναντίωση, φορητότητα, με τους όρους του νόμου, στο info@hlektrismos.gr. Καταγγελία στην ΑΠΔΠΧ (www.dpa.gr).

## Internal security issue (not for the notice)
Staff-entered AI API keys are stored in plain browser `localStorage` (`DashboardPage.tsx`, `LeadDetailSlideout.tsx`, `CrmAiAssistantWidget.tsx`). Move them server-side. This is tracked separately from the legal text.
