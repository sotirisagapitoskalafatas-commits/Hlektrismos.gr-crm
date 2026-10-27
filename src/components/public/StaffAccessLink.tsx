import '@/styles/landing.css';

/* Staff entrance, kept out of the customer navigation. It points at the existing login route (#/login in
   src/lib/router.ts); the login page itself keeps its own «authorised personnel only» explanation and access rules. */
export default function StaffAccessLink() {
  return (
    <div className="lp-chrome lp-staff">
      <span className="lp-staff__label">Για την ομάδα μας</span>
      <a href="#/login">Πρόσβαση προσωπικού</a>
    </div>
  );
}
