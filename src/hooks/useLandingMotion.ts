import { useLayoutEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

type MotionScope = { current: HTMLElement | null };

/**
 * Shared scroll reveal system for the public landing page.
 * Content has normal visible styles by default; reveal states are applied only when JS runs
 * and are skipped entirely for prefers-reduced-motion.
 */
export function useLandingMotion(scopeRef: MotionScope) {
  useLayoutEffect(() => {
    const root = scopeRef.current;
    if (!root) return;
    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) return;

      root.querySelectorAll<HTMLElement>('[data-motion]').forEach((element) => {
        const direction = element.dataset.motion ?? 'up';
        const distance = Number(element.dataset.motionDistance ?? 72);
        const from = direction === 'left'
          ? { x: -distance, y: 0 }
          : direction === 'right'
            ? { x: distance, y: 0 }
            : direction === 'top'
              ? { x: 0, y: -Math.min(distance, 56) }
              : direction === 'scale'
                ? { x: 0, y: 18, scale: 0.96 }
                : { x: 0, y: 28 };

        gsap.fromTo(element,
          { autoAlpha: 0, ...from, filter: 'blur(5px)' },
          {
            autoAlpha: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)',
            duration: Number(element.dataset.motionDuration ?? 0.72),
            ease: 'power3.out',
            clearProps: 'filter',
            scrollTrigger: {
              trigger: element,
              start: element.dataset.motionStart ?? 'top 86%',
              end: 'bottom 12%',
              toggleActions: 'play none none reverse',
              invalidateOnRefresh: true,
            },
          },
        );
      });

      root.querySelectorAll<HTMLElement>('[data-motion-stagger]').forEach((container) => {
        const children = Array.from(container.querySelectorAll<HTMLElement>('[data-motion-item]'));
        if (!children.length) return;
        const direction = container.dataset.motionStagger ?? 'up';
        const distance = Number(container.dataset.motionDistance ?? 34);
        gsap.fromTo(children,
          {
            autoAlpha: 0,
            x: direction === 'left' ? -distance : direction === 'right' ? distance : 0,
            y: direction === 'up' || direction === 'down' ? distance : 0,
            filter: 'blur(3px)',
          },
          {
            autoAlpha: 1, x: 0, y: 0, filter: 'blur(0px)', duration: 0.62,
            ease: 'power3.out', stagger: 0.11, clearProps: 'filter',
            scrollTrigger: {
              trigger: container,
              start: 'top 84%',
              toggleActions: 'play none none reverse',
              invalidateOnRefresh: true,
            },
          },
        );
      });

      root.querySelectorAll<HTMLElement>('[data-motion-parallax]').forEach((element) => {
        gsap.fromTo(element,
          { yPercent: Number(element.dataset.motionParallaxFrom ?? -5) },
          {
            yPercent: Number(element.dataset.motionParallaxTo ?? 5),
            ease: 'none',
            scrollTrigger: {
              trigger: element.closest('section') ?? element,
              start: 'top bottom',
              end: 'bottom top',
              scrub: Number(element.dataset.motionScrub ?? 0.7),
              invalidateOnRefresh: true,
            },
          },
        );
      });

      root.querySelectorAll<HTMLElement>('[data-motion-scrub]').forEach((element) => {
        gsap.to(element, {
          yPercent: Number(element.dataset.motionY ?? -8),
          rotate: Number(element.dataset.motionRotate ?? 0),
          scale: Number(element.dataset.motionScale ?? 1),
          ease: 'none',
          scrollTrigger: {
            trigger: element.closest('section') ?? element,
            start: 'top bottom',
            end: 'bottom top',
            scrub: Number(element.dataset.motionScrub ?? 0.6),
            invalidateOnRefresh: true,
          },
        });
      });
    }, root);

    const frame = window.requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => {
      window.cancelAnimationFrame(frame);
      context.revert();
    };
  }, [scopeRef]);
}
