import { z } from "zod";
import type { PartKind } from "../aero/parts";
import { SKETCHES, type SketchId } from "../code/sketches";
import { DEVICES, MCUS, type DeviceId, type McuId } from "../wire/catalog";

/**
 * A design Claude can write. Everything here is plain data: the 3D bay draws
 * it from `parts`, the Wire bench checks `devices`, and the Code bench fills a
 * fixed template. Claude never writes firmware.
 *
 * `DesignOutput` is the schema sent to the API, so it avoids numeric limits
 * (structured outputs strip them). `sanitizeDesign` applies the real limits.
 */

const MCU_IDS = MCUS.map((m) => m.id) as [McuId, ...McuId[]];
const DEVICE_IDS = DEVICES.map((d) => d.id) as [DeviceId, ...DeviceId[]];
const SKETCH_IDS = SKETCHES.map((s) => s.id) as [SketchId, ...SketchId[]];
const PART_KINDS = ["rib", "motor", "horn", "plate", "clip"] as const satisfies readonly PartKind[];

export const MOTIONS = ["plane", "hover", "ground", "fixed"] as const;
export type Motion = (typeof MOTIONS)[number];

const Vec = z.object({ x: z.number(), y: z.number(), z: z.number() });

const PartOutput = z.object({
  shape: z.enum(["box", "cylinder", "sphere"]),
  size: Vec.describe("Box: width, height, depth. Cylinder: x is diameter, y is length. Sphere: x is diameter."),
  pos: Vec.describe("Center of the part. y is up, -z is the front of the machine."),
  rot: Vec.describe("Rotation in degrees."),
  finish: z.enum(["body", "dark", "accent"]),
  animate: z
    .enum(["none", "spin", "wheel", "swing", "swing-opposite"])
    .describe("spin: propeller or rotor. wheel: rolls when driving. swing / swing-opposite: legs or arms that alternate."),
  axis: z.enum(["x", "y", "z"]).describe("Axis the animation turns around."),
  pivot: Vec.describe("Point the part turns around. Use the joint for legs and arms, the center for wheels and props."),
});

export const DesignOutput = z.object({
  name: z.string().describe("Short name for the button, 1-3 words."),
  projectName: z.string(),
  blurb: z.string().describe("One or two sentences on how it is built and powered."),
  motion: z.enum(MOTIONS).describe("plane: fixed wing. hover: drone or helicopter. ground: wheels, tracks, or legs. fixed: does not travel, like an arm."),
  controls: z.string().describe("What W, A, S, D (and Space / C for flyers) do in the test bay."),
  parts: z.array(PartOutput),
  mcu: z.enum(MCU_IDS),
  devices: z.array(z.object({ id: z.enum(DEVICE_IDS), count: z.number().int() })),
  servoNames: z.array(z.string()).describe("One label per servo, in order, like 'shoulder' or 'steering'."),
  motorNames: z.array(z.string()).describe("One label per ESC, in order, like 'left drive'."),
  sketch: z.enum(SKETCH_IDS),
  printPart: z.enum(PART_KINDS),
});

export const DesignReply = z.object({
  reply: z.string().describe("Short, friendly answer for a student builder. No code."),
  changed: z.boolean().describe("True when the design below is new or different."),
  design: DesignOutput,
});

export type DesignOutputT = z.infer<typeof DesignOutput>;
export type DesignPart = z.infer<typeof PartOutput>;

export type CustomDesign = Omit<DesignOutputT, "devices"> & {
  id: string;
  picked: Partial<Record<DeviceId, number>>;
  updatedAt: number;
};

export const MAX_PARTS = 48;

const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);
const vec = (v: { x: number; y: number; z: number }, lo: number, hi: number) => ({
  x: clamp(v.x, lo, hi),
  y: clamp(v.y, lo, hi),
  z: clamp(v.z, lo, hi),
});
const text = (s: string, max: number, fallback: string) => s.replace(/\s+/g, " ").trim().slice(0, max) || fallback;

// Labels become C identifiers in the generated sketch (`Servo <label>;`).
const RESERVED = new Set(
  "int float double char long short byte bool boolean void word string auto const static return if else for while do switch case break continue default new delete class struct sizeof true false high low input output delay map min max abs servo wire serial led setup loop millis micros random"
    .split(" "),
);

function safeNames(names: string[], kind: "servo" | "motor", taken: Set<string>): string[] {
  return names.map((raw, i) => {
    let name = text(raw, 24, `${kind} ${i + 1}`);
    const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!key(name) || RESERVED.has(key(name)) || /^[0-9]/.test(key(name))) name = `${kind} ${name}`;
    let out = name;
    for (let n = 2; taken.has(key(out)); n++) out = `${name} ${n}`;
    taken.add(key(out));
    return out;
  });
}

/** Clamp everything Claude sent into what the bay and the wiring sheet can handle. */
export function sanitizeDesign(raw: DesignOutputT, id: string): CustomDesign {
  const picked: Partial<Record<DeviceId, number>> = {};
  for (const d of raw.devices) {
    const def = DEVICES.find((x) => x.id === d.id);
    if (!def) continue;
    picked[d.id] = clamp(Math.round((picked[d.id] ?? 0) + d.count), 0, def.max);
  }
  // One pack and one BEC; the wiring sheet treats two as a fault anyway.
  if (picked.pack2s && picked.pack3s) picked.pack3s = 0;
  if (picked.bec5 && picked.bec6) picked.bec6 = 0;

  const parts = raw.parts.slice(0, MAX_PARTS).map((p) => ({
    ...p,
    size: vec(p.size, 0.01, 3),
    pos: vec(p.pos, -3, 3),
    rot: vec(p.rot, -360, 360),
    pivot: vec(p.pivot, -3, 3),
  }));

  const taken = new Set<string>();
  const servoNames = safeNames(raw.servoNames.slice(0, 12), "servo", taken);
  const motorNames = safeNames(raw.motorNames.slice(0, 4), "motor", taken);

  return {
    id,
    name: text(raw.name, 24, "Custom"),
    projectName: text(raw.projectName, 48, "Custom build"),
    blurb: text(raw.blurb, 280, ""),
    motion: raw.motion,
    controls: text(raw.controls, 200, "W forward, S back, A left, D right."),
    parts,
    mcu: raw.mcu,
    picked,
    servoNames,
    motorNames,
    sketch: raw.sketch,
    printPart: raw.printPart,
    updatedAt: Date.now(),
  };
}

/** The design as Claude sees it on the next turn. */
export function designToOutput(d: CustomDesign): DesignOutputT {
  const { id: _id, picked, updatedAt: _t, ...rest } = d;
  return {
    ...rest,
    devices: Object.entries(picked)
      .filter(([, n]) => (n ?? 0) > 0)
      .map(([id, count]) => ({ id: id as DeviceId, count: count ?? 0 })),
  };
}

/** Sketches offered on the Code bench for this design. */
export function designSketches(d: CustomDesign): SketchId[] {
  return Array.from(new Set<SketchId>(["bringup", d.sketch, "rate"]));
}
