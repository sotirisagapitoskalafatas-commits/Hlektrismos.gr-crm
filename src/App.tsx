import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';

type Route = 'landing' | 'login' | 'dashboard';

function getRouteFromHash(): Route {
  const hash = window.location.hash.replace('#', '');
  if (hash === '/login') return 'login';
  if (hash === '/dashboard') return 'dashboard';
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

  return <LandingPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
