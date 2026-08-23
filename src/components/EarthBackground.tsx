import { useEffect, useRef, useState } from 'react'

/* ── Global Orb — photoreal 3D Earth background ──────────────────────────── */

type CameraKeyframe = { lat: number; lng: number; dist: number }

interface Props {
  /** "scroll" interpolates LANDING_KEYFRAMES by page scroll; "ambient" slow-orbits. */
  mode?: 'scroll' | 'ambient'
  keyframes?: CameraKeyframe[]
  className?: string
}

/** Scroll-driven camera stops (hero → Europe → Med → Atlantic → Middle East → Asia). */
export const LANDING_KEYFRAMES: CameraKeyframe[] = [
  { lat: 18, lng: 10, dist: 760 },
  { lat: 48, lng: 9, dist: 430 },
  { lat: 38, lng: 18, dist: 340 },
  { lat: 30, lng: -30, dist: 415 },
  { lat: 26, lng: 45, dist: 360 },
  { lat: 24, lng: 100, dist: 640 },
]

/** Single ambient stop focused over Greece / the Mediterranean. */
export const AMBIENT_KEYFRAME: CameraKeyframe = { lat: 36, lng: 20, dist: 640 }

const CITIES: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'Athens', lat: 37.98, lng: 23.73 },
  { name: 'Madrid', lat: 40.42, lng: -3.7 },
  { name: 'Lisbon', lat: 38.72, lng: -9.14 },
  { name: 'London', lat: 51.51, lng: -0.13 },
  { name: 'Paris', lat: 48.86, lng: 2.35 },
  { name: 'Nicosia', lat: 35.19, lng: 33.38 },
  { name: 'Dubai', lat: 25.2, lng: 55.27 },
  { name: 'New York', lat: 40.71, lng: -74.01 },
  { name: 'Singapore', lat: 1.35, lng: 103.82 },
  { name: 'Sydney', lat: -33.87, lng: 151.21 },
  { name: 'Cape Town', lat: -33.92, lng: 18.42 },
  { name: 'São Paulo', lat: -23.55, lng: -46.63 },
  { name: 'Tokyo', lat: 35.68, lng: 139.69 },
  { name: 'Berlin', lat: 52.52, lng: 13.4 },
  { name: 'Milan', lat: 45.46, lng: 9.19 },
]

const TEAL = '#48d9c9'
const BRASS = '#c9a24a'

type Status = 'loading' | 'ready' | 'fallback'

export default function EarthBackground({ mode = 'ambient', keyframes, className = '' }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>('loading')

  // Latest values via refs — the heavy effect must never re-run on prop identity changes.
  const modeRef = useRef(mode)
  modeRef.current = mode
  const keyframesRef = useRef<CameraKeyframe[]>(
    keyframes ?? (mode === 'scroll' ? LANDING_KEYFRAMES : [AMBIENT_KEYFRAME]),
  )
  keyframesRef.current = keyframes ?? (mode === 'scroll' ? LANDING_KEYFRAMES : [AMBIENT_KEYFRAME])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let dispose: (() => void) | null = null

    const webglOK = () => {
      try {
        const c = document.createElement('canvas')
        return !!(c.getContext('webgl2') ?? c.getContext('webgl'))
      } catch {
        return false
      }
    }

    async function init() {
      const el = host
      try {
        if (!webglOK()) throw new Error('WebGL unavailable')

        const THREE = await import('three')
        if (cancelled || !host) return

        const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const MOBILE = window.matchMedia('(max-width: 768px)').matches
        const R = 100

        /* Spherical helper — matches equirectangular texture mapping. */
        const DEG = Math.PI / 180
        const llToVec = (lat: number, lng: number, r: number, out: import('three').Vector3) =>
          out.set(
            -r * Math.sin((90 - lat) * DEG) * Math.cos((lng + 180) * DEG),
            r * Math.cos((90 - lat) * DEG),
            r * Math.sin((90 - lat) * DEG) * Math.sin((lng + 180) * DEG),
          )

        /* ── Renderer / scene / camera ── */
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, MOBILE ? 1.4 : 2))
        renderer.setSize(window.innerWidth, window.innerHeight)
        host.appendChild(renderer.domElement)

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 1, 4000)

        const distFactor = () => Math.max(0.42, Math.min(1.2, window.innerHeight / 1800))

        /* ── Textures (CDN) with instant 1×1 fallbacks so failures never blank the globe ── */
        const flatTex = (hex: number) => {
          const t = new THREE.DataTexture(new Uint8Array([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255]), 1, 1)
          t.needsUpdate = true
          return t
        }
        const loader = new THREE.TextureLoader()
        loader.setCrossOrigin('anonymous')
        const CDN = 'https://unpkg.com/three-globe@2.31.0/example/img/'
        const created: import('three').Texture[] = []
        const loadTex = (url: string, srgb: boolean, fallbackHex: number) => {
          // Uniform holder starts on a flat 1×1 colour; swaps to the CDN image on success.
          const holder: { value: import('three').Texture } = { value: flatTex(fallbackHex) }
          created.push(holder.value)
          loader.load(
            url,
            (ok) => {
              if (cancelled) return
              ok.colorSpace = srgb ? THREE.SRGBColorSpace : holder.value.colorSpace
              holder.value = ok
              created.push(ok)
            },
            undefined,
            () => console.warn(`[EarthBackground] texture failed: ${url} — using fallback colour`),
          )
          return holder
        }
        const dayTex = loadTex(`${CDN}earth-blue-marble.jpg`, true, 0x0b3d66)
        const nightTex = loadTex(`${CDN}earth-night.jpg`, true, 0x050a14)
        const bumpTex = loadTex(`${CDN}earth-topology.png`, false, 0x808080)

        /* ── Earth ── */
        const segW = MOBILE ? 64 : 128
        const segH = MOBILE ? 48 : 96
        const uniforms = {
          uDay: dayTex,
          uNight: nightTex,
          uBump: bumpTex,
          uSunDir: { value: new THREE.Vector3(1, 0.28, 0).normalize() },
        }
        const earthMat = new THREE.ShaderMaterial({
          uniforms,
          vertexShader: /* glsl */ `
            varying vec2 vUv;
            varying vec3 vNormalW;
            varying vec3 vPosW;
            void main() {
              vUv = uv;
              vNormalW = normalize(mat3(modelMatrix) * normal);
              vec4 wp = modelMatrix * vec4(position, 1.0);
              vPosW = wp.xyz;
              gl_Position = projectionMatrix * viewMatrix * wp;
            }
          `,
          fragmentShader: /* glsl */ `
            uniform sampler2D uDay;
            uniform sampler2D uNight;
            uniform sampler2D uBump;
            uniform vec3 uSunDir;
            varying vec2 vUv;
            varying vec3 vNormalW;
            varying vec3 vPosW;
            void main() {
              vec3 N = normalize(vNormalW);
              // Finite-difference bump from topology map (tangent frame from sphere param).
              vec2 tx = vec2(1.0 / 1024.0, 1.0 / 512.0);
              float hl = texture2D(uBump, vUv - vec2(tx.x, 0.0)).r;
              float hr = texture2D(uBump, vUv + vec2(tx.x, 0.0)).r;
              float hd = texture2D(uBump, vUv - vec2(0.0, tx.y)).r;
              float hu = texture2D(uBump, vUv + vec2(0.0, tx.y)).r;
              vec3 up = abs(N.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
              vec3 T = normalize(cross(up, N));
              vec3 B = cross(N, T);
              vec3 Nb = normalize(N - T * (hr - hl) * 2.2 - B * (hu - hd) * 2.2);

              vec3 L = normalize(uSunDir);
              float lambert = dot(Nb, L);
              float dayMix = smoothstep(-0.18, 0.32, lambert);

              vec3 day = texture2D(uDay, vUv).rgb;
              vec3 night = texture2D(uNight, vUv).rgb;
              vec3 col = mix(night * (1.0 + 0.35 * max(-lambert, 0.0)), day * (0.35 + 0.75 * max(lambert, 0.0)), dayMix);

              vec3 V = normalize(cameraPosition - vPosW);
              float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
              col += vec3(0.282, 0.851, 0.788) * fresnel; // #48D9C9 rim
              gl_FragColor = vec4(col, 1.0);
            }
          `,
        })
        const earth = new THREE.Mesh(new THREE.SphereGeometry(R, segW, segH), earthMat)
        scene.add(earth)

        /* ── Atmosphere shell ── */
        const atmosMat = new THREE.ShaderMaterial({
          vertexShader: earthMat.vertexShader,
          fragmentShader: /* glsl */ `
            varying vec3 vNormalW;
            varying vec3 vPosW;
            void main() {
              vec3 V = normalize(cameraPosition - vPosW);
              float intensity = pow(1.0 - abs(dot(normalize(vNormalW), V)), 2.6);
              gl_FragColor = vec4(0.282, 0.851, 0.788, intensity * 0.5);
            }
          `,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        })
        const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(R * 1.09, segW, segH), atmosMat)
        scene.add(atmosphere)

        /* ── Clouds (desktop only, skipped for reduced motion) ── */
        let clouds: import('three').Mesh | null = null
        if (!MOBILE && !REDUCED) {
          const cloudTex = loader.load('https://raw.githubusercontent.com/turban/webgl-earth/master/images/fair_clouds_4k.png')
          cloudTex.colorSpace = THREE.SRGBColorSpace
          created.push(cloudTex)
          clouds = new THREE.Mesh(
            new THREE.SphereGeometry(R * 1.012, segW, segH),
            new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.28, depthWrite: false }),
          )
          scene.add(clouds)
        }

        /* ── Starfield ── */
        const starCount = MOBILE ? 900 : 2200
        const starPos = new Float32Array(starCount * 3)
        for (let i = 0; i < starCount; i++) {
          const r = 900 + Math.random() * 900
          const theta = Math.random() * Math.PI * 2
          const phi = Math.acos(2 * Math.random() - 1)
          starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
          starPos[i * 3 + 1] = r * Math.cos(phi)
          starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
        }
        const starGeo = new THREE.BufferGeometry()
        starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
        const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false })
        scene.add(new THREE.Points(starGeo, starMat))

        /* ── City markers ── */
        const markerBits: Array<{ ring: import('three').Mesh; phase: number }> = []
        const dotGeo = new THREE.SphereGeometry(0.9, 12, 12)
        const ringGeo = new THREE.RingGeometry(1.4, 1.8, 24)
        const dotMat = new THREE.MeshBasicMaterial({ color: TEAL })
        const ringMatProto = new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
        for (const c of CITIES) {
          const p = llToVec(c.lat, c.lng, R + 0.6, new THREE.Vector3())
          const g = new THREE.Group()
          const dot = new THREE.Mesh(dotGeo, dotMat)
          dot.position.copy(p)
          g.add(dot)
          const ring = new THREE.Mesh(ringGeo, ringMatProto.clone())
          ring.position.copy(p)
          ring.lookAt(p.clone().multiplyScalar(2))
          g.add(ring)
          markerBits.push({ ring, phase: Math.random() * 1.6 })
          scene.add(g)
        }

        /* ── Energy arcs ── */
        interface Arc {
          line: import('three').Line
          head: import('three').Mesh
          curve: import('three').QuadraticBezierCurve3
          geo: import('three').BufferGeometry
          mat: import('three').LineBasicMaterial
          headGeo: import('three').BufferGeometry
          headMat: import('three').MeshBasicMaterial
          t: number
          fading: boolean
        }
        const arcs: Arc[] = []
        const arcPts = 140
        const maxArcs = REDUCED ? 0 : MOBILE ? 4 : 9
        const tmpA = new THREE.Vector3()
        const tmpB = new THREE.Vector3()
        const spawnArc = () => {
          if (arcs.length >= maxArcs) return
          const i = Math.floor(Math.random() * CITIES.length)
          let j = Math.floor(Math.random() * (CITIES.length - 1))
          if (j >= i) j++
          const a = llToVec(CITIES[i].lat, CITIES[i].lng, R + 0.5, tmpA).clone()
          const b = llToVec(CITIES[j].lat, CITIES[j].lng, R + 0.5, tmpB).clone()
          const ang = a.angleTo(b)
          const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(R + 8 + ang * 26)
          const curve = new THREE.QuadraticBezierCurve3(a, mid, b)
          const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(arcPts))
          const brass = Math.random() < 0.35
          const mat = new THREE.LineBasicMaterial({ color: brass ? BRASS : TEAL, transparent: true, opacity: 0.85 })
          const line = new THREE.Line(geo, mat)
          geo.drawRange.count = 0
          const headGeo = new THREE.SphereGeometry(1.1, 10, 10)
          const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
          const head = new THREE.Mesh(headGeo, headMat)
          scene.add(line, head)
          arcs.push({ line, head, curve, geo, mat, headGeo, headMat, t: 0, fading: false })
        }
        let spawnClock = 0

        /* ── Camera choreography ── */
        const kfs = keyframesRef.current
        const camPos = new THREE.Vector3()
        const camTarget = new THREE.Vector3()
        const smooth01 = (x: number) => x * x * (3 - 2 * x)
        let scrollP = 0
        const readScroll = () => {
          const max = document.documentElement.scrollHeight - window.innerHeight
          scrollP = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0
        }
        const applyCamera = (lat: number, lng: number, dist: number) => {
          llToVec(lat, lng, dist * distFactor(), camTarget)
          camPos.lerp(camTarget, 0.14)
          camera.position.copy(camPos)
          camera.lookAt(0, 0, 0)
        }
        const kf0 = kfs[0]
        llToVec(kf0.lat, kf0.lng, kf0.dist * distFactor(), camPos)
        camera.position.copy(camPos)
        camera.lookAt(0, 0, 0)
        if (modeRef.current === 'scroll') {
          readScroll()
          window.addEventListener('scroll', readScroll, { passive: true })
        }

        const onResize = () => {
          camera.aspect = window.innerWidth / window.innerHeight
          camera.updateProjectionMatrix()
          renderer.setSize(window.innerWidth, window.innerHeight)
        }
        window.addEventListener('resize', onResize)

        /* ── Loop ── */
        const clock = new THREE.Clock()
        let raf = 0
        let running = true
        const tick = () => {
          if (!running) return
          raf = requestAnimationFrame(tick)
          const dt = Math.min(clock.getDelta(), 0.05)
          const t = clock.getElapsedTime()

          uniforms.uSunDir.value.set(Math.cos(t * 0.03), 0.28, Math.sin(t * 0.03)).normalize()

          if (modeRef.current === 'ambient') {
            const kf = keyframesRef.current[0] ?? AMBIENT_KEYFRAME
            const lat = kf.lat + (REDUCED ? 0 : Math.sin(t * 0.25) * 4)
            const lng = kf.lng + (REDUCED ? 0 : t * 1.6)
            const dist = kf.dist + (REDUCED ? 0 : Math.sin(t * 0.8) * 12)
            applyCamera(lat, lng, dist)
          } else {
            // Smoothstep-eased segment interpolation + exponential damping.
            const seg = scrollP * (kfs.length - 1)
            const i = Math.min(Math.floor(seg), kfs.length - 2)
            const f = smooth01(seg - i)
            const a = kfs[i]
            const b = kfs[i + 1]
            const target = llToVec(
              a.lat + (b.lat - a.lat) * f,
              a.lng + (b.lng - a.lng) * f,
              (a.dist + (b.dist - a.dist) * f) * distFactor(),
              camTarget,
            )
            const k = 1 - Math.pow(0.0015, dt)
            camPos.lerp(target, k)
            camera.position.copy(camPos)
            camera.lookAt(0, 0, 0)
          }

          if (clouds && !REDUCED) clouds.rotation.y += dt * 0.006

          for (const m of markerBits) {
            const ph = ((t + m.phase) % 1.6) / 1.6
            m.ring.scale.setScalar(1 + ph * 1.1)
            ;(m.ring.material as import('three').MeshBasicMaterial).opacity = 0.55 * (1 - ph)
          }

          spawnClock += dt
          if (spawnClock > 0.9) {
            spawnClock = 0
            spawnArc()
          }
          for (let idx = arcs.length - 1; idx >= 0; idx--) {
            const arc = arcs[idx]
            if (!arc.fading) {
              arc.t += dt / 2.2
              if (arc.t >= 1) {
                arc.t = 1
                arc.fading = true
                arc.head.visible = false
              }
              arc.geo.drawRange.count = Math.floor(arc.t * (arcPts + 1))
              arc.curve.getPoint(arc.t, arc.head.position)
            } else {
              arc.mat.opacity -= dt / 0.8
              if (arc.mat.opacity <= 0) {
                scene.remove(arc.line, arc.head)
                arc.geo.dispose()
                arc.mat.dispose()
                arc.headGeo.dispose()
                arc.headMat.dispose()
                arcs.splice(idx, 1)
                continue
              }
            }
          }

          renderer.render(scene, camera)
        }
        tick()

        const onVisibility = () => {
          if (document.hidden) {
            running = false
            cancelAnimationFrame(raf)
          } else if (!running) {
            running = true
            clock.getDelta()
            tick()
          }
        }
        document.addEventListener('visibilitychange', onVisibility)

        dispose = () => {
          running = false
          cancelAnimationFrame(raf)
          window.removeEventListener('scroll', readScroll)
          window.removeEventListener('resize', onResize)
          document.removeEventListener('visibilitychange', onVisibility)
          for (const arc of arcs) {
            arc.geo.dispose()
            arc.mat.dispose()
            arc.headGeo.dispose()
            arc.headMat.dispose()
          }
          dotGeo.dispose()
          ringGeo.dispose()
          dotMat.dispose()
          for (const m of markerBits) (m.ring.material as import('three').MeshBasicMaterial).dispose()
          starGeo.dispose()
          starMat.dispose()
          for (const t of created) t.dispose()
          earth.geometry.dispose()
          earthMat.dispose()
          atmosphere.geometry.dispose()
          atmosMat.dispose()
          if (clouds) {
            clouds.geometry.dispose()
            ;(clouds.material as import('three').Material).dispose()
          }
          renderer.dispose()
          renderer.domElement.remove()
        }

        setStatus('ready')
      } catch (e) {
        console.warn('[EarthBackground] falling back to static gradient:', e)
        el?.classList.add('earth-fallback')
        setStatus('fallback')
      }
    }
    void init()

    return () => {
      cancelled = true
      dispose?.()
    }
  }, [])

  return (
    <div ref={hostRef} className={`earth-canvas ${className}`} aria-hidden="true">
      {status === 'loading' && (
        <div className="earth-loader">Φόρτωση…</div>
      )}
    </div>
  )
}
