import LegalLayout, { a, h2, ul } from '@/components/LegalLayout';
import { COMPANY } from '@/lib/legal';

/* Copyright notices. Deliberately procedure-neutral: no US DMCA agent is
   registered and no Greek/EU notice-and-action procedure (e.g. DSA art. 16)
   has been confirmed by counsel, so the page states only how to reach us and
   what to include. Do not add deadlines, sworn statements, counter-notice or
   repeat-infringer rules without legal sign-off. */
export default function CopyrightPolicy() {
  const mail = `mailto:${COMPANY.copyrightEmail}?subject=${encodeURIComponent('Ειδοποίηση παραβίασης πνευματικών δικαιωμάτων')}`;
  return (
    <LegalLayout title="Πολιτική Πνευματικών Δικαιωμάτων">
      <p>Σεβόμαστε τα πνευματικά δικαιώματα τρίτων και αναμένουμε το ίδιο από όσους ανεβάζουν αρχεία στις υπηρεσίες μας (π.χ. λογαριασμούς ρεύματος, έγγραφα, φωτογραφίες).</p>

      <h2 style={h2}>1. Αναφορά παραβίασης</h2>
      <p>Αν θεωρείτε ότι περιεχόμενο που είναι διαθέσιμο μέσω των υπηρεσιών μας προσβάλλει δικαιώματά σας, στείλτε μας αναφορά στο <a href={mail} style={a}>{COMPANY.copyrightEmail}</a> με:</p>
      <ul style={ul}>
        <li>τα στοιχεία επικοινωνίας σας,</li>
        <li>περιγραφή του έργου ή του δικαιώματος που θεωρείτε ότι προσβάλλεται,</li>
        <li>τη θέση του επίμαχου υλικού (URL ή άλλη ακριβή περιγραφή),</li>
        <li>σύντομη εξήγηση του λόγου της αναφοράς.</li>
      </ul>
      <p>Θα εξετάσουμε την αναφορά σύμφωνα με το εφαρμοστέο δίκαιο.</p>

      <h2 style={h2}>2. Επικοινωνία</h2>
      <p>{COMPANY.legalName}, {COMPANY.address}<br />
        Τηλ.: {COMPANY.phone} · Email: <a href={mail} style={a}>{COMPANY.copyrightEmail}</a></p>
    </LegalLayout>
  );
}
