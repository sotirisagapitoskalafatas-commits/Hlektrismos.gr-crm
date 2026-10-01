import LegalLayout, { a } from '@/components/LegalLayout';
import { COMPANY } from '@/lib/legal';

/* Landing page for the `unsubscribe` edge function redirect. The address is
   already on the suppression list when this renders. */
export default function Unsubscribed() {
  const invalid = window.location.hash.includes('status=invalid');
  return (
    <LegalLayout title={invalid ? 'Μη έγκυρος σύνδεσμος' : 'Η απεγγραφή ολοκληρώθηκε'} showUpdated={false}>
      {invalid ? (
        <p>Ο σύνδεσμος απεγγραφής δεν είναι έγκυρος ή έχει αλλοιωθεί. Στείλτε μας «απεγγραφή» στο <a href={`mailto:${COMPANY.email}`} style={a}>{COMPANY.email}</a> και θα σας αφαιρέσουμε αμέσως.</p>
      ) : (
        <p>Δεν θα λαμβάνετε πλέον email προσφορών ή ενημερώσεων από την {COMPANY.brand}. Η αλλαγή ισχύει αμέσως. Θα συνεχίσετε να λαμβάνετε μόνο απαραίτητα μηνύματα για αιτήματα που κάνετε εσείς (π.χ. επιβεβαίωση ραντεβού).</p>
      )}
    </LegalLayout>
  );
}
