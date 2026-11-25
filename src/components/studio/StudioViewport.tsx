"use client";

import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, OrbitControls, Sparkles, TransformControls } from "@react-three/drei";
import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { SceneObject, SceneSettings, TransformTool, Vec3 } from "@/lib/studio/scene";

export interface RenderStats { fps: number; triangles: number; calls: number; elapsed: number; collected: number; won: boolean; adaptive?: boolean }
export interface ViewportApi { screenshot: () => string; exportGlb: () => Promise<ArrayBuffer> }
export interface ViewRequest { id: number; type: "reset" | "focus" | "top" | "front" }
interface Props {
  objects: SceneObject[];
  settings: SceneSettings;
  selectedId: string | null;
  tool: TransformTool;
  playState: "edit" | "playing" | "paused";
  viewRequest: ViewRequest;
  apiRef: MutableRefObject<ViewportApi | null>;
  onSelect: (id: string | null) => void;
  onTransform: (id: string, patch: Partial<SceneObject>) => void;
  onStats: (stats: RenderStats) => void;
  onReady: () => void;
  software?: boolean;
}

function random(seed: number) { const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453123; return n - Math.floor(n); }

function islandGeometry(top: boolean) {
  const positions: number[] = [], colors: number[] = [];
  const n = 34;
  const rings = top ? [{ y: 0.13, r: 0 }, { y: 0.12, r: 2.9 }, { y: 0.02, r: 5.84 }] : [{ y: 0.02, r: 5.84 }, { y: -0.38, r: 6.05 }, { y: -1.5, r: 5.45 }, { y: -3.2, r: 4.05 }, { y: -5.25, r: 1.7 }, { y: -5.85, r: 0.05 }];
  const point = (ring: number, j: number) => {
    const a = (j % n) / n * Math.PI * 2;
    const data = rings[ring];
    const r = data.r * (0.94 + random((j % n) + 23) * 0.12);
    return [Math.cos(a) * r, data.y + (ring === 0 && top ? 0 : (random((j % n) * 7 + ring * 2) - 0.5) * (top ? 0.1 : ring === 0 ? 0.1 : 0.6)), Math.sin(a) * r];
  };
  const triangle = (a: number[], b: number[], c: number[], seed: number, ring: number) => {
    const palette = top ? ["#758a48", "#84954e", "#718344", "#8c9a58", "#6f8546", "#9ba568"] : ring === 0 ? ["#7a8158", "#869263", "#6a7350"] : ["#727c78", "#89908a", "#a5a798", "#68746f", "#92998c", "#808a7b"];
    const col = new THREE.Color(palette[Math.floor(random(seed) * palette.length)]);
    positions.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) colors.push(col.r, col.g, col.b);
  };
  for (let ring = 0; ring < rings.length - 1; ring++) for (let i = 0; i < n; i++) {
    triangle(point(ring, i), point(ring + 1, i + 1), point(ring + 1, i), i + ring * 23, ring);
    triangle(point(ring, i), point(ring, i + 1), point(ring + 1, i + 1), i + ring * 17 + 5, ring);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function Grass() {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 690; i++) {
      const a = random(i + 41) * Math.PI * 2, r = Math.sqrt(random(i * 2 + 11)) * 5.65;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = 0.08 + random(i * 3 + 7) * 0.25;
      dummy.position.set(x, 0.14 + h / 2, z);
      dummy.rotation.set((random(i + 9) - .5) * .4, a, .12);
      dummy.scale.set(.05 + random(i + 13) * .07, h, .05 + random(i + 4) * .08);
      if (Math.abs(x) < 2.5 && z > -1.3 && z < 1.2) dummy.scale.setScalar(0);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
      ref.current.setColorAt(i, new THREE.Color(["#6a8543", "#8b9d50", "#bac077", "#5f7e42"][i % 4]));
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, []);
  return <instancedMesh ref={ref} args={[undefined, undefined, 690]} castShadow><coneGeometry args={[1, 1, 3]} /><meshStandardMaterial roughness={1} /></instancedMesh>;
}

function Island({ color }: { color: string }) {
  const cliff = useMemo(() => islandGeometry(false), []);
  const ground = useMemo(() => islandGeometry(true), []);
  useEffect(() => () => { cliff.dispose(); ground.dispose(); }, [cliff, ground]);
  return <group>
    <mesh geometry={cliff} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={.96} side={THREE.DoubleSide} /></mesh>
    <mesh geometry={ground} receiveShadow><meshStandardMaterial vertexColors color={new THREE.Color(color).lerp(new THREE.Color("#ffffff"), .65)} roughness={1} side={THREE.DoubleSide} /></mesh>
    <Grass />
    {Array.from({ length: 19 }, (_, i) => {
      const a = i * 2.399, r = 4.4 + random(i + 6) * 1.1;
      return <mesh key={i} position={[Math.cos(a) * r, -.12, Math.sin(a) * r]} scale={[.35 + random(i + 7) * .6, .18 + random(i + 8) * .2, .3 + random(i + 14) * .55]} rotation={[i * .2, i * .5, i * .4]} castShadow><dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color={["#818b76", "#a7ac8f", "#6d7e5b"][i % 3]} roughness={1} /></mesh>;
    })}
    {Array.from({ length: 9 }, (_, i) => <mesh key={`shard-${i}`} position={[Math.cos(i * 2.4) * (3 + random(i + 90)), -2.6 - random(i + 9) * 1.6, Math.sin(i * 2.4) * (2.8 + random(i + 91))]} rotation={[.15, i, Math.PI + (random(i + 41) - .5) * .5]} scale={[.5 + random(i + 2) * .3, 1.1 + random(i + 11) * 1.5, .5]} castShadow><coneGeometry args={[1, 2, 5]} /><meshStandardMaterial color={["#7b8479", "#9ba293", "#68776d"][i % 3]} roughness={1} /></mesh>)}
    <mesh position={[0, -6.8, .3]} rotation={[0, .5, .25]} scale={[.55, .8, .6]}><dodecahedronGeometry /><meshStandardMaterial color="#849187" roughness={1} /></mesh>
    <mesh position={[2.8, -5.8, -.7]} rotation={[.2, 0, .4]} scale={[.28, .45, .3]}><dodecahedronGeometry /><meshStandardMaterial color="#899a8c" roughness={1} /></mesh>
  </group>;
}

function Branch({ a, b, width = .1 }: { a: Vec3; b: Vec3; width?: number }) {
  const { center, quaternion, length } = useMemo(() => {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
    const direction = to.clone().sub(from);
    return { center: from.clone().add(to).multiplyScalar(.5), quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()), length: direction.length() };
  }, [a, b]);
  return <mesh position={center} quaternion={quaternion} castShadow><cylinderGeometry args={[width * .55, width, length, 7]} /><meshStandardMaterial color="#847556" roughness={1} /></mesh>;
}

function Tree({ color }: { color: string }) {
  return <group>
    <Branch a={[0, 0, 0]} b={[.18, 1.7, -.08]} width={.23} />
    <Branch a={[.18, 1.45, -.08]} b={[-.55, 2.6, -.1]} width={.15} />
    <Branch a={[.18, 1.4, -.08]} b={[.9, 2.5, .25]} width={.14} />
    <Branch a={[.04, 1.1, 0]} b={[-.35, 2.25, .75]} width={.13} />
    <Branch a={[.18, 1.6, -.08]} b={[.3, 2.9, -.65]} width={.14} />
    {Array.from({ length: 17 }, (_, i) => {
      const a = i * 2.4, r = Math.sqrt(random(i + 1)) * 1.25;
      return <mesh key={i} position={[Math.cos(a) * r + .15, 2.6 + random(i + 2) * .8, Math.sin(a) * r]} rotation={[i, i * .2, i * .4]} scale={[.75 + random(i + 3) * .5, .48 + random(i + 8) * .3, .7 + random(i + 9) * .4]} castShadow receiveShadow><icosahedronGeometry args={[1, 2]} /><meshStandardMaterial color={new THREE.Color(color).lerp(new THREE.Color(["#c5be70", "#4b7042", "#8ba65f", "#a2b578"][i % 4]), .45)} flatShading roughness={.96} /></mesh>;
    })}
    {Array.from({ length: 6 }, (_, i) => <mesh key={`root-${i}`} position={[Math.cos(i) * .24, .08, Math.sin(i) * .24]} rotation={[0, -i, Math.PI * .26]} scale={[.1, .5, .13]}><cylinderGeometry args={[.4, 1, 1, 5]} /><meshStandardMaterial color="#7a7354" roughness={1} /></mesh>)}
  </group>;
}

const portalVertex = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const portalFragment = `
  uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p), f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
  void main(){
    vec2 p=(vUv-.5)*2.;float r=length(p);float a=atan(p.y,p.x);
    float swirl=sin(a*4.+r*15.-uTime*.7+noise(p*4.+uTime*.08)*3.);
    float clouds=noise(vec2(a*2.+uTime*.06,r*5.-uTime*.07));
    float rim=pow(r,4.);float threads=pow(max(0.,sin(a*3.+r*22.-uTime*.45)),12.)*.25;
    vec3 dark=vec3(.003,.013,.02);vec3 light=uColor*(.05+clouds*.23);
    vec3 color=mix(dark,light,(swirl*.5+.5)*.6+rim*.1)+uColor*(rim*.55+threads*.4);
    vec2 cell=floor(p*90.);float star=step(.998,hash(cell))*pow(max(0.,sin(uTime+hash(cell)*6.)),2.);
    color+=star*.8;float alpha=1.-smoothstep(.95,1.,r);
    gl_FragColor=vec4(color,alpha);
    #include <colorspace_fragment>
  }`;

function Portal({ color }: { color: string }) {
  const shader = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } }), [color]);
  useFrame(({ clock }) => { if (shader.current) shader.current.uniforms.uTime.value = clock.elapsedTime; });
  return <group>
    <mesh position={[0, .08, 0]} receiveShadow castShadow><cylinderGeometry args={[2.6, 2.8, .3, 12]} /><meshStandardMaterial color="#9b9f84" roughness={.95} flatShading /></mesh>
    <mesh position={[0, .26, 0]} receiveShadow><cylinderGeometry args={[2.25, 2.4, .12, 12]} /><meshStandardMaterial color="#b8b89a" roughness={.95} /></mesh>
    {Array.from({ length: 19 }, (_, i) => {
      const angle = (i / 18) * Math.PI * 2;
      if (i > 10 && i < 16) return null;
      return <group key={i} position={[Math.cos(angle) * 1.99, 2.4 + Math.sin(angle) * 2.14, 0]} rotation={[0, 0, angle - Math.PI / 2]}>
        <mesh castShadow receiveShadow><boxGeometry args={[.65, .49 + random(i + 10) * .1, .68]} /><meshStandardMaterial color={["#999d84", "#b0b195", "#7d8977", "#aaad92"][i % 4]} roughness={.92} /></mesh>
        {i % 3 === 0 && <mesh position={[0, .27, .03]} rotation={[0, 0, .1]}><boxGeometry args={[.66, .05, .68]} /><meshStandardMaterial color="#7a9554" roughness={1} /></mesh>}
        {i % 2 === 0 && <mesh position={[0, 0, .347]}><boxGeometry args={[.035, .15, .008]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.8} /></mesh>}
      </group>;
    })}
    {[-1, 1].map(s => <group key={s} position={[s * 2, .65, 0]}>
      <mesh castShadow receiveShadow><boxGeometry args={[.75, .85, .85]} /><meshStandardMaterial color="#9a9e83" roughness={.94} /></mesh>
      <mesh position={[0, -.3, 0]} castShadow><boxGeometry args={[1, .25, 1.05]} /><meshStandardMaterial color="#91977c" roughness={1} /></mesh>
      <mesh position={[s * .2, .85, .12]} rotation={[.1, .1, s * .2]}><dodecahedronGeometry args={[.3, 0]} /><meshStandardMaterial color="#819953" roughness={1} /></mesh>
    </group>)}
    <group position={[0, 2.4, .075]} scale={[1, 1.12, 1]}>
      <mesh><circleGeometry args={[1.71, 96]} /><shaderMaterial ref={shader} uniforms={uniforms} vertexShader={portalVertex} fragmentShader={portalFragment} transparent side={THREE.DoubleSide} toneMapped={false} /></mesh>
      <mesh><torusGeometry args={[1.73, .038, 12, 128]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={3.4} toneMapped={false} /></mesh>
      <mesh position={[0, 0, -.035]}><torusGeometry args={[1.81, .035, 8, 96]} /><meshStandardMaterial color="#446c57" metalness={.6} roughness={.3} /></mesh>
      <mesh position={[0, 0, -.01]}><ringGeometry args={[1.73, 1.89, 96]} /><meshBasicMaterial color={color} transparent opacity={.11} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
      <mesh position={[0, 0, -.012]}><ringGeometry args={[1.73, 2.02, 96]} /><meshBasicMaterial color={color} transparent opacity={.035} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
      <Sparkles count={32} size={2.5} scale={[3.3, 3.7, .4]} color={color} speed={.25} />
    </group>
    <pointLight position={[0, 2, 1.3]} color={color} intensity={6} distance={6} decay={2} />
  </group>;
}

function Rock({ object }: { object: SceneObject }) {
  return <group>
    <mesh position={[0, .35, 0]} rotation={[.2, .4, .15]} scale={[.85, .75, .7]} castShadow receiveShadow><dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color={object.color} roughness={object.roughness} metalness={object.metalness} flatShading /></mesh>
    <mesh position={[.08, .86, -.04]} rotation={[.1, .4, -.1]} scale={[.72, .16, .55]} castShadow><icosahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#7e9657" roughness={1} /></mesh>
    <mesh position={[.7, .06, .2]} scale={[.3, .25, .25]} castShadow><dodecahedronGeometry /><meshStandardMaterial color={object.color} roughness={1} /></mesh>
  </group>;
}

function Crystals({ object }: { object: SceneObject }) {
  const cluster = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (cluster.current) cluster.current.position.y = Math.sin(clock.elapsedTime * 1.2 + object.position[0]) * .06; });
  return <group ref={cluster}>
    <mesh position={[0, .05, 0]} scale={[.55, .2, .42]}><dodecahedronGeometry /><meshStandardMaterial color="#646f65" roughness={1} /></mesh>
    {[{ p: [0, .65, 0], s: .9, r: .1 }, { p: [.35, .38, .05], s: .58, r: -.35 }, { p: [-.26, .3, .2], s: .44, r: .4 }].map((c, i) => <mesh key={i} position={c.p as Vec3} rotation={[.1, i * .7, c.r]} scale={c.s} castShadow><cylinderGeometry args={[0, .23, 1.4, 5]} /><meshStandardMaterial color={object.color} emissive={object.color} emissiveIntensity={.65} roughness={.18} metalness={.15} flatShading /></mesh>)}
    <pointLight color={object.color} intensity={1.2} distance={2.5} />
  </group>;
}

function ObjectMesh({ object, editor }: { object: SceneObject; editor: boolean }) {
  if (object.kind === "terrain") return <Island color={object.color} />;
  if (object.kind === "portal") return <Portal color={object.color} />;
  if (object.kind === "tree") return <Tree color={object.color} />;
  if (object.kind === "rock") return <Rock object={object} />;
  if (object.kind === "crystal") return <Crystals object={object} />;
  if (object.kind === "platform") return <mesh position={[0, 0, 0]} rotation={[0, .1, 0]} receiveShadow castShadow><cylinderGeometry args={[.58, .65, .22, 6]} /><meshStandardMaterial color={object.color} roughness={object.roughness} metalness={object.metalness} flatShading /></mesh>;
  if (object.kind === "light") return <group><pointLight color={object.color} intensity={12} distance={14} />{editor && <mesh userData={{ editorHelper: true }}><sphereGeometry args={[.1, 12, 12]} /><meshBasicMaterial color={object.color} /></mesh>}</group>;
  return editor ? <group userData={{ editorHelper: true }}><mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.3, .34, 32]} /><meshBasicMaterial color="#d5ed9a" transparent opacity={.7} side={THREE.DoubleSide} /></mesh><mesh position={[0, .3, 0]}><cylinderGeometry args={[.05, .05, .45, 8]} /><meshBasicMaterial color="#d5ed9a" transparent opacity={.6} /></mesh><mesh position={[.15, .48, 0]}><coneGeometry args={[.15, .24, 3]} /><meshBasicMaterial color="#d5ed9a" /></mesh></group> : null;
}

function EditableObject({ object, selected, tool, editor, onSelect, onTransform, softShadow }: { object: SceneObject; selected: boolean; tool: TransformTool; editor: boolean; onSelect: Props["onSelect"]; onTransform: Props["onTransform"]; softShadow?: boolean }) {
  const group = useRef<THREE.Group>(null);
  useEffect(() => {
    group.current?.traverse(node => {
      if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshStandardMaterial) {
        node.material.roughness = object.roughness;
        node.material.metalness = object.metalness;
      }
    });
  }, [object.roughness, object.metalness, object.visible, tool, selected]);
  if (!object.visible) return null;
  const content = <group ref={group} name={object.name} userData={{ studioObject: true }} position={object.position} rotation={object.rotation} scale={object.scale} onPointerDown={e => { if (!editor || e.button !== 0) return; e.stopPropagation(); onSelect(object.id); }}>
    <ObjectMesh object={object} editor={editor} />
    {softShadow && ["portal", "tree", "rock"].includes(object.kind) && <mesh position={[0, object.kind === "portal" ? -.015 : .025, 0]} rotation={[-Math.PI / 2, 0, 0]} userData={{ editorHelper: true }}>
      <planeGeometry args={object.kind === "portal" ? [5.5, 4] : object.kind === "tree" ? [3, 2.4] : [2, 1.6]} />
      <shaderMaterial vertexShader={portalVertex} fragmentShader={`varying vec2 vUv;void main(){float r=length((vUv-.5)*2.);gl_FragColor=vec4(.06,.1,.05,exp(-r*r*3.)*.2*(1.-smoothstep(.65,1.,r)));}`} transparent depthWrite={false} toneMapped={false} />
    </mesh>}
    {selected && editor && object.kind !== "terrain" && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .02, 0]} userData={{ editorHelper: true }}><ringGeometry args={object.kind === "portal" ? [2.88, 2.9, 80] : [.9, .92, 48]} /><meshBasicMaterial color="#d5ed9a" transparent opacity={.6} depthWrite={false} side={THREE.DoubleSide} /></mesh>}
  </group>;
  return selected && editor && !object.locked && tool !== "select" ? <TransformControls mode={tool} size={.8} onMouseUp={() => {
    if (!group.current) return;
    onTransform(object.id, { position: group.current.position.toArray() as Vec3, rotation: [group.current.rotation.x, group.current.rotation.y, group.current.rotation.z], scale: group.current.scale.toArray().map(n => Math.max(.02, Math.min(100, n))) as Vec3 });
  }}>{content}</TransformControls> : content;
}

const skyVertex = `varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const skyFragment = `uniform vec3 uTop;uniform vec3 uBottom;uniform vec3 uSun;varying vec3 vWorld;void main(){vec3 d=normalize(vWorld-cameraPosition);float h=clamp(d.y*1.4+.72,0.,1.);vec3 c=mix(uBottom,uTop,h);float sun=pow(max(dot(d,normalize(vec3(-.5,.28,-.6))),0.),9.);c=mix(c,uSun,sun*.5);gl_FragColor=vec4(c,1.);\n#include <colorspace_fragment>\n}`;

function Atmosphere({ settings, software }: { settings: SceneSettings; software?: boolean }) {
  const night = settings.environment === "night", day = settings.environment === "day";
  const colors = night ? ["#142b40", "#536a76", "#9dbfc3"] : day ? ["#8bbac8", "#d1dccb", "#fff0cb"] : ["#739b9b", "#c4d0b9", "#ffe1b1"];
  const uniforms = useMemo(() => ({ uTop: { value: new THREE.Color(colors[0]) }, uBottom: { value: new THREE.Color(colors[1]) }, uSun: { value: new THREE.Color(colors[2]) } }), [colors[0], colors[1], colors[2]]);
  return <>
    <fog attach="fog" args={[night ? "#536a76" : day ? "#c7d6cc" : "#bdcbb9", 35, 95]} />
    <mesh><sphereGeometry args={[140, 32, 16]} /><shaderMaterial uniforms={uniforms} vertexShader={skyVertex} fragmentShader={skyFragment} side={THREE.BackSide} depthWrite={false} toneMapped={false} /></mesh>
    <ambientLight intensity={night ? .2 : .34} />
    <hemisphereLight args={[night ? "#8faecf" : "#ecf4d8", "#697e5a", night ? .8 : 1.2]} />
    <directionalLight position={[-8, 14, 7]} color={night ? "#bad9f1" : "#fff0c9"} intensity={night ? .8 : 2.7} castShadow={settings.shadows} shadow-mapSize={software ? [512, 512] : settings.quality === "high" ? [2048, 2048] : [1024, 1024]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-camera-near={.1} shadow-camera-far={50} shadow-bias={-.0008} shadow-normalBias={.025} />
    <directionalLight position={[9, 5, -7]} color="#addcce" intensity={night ? .5 : 1.05} />
    <mesh position={[-30, 19, -47]}><sphereGeometry args={[3, 32, 32]} /><meshBasicMaterial color={night ? "#d7e3db" : "#fff2cf"} toneMapped={false} /></mesh>
    {Array.from({ length: 16 }, (_, i) => <group key={i} position={[(random(i + 17) - .5) * 85, -7 + random(i + 93) * 8, -18 - random(i + 71) * 30]} scale={[4 + random(i + 5) * 7, .4 + random(i + 6) * .5, 2 + random(i + 2) * 3]}>
      <mesh><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color={night ? "#6c838e" : "#e2e2ca"} transparent opacity={.17} depthWrite={false} roughness={1} /></mesh>
      <mesh position={[.6, .1, .1]} scale={[.7, 1.2, 1]}><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color={night ? "#6c838e" : "#e5e5d4"} transparent opacity={.13} depthWrite={false} roughness={1} /></mesh>
    </group>)}
    <Sparkles count={45} scale={[14, 8, 12]} position={[0, 2, 0]} size={1.8} color={night ? "#b4ebd7" : "#f6f2c5"} speed={.12} opacity={.55} />
  </>;
}

function CameraRig({ viewRequest, objects, selectedId, playState }: Pick<Props, "viewRequest" | "objects" | "selectedId" | "playState">) {
  const ref = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const currentObjects = useRef(objects); currentObjects.current = objects;
  const currentSelected = useRef(selectedId); currentSelected.current = selectedId;
  useEffect(() => {
    const controls = ref.current;
    if (!controls) return;
    const selected = currentObjects.current.find(o => o.id === currentSelected.current);
    const target = viewRequest.type === "focus" && selected ? new THREE.Vector3(...selected.position).add(new THREE.Vector3(0, selected.kind === "portal" ? 2 : 1, 0)) : new THREE.Vector3(0, -.35, 0);
    controls.target.copy(target);
    const offset = viewRequest.type === "top" ? new THREE.Vector3(.01, 23, .01) : viewRequest.type === "front" ? new THREE.Vector3(0, 3, 23) : viewRequest.type === "focus" ? new THREE.Vector3(6, 4, 8) : new THREE.Vector3(11, 7.8, 15);
    camera.position.copy(target.clone().add(offset)); camera.lookAt(target); controls.update();
  }, [viewRequest, camera]);
  return <OrbitControls ref={ref} makeDefault enabled={playState !== "playing"} target={[0, -.35, 0]} enableDamping dampingFactor={.075} minDistance={3} maxDistance={60} maxPolarAngle={Math.PI * .84} zoomSpeed={.8} panSpeed={.7} />;
}

function Explorer({ objects, paused, onProgress, collected, onCollect }: { objects: SceneObject[]; paused: boolean; onProgress: (time: number, won: boolean) => void; collected: Set<string>; onCollect: (id: string) => void }) {
  const ref = useRef<THREE.Group>(null), keys = useRef<Set<string>>(new Set());
  const velocity = useRef(0), grounded = useRef(true), elapsed = useRef(0), won = useRef(false);
  const { camera } = useThree();
  const spawn = useMemo(() => objects.find(o => o.kind === "spawn")?.position ?? [1.5, .3, 3.35] as Vec3, [objects]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]")) return; const key = e.key.toLowerCase(); if (["w", "a", "s", "d", "z", "q", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) { e.preventDefault(); keys.current.add(key); } };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, []);
  const look = useMemo(() => new THREE.Vector3(), []), follow = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, rawDelta) => {
    const player = ref.current;
    if (!player || paused) return;
    const dt = Math.min(rawDelta, .045);
    if (!won.current) {
      elapsed.current += Math.min(rawDelta, 2);
      const k = keys.current;
      let x = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("q") || k.has("arrowleft") ? 1 : 0);
      let z = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("z") || k.has("arrowup") ? 1 : 0);
      if (x && z) { x *= Math.SQRT1_2; z *= Math.SQRT1_2; }
      const oldX = player.position.x, oldZ = player.position.z;
      player.position.x += x * dt * 3.8; player.position.z += z * dt * 3.8;
      if (x || z) player.rotation.y = Math.atan2(x, z);
      for (const o of objects) if (o.visible && (o.kind === "rock" || o.kind === "tree")) {
        const radius = (o.kind === "rock" ? .7 : .24) * o.scale[0] + .2;
        if (Math.hypot(player.position.x - o.position[0], player.position.z - o.position[2]) < radius && Math.abs(player.position.y - o.position[1]) < 1) { player.position.x = oldX; player.position.z = oldZ; }
      }
      let floor = -100;
      for (const o of objects) if (o.visible && o.kind === "terrain") {
        const d = Math.hypot((player.position.x - o.position[0]) / o.scale[0], (player.position.z - o.position[2]) / o.scale[2]);
        if (d < 5.55) floor = Math.max(floor, o.position[1] + .18 * o.scale[1]);
      }
      if (k.has(" ") && grounded.current) { velocity.current = 6.5; grounded.current = false; }
      velocity.current -= 15 * dt; player.position.y += velocity.current * dt;
      if (player.position.y <= floor && velocity.current <= 0) { player.position.y = floor; velocity.current = 0; grounded.current = true; } else grounded.current = false;
      if (player.position.y < -14) { player.position.set(spawn[0], spawn[1], spawn[2]); velocity.current = 0; }
      for (const o of objects) if (o.kind === "crystal" && o.visible && !collected.has(o.id) && Math.hypot(player.position.x - o.position[0], player.position.z - o.position[2]) < 1.1 && Math.abs(player.position.y - o.position[1]) < 1.7) onCollect(o.id);
      const crystals = objects.filter(o => o.visible && o.kind === "crystal");
      const portal = objects.find(o => o.visible && o.kind === "portal");
      if (portal && crystals.every(c => collected.has(c.id)) && Math.hypot(player.position.x - portal.position[0], player.position.z - portal.position[2]) < 1.15 && Math.abs(player.position.y - portal.position[1]) < 1.5) won.current = true;
    }
    follow.copy(player.position).add(new THREE.Vector3(6.5, 5, 8.5)); camera.position.lerp(follow, Math.min(1, dt * 3));
    look.copy(player.position).add(new THREE.Vector3(0, 1, 0)); camera.lookAt(look);
    onProgress(elapsed.current, won.current);
  });
  return <group ref={ref} position={spawn}>
    <mesh position={[0, .6, 0]} castShadow><capsuleGeometry args={[.2, .43, 5, 10]} /><meshStandardMaterial color="#eee9d3" roughness={.65} /></mesh>
    <mesh position={[0, 1.07, 0]} castShadow><sphereGeometry args={[.27, 16, 12]} /><meshStandardMaterial color="#e0d7b7" metalness={.3} roughness={.35} /></mesh>
    <mesh position={[0, 1.09, .15]} scale={[1, .6, .7]}><sphereGeometry args={[.2, 16, 10]} /><meshStandardMaterial color="#334b4a" metalness={.7} roughness={.15} /></mesh>
    <mesh position={[0, .63, -.22]}><boxGeometry args={[.3, .38, .18]} /><meshStandardMaterial color="#7c9b76" roughness={.8} /></mesh>
    {[-1, 1].map(s => <group key={s}><mesh position={[s * .14, .16, 0]} castShadow><capsuleGeometry args={[.09, .2, 4, 8]} /><meshStandardMaterial color="#697966" /></mesh><mesh position={[s * .31, .63, 0]} rotation={[0, 0, s * .16]} castShadow><capsuleGeometry args={[.075, .3, 4, 8]} /><meshStandardMaterial color="#d2d1b7" /></mesh></group>)}
  </group>;
}

function Bridge({ apiRef, onReady }: Pick<Props, "apiRef" | "onReady">) {
  const { gl, scene } = useThree();
  useEffect(() => {
    apiRef.current = {
      screenshot: () => gl.domElement.toDataURL("image/png"),
      exportGlb: async () => {
        const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
        const source = scene.getObjectByName("studio-world");
        if (!source) throw new Error("La scène n’est pas encore prête.");
        source.updateWorldMatrix(true, true);
        const root = new THREE.Group();
        root.name = "JARVIS Studio · Export";
        source.traverse(node => {
          if (!node.userData.studioObject) return;
          const copy = node.clone(true);
          node.getWorldPosition(copy.position);
          node.getWorldQuaternion(copy.quaternion);
          node.getWorldScale(copy.scale);
          root.add(copy);
        });
        root.traverse(node => {
          if (node.userData.editorHelper || node instanceof THREE.Points || node.type.startsWith("TransformControls")) node.visible = false;
          if (node instanceof THREE.Mesh && node.material instanceof THREE.ShaderMaterial) node.material = new THREE.MeshStandardMaterial({ color: "#72c7af", emissive: "#275d52", emissiveIntensity: .5, side: THREE.DoubleSide });
        });
        const result = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true });
        if (!(result instanceof ArrayBuffer)) throw new Error("L’export GLB a échoué.");
        return result;
      },
    };
    onReady();
    return () => { apiRef.current = null; };
  }, [apiRef, gl, scene, onReady]);
  return null;
}

function World(props: Props) {
  const [collected, setCollected] = useState<Set<string>>(new Set());
  const progress = useRef({ elapsed: 0, won: false });
  const { gl } = useThree();
  const counters = useRef({ frames: 0, since: 0 });
  useEffect(() => { gl.info.autoReset = false; return () => { gl.info.autoReset = true; }; }, [gl]);
  useEffect(() => { if (props.playState === "edit") { setCollected(new Set()); progress.current = { elapsed: 0, won: false }; } }, [props.playState]);
  useFrame((_, dt) => {
    counters.current.frames++; counters.current.since += dt;
    if (counters.current.since > .6) {
      props.onStats({ fps: Math.round(counters.current.frames / counters.current.since), triangles: gl.info.render.triangles, calls: gl.info.render.calls, adaptive: !!props.software, collected: collected.size, ...progress.current });
      counters.current.frames = 0; counters.current.since = 0;
    }
    gl.info.reset();
  });
  useEffect(() => { gl.toneMappingExposure = props.settings.exposure; }, [gl, props.settings.exposure]);
  return <>
    <Atmosphere settings={props.settings} software={props.software} />
    <group name="studio-world">
      {props.objects.filter(o => !(props.playState !== "edit" && o.kind === "crystal" && collected.has(o.id))).map(object => <EditableObject key={object.id} object={object} selected={object.id === props.selectedId} tool={props.tool} editor={props.playState === "edit"} onSelect={props.onSelect} onTransform={props.onTransform} softShadow={props.software && props.settings.shadows} />)}
    </group>
    {props.settings.grid && props.playState === "edit" && <Grid position={[0, -.15, 0]} args={[60, 60]} cellSize={1} cellThickness={.45} cellColor="#e0dfbc" sectionSize={5} sectionThickness={.8} sectionColor="#cbd7a0" fadeDistance={40} fadeStrength={1.5} infiniteGrid />}
    <CameraRig viewRequest={props.viewRequest} objects={props.objects} selectedId={props.selectedId} playState={props.playState} />
    {props.playState !== "edit" && <Explorer objects={props.objects} paused={props.playState === "paused"} collected={collected} onCollect={id => setCollected(prev => new Set([...prev, id]))} onProgress={(elapsed, won) => { progress.current = { elapsed, won }; }} />}
    {!props.software && <EffectComposer multisampling={props.settings.quality === "high" ? 2 : 0}>
      <Bloom intensity={props.settings.bloom ? .55 : 0} luminanceThreshold={1} luminanceSmoothing={.4} mipmapBlur />
      <Vignette offset={.3} darkness={.24} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>}
    <Bridge apiRef={props.apiRef} onReady={props.onReady} />
  </>;
}

class ViewportBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="studio-webgl-error"><span>◇</span><h3>Votre espace 3D vous attend.</h3><p>Activez l’accélération matérielle et WebGL 2 dans votre navigateur pour afficher le monde. L’éditeur et vos sauvegardes restent disponibles.</p><button onClick={() => window.location.reload()}>Réessayer</button></div> : this.props.children; }
}

export default function StudioViewport(props: Props) {
  const [software, setSoftware] = useState(false);
  return <ViewportBoundary><Canvas shadows={props.settings.shadows && !software} dpr={software ? .85 : props.settings.quality === "high" ? [1, 1.35] : 1} camera={{ position: [11, 7.45, 15], fov: 42, near: .1, far: 220 }} gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" }} onCreated={({ gl }) => {
    const context = gl.getContext();
    const debug = context.getExtension("WEBGL_debug_renderer_info");
    const renderer = debug ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "";
    if (/swiftshader|llvmpipe|software|softpipe/i.test(renderer)) setSoftware(true);
  }} onPointerMissed={() => props.onSelect(null)} fallback={<div className="studio-webgl-error">Ce navigateur ne prend pas en charge WebGL 2.</div>}><Suspense fallback={null}><World {...props} software={software} /></Suspense></Canvas></ViewportBoundary>;
}
