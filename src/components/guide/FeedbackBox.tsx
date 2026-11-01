// «Αναφορά προβλήματος»: there is no server for this. The note is checked locally (no email, phone, ID or key-looking text) and copied; the person sends it to the Admin.
import { useState } from 'react';
import { GUIDE_VERSION } from '@/guide/library';
import { KINDS, buildReport, canCopy, sensitive } from '@/guide/feedback';
import type { FeedbackKind } from '@/guide/feedback';
import type { GuideRole } from '@/guide/markdown';

export default function FeedbackBox({ guideId, role, onClose }: { guideId: string | null; role: GuideRole; onClose: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>('wrong');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const problems = sensitive(note);
  const ok = canCopy(note);
  const copy = async () => {
    const text = buildReport({ kind, guideId, role, version: GUIDE_VERSION, note });
    try { await navigator.clipboard.writeText(text); setCopied('ok'); } catch { setCopied('fail'); }
  };
  return (
    <section className="ui-card gd-card-lg" aria-label="Αναφορά προβλήματος" style={{ marginTop: 14 }}>
      <h3>Αναφορά προβλήματος με τον οδηγό</h3>
      <p className="gd-note">Δεν αποθηκεύεται ούτε στέλνεται πουθενά από το CRM. Γράψτε τι δεν πάει καλά, αντιγράψτε το και στείλτε το στον Admin / Back Office. <strong>Μη γράψετε κωδικούς, ονόματα ή στοιχεία πελατών.</strong></p>
      <label className="gd-label" htmlFor="gd-fb-kind">Είδος</label>
      <select id="gd-fb-kind" className="gd-select" value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind)}>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
      <label className="gd-label" htmlFor="gd-fb-note">Τι συνέβη;</label>
      <textarea id="gd-fb-note" className="gd-textarea" value={note} maxLength={1000} onChange={(e) => { setNote(e.target.value); setCopied(null); }} aria-describedby="gd-fb-problems" />
      <div id="gd-fb-problems" aria-live="polite">{problems.map((p) => <p key={p} className="gd-note" style={{ color: '#7a1913' }}>{p} Αφαιρέστε το για να συνεχίσετε.</p>)}</div>
      <div className="gd-row">
        <button className="atx-btn atx-btn-primary" disabled={!ok} onClick={copy}>Αντιγραφή αναφοράς</button>
        <button className="atx-btn atx-btn-quiet" onClick={onClose}>Κλείσιμο</button>
        {copied === 'ok' && <span className="gd-note" role="status">Αντιγράφηκε. Στείλτε το στον Admin / Back Office.</span>}
        {copied === 'fail' && <span className="gd-note" role="status">Η αντιγραφή δεν ήταν δυνατή. Επιλέξτε και αντιγράψτε το κείμενο χειροκίνητα.</span>}
      </div>
    </section>
  );
}
