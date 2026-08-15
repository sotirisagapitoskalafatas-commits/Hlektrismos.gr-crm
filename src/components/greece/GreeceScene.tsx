import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

import { MAINLAND, CRETE, ISLANDS } from "@/lib/greece-shape";
import { REGIONS, project } from "@/lib/regions";
import { greeceSatelliteTiles } from "@/lib/satellite";

function toShape(points: [number, number][]) {
  const shape = new THREE.Shape();
  points.forEach(([lon, lat], i) => {
    const [x, y] = project(lon, lat);
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}

const EXTRUDE = { depth: 0.32, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 };

function Landmass() {
  const geometries = useMemo(() => {
    const shapes = [toShape(MAINLAND), toShape(CRETE)];
    ISLANDS.forEach(({ center, r }) => {
      const [x, y] = project(center[0], center[1]);
      const shape = new THREE.Shape();
      shape.absellipse(x, y, r * 1.1, r * 0.8, 0, Math.PI * 2, false, 0);
      shapes.push(shape);
    });
    return shapes.map((s) => new THREE.ExtrudeGeometry(s, EXTRUDE));
  }, []);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.34, 0]}>
      {geometries.map((geometry, i) => (
        <mesh key={i} geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial color="#0d1c33" roughness={0.9} metalness={0.05} />
        </mesh>
      ))}
      {geometries.map((geometry, i) => (
        <lineSegments key={`edge-${i}`} position={[0, 0, 0.33]}>
          <edgesGeometry args={[geometry, 35]} />
          <lineBasicMaterial color="#5c9bff" transparent opacity={0.5} />
        </lineSegments>
      ))}
    </group>
  );
}

function EnergyLines({ active }: { active: number }) {
  const curves = useMemo(() => {
    const pts = REGIONS.map((r) => {
      const [x, z] = project(r.coords[0], r.coords[1]);
      return new THREE.Vector3(x, 0.34, z);
    });
    return pts.slice(0, -1).map((from, i) => {
      const to = pts[i + 1]!;
      const mid = from.clone().lerp(to, 0.5);
      mid.y += from.distanceTo(to) * 0.42 + 0.3;
      return new THREE.QuadraticBezierCurve3(from, mid, to);
    });
  }, []);

  return (
    <group>
      {curves.map((curve, i) => (
        <mesh key={i}>
          <tubeGeometry args={[curve, 48, 0.018, 8, false]} />
          <meshBasicMaterial
            color={i < active ? "#2f6bd8" : "#9dbdf0"}
            transparent
            opacity={i < active ? 0.85 : 0.28}
          />
        </mesh>
      ))}
    </group>
  );
}

function Marker({
  position,
  isActive,
  visited,
}: {
  position: [number, number, number];
  isActive: boolean;
  visited: boolean;
}) {
  const ring = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = isActive ? 1 + Math.sin(t * 2.6) * 0.28 : 1;
    if (ring.current) {
      ring.current.scale.setScalar(pulse);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = isActive ? 0.75 : 0.25;
    }
    if (beam.current) {
      const target = isActive ? 1.5 : visited ? 0.6 : 0.28;
      beam.current.scale.y += (target - beam.current.scale.y) * 0.08;
      beam.current.position.y = 0.34 + beam.current.scale.y * 0.5;
    }
  });

  return (
    <group position={position}>
      <mesh position={[0, 0.36, 0]}>
        <sphereGeometry args={[0.075, 20, 20]} />
        <meshBasicMaterial color={isActive ? "#f5a524" : "#2f6bd8"} />
      </mesh>
      <mesh ref={ring} position={[0, 0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.13, 0.19, 32]} />
        <meshBasicMaterial color={isActive ? "#f5a524" : "#2f6bd8"} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={beam} position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 1, 8]} />
        <meshBasicMaterial
          color={isActive ? "#f5a524" : "#2f6bd8"}
          transparent
          opacity={isActive ? 0.7 : 0.35}
        />
      </mesh>
    </group>
  );
}

function SatelliteGround() {
  const tiles = useMemo(() => greeceSatelliteTiles(), []);
  const textures = useLoader(
    THREE.TextureLoader,
    tiles.map((tile) => tile.url),
  );

  const meshes = useMemo(
    () =>
      tiles.map((tile, i) => {
        const [x0, z0] = project(tile.west, tile.north);
        const [x1, z1] = project(tile.east, tile.south);
        const texture = textures[i]!;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return {
          key: tile.key,
          texture,
          width: Math.abs(x1 - x0),
          height: Math.abs(z1 - z0),
          center: [(x0 + x1) / 2, 0, (z0 + z1) / 2] as [number, number, number],
        };
      }),
    [tiles, textures],
  );

  return (
    <group>
      {meshes.map((tile) => (
        <mesh key={tile.key} position={tile.center} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[tile.width, tile.height]} />
          <meshBasicMaterial map={tile.texture} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function GroundFallback() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
      <planeGeometry args={[60, 60]} />
      <meshStandardMaterial color="#0b1b30" roughness={0.6} metalness={0.3} />
    </mesh>
  );
}

function Rig({ progress, still }: { progress: number; still: boolean }) {
  const target = useRef(new THREE.Vector3(0, 0, 0));
  const pointer = useRef({ x: 0, y: 0 });

  const anchors = useMemo(
    () =>
      REGIONS.map((r) => {
        const [x, z] = project(r.coords[0], r.coords[1]);
        return new THREE.Vector3(x, 0, z);
      }),
    [],
  );

  useFrame(({ camera, pointer: p, clock }, delta) => {
    pointer.current.x += (p.x - pointer.current.x) * 0.05;
    pointer.current.y += (p.y - pointer.current.y) * 0.05;

    const span = REGIONS.length - 1;
    const pos = Math.min(Math.max(progress, 0), 1) * span;
    const i = Math.min(Math.floor(pos), span - 1 < 0 ? 0 : span - 1);
    const f = pos - i;
    const look = anchors[i]!.clone().lerp(anchors[Math.min(i + 1, span)]!, f);

    const t = clock.getElapsedTime();
    const orbit = still ? 0.6 : 0.55 + pos * 0.55 + Math.sin(t * 0.12) * 0.08 + pointer.current.x * 0.25;
    const dist = still ? 15 : 14.2 - Math.sin(pos * Math.PI) * 3.2;
    const height = still ? 10.5 : 9.6 - Math.sin(pos * Math.PI) * 1.6 + pointer.current.y * 1.1;

    const desired = new THREE.Vector3(
      look.x + Math.sin(orbit) * dist,
      height,
      look.z + Math.cos(orbit) * dist,
    );

    const ease = still ? 1 : Math.min(1, delta * 2.2);
    camera.position.lerp(desired, ease);
    target.current.lerp(look, ease);
    camera.lookAt(target.current);
  });

  return null;
}

export default function GreeceScene({
  progress,
  reducedMotion = false,
}: {
  progress: number;
  reducedMotion?: boolean;
}) {
  const span = REGIONS.length - 1;
  const active = Math.round(Math.min(Math.max(progress, 0), 1) * span);

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [8, 10, 14], fov: 40 }}
      gl={{ antialias: true, alpha: true }}
      frameloop={reducedMotion ? "demand" : "always"}
    >
      <hemisphereLight args={["#ffffff", "#8fb0d8", 1.15]} />
      <directionalLight position={[6, 9, 4]} intensity={1.1} color="#ffffff" />
      <directionalLight position={[-7, 4, -5]} intensity={0.4} color="#8fb6f2" />
      <Suspense fallback={<GroundFallback />}>
        <SatelliteGround />
      </Suspense>
      <Landmass />
      <EnergyLines active={active} />
      {REGIONS.map((r, i) => {
        const [x, z] = project(r.coords[0], r.coords[1]);
        return (
          <Marker
            key={r.id}
            position={[x, 0, z]}
            isActive={i === active}
            visited={i < active}
          />
        );
      })}
      <Rig progress={progress} still={reducedMotion} />
    </Canvas>
  );
}
