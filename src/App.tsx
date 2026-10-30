import { AuthProvider, useAuth } from '@/lib/auth';
import { hasAccess } from '@/lib/roles';
import NoAccessPage from '@/components/app/NoAccessPage';
import { DeviceProvider } from '@/lib/device-context';
import { useRoute } from '@/lib/router';
import { NavProvider } from '@/lib/nav';
import { ToastProvider } from '@/lib/toast';
import { lazy, Suspense } from 'react';
import { JarvisWidget } from '@/components/jarvis/JarvisWidget';
import ConsentBanner from '@/components/ConsentBanner';
// Each route is its own chunk: a visitor on the website does not download the CRM, and a signed-in user does not download the website.
const LandingPage = lazy(() => import('@/pages/LandingPage'));
const LoginPage = lazy(() => import('@/components/LoginPage'));
const ResetPasswordPage = lazy(() => import('@/components/auth/ResetPasswordPage'));
const AppShell = lazy(() => import('@/components/app/AppShell'));
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const ServicesPage = lazy(() => import('@/pages/ServicesPage'));
const EnergyPage = lazy(() => import('@/pages/EnergyPage'));
const FaqPage = lazy(() => import('@/pages/FaqPage'));
const ContactPage = lazy(() => import('@/pages/ContactPage'));
const TermsOfUse = lazy(() => import('@/pages/TermsOfUse'));
const PrivacyPolicy = lazy(() => import('@/pages/PrivacyPolicy'));
const Cookies = lazy(() => import('@/pages/Cookies'));
const CopyrightPolicy = lazy(() => import('@/pages/CopyrightPolicy'));
const Unsubscribed = lazy(() => import('@/pages/Unsubscribed'));

const routeFallback = (
  <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fff', color: '#5a7090' }} role="status">Φόρτωση...</div>
);

function AppContent() {
  const [route, navigate] = useRoute();
  const { session, loading, profile, profileReady } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fff', color: '#5a7090' }}>
        Φόρτωση...
      </div>
    );
  }

  // Protect the CRM OS shell — redirect to login if not signed in.
  if (route === 'app' && !session) {
    navigate('login');
    return null;
  }

  // If already signed in and on login page, go straight to the shell.
  if (route === 'login' && session) {
    navigate('app');
    return null;
  }

  switch (route) {
    case 'login':
      return <LoginPage />;
    case 'reset':
      return <ResetPasswordPage />;
    case 'app':
      // The role is unknown until the profile lookup finishes: show nothing of the CRM meanwhile (no default role is assumed).
      if (!profileReady) return routeFallback;
      // Only an Admin / Back Office or Sales Agent profile reaches the CRM shell. A legacy manager / back_office profile, an
      // unknown role or an account with no profile row holds no access (profile and history are kept, nothing is converted).
      return hasAccess(profile?.role) ? <AppShell /> : <NoAccessPage />;
    case 'about':
      return <AboutPage />;
    case 'services':
      return <ServicesPage />;
    case 'energy':
      return <EnergyPage />;
    case 'faq':
      return <FaqPage />;
    case 'contact':
      return <ContactPage />;
    case 'terms':
      return <TermsOfUse />;
    case 'privacy':
      return <PrivacyPolicy />;
    case 'cookies':
      return <Cookies />;
    case 'copyright':
      return <CopyrightPolicy />;
    case 'unsubscribed':
      return <Unsubscribed />;
    default:
      return <LandingPage />;
  }
}

export default function App() {
  // The public visitor chatbot is for the website only; inside the CRM staff use Atlas AI (top bar).
  const [route] = useRoute();
  return (
    <DeviceProvider>
      <AuthProvider>
        <NavProvider>
          <ToastProvider>
            <Suspense fallback={routeFallback}><AppContent /></Suspense>
            {route !== 'app' && <JarvisWidget />}
          </ToastProvider>
        </NavProvider>
      </AuthProvider>
      <ConsentBanner />
    </DeviceProvider>
  );
}