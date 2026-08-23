import { useRef, useMemo, Suspense, type MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'

/* ── Region data ─────────────────────────────────────────────────────────── */
export interface Region {
  id: string
  label: string
  city: string
  x: number
  y: number
}

export const GREECE_REGIONS: Region[] = [
  { id: 'attiki',      label: 'Αττική',         city: 'Αθήνα',                   x: -0.22, y: -0.35 },
  { id: 'thessaly',    label: 'Θεσσαλία',       city: 'Λάρισα',                  x: -0.50, y:  0.55 },
  { id: 'makedonia',   label: 'Θεσσαλονίκη',   city: 'Θεσσαλονίκη',            x: -0.36, y:  1.28 },
  { id: 'ionio',       label: 'Νησιά Ιονίου',   city: 'Κέρκυρα · Ζάκυνθος',    x: -1.42, y:  0.45 },
  { id: 'aigaio',      label: 'Νησιά Αιγαίου',  city: 'Κυκλάδες · Δωδεκάνησα', x:  1.12, y: -0.22 },
  { id: 'kriti',       label: 'Κρήτη',          city: 'Ηράκλειο · Χανιά',       x:  0.12, y: -1.56 },
]

const ARCS = [[0,1],[1,2],[0,3],[0,4],[0,5],[1,4],[2,3]] as const

/* ── Simplified Greece mainland outline ─────────────────────────────────── */
const MAINLAND: [number,number][] = [
  [ 1.38,  1.06],[ 1.10,  1.55],[ 0.22,  1.55],[-0.28,  1.46],
  [-0.82,  1.35],[-1.44,  1.12],[-1.50,  0.72],[-1.30,  0.36],
  [-1.40,  0.06],[-1.22, -0.30],[-0.96, -0.54],[-0.70, -0.54],
  [-0.70, -0.80],[-1.06, -1.10],[-0.96, -1.38],[-0.52, -1.54],
  [-0.14, -1.30],[ 0.18, -1.02],[ 0.34, -0.70],[ 0.62, -0.60],
  [ 0.82, -0.40],[ 0.82,  0.02],[ 1.02,  0.30],[ 0.95,  0.82],
  [ 1.22,  1.20],[ 1.38,  1.06],
]

const CRETE: [number,number][] = [
  [-0.88,-1.58],[-0.34,-1.46],[ 0.10,-1.40],[ 0.55,-1.46],
  [ 0.90,-1.58],[ 0.70,-1.68],[ 0.28,-1.72],[-0.12,-1.72],
  [-0.50,-1.68],[-0.88,-1.58],
]

const SMALL_ISLANDS: [number,number,number][] = [
  [ 0.86,-0.64,0.02],[ 1.06,-0.34,0.02],[ 1.20,-0.04,0.02],
  [ 0.96,-0.90,0.02],[ 0.72,-1.10,0.02],[ 1.36,-0.46,0.02],
  [ 1.16, 0.16,0.02],[ 0.60,-0.84,0.02],[-1.34, 0.28,0.02],
  [-1.46,-0.08,0.02],[-1.10, 0.14,0.02],
]

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function buildArc(
  ax:number,ay:number,bx:number,by:number,lift=0.55,segs=36
): [number,number,number][] {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(ax, ay, 0.1),
    new THREE.Vector3((ax+bx)/2, (ay+by)/2, 0.1+lift),
    new THREE.Vector3(bx, by, 0.1),
  )
  return curve.getPoints(segs).map(p => [p.x,p.y,p.z] as [number,number,number])
}

/* ── Sub-components ──────────────────────────────────────────────────────── */
function Landmass({ pts, z=0, depth=0.06 }: { pts:[number,number][]; z?:number; depth?:number }) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(pts[0][0], pts[0][1])
    for (let i=1;i<pts.length;i++) shape.lineTo(pts[i][0],pts[i][1])
    shape.closePath()
    return new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled:true, bevelThickness:0.02, bevelSize:0.012, bevelSegments:3,
    })
  }, [pts, depth])
  return (
    <mesh geometry={geo} position={[0,0,z]}>
      <meshStandardMaterial
        color="#0b2318" emissive="#0d4030" emissiveIntensity={0.35}
        roughness={0.82} metalness={0.18}
      />
    </mesh>
  )
}

function RegionMarker({ x,y,active,idx }: { x:number;y:number;active:boolean;idx:number }) {
  const coreRef = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (coreRef.current) coreRef.current.position.z = 0.12 + Math.sin(t*1.6+idx)*0.04
    if (ringRef.current) {
      ringRef.current.scale.setScalar(active ? 1+Math.sin(t*2.2+idx)*0.3 : 1);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity =
        active ? 0.6-Math.sin(t*2.2+idx)*0.25 : 0.15
    }
  })
  return (
    <group position={[x,y,0]}>
      <mesh ref={ringRef}>
        <torusGeometry args={[0.09,0.013,6,40]} />
        <meshBasicMaterial color={active?'#00d4ff':'#0088cc'} transparent opacity={0.2} />
      </mesh>
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.046,14,14]} />
        <meshStandardMaterial
          color={active?'#00d4ff':'#0090cc'}
          emissive={active?'#00aacc':'#004466'}
          emissiveIntensity={active?2.8:0.7}
          roughness={0.1} metalness={0.5}
        />
      </mesh>
    </group>
  )
}

function EnergyArc({ ax,ay,bx,by,speed }: { ax:number;ay:number;bx:number;by:number;speed:number }) {
  const pts = useMemo(() => buildArc(ax,ay,bx,by), [ax,ay,bx,by])
  const ref  = useRef<any>(null)
  useFrame(({ clock }) => {
    if (ref.current?.material) ref.current.material.dashOffset = -clock.getElapsedTime()*speed*0.25
  })
  return (
    <Line ref={ref} points={pts} color="#00a8ff" lineWidth={0.7}
      dashed dashScale={5} dashSize={0.5} gapSize={0.5} transparent opacity={0.3} />
  )
}

function OceanFloor() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current)
      (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.07+Math.sin(clock.getElapsedTime()*0.35)*0.03
  })
  return (
    <mesh ref={ref} position={[0,0,-0.18]}>
      <planeGeometry args={[9,11]} />
      <meshStandardMaterial color="#020c1a" emissive="#0a1e38" emissiveIntensity={0.07} roughness={0.95} metalness={0.1} />
    </mesh>
  )
}

function CameraRig({ active, progressRef }: { active:number;progressRef:MutableRefObject<number> }) {
  const { camera } = useThree()
  const posRef  = useRef(new THREE.Vector3(0,-0.2,4.8))
  const lookRef = useRef(new THREE.Vector3(0,0,0))
  const tmpPos  = useRef(new THREE.Vector3())
  const tmpLook = useRef(new THREE.Vector3())
  useFrame(() => {
    const r = GREECE_REGIONS[active]
    tmpPos.current.set(r.x*0.55, r.y*0.55, 4.5-progressRef.current*0.7)
    tmpLook.current.set(r.x*0.45, r.y*0.45, 0)
    posRef.current .lerp(tmpPos.current, 0.03)
    lookRef.current.lerp(tmpLook.current, 0.03)
    camera.position.copy(posRef.current)
    camera.lookAt(lookRef.current)
  })
  return null
}

/* ── Scene ───────────────────────────────────────────────────────────────── */
function Scene({ activeRegion, progressRef }: { activeRegion:number; progressRef:MutableRefObject<number> }) {
  return (
    <>
      <ambientLight intensity={0.12} />
      <directionalLight position={[2,3,4]} intensity={0.55} color="#6ab4ff" />
      <pointLight position={[-1,1,2]} intensity={0.38} color="#00aaff" />
      <pointLight position={[1,-1,1]} intensity={0.18} color="#004499" />

      <OceanFloor />
      <Landmass pts={MAINLAND} z={-0.04} />
      <Landmass pts={CRETE}   z={-0.03} depth={0.04} />

      {SMALL_ISLANDS.map(([x,y,z],i) => (
        <mesh key={i} position={[x,y,z]}>
          <circleGeometry args={[0.025+(i%3)*0.012,7]} />
          <meshStandardMaterial color="#0b2318" emissive="#0d4030" emissiveIntensity={0.3} />
        </mesh>
      ))}

      {ARCS.map(([a,b],i) => {
        const rA=GREECE_REGIONS[a], rB=GREECE_REGIONS[b]
        return <EnergyArc key={i} ax={rA.x} ay={rA.y} bx={rB.x} by={rB.y} speed={0.8+i*0.12} />
      })}

      {GREECE_REGIONS.map((r,i) => (
        <RegionMarker key={r.id} x={r.x} y={r.y} active={i===activeRegion} idx={i} />
      ))}

      <CameraRig active={activeRegion} progressRef={progressRef} />
    </>
  )
}

/* ── Export ──────────────────────────────────────────────────────────────── */
export interface GreeceMap3DProps {
  /** Active city/region index — drives the camera target & marker glow. */
  activeRegion: number
  /**
   * Continuous 0..1 scroll progress, updated imperatively by GSAP ScrollTrigger
   * (kept in a ref so the scene never re-renders per frame).
   */
  progressRef: MutableRefObject<number>
  className?: string
}

export function GreeceMap3D({ activeRegion, progressRef, className }: GreeceMap3DProps) {
  return (
    <Canvas camera={{ position:[0,-0.2,4.8], fov:38 }} dpr={[1,2]}
      gl={{ antialias:true }} className={className} style={{ background:'#020c1a' }}>
      <Suspense fallback={null}>
        <Scene activeRegion={activeRegion} progressRef={progressRef} />
      </Suspense>
    </Canvas>
  )
}
