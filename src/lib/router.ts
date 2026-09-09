import { useEffect, useState } from 'react';

export type Route = 'landing' | 'login' | 'app' | 'about' | 'services' | 'energy' | 'faq' | 'contact' | 'terms' | 'privacy' | 'cookies';

const PAGE_HASHES: Record<string, Route> = {
  '/login': 'login',
  '/app': 'app',
  '/dashboard': 'app',
  '/about': 'about',
  '/services': 'services',
  '/energy': 'energy',
  '/faq': 'faq',
  '/contact': 'contact',
  '/terms': 'terms',
  '/privacy': 'privacy',
  '/cookies': 'cookies',
};

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => {
    const hash = window.location.hash.slice(1);
    return PAGE_HASHES[hash] ?? 'landing';
  });

  useEffect(() => {
    const handler = () => {
      const next = PAGE_HASHES[window.location.hash.slice(1)];
      if (next) {
        setRoute(next);
        // Page swaps must jump instantly (Lenis drives smooth scrolling elsewhere).
        window.scrollTo(0, 0);
      } else {
        // Non-slash hashes are in-page anchors (landing sections) — keep landing and let them scroll.
        setRoute('landing');
      }
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const navigate = (r: Route) => {
    if (r === 'landing') {
      window.location.hash = '';
    } else if (r === 'app') {
      window.location.hash = '/dashboard';
    } else {
      window.location.hash = `/${r}`;
    }
    setRoute(r);
    window.scrollTo(0, 0);
  };

  return [route, navigate];
}