import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const PARTICLE_COUNT = 220
const BOUNDS = { x: 7.5, y: 4.5, z: 3 }

function ParticleField() {
  const groupRef = useRef<THREE.Group>(null)
  const pointsRef = useRef<THREE.Points>(null)
  const mouse = useRef({ x: 0, y: 0 })

  const { positions, seeds } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const seeds = new Float32Array(PARTICLE_COUNT * 4) // baseX, baseY, speed, phase
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const bx = (Math.random() - 0.5) * 2 * BOUNDS.x
      const by = (Math.random() - 0.5) * 2 * BOUNDS.y
      positions[i * 3] = bx
      positions[i * 3 + 1] = by
      positions[i * 3 + 2] = (Math.random() - 0.5) * BOUNDS.z - 1
      seeds[i * 4] = bx
      seeds[i * 4 + 1] = by
      seeds[i * 4 + 2] = 0.2 + Math.random() * 0.5
      seeds[i * 4 + 3] = Math.random() * Math.PI * 2
    }
    return { positions, seeds }
  }, [])

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      mouse.current.x = (event.clientX / window.innerWidth) * 2 - 1
      mouse.current.y = (event.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    return () => window.removeEventListener('pointermove', onPointerMove)
  }, [])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const points = pointsRef.current
    if (!points) return
    const attr = points.geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const bx = seeds[i * 4]
      const by = seeds[i * 4 + 1]
      const s = seeds[i * 4 + 2]
      const p = seeds[i * 4 + 3]
      arr[i * 3] = bx + Math.sin(t * s + p) * 0.35
      arr[i * 3 + 1] = by + Math.cos(t * s * 0.8 + p) * 0.28 + Math.sin(t * 0.05 + p) * 0.15
    }
    attr.needsUpdate = true

    const group = groupRef.current
    if (group) {
      // Subtle micro-parallax toward the cursor.
      group.rotation.y += (mouse.current.x * 0.09 - group.rotation.y) * 0.04
      group.rotation.x += (-mouse.current.y * 0.06 - group.rotation.x) * 0.04
    }
  })

  return (
    <group ref={groupRef}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.05}
          color="#8fd8ff"
          transparent
          opacity={0.75}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  )
}

/** Lightweight ambient particle backdrop for the hero section. */
export default function HeroParticles() {
  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 50 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      style={{ background: 'transparent' }}
    >
      <ParticleField />
    </Canvas>
  )
}
