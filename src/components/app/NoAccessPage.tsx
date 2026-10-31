import { useAuth } from '@/lib/auth';
import { LEGACY_ROLE_LABEL, hasAccess } from '@/lib/roles';

/* Shown instead of the CRM to an account that holds no access: a LEGACY role identifier (manager / back_office), an unknown
   role, or no profile row yet. The profile and its history are preserved. Nothing is converted or promoted here; an Admin
   decides that through staff administration. */
export default function NoAccessPage() {
  const { signOut, profile, refreshProfile } = useAuth();
  const legacy = !!profile?.role && !hasAccess(profile.role);
  const onSignOut = () => { void signOut(); window.location.hash = '/'; };
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f7fa', color: '#1a2a40', padding: 24 }}>
      <div role="alert" style={{ maxWidth: 440, textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 12px' }}>Ο λογαριασμός δεν έχει πρόσβαση στο CRM</h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, margin: '0 0 20px' }}>
          {legacy
            ? `Ο ρόλος αυτού του λογαριασμού (${LEGACY_ROLE_LABEL}) δεν υποστηρίζεται πλέον. Τα στοιχεία και το ιστορικό διατηρούνται.`
            : 'Ο λογαριασμός δεν έχει ενεργό ρόλο στο CRM.'}{' '}
          Επικοινωνήστε με τον διαχειριστή του γραφείου.
        </p>
        {!legacy && (
          <button type="button" onClick={() => void refreshProfile()} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #9fb0c8', background: '#fff', cursor: 'pointer', fontSize: 15, marginRight: 8 }}>
            Δοκιμάστε ξανά
          </button>
        )}
        <button type="button" onClick={onSignOut} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #9fb0c8', background: '#fff', cursor: 'pointer', fontSize: 15 }}>
          Αποσύνδεση
        </button>
      </div>
    </div>
  );
}
