export function meshToStl(positions: Float32Array, indices: Uint32Array, name: string): ArrayBuffer {
  const triCount = Math.floor(indices.length / 3);
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);
  const header = new TextEncoder().encode(`Noah Forge ${name}`.slice(0, 80));
  new Uint8Array(buffer, 0, 80).set(header);
  view.setUint32(80, triCount, true);
  let offset = 84;
  for (let i = 0; i < triCount; i++) {
    const ia = (indices[i * 3] ?? 0) * 3;
    const ib = (indices[i * 3 + 1] ?? 0) * 3;
    const ic = (indices[i * 3 + 2] ?? 0) * 3;
    const ax = positions[ia] ?? 0;
    const ay = positions[ia + 1] ?? 0;
    const az = positions[ia + 2] ?? 0;
    const bx = positions[ib] ?? 0;
    const by = positions[ib + 1] ?? 0;
    const bz = positions[ib + 2] ?? 0;
    const cx = positions[ic] ?? 0;
    const cy = positions[ic + 1] ?? 0;
    const cz = positions[ic + 2] ?? 0;
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);
    const verts = [ax, ay, az, bx, by, bz, cx, cy, cz];
    for (let k = 0; k < 9; k++) view.setFloat32(offset + 12 + k * 4, verts[k] ?? 0, true);
    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }
  return buffer;
}

export function downloadBlob(filename: string, data: BlobPart, mime: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function slug(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "part";
}
