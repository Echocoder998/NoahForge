import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newEngineeringProject } from "./types";
import {
  convexHull,
  forwardLeg,
  gaitCsv,
  gaitCycle,
  gaitFrame,
  solveLeg,
  staticLoads,
  supportMargin,
} from "./leg";

const close = (actual: number, expected: number, tolerance = 1e-6) =>
  assert(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const config = () => newEngineeringProject().leg;

describe("leg inverse kinematics", () => {
  it("round trips a three-joint pose through independent forward kinematics", () => {
    const c = config();
    const original = forwardLeg(c, 23, 18, 85);
    const result = solveLeg(c, original.foot);
    assert(result.withinLimits);
    close(result.yawDeg, 23);
    close(result.hipDeg, 18);
    close(result.kneeDeg, 85);
    close(result.foot.x, original.foot.x);
    close(result.foot.y, original.foot.y);
    close(result.foot.z, original.foot.z);
  });
  it("solves a two-link planar target without using coxa length", () => {
    const c = { ...config(), joints: 2 as const, coxaMm: 500 };
    const target = forwardLeg(c, 40, 10, 90).foot;
    const result = solveLeg(c, target);
    assert(result.withinLimits);
    close(result.yawDeg, 0);
    close(result.hipDeg, 10);
    close(result.kneeDeg, 90);
    close(result.hip.x, 0);
  });
  it("rejects too-far, too-close, and off-plane targets", () => {
    const c = config();
    assert.equal(solveLeg(c, { x: 1000, y: 0, z: 0 }).reachable, false);
    assert.equal(solveLeg(c, { x: c.coxaMm + 1, y: 0, z: 0 }).reachable, false);
    assert.equal(solveLeg({ ...c, joints: 2 }, { x: 80, y: 10, z: -80 }).reachable, false);
  });
  it("separates geometric reach from joint travel constraints", () => {
    const c = { ...config(), hipMinDeg: 40, hipMaxDeg: 60 };
    const result = solveLeg(c);
    assert(result.reachable);
    assert.equal(result.withinLimits, false);
    assert(result.issues.some((issue) => issue.includes("hip angle")));
    assert.equal(solveLeg({ ...config(), kneeMinDeg: 120, kneeMaxDeg: 10 }).withinLimits, false);
  });
  it("handles fully folded equal links without non-finite angles", () => {
    const c = { ...config(), joints: 2 as const, upperMm: 100, lowerMm: 100, kneeMaxDeg: 180 };
    const result = solveLeg(c, { x: 0, y: 0, z: 0 });
    assert(result.reachable);
    assert(Number.isFinite(result.hipDeg));
    close(result.kneeDeg, 180);
    close(result.foot.x, 0);
    close(result.foot.z, 0);
  });
  it("normalizes equivalent hip rotations before checking travel limits", () => {
    const c = { ...config(), joints: 2 as const, hipMinDeg: -180, hipMaxDeg: 180 };
    const target = forwardLeg(c, 0, -150, 120).foot;
    const result = solveLeg(c, target);
    assert(result.withinLimits);
    close(result.hipDeg, -150);
    close(result.kneeDeg, 120);
  });
  it("fails invalid input without emitting NaN geometry", () => {
    const result = solveLeg({ ...config(), upperMm: 0, lowerMm: Number.NaN });
    assert.equal(result.reachable, false);
    assert(Number.isFinite(result.foot.x));
    assert(Number.isFinite(result.foot.z));
  });
});

describe("static gait geometry", () => {
  it("constructs a CCW support hull and signed margin", () => {
    const points = [
      { x: -10, y: -10 },
      { x: 10, y: -10 },
      { x: 10, y: 10 },
      { x: -10, y: 10 },
      { x: 0, y: 0 },
      { x: -10, y: -10 },
    ];
    assert.equal(convexHull(points).length, 4);
    close(supportMargin(points, { x: 0, y: 0 })!, 10);
    close(supportMargin(points, { x: 12, y: 0 })!, -2);
    close(supportMargin(points, { x: 10, y: 0 })!, 0);
  });
  it("does not claim a polygon for fewer than three non-collinear feet", () => {
    assert.equal(
      supportMargin(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
        { x: 0, y: 0 },
      ),
      null,
    );
    assert.equal(supportMargin([], { x: 0, y: 0 }), null);
  });
  it("keeps at least three stance feet in a six-leg tripod with duty >= 0.5", () => {
    const c = { ...config(), dutyFactor: 0.6 };
    const cycle = gaitCycle(c);
    assert.equal(cycle.minimumContacts, 3);
    for (const frame of cycle.frames) {
      assert.equal(frame.feet.length, 6);
      for (const foot of frame.feet) assert(foot.grounded ? foot.liftMm === 0 : foot.liftMm >= 0);
    }
  });
  it("has continuous foot paths at stance/swing and cycle boundaries", () => {
    const c = config();
    const before = gaitFrame(c, c.dutyFactor - 1e-8).feet[0]!;
    const after = gaitFrame(c, c.dutyFactor + 1e-8).feet[0]!;
    close(before.forwardMm, after.forwardMm, 1e-4);
    close(before.liftMm, after.liftMm, 1e-4);
    const end = gaitFrame(c, 1 - 1e-8).feet[0]!;
    const start = gaitFrame(c, 1e-8).feet[0]!;
    close(end.forwardMm, start.forwardMm, 1e-4);
    close(end.liftMm, start.liftMm, 1e-4);
  });
  it("supports four and eight leg timing with no fabricated contacts", () => {
    for (const count of [4, 8] as const) {
      const frame = gaitFrame({ ...config(), legCount: count, gait: "wave", dutyFactor: 0.9 });
      assert.equal(frame.feet.length, count);
      assert(frame.groundedCount >= count - 1);
    }
  });
  it("detects a shifted center of mass outside the support area", () => {
    const frame = gaitFrame({ ...config(), comXmm: 1000 }, 0);
    assert.equal(frame.stable, false);
    assert(frame.marginMm! < 0);
  });
});

describe("static actuator sizing", () => {
  it("uses the expected moment arms in a straight horizontal pose", () => {
    const c = {
      ...config(),
      joints: 2 as const,
      upperMm: 100,
      lowerMm: 100,
      targetXmm: 200,
      targetYmm: 0,
      targetZmm: 0,
      bodyMassG: 1000,
      payloadG: 0,
      linkMassG: 0,
      serviceFactor: 2,
      kneeMaxDeg: 180,
    };
    const loads = staticLoads(c, 2)!;
    assert(loads);
    close(loads.forcePerLegN, 4.903325);
    close(loads.hipTorqueNm, 0.980665);
    close(loads.kneeTorqueNm, 0.4903325);
    close(loads.requiredHipNm, 1.96133);
    assert.equal(loads.ratingExceedsEstimate, false);
  });
  it("scales body load with the number of supporting feet", () => {
    const c = { ...config(), linkMassG: 0 };
    close(staticLoads(c, 3)!.hipTorqueNm, staticLoads(c, 6)!.hipTorqueNm * 2);
  });
  it("withholds an estimate for invalid poses or no supporting legs", () => {
    assert.equal(staticLoads(config(), 0), null);
    assert.equal(staticLoads({ ...config(), targetXmm: 1000 }, 3), null);
    assert.equal(staticLoads({ ...config(), serviceFactor: 0.5 }, 3), null);
  });
  it("exports a sampled, explicitly dimensional gait table", () => {
    const csv = gaitCsv(config());
    assert.match(csv, /foot_x_mm,foot_y_mm,foot_z_mm/);
    assert.equal(csv.split("\n").length, 121);
    assert(!csv.includes("NaN"));
  });
});
