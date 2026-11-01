import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newEngineeringProject } from "./types";
import { signedVolume, meshSize } from "../aero/mesh";
import {
  analyzeMechanical,
  assemblyBomCsv,
  assemblyScad,
  mountingAssemblyMesh,
  plateDxf,
} from "./mechanical";

describe("mechanical mounting assembly", () => {
  it("has the requested bounds and an outward closed volume close to the analytic volume", () => {
    const config = newEngineeringProject().assembly;
    const result = analyzeMechanical(config);
    const mesh = mountingAssemblyMesh(config);
    assert(result.valid);
    assert(mesh.indices.length > 0);
    const size = meshSize(mesh.positions);
    assert.equal(size.x, config.plateWidthMm);
    assert.equal(size.y, config.plateLengthMm);
    assert.equal(size.z, config.plateThicknessMm + config.mountHeightMm);
    const volume = signedVolume(mesh.positions, mesh.indices);
    assert(volume > 0);
    assert(Math.abs(volume - result.volumeMm3!) / result.volumeMm3! < 0.002);
  });
  it("keeps zero-height columns as a valid plate without degenerate triangles", () => {
    const config = { ...newEngineeringProject().assembly, mountHeightMm: 0 };
    const mesh = mountingAssemblyMesh(config);
    assert.equal(meshSize(mesh.positions).z, config.plateThicknessMm);
    assert(
      Math.abs(signedVolume(mesh.positions, mesh.indices) - analyzeMechanical(config).volumeMm3!) <
        1,
    );
  });
  it("exports a geometrically closed mesh with every edge shared twice", () => {
    const mesh = mountingAssemblyMesh(newEngineeringProject().assembly);
    const edges = new Map<string, number>();
    const point = (index: number) =>
      Array.from(mesh.positions.slice(index * 3, index * 3 + 3))
        .map((n) => n.toFixed(5))
        .join(",");
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const vertices = [
        point(mesh.indices[i]!),
        point(mesh.indices[i + 1]!),
        point(mesh.indices[i + 2]!),
      ];
      assert.equal(new Set(vertices).size, 3);
      for (let edge = 0; edge < 3; edge++) {
        const key = [vertices[edge], vertices[(edge + 1) % 3]].sort().join("|");
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    assert([...edges.values()].every((count) => count === 2));
  });
  it("rejects off-edge pads, overlapping mounts and undersized clearance", () => {
    const config = newEngineeringProject().assembly;
    assert.equal(analyzeMechanical({ ...config, holePitchXmm: config.plateWidthMm }).valid, false);
    assert.equal(analyzeMechanical({ ...config, holePitchXmm: 2 }).valid, false);
    assert.equal(analyzeMechanical({ ...config, holeDiameterMm: 2.5 }).valid, false);
    assert.equal(mountingAssemblyMesh({ ...config, holeDiameterMm: 2.5 }).positions.length, 0);
  });
  it("rejects nonfinite dimensions and computes solid mass from density", () => {
    const config = newEngineeringProject().assembly;
    assert.equal(analyzeMechanical({ ...config, plateThicknessMm: Number.NaN }).valid, false);
    const result = analyzeMechanical(config);
    assert.equal(result.massG, (result.volumeMm3! / 1000) * config.densityGcm3);
  });
  it("exports metric CAD geometry and an explicit hardware assumption", () => {
    const config = newEngineeringProject().assembly;
    const scad = assemblyScad(config, "Trial\nmalicious line");
    assert(scad.includes("difference()"));
    assert(scad.includes("pitch_x = 80"));
    assert(scad.startsWith("// Noah Forge mounting assembly: Trial malicious line\n"));
    const dxf = plateDxf(config);
    assert.equal((dxf.match(/\nCIRCLE\n/g) || []).length, 4);
    assert(dxf.includes("$INSUNITS\n70\n4"));
    assert(assemblyBomCsv(config).includes("4 mm assumed nut/washer stack"));
    assert.throws(() => assemblyScad({ ...config, holeDiameterMm: 0 }, "bad"));
  });
});
