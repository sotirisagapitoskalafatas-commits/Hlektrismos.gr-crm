// The Supabase Auth e-mails of ATLAS CRM. Each entry: the Dashboard / Management-API field names, the Greek subject, the preview line, the content, the plain text,
// and the template variables THAT template supports (checked by a test, because Supabase does not share variables between templates:
// {{ .NewEmail }} only in «Change email address», {{ .OldEmail }} only in «Email address changed», {{ .FactorType }} only in the MFA notifications).
// The action link is ALWAYS the exact {{ .ConfirmationURL }} Supabase provides: it is never rebuilt, shortened or hard-coded.
import { button, code, details, heading, layout, notice, paragraph } from './components.mjs';

const URL_VAR = '{{ .ConfirmationURL }}';
const IGNORE = 'Αν δεν ζητήσατε εσείς αυτή την ενέργεια, αγνοήστε αυτό το μήνυμα. Δεν θα γίνει καμία αλλαγή.';

export const AUTH_TEMPLATES = [
  {
    key: 'confirmation', subjectField: 'mailer_subjects_confirmation', contentField: 'mailer_templates_confirmation_content', variables: ['.ConfirmationURL', '.Email'],
    subject: 'ATLAS — Επιβεβαίωση διεύθυνσης email', preheader: 'Επιβεβαιώστε τη διεύθυνση email του νέου λογαριασμού σας.',
    title: 'Επιβεβαίωση email', lead: 'Για να ολοκληρωθεί η δημιουργία του λογαριασμού σας στο ATLAS CRM, επιβεβαιώστε τη διεύθυνση {{ .Email }}.',
    action: { label: 'Επιβεβαίωση email', url: URL_VAR }, notice: 'Αν δεν δημιουργήσατε εσείς λογαριασμό, αγνοήστε αυτό το μήνυμα.',
  },
  {
    key: 'invite', subjectField: 'mailer_subjects_invite', contentField: 'mailer_templates_invite_content', variables: ['.ConfirmationURL', '.Email'],
    subject: 'ATLAS — Πρόσκληση στο CRM', preheader: 'Σας προσκάλεσαν στο ATLAS CRM. Ορίστε τον κωδικό σας.',
    title: 'Πρόσκληση στο ATLAS CRM', lead: 'Σας προσκάλεσαν να χρησιμοποιήσετε το ATLAS CRM με τη διεύθυνση {{ .Email }}. Πατήστε το κουμπί και ορίστε τον κωδικό πρόσβασής σας για να ενεργοποιήσετε τον λογαριασμό.',
    action: { label: 'Αποδοχή πρόσκλησης', url: URL_VAR }, notice: 'Αν δεν περιμένατε αυτή την πρόσκληση, αγνοήστε το μήνυμα.',
  },
  {
    key: 'magic_link', subjectField: 'mailer_subjects_magic_link', contentField: 'mailer_templates_magic_link_content', variables: ['.ConfirmationURL', '.Email'],
    subject: 'ATLAS — Σύνδεσμος σύνδεσης', preheader: 'Ο μοναδικός σας σύνδεσμος για σύνδεση στο ATLAS CRM.',
    title: 'Σύνδεση στο ATLAS CRM', lead: 'Πατήστε το κουμπί για να συνδεθείτε με τη διεύθυνση {{ .Email }}. Ο σύνδεσμος λήγει σύντομα και χρησιμοποιείται μία φορά.',
    action: { label: 'Σύνδεση', url: URL_VAR }, notice: 'Αν δεν ζητήσατε εσείς σύνδεση, αγνοήστε αυτό το μήνυμα.',
  },
  {
    key: 'recovery', subjectField: 'mailer_subjects_recovery', contentField: 'mailer_templates_recovery_content', variables: ['.ConfirmationURL', '.Email'],
    subject: 'ATLAS — Επαναφορά κωδικού πρόσβασης', preheader: 'Ζητήθηκε επαναφορά του κωδικού του λογαριασμού σας.',
    title: 'Επαναφορά κωδικού', lead: 'Λάβαμε αίτημα επαναφοράς του κωδικού πρόσβασης για τον λογαριασμό {{ .Email }}. Πατήστε το κουμπί για να ορίσετε νέο κωδικό.',
    action: { label: 'Ορισμός νέου κωδικού', url: URL_VAR }, notice: 'Αν δεν ζητήσατε εσείς επαναφορά, αγνοήστε το μήνυμα: ο κωδικός σας δεν αλλάζει αν δεν πατήσετε τον σύνδεσμο.',
  },
  {
    // Sent to BOTH addresses while Secure email change is on, so the wording must be true for each of them.
    key: 'email_change', subjectField: 'mailer_subjects_email_change', contentField: 'mailer_templates_email_change_content', variables: ['.ConfirmationURL', '.Email', '.NewEmail'],
    subject: 'Ασφάλεια λογαριασμού ATLAS — Επιβεβαίωση αλλαγής email', preheader: 'Ζητήθηκε αλλαγή της διεύθυνσης σύνδεσης του λογαριασμού σας.',
    title: 'Επιβεβαίωση αλλαγής email', lead: 'Λάβαμε αίτημα αλλαγής της διεύθυνσης σύνδεσης του λογαριασμού σας στο ATLAS CRM.',
    rows: [['Νέα διεύθυνση email', '{{ .NewEmail }}'], ['Τρέχουσα διεύθυνση σύνδεσης', '{{ .Email }}']],
    after: 'Η αλλαγή ολοκληρώνεται μόνο όταν επιβεβαιωθεί και από τις δύο διευθύνσεις (τρέχουσα και νέα). Έως τότε συνεχίζετε να συνδέεστε με την τρέχουσα.',
    action: { label: 'Επιβεβαίωση νέου email', url: URL_VAR },
    notice: 'Εάν δεν ζητήσατε αυτή την αλλαγή, μην επιβεβαιώσετε το αίτημα. Επικοινωνήστε με τον υπεύθυνο διαχείρισης του λογαριασμού σας.',
  },
  {
    key: 'reauthentication', subjectField: 'mailer_subjects_reauthentication', contentField: 'mailer_templates_reauthentication_content', variables: ['.Token'],
    subject: 'ATLAS — Κωδικός επαλήθευσης {{ .Token }}', preheader: 'Ο κωδικός επαλήθευσης για την ενέργεια που ζητήσατε.',
    title: 'Κωδικός επαλήθευσης', lead: 'Χρησιμοποιήστε τον παρακάτω κωδικό για να επιβεβαιώσετε την ταυτότητά σας. Λήγει σύντομα.', code: '{{ .Token }}',
    notice: 'Μην μοιραστείτε αυτόν τον κωδικό με κανέναν. Το ATLAS δεν θα τον ζητήσει ποτέ τηλεφωνικά.',
  },
  {
    key: 'password_changed', subjectField: 'mailer_subjects_password_changed_notification', contentField: 'mailer_templates_password_changed_notification_content', notification: 'mailer_notifications_password_changed_enabled', variables: ['.Email'],
    subject: 'ATLAS — Ο κωδικός πρόσβασης άλλαξε', preheader: 'Ο κωδικός του λογαριασμού σας άλλαξε πρόσφατα.',
    title: 'Ο κωδικός πρόσβασης άλλαξε', lead: 'Ο κωδικός πρόσβασης του λογαριασμού {{ .Email }} άλλαξε πρόσφατα.',
    notice: 'Αν δεν κάνατε εσείς αυτή την αλλαγή, επαναφέρετε αμέσως τον κωδικό σας και ενημερώστε τον υπεύθυνο διαχείρισης.',
  },
  {
    key: 'email_changed', subjectField: 'mailer_subjects_email_changed_notification', contentField: 'mailer_templates_email_changed_notification_content', notification: 'mailer_notifications_email_changed_enabled', variables: ['.Email', '.OldEmail'],
    subject: 'ATLAS — Η διεύθυνση email του λογαριασμού άλλαξε', preheader: 'Η αλλαγή email του λογαριασμού σας ολοκληρώθηκε.',
    title: 'Η αλλαγή email ολοκληρώθηκε', lead: 'Η διεύθυνση σύνδεσης του λογαριασμού σας στο ATLAS CRM άλλαξε.',
    rows: [['Προηγούμενη διεύθυνση', '{{ .OldEmail }}'], ['Νέα διεύθυνση σύνδεσης', '{{ .Email }}']],
    notice: 'Αν δεν κάνατε εσείς αυτή την αλλαγή, επικοινωνήστε αμέσως με τον υπεύθυνο διαχείρισης του λογαριασμού σας.',
  },
  {
    key: 'mfa_enrolled', subjectField: 'mailer_subjects_mfa_factor_enrolled_notification', contentField: 'mailer_templates_mfa_factor_enrolled_notification_content', notification: 'mailer_notifications_mfa_factor_enrolled_enabled', variables: ['.FactorType'],
    subject: 'ATLAS — Προστέθηκε μέθοδος επαλήθευσης', preheader: 'Μια νέα μέθοδος επαλήθευσης προστέθηκε στον λογαριασμό σας.',
    title: 'Προστέθηκε μέθοδος επαλήθευσης', lead: 'Στον λογαριασμό σας προστέθηκε μέθοδος επαλήθευσης σύνδεσης.', rows: [['Τύπος', '{{ .FactorType }}']],
    notice: 'Αν δεν κάνατε εσείς αυτή την αλλαγή, επικοινωνήστε αμέσως με τον υπεύθυνο διαχείρισης.',
  },
  {
    key: 'mfa_unenrolled', subjectField: 'mailer_subjects_mfa_factor_unenrolled_notification', contentField: 'mailer_templates_mfa_factor_unenrolled_notification_content', notification: 'mailer_notifications_mfa_factor_unenrolled_enabled', variables: ['.FactorType'],
    subject: 'ATLAS — Αφαιρέθηκε μέθοδος επαλήθευσης', preheader: 'Μια μέθοδος επαλήθευσης αφαιρέθηκε από τον λογαριασμό σας.',
    title: 'Αφαιρέθηκε μέθοδος επαλήθευσης', lead: 'Από τον λογαριασμό σας αφαιρέθηκε μέθοδος επαλήθευσης σύνδεσης.', rows: [['Τύπος', '{{ .FactorType }}']],
    notice: 'Αν δεν κάνατε εσείς αυτή την αλλαγή, επικοινωνήστε αμέσως με τον υπεύθυνο διαχείρισης.',
  },
];

export const renderHtml = (t) => layout({
  title: t.title, preheader: t.preheader,
  body: [heading(t.title), paragraph(t.lead), t.rows ? details(t.rows) : '', t.code ? code(t.code) : '', t.after ? paragraph(t.after) : '', t.action ? button(t.action.url, t.action.label) : '', notice(t.notice)].filter(Boolean).join('\n'),
});

/** Plain text for senders that can carry it (the hosted Supabase Auth templates carry HTML only). */
export const renderText = (t) => [
  'HLEKTRISMOS · ATLAS CRM', '', t.title.toUpperCase(), '', t.lead, '',
  ...(t.rows ? [...t.rows.map(([k, v]) => `${k}: ${v}`), ''] : []),
  ...(t.code ? [`Κωδικός: ${t.code}`, ''] : []),
  ...(t.after ? [t.after, ''] : []),
  ...(t.action ? [`${t.action.label}: ${t.action.url}`, ''] : []),
  `Ασφάλεια: ${t.notice}`, '', '--', 'HLEKTRISMOS', 'ATLAS CRM', 'Ασφαλής διαχείριση επαγγελματικών δεδομένων.', '',
].join('\n');
