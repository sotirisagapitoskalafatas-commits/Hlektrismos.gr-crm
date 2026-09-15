import type { CSSProperties } from 'react';

/* ─── Footer wave divider (shared: Services, FAQ, …) ──────────────────────
   Cuts a footer's TOP edge into an organic wave so the fixed sky background
   (CinematicSkyBackground) shows through the crests — the same seamless
   two-image transition as the landing page's contact→footer divider, but on
   pages where the section above the footer has no background image of its own.

   Pair this with, on the <footer>:
     marginTop: -110  → slide the wavy top edge up over the section above
     paddingTop: 'calc(<existing top padding> + 110px)'  → keep footer
                        content clear of the cut wave band
   The section directly above the footer should carry ~70px extra bottom
   padding so its card clears the 110px wave band on short viewports.

   The SVG is the landing-page wave mirrored vertically (solid at the bottom,
   wavy along the top). `%25` is a URL-encoded `%` — required inside a data
   URI so WebKit doesn't invalidate the mask. */
const FOOTER_WAVE_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 120' width='100%25' height='100%25' preserveAspectRatio='none'%3E%3Cpath d='M0,120 H1440 V60 C1340,60 1250,16 1120,20 C960,25 860,76 700,70 C560,65 460,18 320,28 C220,35 110,60 0,60 Z' fill='%23ffffff'/%3E%3C/svg%3E";

export const footerWaveTopMask: CSSProperties = {
  WebkitMaskImage: `url("${FOOTER_WAVE_SVG}"), linear-gradient(#fff,#fff)`,
  maskImage: `url("${FOOTER_WAVE_SVG}"), linear-gradient(#fff,#fff)`,
  WebkitMaskSize: '105% 112px, 105% calc(100% - 110px)',
  maskSize: '105% 112px, 105% calc(100% - 110px)',
  WebkitMaskPosition: 'center top, center bottom',
  maskPosition: 'center top, center bottom',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
};
