import earcut from "earcut";

export type Vec2 = [number, number];

export type MeshData = {
  positions: Float32Array;
  indices: Uint32Array;
  warnings: string[];
};

export function circle(cx: number, cy: number, r: number, n: number, cw: boolean): Vec2[] {
  const pts: Vec2[] = [];
  const steps = Math.max(8, n);
  for (let i = 0; i < steps; i++) {
    const a = (cw ? -1 : 1) * ((i / steps) * Math.PI * 2);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/** Prism from z = 0 to z = depth. Outer ring CCW, holes CW. Rings are not closed. */
export function extrude(outer: Vec2[], holes: Vec2[][], depth: number): MeshData {
  const warnings: string[] = [];
  const rings: Vec2[][] = [outer, ...holes.filter((h) => h.length >= 3)];
  if (outer.length < 3 || depth <= 0) {
    return { positions: new Float32Array(), indices: new Uint32Array(), warnings: ["Empty solid."] };
  }

  const coords: number[] = [];
  const holeStarts: number[] = [];
  const spans: { start: number; count: number }[] = [];
  rings.forEach((ring, i) => {
    const start = coords.length / 2;
    if (i > 0) holeStarts.push(start);
    for (const [x, y] of ring) coords.push(x, y);
    spans.push({ start, count: ring.length });
  });

  let tris = earcut(coords, holeStarts, 2);
  if (tris.length < 3) {
    warnings.push("A hole cut failed and was dropped so the plate still exports.");
    const outerCount = outer.length;
    const outerCoords = coords.slice(0, outerCount * 2);
    tris = earcut(outerCoords, undefined, 2);
    coords.length = outerCount * 2;
    spans.length = 1;
  }

  const vcount = coords.length / 2;
  const positions = new Float32Array(vcount * 2 * 3);
  for (let i = 0; i < vcount; i++) {
    const x = coords[i * 2] ?? 0;
    const y = coords[i * 2 + 1] ?? 0;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = 0;
    const t = (vcount + i) * 3;
    positions[t] = x;
    positions[t + 1] = y;
    positions[t + 2] = depth;
  }

  const idx: number[] = [];
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] ?? 0;
    const b = tris[t + 1] ?? 0;
    const c = tris[t + 2] ?? 0;
    idx.push(a + vcount, b + vcount, c + vcount);
    idx.push(a, c, b);
  }
  for (const ring of spans) {
    for (let i = 0; i < ring.count; i++) {
      const a = ring.start + i;
      const b = ring.start + ((i + 1) % ring.count);
      idx.push(a, b, b + vcount);
      idx.push(a, b + vcount, a + vcount);
    }
  }

  return { positions, indices: new Uint32Array(idx), warnings };
}

export function centerRings(outer: Vec2[], holes: Vec2[][]): { outer: Vec2[]; holes: Vec2[][] } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of outer) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const shift = (ring: Vec2[]): Vec2[] => ring.map(([x, y]) => [x - cx, y - cy]);
  return { outer: shift(outer), holes: holes.map(shift) };
}

/** Signed volume, mm³. Positive when triangle normals point outward. */
export function signedVolume(positions: Float32Array, indices: Uint32Array): number {
  let v = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const ia = (indices[i] ?? 0) * 3;
    const ib = (indices[i + 1] ?? 0) * 3;
    const ic = (indices[i + 2] ?? 0) * 3;
    const ax = positions[ia] ?? 0;
    const ay = positions[ia + 1] ?? 0;
    const az = positions[ia + 2] ?? 0;
    const bx = positions[ib] ?? 0;
    const by = positions[ib + 1] ?? 0;
    const bz = positions[ib + 2] ?? 0;
    const cx = positions[ic] ?? 0;
    const cy = positions[ic + 1] ?? 0;
    const cz = positions[ic + 2] ?? 0;
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

export function meshSize(positions: Float32Array): { x: number; y: number; z: number } {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] ?? 0;
    const y = positions[i + 1] ?? 0;
    const z = positions[i + 2] ?? 0;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, z: 0 };
  return { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
}
