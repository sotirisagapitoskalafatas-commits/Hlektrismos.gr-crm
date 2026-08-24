import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { GreeceTerrainR3F } from './GreeceTerrainR3F'

/* ── Activation gates ──────────────────────────────────────────────────────
 * Tier 1: Mapbox GL satellite + 3D terrain  (VITE_MAPBOX_TOKEN = pk.…)
 * Tier 2: Google Earth photorealistic 3D    (VITE_GOOGLE_MAPS_API_KEY = AIza…)
 * Tier 3: self-contained R3F stylised terrain (always available fallback)
 * Invalid/missing keys silently fall down the chain — production never breaks.
 * ──────────────────────────────────────────────────────────────────────── */
const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined)?.trim() ?? ''
const GOOGLE_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() ?? ''

const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface RegionStop {
  name: string
  subtitle: string
  center: [number, number]
  zoom: number
  pitch: number
  bearing: number
}

const REGIONS: RegionStop[] = [
  { name: 'Attica',          center: [23.7275, 37.9838], zoom: 11,   pitch: 65, bearing: -20, subtitle: 'Αθήνα — Κέντρο Ενέργειας' },
  { name: 'Central Greece',  center: [22.4, 38.65],      zoom: 9,    pitch: 60, bearing: 10,  subtitle: 'Στερεά Ελλάδα — Δίκτυο' },
  { name: 'Northern Greece', center: [22.9444, 40.6401], zoom: 10,   pitch: 65, bearing: 15,  subtitle: 'Θεσσαλονίκη — Βόρειος Κόμβος' },
  { name: 'Ionian Islands',  center: [20.7, 38.6],       zoom: 9.5,  pitch: 70, bearing: -30, subtitle: 'Ιόνιο — Νησιωτική Διαχείριση' },
  { name: 'Aegean Islands',  center: [25.3289, 37.4467], zoom: 9,    pitch: 65, bearing: 45,  subtitle: 'Αιγαίο — Ανανεώσιμες Πηγές' },
  { name: 'Crete',           center: [24.8093, 35.2401], zoom: 9.5,  pitch: 65, bearing: 0,   subtitle: 'Κρήτη — Πράσινη Μετάβαση' },
]

/* ── Tier 1 · Mapbox GL ──────────────────────────────────────────────────── */

type MapStatus = 'loading' | 'ready' | 'failed'

function GreeceMapboxMap({ activeRegion, progressRef, className }: GreeceMap3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('mapbox-gl').Map | null>(null)
  const [status, setStatus] = useState<MapStatus>('loading')
  const stop = REGIONS[activeRegion] ?? REGIONS[0]

  useEffect(() => {
    let cancelled = false
    let failTimer = 0

    async function init() {
      try {
        // Lazy-load: keeps ~800 kB of mapbox-gl out of the main bundle.
        const mapboxgl = (await import('mapbox-gl')).default
        await import('mapbox-gl/dist/mapbox-gl.css')
        if (cancelled || !containerRef.current) return

        mapboxgl.accessToken = MAPBOX_TOKEN
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: 'mapbox://styles/mapbox/satellite-streets-v12',
          center: REGIONS[0].center,
          zoom: REGIONS[0].zoom,
          pitch: REGIONS[0].pitch,
          bearing: REGIONS[0].bearing,
          projection: 'globe',
          interactive: false,
          attributionControl: true,
        })
        mapRef.current = map

        const fail = (reason: string) => {
          if (cancelled) return
          console.warn(`[GreeceMap3D] Mapbox unavailable: ${reason} — falling back to stylised terrain.`)
          setStatus('failed')
        }
        // Hard deadline: if the style hasn't loaded in 10s, give up.
        failTimer = window.setTimeout(() => fail('style load timeout (10s)'), 10000)

        // ANY error before 'load' means the map can't be trusted → fall back fast.
        map.on('error', (e) => {
          const err = e as unknown as { error?: { status?: number; message?: string } }
          const msg = err?.error?.message ?? String((e as unknown as { message?: string })?.message ?? 'unknown error')
          if (!cancelled && !map.loaded()) fail(msg)
        })

        map.on('load', () => {
          if (cancelled) return
          window.clearTimeout(failTimer)
          // DEM raster tiles are the heaviest part of the scene — skip 3D
          // terrain on phones/tablets to keep the journey smooth on mobile
          // GPUs and networks. Fog is shader-side, so it stays everywhere.
          const isSmallScreen = window.matchMedia('(max-width: 768px)').matches
          if (!isSmallScreen) {
            map.addSource('mapbox-dem', {
              type: 'raster-dem',
              url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
              tileSize: 512,
              maxzoom: 14,
            })
            map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.6 })
          }
          map.setFog({
            range: [0.5, 10],
            color: '#030712',
            'horizon-blend': 0.1,
            'high-color': '#0f172a',
            'space-color': '#020617',
            'star-intensity': isSmallScreen ? 0.25 : 0.5,
          })
          setStatus('ready')
        })
      } catch (e) {
        console.warn('[GreeceMap3D] Mapbox failed to initialise:', e)
        setStatus('failed')
      }
    }
    void init()

    return () => {
      cancelled = true
      window.clearTimeout(failTimer)
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (status !== 'ready' || !map) return
    map.flyTo({
      center: stop.center,
      zoom: stop.zoom,
      pitch: stop.pitch,
      bearing: stop.bearing,
      duration: REDUCED_MOTION ? 0 : 2600,
      essential: true,
    })
  }, [activeRegion, status]) // eslint-disable-line react-hooks/exhaustive-deps -- `stop` derives from activeRegion

  if (status === 'failed') {
    return <GreeceTerrainR3F activeRegion={activeRegion} progressRef={progressRef} className={className} />
  }

  return (
    <div
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: '320px', background: '#04101f' }}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex items-center gap-3 rounded-full border border-emerald-500/30 bg-slate-950/80 px-5 py-2.5 backdrop-blur-md">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
            <span className="text-xs font-semibold tracking-wide text-slate-300">Φόρτωση δορυφορικού χάρτη…</span>
          </div>
        </div>
      )}
      {status === 'ready' && (
        <div className="pointer-events-none absolute left-4 top-4 z-10">
          <div className="rounded-2xl border border-emerald-500/50 bg-slate-950/85 px-4 py-2.5 shadow-2xl backdrop-blur-xl transition-all duration-500">
            <div className="flex items-center gap-2.5">
              <span className="h-3 w-3 animate-ping rounded-full bg-emerald-400 shadow-[0_0_12px_#34d9b4]" />
              <div>
                <h4 className="text-sm font-extrabold tracking-wide text-white">{stop.name}</h4>
                <p className="text-[11px] font-medium text-emerald-300">{stop.subtitle}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Tier 2 · Google Earth 3D web component ─────────────────────────────── */

type MapsStatus = 'loading' | 'ready' | 'failed'

function useGoogleMaps3d(enabled: boolean): MapsStatus {
  const [status, setStatus] = useState<MapsStatus>('loading')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const failTimer = window.setTimeout(() => {
      if (!cancelled && !customElements.get('gmp-map-3d')) setStatus('failed')
    }, 10000)

    async function init() {
      try {
        if (!document.querySelector('script[data-gmaps-3d="true"]')) {
          const s = document.createElement('script')
          s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_KEY)}&v=weekly&libraries=maps3d`
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

/** "lat,lng" flight plan for gmp-map-3d flyCameraTo. */
const GOOGLE_FLIGHT_PLAN = [
  { id: 'attiki',    name: 'Αττική',        center: '37.9838,23.7275', range: 45000,  tilt: 50 },
  { id: 'sterea',    name: 'Στερεά Ελλάδα', center: '38.65,22.4',      range: 75000,  tilt: 55 },
  { id: 'makedonia', name: 'Βόρεια Ελλάδα', center: '40.6401,22.9444', range: 85000,  tilt: 50 },
  { id: 'ionio',     name: 'Ιόνια Νησιά',   center: '38.6,20.7',       range: 95000,  tilt: 55 },
  { id: 'aigaio',    name: 'Αιγαίο',        center: '37.4467,25.3289', range: 110000, tilt: 50 },
  { id: 'kriti',     name: 'Κρήτη',         center: '35.2401,24.8093', range: 60000,  tilt: 50 },
]

function GoogleEarthMap({ activeRegion, progressRef, className }: GreeceMap3DProps) {
  const mapRef = useRef<HTMLElement | null>(null)
  const status = useGoogleMaps3d(true)

  useEffect(() => {
    const el = mapRef.current as { flyCameraTo?: (o: unknown) => void } | null
    if (status !== 'ready' || !el || typeof el.flyCameraTo !== 'function') return
    const idx = Math.min(Math.max(activeRegion, 0), GOOGLE_FLIGHT_PLAN.length - 1)
    const stopG = GOOGLE_FLIGHT_PLAN[idx]
    el.flyCameraTo({
      center: stopG.center,
      range: stopG.range,
      tilt: stopG.tilt,
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
        {GOOGLE_FLIGHT_PLAN.map((stopG, idx) => (
          <gmp-marker-3d key={stopG.id} position={stopG.center} altitude-mode="relative-to-ground">
            <div
              slot="content"
              className={`pointer-events-none rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-2xl transition-all duration-300 ${
                idx === activeRegion
                  ? 'scale-110 bg-emerald-600 ring-4 ring-emerald-400/50'
                  : 'border border-gray-700 bg-gray-900/90 backdrop-blur-md'
              }`}
            >
              ⚡ {stopG.name}
            </div>
          </gmp-marker-3d>
        ))}
      </gmp-map-3d>
    </div>
  )
}

/* ── Public contract ─────────────────────────────────────────────────────── */

export interface GreeceMap3DProps {
  /** Active city/region index — drives marker glow, HUD card & camera flight. */
  activeRegion: number
  /**
   * Continuous 0..1 scroll progress ref (consumed by the R3F fallback's camera
   * rig; kept for contract stability across all implementations).
   */
  progressRef: MutableRefObject<number>
  className?: string
}

/**
 * Region map used inside the landing journey.
 * Mapbox satellite terrain when VITE_MAPBOX_TOKEN is set; Google Earth 3D when
 * VITE_GOOGLE_MAPS_API_KEY is set; otherwise the self-contained R3F terrain.
 */
export function GreeceMap3D({ activeRegion, progressRef, className }: GreeceMap3DProps) {
  if (/^pk\./.test(MAPBOX_TOKEN)) {
    return <GreeceMapboxMap activeRegion={activeRegion} progressRef={progressRef} className={className} />
  }
  if (/^AIza/.test(GOOGLE_KEY)) {
    return <GoogleEarthMap activeRegion={activeRegion} progressRef={progressRef} className={className} />
  }
  return <GreeceTerrainR3F activeRegion={activeRegion} progressRef={progressRef} className={className} />
}
