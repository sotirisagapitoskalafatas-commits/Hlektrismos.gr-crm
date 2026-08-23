import type { DetailedHTMLProps, HTMLAttributes } from 'react'

/**
 * Minimal JSX typings for Google Maps 3D web components
 * (loaded via `libraries=maps3d`). Attributes only — imperative methods
 * like flyCameraTo() are accessed through refs with runtime guards.
 */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gmp-map-3d': DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          center?: string
          range?: string | number
          tilt?: string | number
          heading?: string | number
        },
        HTMLElement
      >
      'gmp-marker-3d': DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          position?: string
          'altitude-mode'?: string
        },
        HTMLElement
      >
    }
  }
}

export {}
