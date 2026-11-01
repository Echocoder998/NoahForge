import type { LegConfig } from "./types";

export type Point2 = { x: number; y: number };
export type FootTarget = { x: number; y: number; z: number };
export type LegSolution = {
  reachable: boolean;
  withinLimits: boolean;
  yawDeg: number;
  hipDeg: number;
  kneeDeg: number;
  hip: FootTarget;
  elbow: FootTarget;
  foot: FootTarget;
  target: FootTarget;
  distanceMm: number;
  minReachMm: number;
  maxReachMm: number;
  issues: string[];
};

const RAD = Math.PI / 180;
const EPS = 1e-7;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const finite = (...values: number[]) => values.every(Number.isFinite);
const wrap = (n: number) => ((n % 1) + 1) % 1;

/**
 * Local coordinates: +x points out from the hip; +y is lateral to the leg plane;
 * +z is up. Hip pitch is positive up and knee flexion is positive. The chosen
 * branch places the knee above the straight hip-to-foot line.
 */
export function forwardLeg(
  config: Pick<LegConfig, "coxaMm" | "upperMm" | "lowerMm" | "joints">,
  yawDeg: number,
  hipDeg: number,
  kneeDeg: number,
): Pick<LegSolution, "hip" | "elbow" | "foot"> {
  const yaw = config.joints === 3 ? yawDeg * RAD : 0;
  const hip = hipDeg * RAD;
  const knee = kneeDeg * RAD;
  const coxa = config.joints === 3 ? config.coxaMm : 0;
  const project = (r: number, z: number): FootTarget => ({
    x: r * Math.cos(yaw),
    y: r * Math.sin(yaw),
    z,
  });
  const elbowR = coxa + config.upperMm * Math.cos(hip);
  const elbowZ = config.upperMm * Math.sin(hip);
  return {
    hip: project(coxa, 0),
    elbow: project(elbowR, elbowZ),
    foot: project(
      elbowR + config.lowerMm * Math.cos(hip - knee),
      elbowZ + config.lowerMm * Math.sin(hip - knee),
    ),
  };
}

export function solveLeg(
  config: LegConfig,
  target: FootTarget = { x: config.targetXmm, y: config.targetYmm, z: config.targetZmm },
): LegSolution {
  const issues: string[] = [];
  const valid =
    finite(config.coxaMm, config.upperMm, config.lowerMm, target.x, target.y, target.z) &&
    config.upperMm > 0 &&
    config.lowerMm > 0 &&
    config.coxaMm >= 0;
  const upper = valid ? config.upperMm : 1;
  const lower = valid ? config.lowerMm : 1;
  const coxa = config.joints === 3 && valid ? config.coxaMm : 0;
  const safeTarget = valid ? target : { x: 0, y: 0, z: 0 };
  const yaw = config.joints === 3 ? Math.atan2(safeTarget.y, safeTarget.x) : 0;
  const radial = config.joints === 3 ? Math.hypot(safeTarget.x, safeTarget.y) - coxa : safeTarget.x;
  const distance = Math.hypot(radial, safeTarget.z);
  const minReach = Math.abs(upper - lower);
  const maxReach = upper + lower;
  const planeOk = config.joints === 3 || Math.abs(safeTarget.y) < EPS;
  const reachable = valid && planeOk && distance >= minReach - EPS && distance <= maxReach + EPS;
  const knee = Math.acos(
    clamp((distance * distance - upper * upper - lower * lower) / (2 * upper * lower), -1, 1),
  );
  const hip =
    distance < EPS
      ? Math.PI / 2
      : Math.atan2(safeTarget.z, radial) +
        Math.atan2(lower * Math.sin(knee), upper + lower * Math.cos(knee));
  const yawDeg = yaw / RAD;
  const hipDeg = ((((hip / RAD + 180) % 360) + 360) % 360) - 180;
  const kneeDeg = knee / RAD;
  const validLimits =
    finite(config.hipMinDeg, config.hipMaxDeg, config.kneeMinDeg, config.kneeMaxDeg) &&
    config.hipMinDeg <= config.hipMaxDeg &&
    config.kneeMinDeg <= config.kneeMaxDeg &&
    (config.joints === 2 ||
      (finite(config.yawMinDeg, config.yawMaxDeg) && config.yawMinDeg <= config.yawMaxDeg));
  const hipOk = hipDeg >= config.hipMinDeg - EPS && hipDeg <= config.hipMaxDeg + EPS;
  const kneeOk = kneeDeg >= config.kneeMinDeg - EPS && kneeDeg <= config.kneeMaxDeg + EPS;
  const yawOk =
    config.joints === 2 || (yawDeg >= config.yawMinDeg - EPS && yawDeg <= config.yawMaxDeg + EPS);
  if (!valid) issues.push("Enter positive link lengths and finite target coordinates.");
  if (!planeOk)
    issues.push(
      "A two-joint leg only reaches targets in its x–z plane. Set target y to zero or enable yaw.",
    );
  if (valid && distance > maxReach + EPS)
    issues.push("The foot target is beyond the links' maximum reach.");
  if (valid && distance < minReach - EPS)
    issues.push("The foot target is inside the leg's folded reach limit.");
  if (!validLimits) issues.push("Each joint minimum must be less than or equal to its maximum.");
  if (reachable && validLimits && !hipOk)
    issues.push("The required hip angle is outside its configured joint limits.");
  if (reachable && validLimits && !kneeOk)
    issues.push("The required knee angle is outside its configured joint limits.");
  if (reachable && validLimits && !yawOk)
    issues.push("The required yaw angle is outside its configured joint limits.");
  if (reachable && (Math.abs(distance - maxReach) < 0.1 || distance < minReach + 0.1))
    issues.push(
      "This pose is near a kinematic singularity; small target changes can require large joint motion.",
    );
  const points = forwardLeg(
    { ...config, coxaMm: coxa, upperMm: upper, lowerMm: lower },
    yawDeg,
    hipDeg,
    kneeDeg,
  );
  return {
    reachable,
    withinLimits: reachable && validLimits && hipOk && kneeOk && yawOk,
    yawDeg,
    hipDeg,
    kneeDeg,
    ...points,
    target: safeTarget,
    distanceMm: distance,
    minReachMm: minReach,
    maxReachMm: maxReach,
    issues,
  };
}

export type GaitFoot = Point2 & {
  id: string;
  index: number;
  grounded: boolean;
  liftMm: number;
  localPhase: number;
  forwardMm: number;
  target: FootTarget;
  solution: LegSolution;
};
export type GaitFrame = {
  feet: GaitFoot[];
  support: Point2[];
  groundedCount: number;
  marginMm: number | null;
  stable: boolean;
  issues: string[];
};

export function convexHull(points: Point2[]): Point2[] {
  const sorted = [...new Map(points.map((p) => [`${p.x},${p.y}`, p])).values()]
    .filter((p) => finite(p.x, p.y))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length <= 2) return sorted;
  const cross = (a: Point2, b: Point2, c: Point2) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const lower: Point2[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= EPS)
      lower.pop();
    lower.push(p);
  }
  const upper: Point2[] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= EPS)
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Signed shortest edge distance for a CCW convex polygon. Positive is inside. */
export function supportMargin(points: Point2[], center: Point2): number | null {
  const hull = convexHull(points);
  if (hull.length < 3 || !finite(center.x, center.y)) return null;
  return Math.min(
    ...hull.map((a, index) => {
      const b = hull[(index + 1) % hull.length]!;
      return (
        ((b.x - a.x) * (center.y - a.y) - (b.y - a.y) * (center.x - a.x)) /
        Math.hypot(b.x - a.x, b.y - a.y)
      );
    }),
  );
}

export function gaitFrame(config: LegConfig, phase = config.phase): GaitFrame {
  const count = [4, 6, 8].includes(config.legCount) ? config.legCount : 6;
  const rows = count / 2;
  const duty = clamp(Number.isFinite(config.dutyFactor) ? config.dutyFactor : 0.65, 0.05, 0.99);
  const feet: GaitFoot[] = Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / 2);
    const side = index % 2 === 0 ? 1 : -1;
    const offset =
      config.gait === "tripod"
        ? ((row + (side === 1 ? 0 : 1)) % 2) / 2
        : config.gait === "wave"
          ? index / count
          : wrap(row / rows + (side === 1 ? 0 : 0.5));
    const localPhase = wrap((Number.isFinite(phase) ? phase : 0) + offset);
    const grounded = localPhase < duty;
    const t = grounded ? localPhase / duty : (localPhase - duty) / (1 - duty);
    const forwardMm = grounded ? config.strideMm * (0.5 - t) : config.strideMm * (t - 0.5);
    const liftMm = grounded ? 0 : Math.max(0, config.stepHeightMm) * Math.sin(Math.PI * t);
    const target =
      config.joints === 3
        ? { x: config.targetXmm, y: config.targetYmm + forwardMm, z: config.targetZmm + liftMm }
        : { x: config.targetXmm + forwardMm, y: 0, z: config.targetZmm + liftMm };
    return {
      id: `${side === 1 ? "L" : "R"}${row + 1}`,
      index,
      grounded,
      liftMm,
      localPhase,
      forwardMm,
      target,
      solution: solveLeg(config, target),
      x: config.bodyLengthMm / 2 - (row * config.bodyLengthMm) / Math.max(1, rows - 1) + forwardMm,
      y: side * (config.bodyWidthMm / 2 + Math.abs(config.targetXmm)),
    };
  });
  const support = convexHull(feet.filter((f) => f.grounded));
  const marginMm = supportMargin(support, { x: config.comXmm, y: config.comYmm });
  const issues: string[] = [];
  if (config.gait === "tripod" && count !== 6)
    issues.push(
      "Tripod timing requires six legs. For this leg count the preview uses alternating groups.",
    );
  if (marginMm === null)
    issues.push(
      "Fewer than three non-collinear contacts: no static support polygon exists at this phase.",
    );
  else if (marginMm < 0)
    issues.push("The projected center of mass is outside the support polygon at this phase.");
  const limited = feet.filter((foot) => !foot.solution.withinLimits);
  if (limited.length)
    issues.push(
      `${limited.length} leg target${limited.length === 1 ? " is" : "s are"} unreachable or beyond the configured joint limits at this phase.`,
    );
  return {
    feet,
    support,
    groundedCount: feet.filter((f) => f.grounded).length,
    marginMm,
    stable: marginMm !== null && marginMm > EPS,
    issues,
  };
}

export function gaitCycle(config: LegConfig, samples = 100) {
  const count = Math.min(1000, Math.max(2, Math.round(Number.isFinite(samples) ? samples : 100)));
  const frames = Array.from({ length: count }, (_, i) => gaitFrame(config, i / count));
  return {
    frames,
    minimumContacts: Math.min(...frames.map((f) => f.groundedCount)),
    minimumMarginMm: frames.some((f) => f.marginMm === null)
      ? null
      : Math.min(...frames.map((f) => f.marginMm!)),
    infeasiblePhases: frames.filter((f) => f.feet.some((foot) => !foot.solution.withinLimits))
      .length,
    supportedPhases: frames.filter((f) => f.stable).length,
  };
}

export function staticLoads(
  config: LegConfig,
  supportingLegs: number,
  solution = solveLeg(config),
) {
  const valid =
    supportingLegs > 0 &&
    finite(
      config.bodyMassG,
      config.payloadG,
      config.linkMassG,
      config.serviceFactor,
      config.servoTorqueNm,
    ) &&
    config.bodyMassG >= 0 &&
    config.payloadG >= 0 &&
    config.linkMassG >= 0 &&
    config.serviceFactor >= 1 &&
    config.servoTorqueNm >= 0 &&
    solution.withinLimits;
  if (!valid) return null;
  const g = 9.80665;
  const forcePerLegN = (((config.bodyMassG + config.payloadG) / 1000) * g) / supportingLegs;
  const yaw = solution.yawDeg * RAD;
  const radial = (p: FootTarget) => p.x * Math.cos(yaw) + p.y * Math.sin(yaw);
  const x0 = radial(solution.hip) / 1000;
  const x1 = radial(solution.elbow) / 1000;
  const x2 = radial(solution.foot) / 1000;
  const linkWeightN = (config.linkMassG / 1000) * g;
  // Sum absolute moments as a conservative static sizing estimate. Equal body
  // load sharing and horizontal moment arms are explicit assumptions.
  const hipTorqueNm =
    forcePerLegN * Math.abs(x2 - x0) +
    linkWeightN * Math.abs((x0 + x1) / 2 - x0) +
    linkWeightN * Math.abs((x1 + x2) / 2 - x0);
  const kneeTorqueNm =
    forcePerLegN * Math.abs(x2 - x1) + linkWeightN * Math.abs((x1 + x2) / 2 - x1);
  const requiredHipNm = hipTorqueNm * config.serviceFactor;
  const requiredKneeNm = kneeTorqueNm * config.serviceFactor;
  const largest = Math.max(requiredHipNm, requiredKneeNm);
  return {
    forcePerLegN,
    hipTorqueNm,
    kneeTorqueNm,
    requiredHipNm,
    requiredKneeNm,
    totalMassG: config.bodyMassG + config.payloadG + config.legCount * config.linkMassG * 2,
    ratingRatio: largest > 0 ? config.servoTorqueNm / largest : null,
    ratingExceedsEstimate: config.servoTorqueNm >= largest,
  };
}

export function gaitCsv(config: LegConfig): string {
  const rows = [
    "phase,leg,contact,foot_x_mm,foot_y_mm,foot_z_mm,yaw_deg,hip_deg,knee_deg,within_limits",
  ];
  for (let i = 0; i < 20; i++) {
    const phase = i / 20;
    for (const foot of gaitFrame(config, phase).feet) {
      const s = foot.solution;
      rows.push(
        [
          phase.toFixed(2),
          foot.id,
          foot.grounded ? "stance" : "swing",
          foot.target.x.toFixed(3),
          foot.target.y.toFixed(3),
          foot.target.z.toFixed(3),
          s.yawDeg.toFixed(3),
          s.hipDeg.toFixed(3),
          s.kneeDeg.toFixed(3),
          String(s.withinLimits),
        ].join(","),
      );
    }
  }
  return rows.join("\n");
}
