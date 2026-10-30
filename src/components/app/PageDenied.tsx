import { useNav } from '@/lib/nav';

/** Shown in place of a page the signed-in role may not open (direct address or programmatic navigation).
 *  The protected page itself is never mounted, so it cannot fetch anything. Home is open to every role with access. */
export default function PageDenied() {
  const { go } = useNav();
  return (
    <div role="alert" style={{ maxWidth: 440, margin: '96px auto', textAlign: 'center', padding: '0 16px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>Δεν έχετε πρόσβαση σε αυτή τη σελίδα</h1>
      <p style={{ fontSize: 14, opacity: 0.75, margin: '0 0 16px' }}>Η σελίδα δεν είναι διαθέσιμη για τον ρόλο σας.</p>
      <button type="button" onClick={() => go('home')} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid currentColor', background: 'transparent', cursor: 'pointer', fontSize: 14 }}>
        Επιστροφή στην Αρχική
      </button>
    </div>
  );
}
