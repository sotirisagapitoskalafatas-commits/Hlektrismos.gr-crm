import { useState } from 'react';

/* Public confirmation page for an e-mailed offer (#/offer?lead_id=…&tariff_id=…&t=…). Opening the link changes nothing: the customer
   must press the button, which POSTs to the accept-offer Edge Function. The function decides everything; this page only shows the answer. */
type State = 'idle' | 'busy' | 'accepted' | 'already_accepted' | 'expired' | 'closed' | 'invalid' | 'not_found' | 'error';

const TEXT: Record<Exclude<State, 'idle' | 'busy'>, { title: string; body: string }> = {
  accepted: { title: 'Ευχαριστούμε!', body: 'Η αποδοχή καταχωρήθηκε. Θα επικοινωνήσουμε μαζί σας σύντομα.' },
  already_accepted: { title: 'Η προσφορά έχει ήδη γίνει αποδεκτή', body: 'Θα επικοινωνήσουμε μαζί σας σύντομα.' },
  expired: { title: 'Ο σύνδεσμος έχει λήξει', body: 'Παρακαλώ ζητήστε νέα προσφορά από τον υπάλληλό σας.' },
  closed: { title: 'Η προσφορά δεν είναι πλέον διαθέσιμη', body: 'Παρακαλώ επικοινωνήστε με τον υπάλληλό σας.' },
  invalid: { title: 'Μη έγκυρος σύνδεσμος', body: 'Παρακαλώ ζητήστε νέα προσφορά από τον υπάλληλό σας.' },
  not_found: { title: 'Η προσφορά δεν βρέθηκε', body: 'Παρακαλώ ζητήστε νέα προσφορά από τον υπάλληλό σας.' },
  error: { title: 'Κάτι πήγε στραβά', body: 'Δεν καταχωρήθηκε καμία αποδοχή. Δοκιμάστε ξανά σε λίγο.' },
};

export default function OfferAccept() {
  const [state, setState] = useState<State>('idle');
  const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');

  const accept = async () => {
    setState('busy');
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept-offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: q.get('lead_id'), tariff_id: q.get('tariff_id'), t: q.get('t') }),
      });
      const { state: next } = await res.json() as { state?: string };
      setState(next && next in TEXT ? next as State : 'error');
    } catch {
      setState('error');
    }
  };

  const shown = state === 'idle' || state === 'busy' ? null : TEXT[state];
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f7fa', color: '#1a2a40', padding: 24 }}>
      <div role="status" style={{ maxWidth: 440, textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 12px' }}>{shown ? shown.title : 'Επιβεβαίωση αποδοχής προσφοράς'}</h1>
        {shown
          ? <p style={{ fontSize: 15, lineHeight: 1.5 }}>{shown.body}</p>
          : <button type="button" disabled={state === 'busy'} onClick={() => void accept()} style={{ padding: '12px 28px', fontSize: 16, borderRadius: 8, border: '1px solid #9fb0c8', background: '#fff', cursor: 'pointer' }}>Αποδέχομαι την προσφορά</button>}
      </div>
    </div>
  );
}
