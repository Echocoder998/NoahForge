import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newEngineeringProject } from "./types";
import { analyzeFlight, STANDARD_GRAVITY } from "./flight";

describe("flight sizing equations", () => {
  it("computes weighted mass, cost and center of mass", () => {
    const config = newEngineeringProject().flight;
    config.massItems = [
      { id: "a", name: "a", massG: 100, costUsd: 10, xMm: -30, yMm: 0, zMm: 5, source: "scale" },
      { id: "b", name: "b", massG: 300, costUsd: 15, xMm: 10, yMm: 20, zMm: -5, source: "scale" },
    ];
    const result = analyzeFlight(config);
    assert.equal(result.totalMassG, 400);
    assert.equal(result.totalCostUsd, 25);
    assert.deepEqual(result.cg, { xMm: 0, yMm: 15, zMm: -2.5 });
  });
  it("uses usable Ah and total current without multiplying capacity by cell count", () => {
    const config = newEngineeringProject().flight;
    config.batteryMah = 2000;
    config.usableFraction = 0.8;
    config.rotorCount = 4;
    config.hoverCurrentPerMotorA = 2;
    config.electronicsCurrentA = 0;
    config.cruiseCurrentA = 4;
    const result = analyzeFlight(config);
    assert.equal(result.hoverRuntimeMin, 12);
    assert.equal(result.cruiseRuntimeMin, 24);
    config.cellCount = 6;
    assert.equal(analyzeFlight(config).hoverRuntimeMin, 12);
  });
  it("calculates thrust ratio and the no-reserve hover ceiling", () => {
    const config = newEngineeringProject().flight;
    const result = analyzeFlight(config);
    assert.equal(result.thrustToWeight, 1600 / 780);
    assert.equal(result.payloadMarginG, 1600 - 780);
  });
  it("converts dm² to m² in the lift equation", () => {
    const config = newEngineeringProject().flight;
    const result = analyzeFlight(config);
    const expected = Math.sqrt((2 * 0.78 * STANDARD_GRAVITY) / (1.225 * 0.18 * 1.2));
    assert(Math.abs(result.stallSpeedMs! - expected) < 1e-10);
  });
  it("returns undefined-result nulls for zero mass, current, and area", () => {
    const config = newEngineeringProject().flight;
    config.massItems = [];
    config.hoverCurrentPerMotorA = 0;
    config.electronicsCurrentA = 0;
    config.wingAreaDm2 = 0;
    config.cruiseCurrentA = 0;
    const result = analyzeFlight(config);
    assert.equal(result.cg, null);
    assert.equal(result.thrustToWeight, null);
    assert.equal(result.hoverRuntimeMin, null);
    assert.equal(result.cruiseRuntimeMin, null);
    assert.equal(result.stallSpeedMs, null);
  });
  it("does not count negative/NaN rows and flags unsourced assumptions", () => {
    const config = newEngineeringProject().flight;
    config.massItems[0]!.massG = -100;
    config.massItems[1]!.xMm = Number.NaN;
    const result = analyzeFlight(config);
    assert.equal(result.totalMassG, 350);
    assert(result.notices.some((text) => /Invalid mass/.test(text)));
    assert(result.notices.some((text) => /unsourced/.test(text)));
  });
});
