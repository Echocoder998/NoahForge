import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newEngineeringProject, ROBOT_ARCHETYPES } from "./types";
import { analyzeProject, bindEngineering, archetypeForChassis, isWalking } from "./archetypes";
import { migrateEngineering } from "./schema";
import { reportMarkdown } from "./report";
describe("archetype sizing and shared budgets", () => {
  it("uses 18 servos for a 3-DoF hexapod and converts torque to N cm", () => {
    const p = newEngineeringProject("hexapod");
    const r = analyzeProject(p);
    assert.equal(r.actuatorCount, 18);
    assert.equal(r.busContinuousA, 5);
    assert.ok(Math.abs(r.jointTorqueNcm - (((780 / 1000) * 9.80665) / 3) * 0.17 * 2 * 100) < 1e-8);
    assert.equal(r.strideSpeedMs, 0.02);
    assert.ok(r.notices.every((n) => !n.includes("propeller")));
  });
  it("updates linked BOM repeatedly without double counting and supports reverse unit edits", () => {
    let p = newEngineeringProject("hexapod");
    p = bindEngineering(p, { sizing: { ...p.sizing, actuatorMassG: 20 } });
    assert.equal(p.flight.massItems.find((x) => x.id === "propulsion")!.massG, 360);
    p = bindEngineering(p, { leg: { ...p.leg, joints: 2 } });
    assert.equal(p.flight.massItems.find((x) => x.id === "propulsion")!.massG, 240);
    p = bindEngineering(p, {
      flight: {
        ...p.flight,
        massItems: p.flight.massItems.map((x) =>
          x.id === "propulsion" ? { ...x, massG: 120 } : x,
        ),
      },
    });
    assert.equal(p.sizing.actuatorMassG, 10);
    p = bindEngineering(p, { leg: { ...p.leg, joints: 3 } });
    assert.equal(p.flight.massItems.find((x) => x.id === "propulsion")!.massG, 180);
    assert.equal(p.flight.massItems.filter((x) => x.id === "propulsion").length, 1);
  });
  it("uses distinct flight models and handles zero current/mass", () => {
    const drone = newEngineeringProject("multirotor");
    const r = analyzeProject(drone);
    assert.ok(Math.abs(r.runtimeMin! - ((2.2 * 0.8) / 16.5) * 60) < 1e-8);
    assert.ok(r.thrustToWeight! >= 2);
    const wing = newEngineeringProject("fixed_wing");
    assert.notEqual(r.runtimeMin, analyzeProject(wing).runtimeMin);
    wing.flight.cruiseCurrentA = 0;
    wing.flight.electronicsCurrentA = 0;
    assert.equal(analyzeProject(wing).runtimeMin, null);
  });
  it("models rover slope, gearing and traction independently of rotor settings", () => {
    const p = newEngineeringProject("rover");
    const flat = analyzeProject({ ...p, sizing: { ...p.sizing, slopeDeg: 0 } });
    const slope = analyzeProject(p);
    assert.ok(slope.wheelTorqueNcm > flat.wheelTorqueNcm);
    assert.ok(Math.abs(slope.motorTorqueNcm - slope.wheelTorqueNcm / 30 / 0.85) < 1e-8);
    p.flight.hoverCurrentPerMotorA = 999;
    assert.equal(analyzeProject(p).powerW, slope.powerW);
    assert.ok(!reportMarkdown("Rover", p, "").includes("Hover runtime"));
  });
  it("preserves old BOM and infers chassis types while migrating and switching", () => {
    const p = newEngineeringProject();
    const { archetype: _archetype, sizing: _sizing, ...legacy } = p;
    const migrated = migrateEngineering(legacy, archetypeForChassis("spider"));
    assert.equal(migrated.archetype, "hexapod");
    assert.deepEqual(migrated.flight.massItems, p.flight.massItems);
    for (const a of ROBOT_ARCHETYPES) {
      const changed = bindEngineering(p, { archetype: a });
      assert.equal(changed.archetype, a);
      if (isWalking(a))
        assert.equal(changed.leg.legCount, a === "hexapod" ? 6 : a === "quadruped" ? 4 : 2);
    }
  });
  it("preserves explicit archetypes and recovers malformed sizing fields individually", () => {
    const p = newEngineeringProject("rover");
    const r = migrateEngineering({ ...p, sizing: { ...p.sizing, gearRatio: -1, motorMassG: 72 } });
    assert.equal(r.archetype, "rover");
    assert.equal(r.sizing.gearRatio, 30);
    assert.equal(r.sizing.motorMassG, 72);
  });
});
