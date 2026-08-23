import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { GreeceTerrainR3F } from './GreeceTerrainR3F'

/* ── Activation gate ───────────────────────────────────────────────────────
 * VITE_GOOGLE_MAPS_API_KEY must be a real Google Maps Platform key (AIza…)
 * with "Maps JavaScript API" + "Map Tiles API" enabled and billing active.
 * Anything else (missing key, Gemini/AI Studio keys, typos) silently keeps
 * the self-contained R3F terrain so production never breaks.
 * ──────────────────────────────────────────────────────────────────────── */
const MAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() ?? ''
const EARTH_ENABLED = /^AIza/.test(MAPS_KEY)

interface FlightStop {
  id: string
  name: string
  /** "lat,lng" */
  center: string
  range: number
  tilt: number
}

const FLIGHT_PLAN: FlightStop[] = [
  { id: 'attiki',    name: 'Αττική',         center: '37.9838,23.7275', range: 45000,  tilt: 50 },
  { id: 'sterea',    name: 'Στερεά Ελλάδα',  center: '38.6500,22.4000', range: 75000,  tilt: 55 },
  { id: 'makedonia', name: 'Βόρεια Ελλάδα',  center: '40.6401,22.9444', range: 85000,  tilt: 50 },
  { id: 'ionio',     name: 'Ιόνια Νησιά',    center: '38.6000,20.7000', range: 95000,  tilt: 55 },
  { id: 'aigaio',    name: 'Αιγαίο',         center: '37.4467,25.3289', range: 110000, tilt: 50 },
  { id: 'kriti',     name: 'Κρήτη',          center: '35.2401,24.8093', range: 60000,  tilt: 50 },
]

type MapsStatus = 'loading' | 'ready' | 'failed'

/** Injects the Maps JS API (maps3d library) once, then waits for <gmp-map-3d>. */
function useGoogleMaps3d(enabled: boolean): MapsStatus {
  const [status, setStatus] = useState<MapsStatus>('loading')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    // If the element still isn't defined after 10s (bad key, blocked network),
    // give up and let the caller fall back to the R3F terrain.
    const failTimer = window.setTimeout(() => {
      if (!cancelled && !customElements.get('gmp-map-3d')) setStatus('failed')
    }, 10000)

    async function init() {
      try {
        if (!document.querySelector('script[data-gmaps-3d="true"]')) {
          const s = document.createElement('script')
          s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}&v=weekly&libraries=maps3d`
          s.async = true
          s.dataset.gmaps3d = 'true'
          document.head.appendChild(s)
        }
        await customElements.whenDefined('gmp-map-3d')
        if (!cancelled) {
          window.clearTimeout(failTimer)
          setStatus('ready')
        }
      } catch {
        /* failTimer decides */
      }
    }
    void init()

    return () => {
      cancelled = true
      window.clearTimeout(failTimer)
    }
  }, [enabled])

  return status
}

function GoogleEarthMap({ activeRegion, progressRef, className }: GreeceMap3DProps) {
  const mapRef = useRef<HTMLElement | null>(null)
  const status = useGoogleMaps3d(true)

  useEffect(() => {
    const el = mapRef.current as { flyCameraTo?: (o: unknown) => void } | null
    if (status !== 'ready' || !el || typeof el.flyCameraTo !== 'function') return
    const stop = FLIGHT_PLAN[activeRegion] ?? FLIGHT_PLAN[0]
    el.flyCameraTo({
      center: stop.center,
      range: stop.range,
      tilt: stop.tilt,
      heading: 0,
      duration: 2000,
    })
  }, [activeRegion, status])

  if (status === 'failed') {
    return <GreeceTerrainR3F activeRegion={activeRegion} progressRef={progressRef} className={className} />
  }

  return (
    <div className={className} style={{ background: '#04101f' }}>
      <gmp-map-3d
        ref={(node: HTMLElement | null) => { mapRef.current = node }}
        center="39.0742,21.8243"
        range="800000"
        tilt="45"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        {FLIGHT_PLAN.map((stop, idx) => (
          <gmp-marker-3d key={stop.id} position={stop.center} altitude-mode="relative-to-ground">
            <div
              slot="content"
              className={`pointer-events-none rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-2xl transition-all duration-300 ${
                idx === activeRegion
                  ? 'scale-110 bg-emerald-600 ring-4 ring-emerald-400/50'
                  : 'border border-gray-700 bg-gray-900/90 backdrop-blur-md'
              }`}
            >
              ⚡ {stop.name}
            </div>
          </gmp-marker-3d>
        ))}
      </gmp-map-3d>
    </div>
  )
}

export interface GreeceMap3DProps {
  /** Active city/region index — drives marker glow, HUD card & camera flight. */
  activeRegion: number
  /**
   * Continuous 0..1 scroll progress ref (consumed by the R3F fallback's camera
   * rig; kept for contract stability across both implementations).
   */
  progressRef: MutableRefObject<number>
  className?: string
}

/**
 * Region map used inside the landing journey.
 * - Real Google Earth photorealistic 3D when VITE_GOOGLE_MAPS_API_KEY is set.
 * - Otherwise the self-contained stylised R3F terrain (no external calls).
 */
export function GreeceMap3D({ activeRegion, progressRef, className }: GreeceMap3DProps) {
  if (!EARTH_ENABLED) {
    return <GreeceTerrainR3F activeRegion={activeRegion} progressRef={progressRef} className={className} />
  }
  return <GoogleEarthMap activeRegion={activeRegion} progressRef={progressRef} className={className} />
}
