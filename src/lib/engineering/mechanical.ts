import earcut from "earcut";
import { circle, extrude, type MeshData, type Vec2 } from "../aero/mesh";
import type { AssemblyConfig } from "./types";

export type AssemblyCheck = { level: "pass" | "warn" | "fail"; title: string; detail: string };
export const FASTENER_MM = { M2: 2, M3: 3, M4: 4 } as const;
export const postRadius = (config: AssemblyConfig) => Math.max(4, config.holeDiameterMm / 2 + 2);
export const holeCenters = (config: AssemblyConfig): Vec2[] =>
  [-1, 1].flatMap((sx) =>
    [-1, 1].map((sy) => [(sx * config.holePitchXmm) / 2, (sy * config.holePitchYmm) / 2] as Vec2),
  );

export function analyzeMechanical(config: AssemblyConfig) {
  const checks: AssemblyCheck[] = [];
  const values = [
    config.plateWidthMm,
    config.plateLengthMm,
    config.plateThicknessMm,
    config.holeDiameterMm,
    config.holePitchXmm,
    config.holePitchYmm,
    config.mountHeightMm,
    config.clearanceMm,
    config.densityGcm3,
  ];
  const numbersValid =
    values.every(Number.isFinite) &&
    values.every((n) => n >= 0) &&
    config.plateWidthMm > 0 &&
    config.plateLengthMm > 0 &&
    config.plateThicknessMm > 0 &&
    config.holeDiameterMm > 0 &&
    config.holePitchXmm > 0 &&
    config.holePitchYmm > 0 &&
    config.densityGcm3 > 0;
  if (!numbersValid)
    checks.push({
      level: "fail",
      title: "Invalid dimensions",
      detail: "Use positive finite dimensions and density; height and added clearance may be zero.",
    });
  const radius = postRadius(config);
  if (
    config.holePitchXmm + radius * 2 > config.plateWidthMm ||
    config.holePitchYmm + radius * 2 > config.plateLengthMm
  )
    checks.push({
      level: "fail",
      title: "Mounts extend past the plate",
      detail:
        "Increase the plate size or reduce mounting-hole pitch so each complete standoff fits on the plate.",
    });
  else
    checks.push({
      level: "pass",
      title: "Mounts fit inside the plate",
      detail:
        "The complete mounting pads are inside the outline. This is a geometry check, not a load rating.",
    });
  if (config.holePitchXmm <= radius * 2 || config.holePitchYmm <= radius * 2)
    checks.push({
      level: "fail",
      title: "Mounting pads overlap",
      detail: "Increase the hole spacing above the standoff outside diameter.",
    });
  const nominal = FASTENER_MM[config.fastenerSize];
  const requiredHoleMm = nominal + config.clearanceMm;
  if (config.holeDiameterMm < requiredHoleMm)
    checks.push({
      level: "fail",
      title: "Fastener clearance is too small",
      detail: `${config.fastenerSize} plus ${config.clearanceMm.toFixed(2)} mm diametral allowance requires at least ${requiredHoleMm.toFixed(2)} mm holes.`,
    });
  else
    checks.push({
      level: "pass",
      title: "Entered fastener allowance fits",
      detail: `${config.holeDiameterMm.toFixed(2)} mm hole ≥ ${requiredHoleMm.toFixed(2)} mm nominal plus allowance. Verify with a printed test coupon.`,
    });
  checks.push({
    level: "warn",
    title: "Manufacturing and strength still need testing",
    detail: `${config.orientation} build orientation is recorded. Layer adhesion, tolerances, stress concentrations and service temperature are not modeled.`,
  });
  const valid = !checks.some((check) => check.level === "fail");
  const innerR = config.holeDiameterMm / 2;
  const volumeMm3 = valid
    ? (config.plateWidthMm * config.plateLengthMm - 4 * Math.PI * innerR ** 2) *
        config.plateThicknessMm +
      4 * Math.PI * (radius ** 2 - innerR ** 2) * config.mountHeightMm
    : null;
  const massG = volumeMm3 === null ? null : (volumeMm3 / 1000) * config.densityGcm3;
  const screwLengthMm = Math.ceil((config.plateThicknessMm + config.mountHeightMm + 4) / 5) * 5;
  return {
    checks,
    valid,
    volumeMm3,
    massG,
    requiredHoleMm,
    screwLengthMm,
    postOuterDiameterMm: radius * 2,
  };
}

/** Closed stepped solid: plate with four through holes and four integral mounting columns. Units mm. */
export function mountingAssemblyMesh(config: AssemblyConfig): MeshData {
  const result = analyzeMechanical(config);
  if (!result.valid)
    return {
      positions: new Float32Array(),
      indices: new Uint32Array(),
      warnings: result.checks.filter((c) => c.level === "fail").map((c) => c.detail),
    };
  const outer: Vec2[] = [
    [-config.plateWidthMm / 2, -config.plateLengthMm / 2],
    [config.plateWidthMm / 2, -config.plateLengthMm / 2],
    [config.plateWidthMm / 2, config.plateLengthMm / 2],
    [-config.plateWidthMm / 2, config.plateLengthMm / 2],
  ];
  const centers = holeCenters(config);
  const inner = centers.map(([x, y]) => circle(x, y, config.holeDiameterMm / 2, 48, true));
  if (config.mountHeightMm === 0) return extrude(outer, inner, config.plateThicknessMm);
  const upper = config.plateThicknessMm + config.mountHeightMm;
  const positions: number[] = [];
  const indices: number[] = [];
  const addTriangle = (a: number[], b: number[], c: number[]) => {
    const index = positions.length / 3;
    positions.push(...a, ...b, ...c);
    indices.push(index, index + 1, index + 2);
  };
  const cap = (outline: Vec2[], holes: Vec2[][], z: number, upwards: boolean) => {
    const points = [...outline, ...holes.flat()];
    const starts: number[] = [];
    let offset = outline.length;
    for (const hole of holes) {
      starts.push(offset);
      offset += hole.length;
    }
    const triangles = earcut(points.flat(), starts, 2);
    for (let i = 0; i < triangles.length; i += 3) {
      const a = [...points[triangles[i]!]!, z];
      const b = [...points[triangles[i + 1]!]!, z];
      const c = [...points[triangles[i + 2]!]!, z];
      addTriangle(a, upwards ? b : c, upwards ? c : b);
    }
  };
  const wall = (ring: Vec2[], bottom: number, top: number) => {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      addTriangle([...a, bottom], [...b, bottom], [...b, top]);
      addTriangle([...a, bottom], [...b, top], [...a, top]);
    }
  };
  const outsidePads = centers.map(([x, y]) => circle(x, y, postRadius(config), 48, true));
  cap(outer, inner, 0, false);
  cap(outer, outsidePads, config.plateThicknessMm, true);
  wall(outer, 0, config.plateThicknessMm);
  for (let i = 0; i < centers.length; i++) {
    const pad = [...outsidePads[i]!].reverse();
    wall(pad, config.plateThicknessMm, upper);
    wall(inner[i]!, 0, upper);
    cap(pad, [inner[i]!], upper, true);
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    warnings: [],
  };
}

export function mountingPlateMesh(config: AssemblyConfig): MeshData {
  return mountingAssemblyMesh({ ...config, mountHeightMm: 0 });
}

export function assemblyScad(config: AssemblyConfig, name: string): string {
  if (!analyzeMechanical(config).valid)
    throw new Error("Fix the assembly geometry before exporting.");
  const title = name.replace(/[\r\n]/g, " ");
  return `// Noah Forge mounting assembly: ${title}\n// Units: millimeters. Verify tolerances and loads before manufacture.\n$fn = 96;\nwidth = ${config.plateWidthMm};\nlength = ${config.plateLengthMm};\nthickness = ${config.plateThicknessMm};\nheight = ${config.mountHeightMm};\nhole_d = ${config.holeDiameterMm};\npitch_x = ${config.holePitchXmm};\npitch_y = ${config.holePitchYmm};\npost_d = ${postRadius(config) * 2};\n\ndifference() {\n  union() {\n    translate([-width/2, -length/2, 0]) cube([width, length, thickness]);\n    for (x=[-pitch_x/2,pitch_x/2], y=[-pitch_y/2,pitch_y/2])\n      translate([x,y,thickness]) cylinder(h=height,d=post_d);\n  }\n  for (x=[-pitch_x/2,pitch_x/2], y=[-pitch_y/2,pitch_y/2])\n    translate([x,y,-0.1]) cylinder(h=thickness+height+0.2,d=hole_d);\n}\n`;
}

export function plateDxf(config: AssemblyConfig): string {
  if (!analyzeMechanical(config).valid)
    throw new Error("Fix the assembly geometry before exporting.");
  const w = config.plateWidthMm / 2;
  const h = config.plateLengthMm / 2;
  const corners = [
    [-w, -h],
    [w, -h],
    [w, h],
    [-w, h],
  ];
  const entities =
    corners
      .map((a, i) => {
        const b = corners[(i + 1) % corners.length]!;
        return `0\nLINE\n8\nPLATE\n10\n${a[0]}\n20\n${a[1]}\n30\n0\n11\n${b[0]}\n21\n${b[1]}\n31\n0\n`;
      })
      .join("") +
    holeCenters(config)
      .map(
        ([x, y]) =>
          `0\nCIRCLE\n8\nHOLES\n10\n${x}\n20\n${y}\n30\n0\n40\n${config.holeDiameterMm / 2}\n`,
      )
      .join("");
  return `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`;
}

export function assemblyBomCsv(config: AssemblyConfig): string {
  const result = analyzeMechanical(config);
  const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  return [
    ["Quantity", "Part", "Specification", "Note"],
    [
      1,
      "Mounting assembly",
      `${config.material}; ${config.plateWidthMm} × ${config.plateLengthMm} × ${config.plateThicknessMm} mm plate; ${config.mountHeightMm} mm posts`,
      "Solid-volume estimate; validate fabrication settings",
    ],
    [
      4,
      "Machine screw",
      `${config.fastenerSize} × ${result.screwLengthMm} mm starting estimate`,
      "Includes 4 mm assumed nut/washer stack; verify mating part and engagement",
    ],
    [4, "Nut", config.fastenerSize, "Match screw thread"],
    [8, "Washer", config.fastenerSize, "One per side; verify local bearing loads"],
  ]
    .map((row) => row.map(quote).join(","))
    .join("\r\n");
}
