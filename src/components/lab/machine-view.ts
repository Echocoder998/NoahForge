import * as THREE from "three";
import type { ChassisId } from "@/lib/robots/chassis";
import type { CustomDesign, Motion } from "@/lib/robots/design";

export type Live = {
  chassis: ChassisId;
  legs: 6 | 8;
  color: string;
  scale: number;
  testing: boolean;
  project: string;
  design: CustomDesign | null;
};

export type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  getRoll: () => number;
  setKeys: (codes: string[]) => void;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}

type Sim = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  climb: number;
  throttle: number;
  phase: number;
  active: number;
};

type Rig = {
  root: THREE.Group;
  tick: (phase: number, speed: number) => void;
  dispose: () => void;
  frame?: { dist: number; height: number };
};

const UP = new THREE.Vector3(0, 1, 0);

export function mountMachine(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  live: { current: Live },
  hud: HTMLElement,
): () => void {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x070913, 1);
  renderer.domElement.style.touchAction = "none";

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x070913, 14, 42);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.08, 80);
  const desired = new THREE.Vector3();

  scene.add(new THREE.HemisphereLight(0xe6f4ff, 0x1a1440, 0.85));
  const key = new THREE.DirectionalLight(0xf2f8ff, 2.4);
  key.position.set(4, 8, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xa855ff, 0.7);
  rim.position.set(-4, 3, -2);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(18, 64),
    new THREE.MeshStandardMaterial({ color: 0x0b1028, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const grid = new THREE.GridHelper(28, 28, 0x26e7ff, 0x1a2550);
  scene.add(grid);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.01, 16),
    new THREE.MeshStandardMaterial({ color: 0x26e7ff, roughness: 0.6 }),
  );
  stripe.position.set(0, 0.012, -6);
  scene.add(stripe);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  scene.add(shadow);

  const holder = new THREE.Group();
  scene.add(holder);

  const sim: Sim = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, speed: 0, climb: 0, throttle: 0, phase: 0, active: 0 };
  const real = new Set<string>();
  let override: Set<string> | null = null;
  const held = () => override ?? real;
  const has = (code: string) => held().has(code);

  const reset = () => {
    sim.x = 0;
    sim.y = 0;
    sim.z = 0;
    sim.yaw = 0;
    sim.pitch = 0;
    sim.roll = 0;
    sim.speed = 0;
    sim.climb = 0;
    sim.throttle = 0;
    sim.active = 0;
  };

  const probeOn = import.meta.env.DEV || new URLSearchParams(window.location.search).has("qa");
  if (probeOn) {
    window.__controlsTest = {
      getYaw: () => sim.yaw,
      getSpeed: () => sim.speed,
      getRoll: () => sim.roll,
      setKeys: (codes) => {
        override = codes.length ? new Set(codes) : null;
        if (!codes.length) real.clear();
      },
    };
  }

  const onKey = (e: KeyboardEvent) => {
    const t = e.target;
    if (t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (e.code === "Space") e.preventDefault();
    if (e.type === "keydown") real.add(e.code);
    else real.delete(e.code);
  };
  const onBlur = () => real.clear();
  const onBay = (e: Event) => {
    const detail = (e as CustomEvent<{ code: string; on: boolean }>).detail;
    if (!detail) return;
    if (detail.on) real.add(detail.code);
    else real.delete(detail.code);
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  window.addEventListener("blur", onBlur);
  window.addEventListener("robot-bay-key", onBay);

  let rig: Rig | null = null;
  let built = "";
  let wasTesting = false;
  let orbit = 0.85;

  const keyOf = (v: Live) => `${v.chassis}|${v.legs}|${v.color}|${v.design ? `${v.design.id}:${v.design.updatedAt}` : ""}`;
  const rebuild = () => {
    const { chassis, legs, color, design } = live.current;
    if (rig) {
      holder.remove(rig.root);
      rig.dispose();
    }
    rig = design ? buildCustom(design, color) : buildRig(chassis, legs, color);
    holder.add(rig.root);
    built = keyOf(live.current);
  };
  rebuild();

  const resize = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  let last = performance.now();
  let frame = 0;
  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const view = live.current;
    if (keyOf(view) !== built) {
      rebuild();
      reset();
    }
    if (view.testing && !wasTesting) reset();
    if (!view.testing && wasTesting) reset();
    wasTesting = view.testing;

    const mode = modeOf(view);
    step(sim, dt, mode, view.chassis === "heli" ? 22 : 28, view.testing, has);
    holder.scale.setScalar(view.scale);
    holder.position.set(sim.x, sim.y, sim.z);
    holder.rotation.order = "YXZ";
    holder.rotation.y = sim.yaw;
    holder.rotation.x = sim.pitch;
    holder.rotation.z = sim.roll;
    rig?.tick(sim.phase, mode === "fixed" ? sim.active : sim.speed);

    const dist = rig?.frame?.dist ?? (view.chassis === "plane" ? 5.4 : view.chassis === "humanoid" ? 4.2 : 3.8);
    const height = rig?.frame?.height ?? (view.chassis === "humanoid" ? 1.7 : 1.5);
    if (!view.testing) {
      orbit += dt * 0.28;
      camera.position.set(Math.sin(orbit) * dist, height + 0.4, Math.cos(orbit) * dist);
      camera.lookAt(0, 0.55 * view.scale, 0);
    } else {
      const fx = -Math.sin(sim.yaw);
      const fz = -Math.cos(sim.yaw);
      desired.set(sim.x - fx * dist, sim.y + height, sim.z - fz * dist);
      camera.position.lerp(desired, 1 - Math.exp(-4 * dt));
      camera.lookAt(sim.x, sim.y + 0.45 * view.scale, sim.z);
      camera.up.copy(UP);
    }

    const altLift = 1 / (1 + sim.y * 0.35);
    shadow.position.set(sim.x, 0.015, sim.z);
    shadow.scale.setScalar((0.85 + view.scale) * altLift);

    const moving = view.testing
      ? `${sim.speed.toFixed(1)} m/s · ${sim.y.toFixed(1)} m`
      : "bay";
    hud.textContent = `${view.project} · ${moving}`;
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frame);
    ro.disconnect();
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKey);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("robot-bay-key", onBay);
    if (probeOn) delete window.__controlsTest;
    rig?.dispose();
    floor.geometry.dispose();
    (floor.material as THREE.Material).dispose();
    stripe.geometry.dispose();
    (stripe.material as THREE.Material).dispose();
    shadow.geometry.dispose();
    (shadow.material as THREE.Material).dispose();
    renderer.dispose();
  };
}

function modeOf(view: Live): Motion {
  if (view.design) return view.design.motion;
  if (view.chassis === "plane") return "plane";
  if (view.chassis === "drone" || view.chassis === "heli") return "hover";
  return "ground";
}

function step(
  sim: Sim,
  dt: number,
  mode: Motion,
  rotorRate: number,
  testing: boolean,
  has: (code: string) => boolean,
) {
  if (!testing) {
    sim.speed = 0;
    sim.climb = 0;
    sim.pitch *= Math.exp(-3 * dt);
    sim.roll *= Math.exp(-3 * dt);
    sim.phase += dt * 1.4;
    return;
  }
  const w = has("KeyW") || has("ArrowUp");
  const s = has("KeyS") || has("ArrowDown");
  const a = has("KeyA") || has("ArrowLeft");
  const d = has("KeyD") || has("ArrowRight");
  const up = has("Space");
  const down = has("KeyC") || has("ShiftLeft") || has("ShiftRight");

  if (mode === "fixed") {
    // Stays put. A and D turn the base; any held key runs the joints.
    const steer = (a ? 1 : 0) - (d ? 1 : 0);
    sim.yaw += steer * 1.4 * dt;
    const busy = w || s || a || d || up || down;
    sim.active += ((busy ? 1 : 0) - sim.active) * Math.min(1, dt * 4);
    sim.speed = 0;
    sim.phase += dt * (0.8 + sim.active * 2.6) * (s && !w ? -1 : 1);
    return;
  }

  if (mode === "plane") {
    const rollCmd = (a ? 1 : 0) - (d ? 1 : 0);
    if (rollCmd !== 0) sim.roll += rollCmd * 2.6 * dt;
    else sim.roll *= Math.exp(-2.4 * dt);
    sim.roll = clamp(sim.roll, -1.15, 1.15);
    const pitchCmd = (w ? 1 : 0) - (s ? 1 : 0);
    if (pitchCmd !== 0) sim.pitch += pitchCmd * 1.15 * dt;
    else sim.pitch *= Math.exp(-1.8 * dt);
    sim.pitch = clamp(sim.pitch, -0.65, 0.8);
    if (up) sim.throttle = Math.min(1, sim.throttle + dt * 0.5);
    if (down) sim.throttle = Math.max(0, sim.throttle - dt * 0.6);
    sim.speed = sim.throttle * 9;
    const factor = Math.min(1, sim.speed / 3.5);
    sim.yaw += Math.sin(sim.roll) * 1.5 * factor * dt;
    const fx = -Math.sin(sim.yaw);
    const fz = -Math.cos(sim.yaw);
    const horiz = Math.cos(sim.pitch);
    sim.x += fx * sim.speed * horiz * dt;
    sim.z += fz * sim.speed * horiz * dt;
    sim.y = Math.max(0, sim.y + Math.sin(sim.pitch) * sim.speed * dt);
    sim.phase += dt * (6 + sim.throttle * 46);
    return;
  }

  if (mode === "hover") {
    const yawCmd = (a ? 1 : 0) - (d ? 1 : 0);
    sim.yaw += yawCmd * 1.9 * dt;
    const fwd = (w ? 1 : 0) - (s ? 1 : 0);
    const target = fwd * 4.2;
    sim.speed += (target - sim.speed) * Math.min(1, dt * 3.5);
    const climbCmd = (up ? 1 : 0) - (down ? 1 : 0);
    sim.climb += (climbCmd * 2.5 - sim.climb) * Math.min(1, dt * 3);
    sim.pitch = clamp(-sim.speed / 4.2 * 0.38, -0.4, 0.4);
    sim.roll = yawCmd * 0.28;
    const fx = -Math.sin(sim.yaw);
    const fz = -Math.cos(sim.yaw);
    sim.x += fx * sim.speed * dt;
    sim.z += fz * sim.speed * dt;
    sim.y = Math.max(0, sim.y + sim.climb * dt);
    sim.phase += dt * rotorRate;
    return;
  }

  const steer = (a ? 1 : 0) - (d ? 1 : 0);
  const fwd = (w ? 1 : 0) - (s ? 1 : 0);
  const target = fwd * 1.8;
  sim.speed += (target - sim.speed) * Math.min(1, dt * 4);
  const reverse = sim.speed >= 0 ? 1 : -1;
  const speedFactor = Math.min(1, Math.abs(sim.speed) / 0.35);
  sim.yaw += steer * 2.5 * Math.max(0.45, speedFactor) * reverse * dt;
  const fx = -Math.sin(sim.yaw);
  const fz = -Math.cos(sim.yaw);
  sim.x += fx * sim.speed * dt;
  sim.z += fz * sim.speed * dt;
  sim.y = 0;
  sim.pitch = 0;
  sim.roll = 0;
  if (Math.abs(sim.speed) > 0.08) sim.phase += Math.abs(sim.speed) * dt * 7.5;
  else sim.phase += dt * 1.2;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function buildRig(chassis: ChassisId, legs: 6 | 8, color: string): Rig {
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.52, metalness: 0.08 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141a36, roughness: 0.72, metalness: 0.15 });
  const accent = new THREE.MeshStandardMaterial({
    color: 0x26e7ff,
    roughness: 0.35,
    metalness: 0.2,
    emissive: 0x06424c,
    emissiveIntensity: 0.4,
  });
  mats.push(body, dark, accent);

  const box = (
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    geos.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const cyl = (
    parent: THREE.Object3D,
    r: number,
    h: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const geo = new THREE.CylinderGeometry(r, r, h, 16);
    geos.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  const root = new THREE.Group();
  let tick: (phase: number, speed: number) => void = () => {};

  if (chassis === "plane") tick = plane(root, box, cyl, body, dark, accent);
  else if (chassis === "drone") tick = drone(root, box, cyl, body, dark, accent);
  else if (chassis === "heli") tick = heli(root, box, cyl, body, dark, accent);
  else if (chassis === "spider") tick = spider(root, box, cyl, body, dark, accent, legs);
  else tick = humanoid(root, box, cyl, body, dark, accent);

  return {
    root,
    tick,
    dispose: () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}

function plane(
  root: THREE.Group,
  box: Boxer,
  cyl: Cyler,
  body: THREE.Material,
  dark: THREE.Material,
  accent: THREE.Material,
) {
  box(root, 0.22, 0.16, 1.05, body, 0, 0.2, 0.02);
  const nose = cyl(root, 0.09, 0.28, body, 0, 0.2, -0.62);
  nose.rotation.x = -Math.PI / 2;
  box(root, 2.15, 0.035, 0.38, body, 0, 0.22, -0.08);
  box(root, 0.035, 0.26, 0.22, dark, 0, 0.36, 0.48);
  box(root, 0.62, 0.025, 0.16, body, 0, 0.24, 0.5);
  box(root, 0.16, 0.08, 0.22, dark, 0, 0.28, -0.22);
  const prop = new THREE.Group();
  prop.position.set(0, 0.2, -0.78);
  root.add(prop);
  box(prop, 0.06, 0.62, 0.02, accent, 0, 0, 0);
  box(prop, 0.62, 0.06, 0.02, accent, 0, 0, 0);
  cyl(prop, 0.04, 0.05, dark, 0, 0, 0);
  return (phase: number) => {
    prop.rotation.z = phase;
  };
}

function drone(
  root: THREE.Group,
  box: Boxer,
  cyl: Cyler,
  body: THREE.Material,
  dark: THREE.Material,
  accent: THREE.Material,
) {
  box(root, 0.34, 0.1, 0.34, body, 0, 0.28, 0);
  box(root, 0.12, 0.06, 0.12, accent, 0, 0.36, -0.04);
  const props: THREE.Object3D[] = [];
  const spots: [number, number][] = [
    [-0.34, -0.34],
    [0.34, -0.34],
    [0.34, 0.34],
    [-0.34, 0.34],
  ];
  for (const [x, z] of spots) {
    const arm = new THREE.Group();
    arm.rotation.y = Math.atan2(x, z);
    root.add(arm);
    box(arm, 0.06, 0.04, 0.46, dark, 0, 0.3, 0.24);
    cyl(root, 0.07, 0.06, dark, x, 0.34, z);
    const prop = new THREE.Group();
    prop.position.set(x, 0.4, z);
    root.add(prop);
    box(prop, 0.42, 0.012, 0.05, accent, 0, 0, 0);
    props.push(prop);
  }
  box(root, 0.04, 0.16, 0.28, dark, -0.12, 0.08, 0);
  box(root, 0.04, 0.16, 0.28, dark, 0.12, 0.08, 0);
  return (phase: number) => {
    props.forEach((p, i) => {
      p.rotation.y = phase * (i % 2 === 0 ? 1 : -1);
    });
  };
}

function heli(
  root: THREE.Group,
  box: Boxer,
  cyl: Cyler,
  body: THREE.Material,
  dark: THREE.Material,
  accent: THREE.Material,
) {
  box(root, 0.28, 0.24, 0.55, body, 0, 0.36, -0.05);
  box(root, 0.16, 0.1, 0.16, accent, 0, 0.4, -0.22);
  box(root, 0.07, 0.07, 0.85, dark, 0, 0.4, 0.5);
  cyl(root, 0.04, 0.16, dark, 0, 0.52, -0.02);
  const main = new THREE.Group();
  main.position.set(0, 0.62, -0.02);
  root.add(main);
  box(main, 1.7, 0.02, 0.08, accent, 0, 0, 0);
  box(main, 0.08, 0.02, 1.7, accent, 0, 0, 0);
  const tail = new THREE.Group();
  tail.position.set(0.08, 0.42, 0.92);
  root.add(tail);
  box(tail, 0.02, 0.28, 0.05, accent, 0, 0, 0);
  box(root, 0.04, 0.2, 0.5, dark, -0.12, 0.1, -0.02);
  box(root, 0.04, 0.2, 0.5, dark, 0.12, 0.1, -0.02);
  box(root, 0.22, 0.02, 0.16, dark, 0, 0.42, 0.9);
  return (phase: number) => {
    main.rotation.y = phase;
    tail.rotation.x = phase * 1.6;
  };
}

function spider(
  root: THREE.Group,
  box: Boxer,
  cyl: Cyler,
  body: THREE.Material,
  dark: THREE.Material,
  accent: THREE.Material,
  legs: number,
) {
  const belly = cyl(root, 0.2, 0.16, body, 0, 0.32, 0.08);
  belly.scale.set(1.15, 1, 1.45);
  box(root, 0.16, 0.1, 0.16, accent, 0, 0.36, -0.22);
  const joints: { hip: THREE.Group; base: number; femur: THREE.Object3D }[] = [];
  for (let i = 0; i < legs; i++) {
    const ang = (i / legs) * Math.PI * 2;
    const hip = new THREE.Group();
    hip.position.set(Math.sin(ang) * 0.16, 0.3, -Math.cos(ang) * 0.16);
    const base = Math.atan2(Math.cos(ang), Math.sin(ang));
    hip.rotation.y = base;
    root.add(hip);
    box(hip, 0.22, 0.04, 0.05, dark, 0.12, 0, 0);
    const femur = new THREE.Group();
    femur.position.set(0.22, 0, 0);
    hip.add(femur);
    box(femur, 0.06, 0.28, 0.05, body, 0.02, -0.12, 0);
    const tibia = new THREE.Group();
    tibia.position.set(0.02, -0.26, 0);
    femur.add(tibia);
    box(tibia, 0.045, 0.3, 0.04, dark, 0, -0.12, 0);
    femur.rotation.z = -0.7;
    tibia.rotation.z = 1.15;
    joints.push({ hip, base, femur });
  }
  return (phase: number, speed: number) => {
    const moving = Math.min(1, Math.abs(speed) / 0.4);
    joints.forEach((leg, i) => {
      const p = phase + (i % 2 === 0 ? 0 : Math.PI);
      const lift = Math.max(0, Math.sin(p)) * moving;
      const swing = Math.cos(p) * 0.45 * moving;
      leg.hip.rotation.y = leg.base + swing;
      leg.femur.rotation.z = -0.7 + lift * 0.55 + (1 - moving) * Math.sin(phase * 2 + i) * 0.04;
    });
  };
}

function humanoid(
  root: THREE.Group,
  box: Boxer,
  cyl: Cyler,
  body: THREE.Material,
  dark: THREE.Material,
  accent: THREE.Material,
) {
  const hip = new THREE.Group();
  hip.position.y = 0.8;
  root.add(hip);
  box(hip, 0.28, 0.16, 0.16, dark, 0, 0, 0);
  box(hip, 0.32, 0.42, 0.18, body, 0, 0.3, 0);
  const head = cyl(hip, 0.11, 0.16, body, 0, 0.62, 0);
  box(head, 0.1, 0.04, 0.02, accent, 0, 0.02, -0.1);

  const limb = (x: number, upper: number, lower: number, foot: boolean) => {
    const joint = new THREE.Group();
    joint.position.set(x, 0, 0);
    hip.add(joint);
    box(joint, 0.09, upper, 0.09, body, 0, -upper / 2, 0);
    const knee = new THREE.Group();
    knee.position.set(0, -upper, 0);
    joint.add(knee);
    box(knee, 0.08, lower, 0.08, dark, 0, -lower / 2, 0);
    if (foot) box(knee, 0.1, 0.04, 0.16, dark, 0, -lower, -0.03);
    return { joint, knee };
  };
  const legL = limb(-0.1, 0.4, 0.4, true);
  const legR = limb(0.1, 0.4, 0.4, true);
  const armL = limb(-0.22, 0.32, 0.28, false);
  const armR = limb(0.22, 0.32, 0.28, false);
  armL.joint.position.y = 0.42;
  armR.joint.position.y = 0.42;

  return (phase: number, speed: number) => {
    const moving = Math.min(1, Math.abs(speed) / 0.35);
    const s = Math.sin(phase);
    const swing = s * 0.7 * moving;
    legL.joint.rotation.x = swing;
    legR.joint.rotation.x = -swing;
    const kneeL = Math.max(0, s) * 0.9 * moving;
    const kneeR = Math.max(0, -s) * 0.9 * moving;
    legL.knee.rotation.x = -kneeL;
    legR.knee.rotation.x = -kneeR;
    armL.joint.rotation.x = -swing * 0.8;
    armR.joint.rotation.x = swing * 0.8;
    if (moving < 0.2) {
      hip.rotation.y = Math.sin(phase) * 0.04;
    } else hip.rotation.y = 0;
  };
}

function buildCustom(design: CustomDesign, color: string): Rig {
  const geos: THREE.BufferGeometry[] = [];
  const mats = {
    body: new THREE.MeshStandardMaterial({ color, roughness: 0.52, metalness: 0.08 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x141a36, roughness: 0.72, metalness: 0.15 }),
    accent: new THREE.MeshStandardMaterial({
      color: 0x26e7ff,
      roughness: 0.35,
      metalness: 0.2,
      emissive: 0x06424c,
      emissiveIntensity: 0.4,
    }),
  };
  const deg = Math.PI / 180;
  const root = new THREE.Group();
  const moving: { g: THREE.Group; kind: string; axis: "x" | "y" | "z" }[] = [];
  let low = Infinity;
  let reach = 0.4;

  for (const p of design.parts) {
    const geo =
      p.shape === "box"
        ? new THREE.BoxGeometry(p.size.x, p.size.y, p.size.z)
        : p.shape === "cylinder"
          ? new THREE.CylinderGeometry(p.size.x / 2, p.size.x / 2, p.size.y, 20)
          : new THREE.SphereGeometry(p.size.x / 2, 20, 14);
    geos.push(geo);
    const mesh = new THREE.Mesh(geo, mats[p.finish]);
    const pivot = new THREE.Group();
    pivot.position.set(p.pivot.x, p.pivot.y, p.pivot.z);
    mesh.position.set(p.pos.x - p.pivot.x, p.pos.y - p.pivot.y, p.pos.z - p.pivot.z);
    mesh.rotation.set(p.rot.x * deg, p.rot.y * deg, p.rot.z * deg);
    pivot.add(mesh);
    root.add(pivot);
    if (p.animate !== "none") moving.push({ g: pivot, kind: p.animate, axis: p.axis });

    const tilted = Math.abs(p.rot.x) > 1 || Math.abs(p.rot.z) > 1;
    const half = tilted || p.shape === "sphere" ? Math.max(p.size.x, p.size.y, p.size.z) / 2 : p.size.y / 2;
    low = Math.min(low, p.pos.y - half);
    reach = Math.max(reach, Math.hypot(p.pos.x, p.pos.z) + Math.max(p.size.x, p.size.z) / 2, p.pos.y + half);
  }
  // Rest the lowest point on the floor whatever height Claude drew it at.
  if (Number.isFinite(low)) root.position.y = -low;

  return {
    root,
    frame: { dist: clamp(reach * 3.4, 3.2, 8), height: clamp(reach * 1.5, 1.2, 3) },
    tick: (phase, speed) => {
      const amt = Math.max(0.15, Math.min(1, Math.abs(speed) / 0.35));
      for (const m of moving) {
        let angle = 0;
        if (m.kind === "spin") angle = phase;
        else if (m.kind === "wheel") angle = -phase;
        else if (m.kind === "swing") angle = Math.sin(phase) * 0.6 * amt;
        else angle = -Math.sin(phase) * 0.6 * amt;
        m.g.rotation[m.axis] = angle;
      }
    },
    dispose: () => {
      geos.forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    },
  };
}

type Boxer = (
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
) => THREE.Mesh;

type Cyler = (
  parent: THREE.Object3D,
  r: number,
  h: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
) => THREE.Mesh;
