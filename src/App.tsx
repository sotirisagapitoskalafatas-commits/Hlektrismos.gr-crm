import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { DeviceProvider } from '@/lib/device-context';
import { useRoute } from '@/lib/router';
import { NavProvider } from '@/lib/nav';
import { ToastProvider } from '@/lib/toast';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/components/LoginPage';
import AppShell from '@/components/app/AppShell';
import AboutPage from '@/pages/AboutPage';
import ServicesPage from '@/pages/ServicesPage';
import EnergyPage from '@/pages/EnergyPage';
import FaqPage from '@/pages/FaqPage';
import ContactPage from '@/pages/ContactPage';
import TermsOfUse from '@/pages/TermsOfUse';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import Cookies from '@/pages/Cookies';

function AppContent() {
  const [route, navigate] = useRoute();
  const { session, loading } = useAuth();

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
    case 'app':
      return <AppShell />;
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
    default:
      return <LandingPage />;
  }
}

export default function App() {
  return (
    <DeviceProvider>
      <AuthProvider>
        <NavProvider>
          <ToastProvider>
            <AppContent />
          </ToastProvider>
        </NavProvider>
      </AuthProvider>
      <SpeedInsights />
    </DeviceProvider>
  );
}