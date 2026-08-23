import { useRef, useMemo, Suspense, type MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'

/* ── Environment flags ───────────────────────────────────────────────────── */
const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const IS_MOBILE =
  typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches

/* ── Region data ─────────────────────────────────────────────────────────── */
export interface Region {
  id: string
  label: string
  city: string
  x: number
  y: number
  /** base terrain height (top surface) at this region */
  h: number
}

export const GREECE_REGIONS: Region[] = [
  { id: 'attiki',      label: 'Αττική',         city: 'Αθήνα',                   x: -0.22, y: -0.35, h: 0.18 },
  { id: 'thessaly',    label: 'Θεσσαλία',       city: 'Λάρισα',                  x: -0.50, y:  0.55, h: 0.22 },
  { id: 'makedonia',   label: 'Θεσσαλονίκη',   city: 'Θεσσαλονίκη',            x: -0.36, y:  1.28, h: 0.24 },
  { id: 'ionio',       label: 'Νησιά Ιονίου',   city: 'Κέρκυρα · Ζάκυνθος',    x: -1.42, y:  0.45, h: 0.09 },
  { id: 'aigaio',      label: 'Νησιά Αιγαίου',  city: 'Κυκλάδες · Δωδεκάνησα', x:  1.12, y: -0.22, h: 0.09 },
  { id: 'kriti',       label: 'Κρήτη',          city: 'Ηράκλειο · Χανιά',       x:  0.12, y: -1.56, h: 0.12 },
]

/* Journey flight legs — the camera & energy routes follow this sequence */
const ROUTE_SEQ: Array<[number, number]> = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]

/* ── Simplified Greece outlines (XY map plane, +Z = up) ──────────────────── */
const MAINLAND: [number, number][] = [
  [ 1.38,  1.06],[ 1.10,  1.55],[ 0.22,  1.55],[-0.28,  1.46],
  [-0.82,  1.35],[-1.44,  1.12],[-1.50,  0.72],[-1.30,  0.36],
  [-1.40,  0.06],[-1.22, -0.30],[-0.96, -0.54],[-0.70, -0.54],
  [-0.70, -0.80],[-1.06, -1.10],[-0.96, -1.38],[-0.52, -1.54],
  [-0.14, -1.30],[ 0.18, -1.02],[ 0.34, -0.70],[ 0.62, -0.60],
  [ 0.82, -0.40],[ 0.82,  0.02],[ 1.02,  0.30],[ 0.95,  0.82],
  [ 1.22,  1.20],[ 1.38,  1.06],
]

const CRETE: [number, number][] = [
  [-0.88,-1.58],[-0.34,-1.46],[ 0.10,-1.40],[ 0.55,-1.46],
  [ 0.90,-1.58],[ 0.70,-1.68],[ 0.28,-1.72],[-0.12,-1.72],
  [-0.50,-1.68],[-0.88,-1.58],
]

const ISLAND_SPOTS: [number, number, number][] = [
  [ 0.86,-0.64,0.030],[ 1.06,-0.34,0.026],[ 1.20,-0.04,0.024],
  [ 0.96,-0.90,0.026],[ 0.72,-1.10,0.024],[ 1.36,-0.46,0.022],
  [ 1.16, 0.16,0.024],[ 0.60,-0.84,0.026],[-1.34, 0.28,0.028],
  [-1.46,-0.08,0.024],[-1.10, 0.14,0.026],
]

/* Stylized mountain relief (Pindos chain, Olympus, Taygetos…) */
const PEAKS: Array<{ x: number; y: number; r: number; h: number }> = [
  { x: -0.58, y:  0.72, r: 0.15, h: 0.26 },
  { x: -0.68, y:  0.30, r: 0.17, h: 0.30 },
  { x: -0.52, y: -0.10, r: 0.13, h: 0.22 },
  { x: -0.64, y: -0.52, r: 0.15, h: 0.26 },
  { x: -0.82, y: -0.92, r: 0.12, h: 0.22 },
  { x: -0.34, y:  1.02, r: 0.13, h: 0.24 },
  { x:  0.28, y:  0.86, r: 0.11, h: 0.18 },
]

function shrink(pts: [number, number][], f: number): [number, number][] {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length
  return pts.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f])
}

function buildShape(pts: [number, number][]): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1])
  shape.closePath()
  return shape
}

/* ── Route curves with real altitude ─────────────────────────────────────── */
function makeRouteCurve(a: number, b: number): THREE.QuadraticBezierCurve3 {
  const ra = GREECE_REGIONS[a]
  const rb = GREECE_REGIONS[b]
  const start = new THREE.Vector3(ra.x, ra.y, ra.h + 0.04)
  const end = new THREE.Vector3(rb.x, rb.y, rb.h + 0.04)
  const distance = start.distanceTo(end)
  return new THREE.QuadraticBezierCurve3(
    start,
    new THREE.Vector3((start.x + end.x) / 2, (start.y + end.y) / 2, 0.45 + distance * 0.28),
    end,
  )
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

/** Deep beveled slab: bright top surface + dark side walls for real elevation. */
function TerrainSlab({ pts, depth, z = 0, topColor = '#173c2b', relief }: {
  pts: [number, number][]
  depth: number
  z?: number
  topColor?: string
  relief?: boolean
}) {
  const geo = useMemo(() => new THREE.ExtrudeGeometry(buildShape(pts), {
    depth,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelThickness: 0.025,
    bevelSize: 0.035,
    curveSegments: 2,
  }), [pts, depth])

  return (
    <mesh geometry={geo} position={[0, 0, z]} castShadow receiveShadow>
      <meshStandardMaterial attach="material-0" color={topColor} emissive="#0e3a28" emissiveIntensity={0.35} roughness={0.78} metalness={0.08} />
      <meshStandardMaterial attach="material-1" color="#06150f" roughness={0.95} metalness={0} />
      {relief === true && null}
    </mesh>
  )
}

/** Second relief layer sitting on top of a landmass. */
function ReliefLayer({ pts, depth, z }: { pts: [number, number][]; depth: number; z: number }) {
  const geo = useMemo(() => new THREE.ExtrudeGeometry(buildShape(pts), {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelThickness: 0.02,
    bevelSize: 0.03,
    curveSegments: 2,
  }), [pts, depth])
  return (
    <mesh geometry={geo} position={[0, 0, z]} castShadow receiveShadow>
      <meshStandardMaterial color="#24563a" emissive="#0f452c" emissiveIntensity={0.25} roughness={0.92} metalness={0.02} flatShading />
    </mesh>
  )
}

/** Faceted low-poly peaks along the mountain chains. */
function Peaks() {
  return (
    <group>
      {PEAKS.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, 0.22 + p.h / 2]} rotation={[0, 0, i * 0.7]} castShadow receiveShadow>
          <coneGeometry args={[p.r, p.h, 6]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#2b5f41' : '#255238'} roughness={0.9} metalness={0.02} flatShading />
        </mesh>
      ))}
    </group>
  )
}

function Islands() {
  return (
    <group>
      {ISLAND_SPOTS.map(([x, y, r], i) => (
        <mesh key={i} position={[x, y, 0.045]} castShadow receiveShadow>
          <cylinderGeometry args={[r * 1.6, r * 1.9, 0.09, 7]} />
          <meshStandardMaterial color="#143526" emissive="#0d4030" emissiveIntensity={0.3} roughness={0.88} metalness={0.05} flatShading />
        </mesh>
      ))}
    </group>
  )
}

function OceanFloor() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current)
      (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.07 + Math.sin(clock.getElapsedTime() * 0.35) * 0.03
  })
  return (
    <mesh ref={ref} position={[0, 0, -0.01]} receiveShadow>
      <planeGeometry args={[11, 13]} />
      <meshStandardMaterial color="#020c1a" emissive="#0a1e38" emissiveIntensity={0.07} roughness={0.95} metalness={0.1} />
    </mesh>
  )
}

/** Raised 3D energy pin that lifts off the terrain when active. */
function RegionMarker({ region, active, idx }: { region: Region; active: boolean; idx: number }) {
  const pin = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)
  const restY = region.h + 0.10
  const liftY = region.h + 0.34

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime()
    const d = Math.min(delta, 0.05)
    if (pin.current) {
      const targetY = active ? liftY : restY
      pin.current.position.y = REDUCED_MOTION
        ? targetY
        : THREE.MathUtils.lerp(pin.current.position.y, targetY, 1 - Math.pow(0.002, d))
      pin.current.scale.setScalar(active && !REDUCED_MOTION ? 1 + Math.sin(t * 3.2 + idx) * 0.08 : 0.88)
    }
    if (ring.current) {
      const m = ring.current.material as THREE.MeshBasicMaterial
      const pulse = active && !REDUCED_MOTION ? 1 + Math.sin(t * 2.4 + idx) * 0.18 : 1
      ring.current.scale.setScalar(pulse)
      m.opacity = THREE.MathUtils.lerp(m.opacity, active ? 0.7 : 0.16, 0.08)
    }
    if (light.current) {
      light.current.intensity = THREE.MathUtils.lerp(light.current.intensity, active ? 1.6 : 0.2, 0.08)
    }
  })

  return (
    <group position={[region.x, region.y, 0]}>
      {/* pulsing torus lying on the terrain */}
      <mesh ref={ring} position={[0, 0, region.h + 0.006]}>
        <torusGeometry args={[0.12, 0.012, 6, 40]} />
        <meshBasicMaterial color={active ? '#00d4ff' : '#0088cc'} transparent opacity={0.16} />
      </mesh>

      {/* floating pin: stem + glowing head + local glow light */}
      <group ref={pin} position={[0, 0, restY]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.028, 0.06, 0.3, 8]} />
          <meshStandardMaterial
            color={active ? '#00d4ff' : '#0874a8'}
            emissive={active ? '#00d4ff' : '#003b63'}
            emissiveIntensity={active ? 2.6 : 0.7}
            roughness={0.35} metalness={0.4}
          />
        </mesh>
        <mesh position={[0, 0.21, 0]} castShadow>
          <sphereGeometry args={[0.06, 16, 12]} />
          <meshStandardMaterial
            color={active ? '#d9fbff' : '#0aa0d8'}
            emissive={active ? '#00d4ff' : '#003b63'}
            emissiveIntensity={active ? 4 : 0.9}
            toneMapped={false}
          />
        </mesh>
        <pointLight ref={light} position={[0, 0.22, 0]} color="#00d4ff" intensity={0.2} distance={0.9} />
      </group>
    </group>
  )
}

/**
 * Scroll-driven energy routes: thin dashed lines idle, the active leg lights up
 * as a bright tube while a luminous "data packet" travels along it.
 */
function EnergyRoutes({ progressRef }: { progressRef: MutableRefObject<number> }) {
  const routes = useMemo(() => ROUTE_SEQ.map(([a, b]) => makeRouteCurve(a, b)), [])
  const lineMats = useRef<Array<THREE.Material | null>>([])
  const tubes = useRef<Array<THREE.Mesh | null>>([])
  const traveller = useRef<THREE.Mesh>(null)

  const tubeGeos = useMemo(() => routes.map((c) => new THREE.TubeGeometry(c, 64, 0.013, 6, false)), [routes])
  const startVec = useMemo(() => routes[0].getPoint(0), [routes])

  useFrame(({ clock }, delta) => {
    const d = Math.min(delta, 0.05)
    const p = THREE.MathUtils.clamp(progressRef.current, 0, 1)
    const legF = p * (routes.length - 1)
    const activeLeg = Math.min(Math.floor(legF), routes.length - 2)
    const localT = legF - activeLeg
    const speedBoost = REDUCED_MOTION ? 0 : 1

    for (let i = 0; i < routes.length; i++) {
      const isActive = i === activeLeg
      const lm = lineMats.current[i] as { opacity: number; dashOffset: number } | null
      if (lm) {
        lm.opacity = THREE.MathUtils.lerp(lm.opacity, isActive ? 0.8 : 0.22, 0.08)
        lm.dashOffset -= d * (isActive ? 0.9 : 0.15) * speedBoost
      }
      const tm = tubes.current[i]?.material as THREE.MeshStandardMaterial | undefined
      if (tm) {
        tm.emissiveIntensity = THREE.MathUtils.lerp(tm.emissiveIntensity, isActive ? 3 : 0.35, 0.08)
        tm.opacity = THREE.MathUtils.lerp(tm.opacity, isActive ? 0.9 : 0.25, 0.08)
      }
    }

    if (traveller.current) {
      routes[activeLeg].getPointAt(localT, traveller.current.position)
      const s = REDUCED_MOTION ? 1 : 1 + Math.sin(clock.getElapsedTime() * 6) * 0.15
      traveller.current.scale.setScalar(s)
    }
  })

  return (
    <group>
      {routes.map((_, i) => (
        <group key={i}>
          {/* idle dashed guide line */}
          <Line
            ref={(node: any) => { lineMats.current[i] = node?.material ?? null }}
            points={routes[i].getPoints(80)}
            color="#00a8ff" lineWidth={1.1}
            dashed dashScale={5} dashSize={0.14} gapSize={0.09}
            transparent opacity={0.22} depthWrite={false}
          />
          {/* solid energised tube */}
          <mesh ref={(node: THREE.Mesh | null) => { tubes.current[i] = node }} geometry={tubeGeos[i]}>
            <meshStandardMaterial
              color="#0077bb" emissive="#00a8ff" emissiveIntensity={0.35}
              transparent opacity={0.25} toneMapped={false} depthWrite={false}
            />
          </mesh>
        </group>
      ))}

      {/* travelling light packet on the active leg */}
      <mesh ref={traveller} position={startVec}>
        <sphereGeometry args={[0.045, 12, 12]} />
        <meshStandardMaterial color="#d9fbff" emissive="#00d4ff" emissiveIntensity={4} toneMapped={false} />
        <pointLight color="#00d4ff" intensity={1.1} distance={0.6} />
      </mesh>
    </group>
  )
}

/** Subtle drone-style yaw + drift of the whole diorama, driven by scroll. */
function TerrainMotion({ progressRef, children }: {
  progressRef: MutableRefObject<number>
  children: React.ReactNode
}) {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    const g = ref.current
    if (!g || REDUCED_MOTION) return
    const p = THREE.MathUtils.clamp(progressRef.current, 0, 1)
    g.rotation.z = THREE.MathUtils.damp(g.rotation.z, THREE.MathUtils.lerp(-0.08, 0.08, p), 3, delta)
    g.position.z = THREE.MathUtils.damp(g.position.z, p * 0.12, 3, delta)
  })
  return <group ref={ref}>{children}</group>
}

/** Tilted drone camera flying continuously between regions along scroll. */
function CameraRig({ progressRef }: { progressRef: MutableRefObject<number> }) {
  const { camera } = useThree()
  const target = useMemo(() => new THREE.Vector3(), [])
  const lookGoal = useMemo(() => new THREE.Vector3(), [])
  const lookSmooth = useMemo(() => new THREE.Vector3(0, 0, 0.1), [])

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05)
    const p = THREE.MathUtils.clamp(progressRef.current, 0, 1)
    const seg = p * (GREECE_REGIONS.length - 1)
    const i = Math.min(Math.floor(seg), GREECE_REGIONS.length - 2)
    const lp = seg - i
    const eased = lp * lp * (3 - 2 * lp)
    const cur = GREECE_REGIONS[i]
    const nxt = GREECE_REGIONS[i + 1]

    const x = THREE.MathUtils.lerp(cur.x, nxt.x, eased)
    const y = THREE.MathUtils.lerp(cur.y, nxt.y, eased)

    target.set(x * 0.55, 3.9 - p * 0.5, 4.8 - p * 0.9)
    lookGoal.set(x * 0.5, y * 0.4, 0.1)

    camera.position.lerp(target, 1 - Math.pow(0.001, d))
    lookSmooth.lerp(lookGoal, 1 - Math.pow(0.0005, d))
    camera.lookAt(lookSmooth)
  })
  return null
}

/* ── Scene ───────────────────────────────────────────────────────────────── */
function Scene({ activeRegion, progressRef }: { activeRegion: number; progressRef: MutableRefObject<number> }) {
  const mainlandRelief = useMemo(() => shrink(MAINLAND, 0.8), [])
  const creteRelief = useMemo(() => shrink(CRETE, 0.75), [])

  return (
    <>
      <fog attach="fog" args={['#04101e', 5.5, 11]} />

      <ambientLight intensity={0.18} />
      <directionalLight
        castShadow
        position={[2.5, 1.5, 5.5]}
        intensity={2.2}
        color="#8cc8ff"
        shadow-mapSize-width={IS_MOBILE ? 1024 : 2048}
        shadow-mapSize-height={IS_MOBILE ? 1024 : 2048}
        shadow-camera-left={-4.2}
        shadow-camera-right={4.2}
        shadow-camera-top={4.2}
        shadow-camera-bottom={-4.2}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-3, 1, -2]} intensity={0.45} color="#00a8ff" />

      <OceanFloor />

      <TerrainMotion progressRef={progressRef}>
        {/* Raised Greece — deep beveled slabs + relief layers + peaks */}
        <TerrainSlab pts={MAINLAND} depth={0.2} z={0} relief />
        <ReliefLayer pts={mainlandRelief} depth={0.07} z={0.17} />
        <Peaks />
        <TerrainSlab pts={CRETE} depth={0.12} z={0} topColor="#153627" />
        <ReliefLayer pts={creteRelief} depth={0.05} z={0.1} />
        <Islands />

        <EnergyRoutes progressRef={progressRef} />

        {GREECE_REGIONS.map((r, i) => (
          <RegionMarker key={r.id} region={r} active={i === activeRegion} idx={i} />
        ))}
      </TerrainMotion>

      {/* soft grounding shadow beneath the raised terrain */}
      {!IS_MOBILE && (
        <group rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.02]}>
          <ContactShadows opacity={0.55} scale={8} blur={2.4} far={1.2} />
        </group>
      )}

      <CameraRig progressRef={progressRef} />
    </>
  )
}

/* ── Export ──────────────────────────────────────────────────────────────── */
export interface GreeceTerrainR3FProps {
  /** Active city/region index — drives marker glow & HUD. */
  activeRegion: number
  /**
   * Continuous 0..1 scroll progress, updated imperatively by GSAP ScrollTrigger
   * (kept in a ref so the scene never re-renders per frame).
   */
  progressRef: MutableRefObject<number>
  className?: string
}

export function GreeceTerrainR3F({ activeRegion, progressRef, className }: GreeceTerrainR3FProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 3.9, 4.8], fov: 38, near: 0.1, far: 100 }}
      dpr={IS_MOBILE ? [1, 1.5] : [1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      className={className}
      style={{ background: '#020c1a' }}
    >
      <Suspense fallback={null}>
        <Scene activeRegion={activeRegion} progressRef={progressRef} />
      </Suspense>
    </Canvas>
  )
}
