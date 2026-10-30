/** Shown in place of a page the signed-in role may not open (direct address or programmatic navigation).
 *  The protected page itself is never mounted, so it cannot fetch anything. */
export default function PageDenied() {
  return (
    <div role="alert" style={{ maxWidth: 440, margin: '96px auto', textAlign: 'center', padding: '0 16px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>Δεν έχετε πρόσβαση σε αυτή τη σελίδα</h1>
      <p style={{ fontSize: 14, opacity: 0.75, margin: '0 0 16px' }}>Η σελίδα δεν είναι διαθέσιμη για τον ρόλο σας.</p>
      <a href="#/" style={{ fontSize: 14, textDecoration: 'underline' }}>Επιστροφή στην Αρχική</a>
    </div>
  );
}
