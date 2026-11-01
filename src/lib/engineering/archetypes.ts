import type { EngineeringProject, RobotArchetype } from "./types";
export const archetypeLabels: Record<RobotArchetype, string> = {
  multirotor: "Multirotor",
  fixed_wing: "Fixed wing",
  hexapod: "Hexapod",
  quadruped: "Quadruped",
  biped: "Biped",
  humanoid: "Humanoid",
  rover: "Rover",
};
export const isWalking = (a: RobotArchetype) =>
  ["hexapod", "quadruped", "biped", "humanoid"].includes(a);
export const isAerial = (a: RobotArchetype) => a === "multirotor" || a === "fixed_wing";
export const archetypeForChassis = (chassis: string): RobotArchetype =>
  chassis === "plane"
    ? "fixed_wing"
    : chassis === "spider"
      ? "hexapod"
      : chassis === "humanoid"
        ? "humanoid"
        : "multirotor";
export const safetyNotice = (a: RobotArchetype) =>
  isWalking(a)
    ? "Ensure zero-positions and joint limits are calibrated before powering the servo bus. Support the robot and keep hands clear of joints."
    : a === "rover"
      ? "Raise the drive wheels and secure the chassis before powered drivetrain tests."
      : "Keep propellers off during bench tests.";
const ratio = (n: number, d: number) => (d > 0 && Number.isFinite(n / d) ? n / d : null);
export function analyzeProject(p: EngineeringProject) {
  const { flight: f, leg: l, sizing: s, archetype: a } = p;
  const massG = f.massItems.reduce((v, r) => v + r.massG, 0);
  const centerOfMass =
    massG > 0
      ? {
          xMm: f.massItems.reduce((v, r) => v + r.massG * r.xMm, 0) / massG,
          yMm: f.massItems.reduce((v, r) => v + r.massG * r.yMm, 0) / massG,
          zMm: f.massItems.reduce((v, r) => v + r.massG * r.zMm, 0) / massG,
        }
      : null;
  const costUsd = f.massItems.reduce((v, r) => v + r.costUsd, 0);
  const actuatorCount = l.legCount * l.joints + s.additionalActuators;
  const packV = f.cellCount * 3.7;
  const supportLegs = Math.max(1, Math.floor(l.legCount * l.dutyFactor));
  const jointTorqueNcm =
    (((((massG / 1000) * 9.80665) / supportLegs) * (l.upperMm + l.lowerMm)) / 1000) *
    l.serviceFactor *
    100;
  const busContinuousA = actuatorCount * s.servoContinuousA + f.electronicsCurrentA;
  const busPeakA = actuatorCount * s.servoStallA + f.electronicsCurrentA;
  const strideSpeedMs = ratio(l.strideMm / 1000, l.cycleSeconds);
  const slope = (s.slopeDeg * Math.PI) / 180;
  const forceN =
    (massG / 1000) * 9.80665 * (Math.sin(slope) + s.rollingResistance * Math.cos(slope));
  const driveSpeedMs = ((s.motorRpm / s.gearRatio) * 2 * Math.PI * s.wheelRadiusMm) / 1000 / 60;
  const wheelTorqueNcm =
    ((forceN * s.wheelRadiusMm) / 1000 / s.driveMotors) * l.serviceFactor * 100;
  const motorTorqueNcm = wheelTorqueNcm / s.gearRatio / s.efficiency;
  const drivePowerW = (forceN * driveSpeedMs) / s.efficiency + s.driveMotors * s.motorIdleA * packV;
  const powerW = isWalking(a)
    ? (busContinuousA * l.servoVoltageV) / s.efficiency
    : a === "rover"
      ? drivePowerW + f.electronicsCurrentA * packV
      : (a === "fixed_wing"
          ? f.cruiseCurrentA + f.electronicsCurrentA
          : f.rotorCount * f.hoverCurrentPerMotorA + f.electronicsCurrentA) * packV;
  const runtimeMin = ratio((f.batteryMah / 1000) * f.usableFraction * packV * 60, powerW);
  const rangeM = runtimeMin === null ? null : runtimeMin * 60 * driveSpeedMs;
  const thrustToWeight = ratio(f.rotorCount * f.thrustPerMotorG, massG);
  const rotorAreaM2 = f.rotorCount * Math.PI * (s.rotorDiameterMm / 2000) ** 2;
  const diskLoadingNm2 = ratio((massG / 1000) * 9.80665, rotorAreaM2);
  const idealHoverPowerW = ratio(
    ((massG / 1000) * 9.80665) ** 1.5,
    Math.sqrt(2 * f.airDensity * rotorAreaM2),
  );
  const stallSpeedMs =
    massG <= 0
      ? null
      : ratio(((2 * massG) / 1000) * 9.80665, ((f.airDensity * f.wingAreaDm2) / 100) * f.clMax);
  const notices = [
    safetyNotice(a),
    "Planning estimates: verify currents, torque, traction and runtime with measured data.",
  ];
  if (isWalking(a) && busPeakA > s.busLimitA)
    notices.push("Servo peak current exceeds the entered bus current limit.");
  if (isWalking(a) && jointTorqueNcm > l.servoTorqueNm * 100)
    notices.push("Required joint torque exceeds the selected servo rating.");
  if (a === "multirotor" && (thrustToWeight === null || thrustToWeight < 2))
    notices.push("Multirotor thrust-to-weight is below the 2:1 planning target.");
  if (
    a === "rover" &&
    forceN > ((s.tractionCoefficient * massG) / 1000) * 9.80665 * Math.cos(slope)
  )
    notices.push("Required incline force exceeds estimated tire traction; wheel slip is likely.");
  if (!isWalking(a) && (ratio(powerW, packV) ?? 0) > s.busLimitA)
    notices.push("Estimated battery current exceeds the entered power current limit.");
  if (costUsd > p.mission.budgetUsd) notices.push("Component cost exceeds the mission budget.");
  if (massG > p.mission.maxMassG) notices.push("Total mass exceeds the mission limit.");
  if (massG <= 0) notices.push("Enter measured component masses before using load estimates.");
  if (isWalking(a) && s.servoContinuousA > s.servoStallA)
    notices.push(
      "Continuous servo current exceeds stall current; check the entered datasheet values.",
    );
  const runtimeLabel = isWalking(a)
    ? "Continuous walk runtime / target"
    : a === "fixed_wing"
      ? "Cruise runtime / target"
      : "Hover runtime / target";
  const metrics: [string, number | null, number, string][] = [
    a === "rover"
      ? ["Expected range / target", rangeM, s.targetRangeM, "m"]
      : [runtimeLabel, runtimeMin, p.mission.targetRuntimeMin, "min"],
    ["Total mass / limit", massG, p.mission.maxMassG, "g"],
    ["Cost / budget", costUsd, p.mission.budgetUsd, "USD"],
  ];
  return {
    centerOfMass,
    diskLoadingNm2,
    idealHoverPowerW,
    massG,
    costUsd,
    actuatorCount,
    supportLegs,
    jointTorqueNcm,
    busContinuousA,
    busPeakA,
    strideSpeedMs,
    wheelTorqueNcm,
    motorTorqueNcm,
    driveSpeedMs,
    drivePowerW,
    powerW,
    runtimeMin,
    rangeM,
    thrustToWeight,
    stallSpeedMs: stallSpeedMs === null ? null : Math.sqrt(stallSpeedMs),
    notices,
    metrics,
  };
}
/** One canonical budget (legacy flight.massItems path retained for saved-file compatibility). */
export function bindEngineering(
  current: EngineeringProject,
  patch: Partial<EngineeringProject>,
): EngineeringProject {
  const next = { ...current, ...patch };
  const a = next.archetype;
  if (patch.archetype && patch.archetype !== current.archetype && isWalking(a)) {
    next.leg = {
      ...next.leg,
      legCount: a === "hexapod" ? 6 : a === "quadruped" ? 4 : 2,
      gait: a === "hexapod" ? "tripod" : "wave",
    };
  }
  const count = isWalking(a)
    ? next.leg.legCount * next.leg.joints + next.sizing.additionalActuators
    : a === "rover"
      ? next.sizing.driveMotors
      : a === "fixed_wing"
        ? 1
        : next.flight.rotorCount;
  if (next.sizing.autoBom) {
    const oldRow = next.flight.massItems.find((r) => r.id === "propulsion");
    if (patch.flight?.massItems && patch.flight.massItems !== current.flight.massItems && oldRow) {
      next.sizing = {
        ...next.sizing,
        ...(isWalking(a)
          ? { actuatorMassG: oldRow.massG / count, actuatorCostUsd: oldRow.costUsd / count }
          : { motorMassG: oldRow.massG / count, motorCostUsd: oldRow.costUsd / count }),
      };
    } else if (
      patch.sizing ||
      patch.archetype ||
      patch.leg ||
      (patch.flight && patch.flight.rotorCount !== current.flight.rotorCount)
    ) {
      const row = {
        id: "propulsion",
        name: isWalking(a) ? `${count} joint actuators` : `${count} drive motors`,
        massG: count * (isWalking(a) ? next.sizing.actuatorMassG : next.sizing.motorMassG),
        costUsd: count * (isWalking(a) ? next.sizing.actuatorCostUsd : next.sizing.motorCostUsd),
        xMm: oldRow?.xMm ?? 0,
        yMm: oldRow?.yMm ?? 0,
        zMm: oldRow?.zMm ?? 0,
        source: "Calculator-linked BOM: count × entered unit mass/cost",
      };
      next.flight = {
        ...next.flight,
        massItems: [...next.flight.massItems.filter((r) => r.id !== "propulsion"), row],
      };
    }
  }
  return next;
}
