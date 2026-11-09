import { Component, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AudioSignal } from "../types/audio";
import { usePageVisible } from "../hooks/usePageVisible";
import { useReducedMotion } from "../hooks/useReducedMotion";

const vertexShader = `
  uniform float uTime;
  uniform float uBass;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    float wave = sin(position.x * 4.5 + uTime * 0.5) * sin(position.y * 5.0 - uTime * 0.35) * sin(position.z * 4.0 + uTime * 0.4);
    vec3 p = position + normal * wave * (0.035 + uBass * 0.16);
    vNormal = normalize(normalMatrix * normal);
    vPosition = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const fragmentShader = `
  uniform float uBass;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    float gradient = smoothstep(-1.0, 1.0, vPosition.x + vPosition.y * 0.5);
    vec3 violet = vec3(0.39, 0.22, 0.95);
    vec3 cyan = vec3(0.14, 0.84, 0.92);
    vec3 color = mix(violet, cyan, gradient);
    float rim = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 1.7);
    float pulse = 0.7 + uBass * 0.35 + sin(uTime * 0.7) * 0.035;
    gl_FragColor = vec4(color * (0.45 + rim * 0.8) * pulse, 0.78);
  }
`;
function Reactor({
  signal,
  reducedMotion,
}: {
  signal: AudioSignal;
  reducedMotion: boolean;
}) {
  const core = useRef<THREE.Mesh>(null);
  const shell = useRef<THREE.Mesh>(null);
  const orbits = useRef<THREE.Group>(null);
  const elapsed = useRef(0);
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uBass: { value: 0 } }),
    [],
  );
  useFrame((_, rawDelta) => {
    const delta = reducedMotion ? 0 : Math.min(rawDelta, 0.05);
    elapsed.current += delta;
    const time = elapsed.current;
    const bass = signal.bass * (reducedMotion ? 0.3 : 1);
    if (material.current) {
      material.current.uniforms.uTime.value = time;
      material.current.uniforms.uBass.value = bass;
    }
    if (core.current) {
      core.current.rotation.y += delta * 0.075;
      core.current.rotation.z = Math.sin(time * 0.12) * 0.12;
      core.current.scale.setScalar(1 + bass * 0.2);
    }
    if (shell.current) {
      shell.current.rotation.y -= delta * 0.04;
      shell.current.rotation.z += delta * 0.025;
      shell.current.scale.setScalar(1.14 + bass * 0.13);
    }
    if (orbits.current) orbits.current.rotation.z = Math.sin(time * 0.08) * 0.1;
  });
  return (
    <group rotation={[0.15, 0, 0]}>
      <mesh ref={core}>
        <icosahedronGeometry args={[1.35, 12]} />
        <shaderMaterial
          ref={material}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          wireframe
          transparent
        />
      </mesh>
      <mesh ref={shell} rotation={[0.4, 0.2, 0.4]}>
        <icosahedronGeometry args={[1.35, 1]} />
        <meshBasicMaterial
          color="#8d7bdc"
          wireframe
          transparent
          opacity={0.18}
        />
      </mesh>
      <group ref={orbits}>
        {[0, 1, 2].map((i) => (
          <mesh
            key={i}
            rotation={[Math.PI / 2 + 0.2 + i * 0.25, i * 0.65, i * 0.35]}
          >
            <torusGeometry args={[1.93 + i * 0.16, 0.004, 4, 180]} />
            <meshBasicMaterial
              color={i === 1 ? "#67d3dc" : "#8672ce"}
              transparent
              opacity={0.32 - i * 0.06}
            />
          </mesh>
        ))}
      </group>
      <mesh position={[0, -2.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.5, 2.505, 160]} />
        <meshBasicMaterial
          color="#5c617d"
          transparent
          opacity={0.22}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
class SceneBoundary extends Component<
  { children: ReactNode; outputOnly?: boolean },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="scene-fallback" role="status">
        The visual renderer is unavailable. Try enabling hardware acceleration
        or reloading.{" "}
        {this.props.outputOnly ? "" : "Audio controls remain available."}
      </div>
    ) : (
      this.props.children
    );
  }
}
export function PulseReactor({
  signal,
  outputOnly = false,
}: {
  signal: AudioSignal;
  outputOnly?: boolean;
}) {
  const visible = usePageVisible();
  const reducedMotion = useReducedMotion();
  return (
    <SceneBoundary outputOnly={outputOnly}>
      <Canvas
        camera={{ position: [0, 0.3, 7], fov: 43 }}
        dpr={[1, 1.75]}
        frameloop={visible ? "always" : "never"}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        fallback={
          <div className="scene-fallback">
            WebGL is unavailable.{" "}
            {outputOnly
              ? "Try enabling hardware acceleration."
              : "Audio playback still works."}
          </div>
        }
      >
        <Reactor signal={signal} reducedMotion={reducedMotion} />
      </Canvas>
    </SceneBoundary>
  );
}
