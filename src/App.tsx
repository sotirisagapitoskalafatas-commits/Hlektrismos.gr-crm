import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import AboutPage from '@/pages/AboutPage';
import ServicesPage from '@/pages/ServicesPage';
import EnergyPage from '@/pages/EnergyPage';
import FaqPage from '@/pages/FaqPage';
import ContactPage from '@/pages/ContactPage';

type Route = 'landing' | 'login' | 'dashboard' | 'about' | 'services' | 'energy' | 'faq' | 'contact';

function getRouteFromHash(): Route {
  const hash = window.location.hash.replace('#', '');
  if (hash === '/login') return 'login';
  if (hash === '/dashboard') return 'dashboard';
  if (hash === '/about') return 'about';
  if (hash === '/services') return 'services';
  if (hash === '/energy') return 'energy';
  if (hash === '/faq') return 'faq';
  if (hash === '/contact') return 'contact';
  return 'landing';
}

function Router() {
  const { session, loading } = useAuth();
  const [route, setRoute] = useState<Route>(getRouteFromHash());

  useEffect(() => {
    const onHashChange = () => setRoute(getRouteFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fff', color: '#5a7090' }}>Φόρτωση...</div>;
  }

  if (route === 'login') {
    return <LoginPage />;
  }

  if (route === 'dashboard') {
    if (!session) {
      window.location.hash = '/login';
      return <LoginPage />;
    }
    return <DashboardPage />;
  }

  if (route === 'about') return <AboutPage />;
  if (route === 'services') return <ServicesPage />;
  if (route === 'energy') return <EnergyPage />;
  if (route === 'faq') return <FaqPage />;
  if (route === 'contact') return <ContactPage />;

  return <LandingPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
      <Analytics />
    </AuthProvider>
  );
}
