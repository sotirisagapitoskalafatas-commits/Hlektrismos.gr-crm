import { useEffect } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;

export function getLenis(): Lenis | null {
  return lenis;
}

/**
 * Smooth-scrolls to an element (or the top) through the active Lenis instance,
 * falling back to native scrolling when Lenis is not mounted (e.g. CRM routes).
 */
export function scrollToTarget(target: string | number | HTMLElement, immediate = false): void {
  if (lenis) {
    lenis.scrollTo(target, { immediate, offset: typeof target !== 'number' && typeof target !== 'function' ? -76 : 0 });
    return;
  }
  if (typeof target === 'number') {
    window.scrollTo(0, target);
  } else if (typeof target === 'string') {
    document.getElementById(target.replace(/^#/, ''))?.scrollIntoView();
  }
}

const HEADER_OFFSET = -76;

/**
 * Mounts a Lenis smooth-scroll instance for the landing page.
 *
 * - Anchor links pointing at in-page ids are intercepted and scrolled via Lenis.
 * - Anchor links starting with "#/" are hash *routes* (#/dashboard, #/login, ...)
 *   and are deliberately left untouched so the router keeps working.
 * - The render loop is driven by the GSAP ticker and ScrollTrigger is kept in
 *   sync on every Lenis scroll event.
 */
export function useLenis(): void {
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const instance = new Lenis({
      duration: prefersReducedMotion ? 0 : 1.15,
      anchors: false,
      touchMultiplier: 1.4,
    });
    lenis = instance;

    const raf = (time: number) => {
      instance.raf(time * 1000);
    };
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    instance.on('scroll', ScrollTrigger.update);

    const onDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      // Only plain "#id" anchors; never intercept hash routes like "#/dashboard".
      if (!href || !href.startsWith('#') || href.startsWith('#/') || href === '#') return;
      const destination = document.getElementById(href.slice(1));
      if (!destination) return;
      event.preventDefault();
      instance.scrollTo(destination, { offset: HEADER_OFFSET });
    };
    document.addEventListener('click', onDocumentClick);

    return () => {
      document.removeEventListener('click', onDocumentClick);
      instance.off('scroll', ScrollTrigger.update);
      gsap.ticker.remove(raf);
      gsap.ticker.lagSmoothing(0);
      instance.destroy();
      lenis = null;
    };
  }, []);
}
