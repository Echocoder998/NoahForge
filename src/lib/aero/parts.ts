import { centerRings, circle, extrude, type MeshData, type Vec2 } from "./mesh";

export type PartKind = "rib" | "motor" | "horn" | "plate" | "clip";

export type RibParams = {
  code: string;
  chord: number;
  thickness: number;
  sparX: number;
  sparD: number;
  wall: number;
  minTe: number;
  lights: boolean;
};

export type MotorParams = {
  od: number;
  thickness: number;
  bore: number;
  boltCircle: number;
  boltD: number;
  bolts: number;
};

export type HornParams = {
  hubD: number;
  length: number;
  rootW: number;
  tipW: number;
  thickness: number;
  hubHole: number;
  tipHole: number;
};

export type PlateParams = {
  width: number;
  height: number;
  thickness: number;
  holeD: number;
  inset: number;
  slot: boolean;
  slotL: number;
  slotW: number;
};

export type ClipParams = {
  length: number;
  width: number;
  height: number;
  wall: number;
};

export const defaultRib: RibParams = {
  code: "2412",
  chord: 180,
  thickness: 3,
  sparX: 0.3,
  sparD: 6,
  wall: 1.4,
  minTe: 0.8,
  lights: true,
};

export const defaultMotor: MotorParams = {
  od: 36,
  thickness: 3,
  bore: 8,
  boltCircle: 19,
  boltD: 3.2,
  bolts: 4,
};

export const defaultHorn: HornParams = {
  hubD: 12,
  length: 32,
  rootW: 8,
  tipW: 4.5,
  thickness: 2.4,
  hubHole: 2.4,
  tipHole: 2,
};

export const defaultPlate: PlateParams = {
  width: 70,
  height: 42,
  thickness: 3,
  holeD: 3.2,
  inset: 5,
  slot: true,
  slotL: 28,
  slotW: 4,
};

export const defaultClip: ClipParams = {
  length: 18,
  width: 14,
  height: 10,
  wall: 1.8,
};

export type Rings = { outer: Vec2[]; holes: Vec2[][]; warnings: string[] };

export function nacaLabel(code: string): string {
  const { m, p, t, ok } = parseNaca(code);
  if (!ok) return "Use four digits, like 2412.";
  if (m === 0) return `Symmetric, ${(t * 100).toFixed(0)}% thick.`;
  return `${(m * 100).toFixed(0)}% camber at ${(p * 100).toFixed(0)}% chord, ${(t * 100).toFixed(0)}% thick.`;
}

export function partRings(
  kind: PartKind,
  rib: RibParams,
  motor: MotorParams,
  horn: HornParams,
  plate: PlateParams,
  clip: ClipParams,
): Rings {
  if (kind === "rib") return ribRings(rib);
  if (kind === "motor") return motorRings(motor);
  if (kind === "horn") return hornRings(horn);
  if (kind === "plate") return plateRings(plate);
  return clipRings(clip);
}

export function partMesh(
  kind: PartKind,
  rib: RibParams,
  motor: MotorParams,
  horn: HornParams,
  plate: PlateParams,
  clip: ClipParams,
): MeshData {
  const rings = partRings(kind, rib, motor, horn, plate, clip);
  const depth =
    kind === "rib"
      ? rib.thickness
      : kind === "motor"
        ? motor.thickness
        : kind === "horn"
          ? horn.thickness
          : kind === "plate"
            ? plate.thickness
            : clip.length;
  const centered = centerRings(rings.outer, rings.holes);
  const mesh = extrude(centered.outer, centered.holes, Math.max(depth, 0.4));
  return { ...mesh, warnings: [...rings.warnings, ...mesh.warnings] };
}

function parseNaca(code: string): { m: number; p: number; t: number; ok: boolean } {
  const digits = code.replace(/\D/g, "").slice(0, 4);
  if (digits.length !== 4) return { m: 0.02, p: 0.4, t: 0.12, ok: false };
  const m = Number(digits[0]) / 100;
  const p = Number(digits[1]) / 10;
  const t = Number(digits.slice(2)) / 100;
  if (t <= 0) return { m, p: p === 0 ? 0.4 : p, t: 0.12, ok: false };
  return { m, p: p === 0 ? 0 : p, t, ok: true };
}

function camber(x: number, m: number, p: number): { y: number; dy: number } {
  if (m === 0 || p === 0 || p === 1) return { y: 0, dy: 0 };
  if (x < p) {
    return { y: (m / (p * p)) * (2 * p * x - x * x), dy: (2 * m / (p * p)) * (p - x) };
  }
  const d = 1 - p;
  return {
    y: (m / (d * d)) * ((1 - 2 * p) + 2 * p * x - x * x),
    dy: (2 * m / (d * d)) * (p - x),
  };
}

function yt(x: number, t: number): number {
  return (
    5 *
    t *
    (0.2969 * Math.sqrt(Math.max(x, 0)) -
      0.126 * x -
      0.3516 * x * x +
      0.2843 * x * x * x -
      0.1015 * x * x * x * x)
  );
}

function ribRings(p: RibParams): Rings {
  const warnings: string[] = [];
  const parsed = parseNaca(p.code);
  if (!parsed.ok) warnings.push("Airfoil code was not four digits. Showing a 2412 until it is.");
  const { m, p: pc, t } = parsed;
  const n = 72;
  const upper: Vec2[] = [];
  const lower: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const x = (1 - Math.cos((i / n) * Math.PI)) / 2;
    const thick = yt(x, t);
    const c = camber(x, m, pc);
    const theta = Math.atan(c.dy);
    let yu = (c.y + thick * Math.cos(theta)) * p.chord;
    let yl = (c.y - thick * Math.cos(theta)) * p.chord;
    const xu = (x - thick * Math.sin(theta)) * p.chord;
    const xl = (x + thick * Math.sin(theta)) * p.chord;
    if (x > 0.84 && yu - yl < p.minTe) {
      const mid = (yu + yl) / 2;
      yu = mid + p.minTe / 2;
      yl = mid - p.minTe / 2;
    }
    upper.push([xu, yu]);
    lower.push([xl, yl]);
  }
  upper.reverse();
  const outer: Vec2[] = [...upper, ...lower.slice(1)];
  const holes: Vec2[][] = [];
  const placed: { x: number; y: number; r: number }[] = [];

  const place = (xFrac: number, wantR: number, label: string) => {
    const x = Math.min(0.88, Math.max(0.1, xFrac));
    const local = yt(x, t) * p.chord;
    const maxR = local / 2 - p.wall;
    if (maxR < 1.1) {
      warnings.push(`${label} does not fit inside the airfoil here, so it was left out.`);
      return;
    }
    let r = wantR;
    if (r > maxR) {
      r = maxR;
      warnings.push(`${label} reduced to ⌀${(2 * r).toFixed(1)} mm so ${p.wall.toFixed(1)} mm of wall remains.`);
    }
    const y = camber(x, m, pc).y * p.chord;
    const cx = x * p.chord;
    for (const other of placed) {
      const dist = Math.hypot(other.x - cx, other.y - y);
      if (dist < other.r + r + p.wall) {
        warnings.push(`${label} would break into another hole, so it was left out.`);
        return;
      }
    }
    holes.push(circle(cx, y, r, 28, true));
    placed.push({ x: cx, y, r });
  };

  place(p.sparX, p.sparD / 2, "Spar hole");
  if (p.lights) {
    place(0.52, 4, "Forward lightening hole");
    place(0.7, 3, "Aft lightening hole");
  }
  if (p.thickness < 1.6) warnings.push("Rib is under 1.6 mm thick. That is fragile on a hobby printer.");
  if (p.minTe > 0.4) warnings.push("Trailing edge is opened up so a nozzle can actually print it.");
  return { outer, holes, warnings };
}

function motorRings(p: MotorParams): Rings {
  const warnings: string[] = [];
  const rOuter = p.od / 2;
  let bore = Math.max(0.8, p.bore / 2);
  let boltR = Math.max(0.6, p.boltD / 2);
  if (bore > rOuter - 3) {
    bore = Math.max(0.8, rOuter - 3);
    warnings.push("Center bore was reduced so the plate still has a rim.");
  }
  boltR = Math.min(boltR, rOuter / 6);
  const minBc = bore + boltR + 1.6;
  const maxBc = rOuter - boltR - 1.4;
  const holes: Vec2[][] = [circle(0, 0, bore, 32, true)];
  const bolts = p.bolts === 6 ? 6 : p.bolts === 3 ? 3 : 4;
  if (minBc >= maxBc) {
    warnings.push("Bolt holes do not fit between the bore and the rim, so they were left out.");
  } else {
    let bc = p.boltCircle / 2;
    if (bc < minBc || bc > maxBc) {
      bc = Math.min(maxBc, Math.max(minBc, bc));
      warnings.push(`Bolt circle moved to ⌀${(2 * bc).toFixed(1)} mm so the holes stay in the plate.`);
    }
    for (let i = 0; i < bolts; i++) {
      const a = -Math.PI / 2 + (i / bolts) * Math.PI * 2;
      holes.push(circle(bc * Math.cos(a), bc * Math.sin(a), boltR, 16, true));
    }
  }
  if (p.thickness < 2) warnings.push("Motor plates under 2 mm crack at the bolts. 3 mm PLA is the usual first article.");
  return { outer: circle(0, 0, rOuter, 64, false), holes, warnings };
}

function hornRings(p: HornParams): Rings {
  const warnings: string[] = [];
  const hubR = p.hubD / 2;
  const length = Math.max(p.length, hubR + 10);
  if (length !== p.length) warnings.push("Arm was lengthened so it clears the hub.");
  const halfRoot = Math.min(p.rootW / 2, hubR * 0.9);
  const halfTip = Math.min(Math.max(p.tipW / 2, 1.2), halfRoot);
  const a = Math.atan2(halfRoot, Math.sqrt(Math.max(hubR * hubR - halfRoot * halfRoot, 0.01)));
  const outer: Vec2[] = [];
  const segs = 24;
  const sweep = Math.PI * 2 - 2 * a;
  for (let i = 0; i <= segs; i++) {
    const ang = a + (sweep * i) / segs;
    outer.push([hubR * Math.cos(ang), hubR * Math.sin(ang)]);
  }
  outer.push([length, -halfTip], [length, halfTip]);
  const hubHole = Math.min(Math.max(p.hubHole / 2, 0.6), hubR - 1.3);
  let tipR = Math.min(p.tipHole / 2, halfTip - 0.8);
  const tipMargin = Math.max(halfTip + 1.6, tipR + 1.6);
  let tipX = length - tipMargin;
  const holes: Vec2[][] = [circle(0, 0, hubHole, 24, true)];
  if (tipR < 0.6 || tipX < hubR + hubHole + tipR + 1.5) {
    warnings.push("Tip hole does not fit this arm, so only the hub pilot is cut.");
  } else {
    holes.push(circle(tipX, 0, tipR, 16, true));
  }
  warnings.push("Hub hole is a round pilot. Ream it to the spline — it will not press on.");
  return { outer, holes, warnings };
}

function plateRings(p: PlateParams): Rings {
  const warnings: string[] = [];
  const w = p.width;
  const h = p.height;
  const outer: Vec2[] = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ];
  const inset = Math.min(p.inset, Math.min(w, h) / 3);
  const holeR = Math.min(p.holeD / 2, inset - 0.8);
  const holes: Vec2[][] = [];
  if (holeR >= 0.6) {
    const xs = [-w / 2 + inset, w / 2 - inset];
    const ys = [-h / 2 + inset, h / 2 - inset];
    for (const x of xs) for (const y of ys) holes.push(circle(x, y, holeR, 16, true));
  } else {
    warnings.push("Corner holes do not fit this inset. Increase the plate or shrink the holes.");
  }
  if (p.slot) {
    const keep = holeR + 2.2;
    const sw = Math.min(p.slotW, h - keep * 2);
    const sl = Math.min(p.slotL, w - 2 * inset - keep);
    if (sw >= 1.2 && sl >= 4) {
      holes.push([
        [-sl / 2, -sw / 2],
        [-sl / 2, sw / 2],
        [sl / 2, sw / 2],
        [sl / 2, -sw / 2],
      ]);
    } else {
      warnings.push("Slot does not fit between the corner holes, so it was left out.");
    }
  }
  if (p.holeD < 2.2) warnings.push("Holes under about 2.2 mm often close up in FDM. Drill them after printing.");
  return { outer, holes, warnings };
}

function clipRings(p: ClipParams): Rings {
  const warnings: string[] = [];
  let wall = p.wall;
  if (wall * 2 >= p.width - 1) {
    wall = Math.max(1.2, (p.width - 2) / 2);
    warnings.push("Wall was thinned so the clip still has a throat for the wire.");
  }
  if (wall >= p.height - 1) {
    warnings.push("Wall is almost as tall as the clip. It will print as a solid block.");
  }
  const w = p.width;
  const h = p.height;
  const t = wall;
  const outer: Vec2[] = [
    [0, 0],
    [w, 0],
    [w, h],
    [w - t, h],
    [w - t, t],
    [t, t],
    [t, h],
    [0, h],
  ];
  if (p.length < 8) warnings.push("A clip this short will not hold a cable bundle.");
  return { outer, holes: [], warnings };
}
