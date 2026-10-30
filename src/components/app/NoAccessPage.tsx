import { useAuth } from '@/lib/auth';
import { LEGACY_ROLE_LABEL } from '@/lib/roles';

/* Shown instead of the CRM to an account whose role is a LEGACY identifier (manager / back_office): the profile and its
   history are preserved, but it holds no access. Nothing is converted or promoted here; an Admin decides that through
   staff administration. */
export default function NoAccessPage() {
  const { signOut } = useAuth();
  const onSignOut = () => { void signOut(); window.location.hash = '/'; };
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f7fa', color: '#1a2a40', padding: 24 }}>
      <div role="alert" style={{ maxWidth: 440, textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 12px' }}>Ο λογαριασμός δεν έχει πρόσβαση στο CRM</h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, margin: '0 0 20px' }}>
          Ο ρόλος αυτού του λογαριασμού ({LEGACY_ROLE_LABEL}) δεν υποστηρίζεται πλέον. Τα στοιχεία και το ιστορικό διατηρούνται.
          Επικοινωνήστε με τον διαχειριστή του γραφείου.
        </p>
        <button type="button" onClick={onSignOut} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #9fb0c8', background: '#fff', cursor: 'pointer', fontSize: 15 }}>
          Αποσύνδεση
        </button>
      </div>
    </div>
  );
}
