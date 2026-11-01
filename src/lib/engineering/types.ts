export const ROBOT_ARCHETYPES = [
  "multirotor",
  "fixed_wing",
  "hexapod",
  "quadruped",
  "biped",
  "humanoid",
  "rover",
] as const;
export type RobotArchetype = (typeof ROBOT_ARCHETYPES)[number];
export type SizingConfig = {
  rotorDiameterMm: number;
  servoContinuousA: number;
  servoStallA: number;
  actuatorMassG: number;
  actuatorCostUsd: number;
  motorMassG: number;
  motorCostUsd: number;
  additionalActuators: number;
  busLimitA: number;
  efficiency: number;
  driveMotors: number;
  wheelRadiusMm: number;
  gearRatio: number;
  motorRpm: number;
  slopeDeg: number;
  rollingResistance: number;
  tractionCoefficient: number;
  motorIdleA: number;
  targetRangeM: number;
  autoBom: boolean;
};
export type Requirement = {
  id: string;
  text: string;
  metric: string;
  target: number;
  unit: string;
  direction: "min" | "max";
  actual: number | null;
  method: "test" | "analysis" | "inspection" | "demonstration";
  evidence: string;
};
export type Mission = {
  summary: string;
  terrain: string;
  budgetUsd: number;
  maxMassG: number;
  payloadG: number;
  targetRuntimeMin: number;
  requirements: Requirement[];
};
export type MassItem = {
  id: string;
  name: string;
  massG: number;
  xMm: number;
  yMm: number;
  zMm: number;
  costUsd: number;
  source: string;
};
export type LegConfig = {
  coxaMm: number;
  upperMm: number;
  lowerMm: number;
  targetXmm: number;
  targetYmm: number;
  targetZmm: number;
  hipMinDeg: number;
  hipMaxDeg: number;
  kneeMinDeg: number;
  kneeMaxDeg: number;
  yawMinDeg: number;
  yawMaxDeg: number;
  joints: 2 | 3;
  legCount: 2 | 4 | 6 | 8;
  bodyLengthMm: number;
  bodyWidthMm: number;
  strideMm: number;
  stepHeightMm: number;
  cycleSeconds: number;
  dutyFactor: number;
  gait: "tripod" | "wave" | "ripple";
  phase: number;
  comXmm: number;
  comYmm: number;
  bodyMassG: number;
  payloadG: number;
  linkMassG: number;
  servoTorqueNm: number;
  servoVoltageV: number;
  servoSource: string;
  serviceFactor: number;
};
export type FlightConfig = {
  massItems: MassItem[];
  rotorCount: number;
  thrustPerMotorG: number;
  hoverCurrentPerMotorA: number;
  electronicsCurrentA: number;
  cruiseCurrentA: number;
  batteryMah: number;
  usableFraction: number;
  cellCount: number;
  testVoltageV: number;
  thrustSource: string;
  wingAreaDm2: number;
  clMax: number;
  airDensity: number;
};
export type AssemblyConfig = {
  plateWidthMm: number;
  plateLengthMm: number;
  plateThicknessMm: number;
  holeDiameterMm: number;
  holePitchXmm: number;
  holePitchYmm: number;
  mountHeightMm: number;
  clearanceMm: number;
  fastenerSize: "M2" | "M3" | "M4";
  material: "PLA" | "PETG" | "ABS" | "Aluminum";
  densityGcm3: number;
  orientation: "flat" | "edge" | "upright";
};
export type NotebookEntry = {
  id: string;
  date: string;
  title: string;
  kind: "decision" | "experiment" | "failure" | "revision";
  procedure: string;
  predicted: number | null;
  measured: number | null;
  unit: string;
  notes: string;
  photos: { name: string; dataUrl: string }[];
};
export type EngineeringProject = {
  archetype: RobotArchetype;
  sizing: SizingConfig;
  mission: Mission;
  leg: LegConfig;
  flight: FlightConfig;
  assembly: AssemblyConfig;
  notebook: NotebookEntry[];
};
export function localProjectDate(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function newEngineeringProject(
  archetype: RobotArchetype = "fixed_wing",
): EngineeringProject {
  return {
    archetype,
    sizing: {
      rotorDiameterMm: 254,
      servoContinuousA: 0.25,
      servoStallA: 1.2,
      actuatorMassG: 12,
      actuatorCostUsd: 5,
      motorMassG: 45,
      motorCostUsd: 15,
      additionalActuators: 0,
      busLimitA: 20,
      efficiency: 0.85,
      driveMotors: 2,
      wheelRadiusMm: 50,
      gearRatio: 30,
      motorRpm: 3000,
      slopeDeg: 10,
      rollingResistance: 0.03,
      tractionCoefficient: 0.6,
      motorIdleA: 0.2,
      targetRangeM: 500,
      autoBom: true,
    },
    mission: {
      summary: "",
      terrain: "Level indoor test surface",
      budgetUsd: 250,
      maxMassG: 1500,
      payloadG: 100,
      targetRuntimeMin: 20,
      requirements: [],
    },
    leg: {
      coxaMm: 25,
      upperMm: 70,
      lowerMm: 100,
      targetXmm: 95,
      targetYmm: 0,
      targetZmm: -80,
      hipMinDeg: -90,
      hipMaxDeg: 90,
      kneeMinDeg: 0,
      kneeMaxDeg: 150,
      yawMinDeg: -60,
      yawMaxDeg: 60,
      joints: 3,
      legCount: archetype === "quadruped" ? 4 : ["biped", "humanoid"].includes(archetype) ? 2 : 6,
      bodyLengthMm: 160,
      bodyWidthMm: 100,
      strideMm: 40,
      stepHeightMm: 25,
      cycleSeconds: 2,
      dutyFactor: 0.65,
      gait: ["quadruped", "biped", "humanoid"].includes(archetype) ? "wave" : "tripod",
      phase: 0,
      comXmm: 0,
      comYmm: 0,
      bodyMassG: 1000,
      payloadG: 100,
      linkMassG: 40,
      servoTorqueNm: 1.2,
      servoVoltageV: 6,
      servoSource: "",
      serviceFactor: 2,
    },
    flight: {
      massItems: [
        {
          id: "frame",
          name: "Frame / structure",
          massG: 250,
          xMm: 0,
          yMm: 0,
          zMm: 0,
          costUsd: 30,
          source: "Planning estimate",
        },
        {
          id: "battery",
          name: "Battery",
          massG: 180,
          xMm: 0,
          yMm: 0,
          zMm: 20,
          costUsd: 25,
          source: "Planning estimate",
        },
        {
          id: "propulsion",
          name: "Motors and actuators",
          massG: 180,
          xMm: 0,
          yMm: 0,
          zMm: 0,
          costUsd: 60,
          source: "Planning estimate",
        },
        {
          id: "electronics",
          name: "Electronics",
          massG: 70,
          xMm: 10,
          yMm: 0,
          zMm: 10,
          costUsd: 40,
          source: "Planning estimate",
        },
        {
          id: "payload",
          name: "Payload",
          massG: 100,
          xMm: 20,
          yMm: 0,
          zMm: 35,
          costUsd: 0,
          source: "Planning estimate",
        },
      ],
      rotorCount: 4,
      thrustPerMotorG: 400,
      hoverCurrentPerMotorA: 4,
      electronicsCurrentA: 0.5,
      cruiseCurrentA: 8,
      batteryMah: 2200,
      usableFraction: 0.8,
      cellCount: 3,
      testVoltageV: 11.1,
      thrustSource: "",
      wingAreaDm2: 18,
      clMax: 1.2,
      airDensity: 1.225,
    },
    assembly: {
      plateWidthMm: 100,
      plateLengthMm: 160,
      plateThicknessMm: 3,
      holeDiameterMm: 3.4,
      holePitchXmm: 80,
      holePitchYmm: 140,
      mountHeightMm: 20,
      clearanceMm: 0.3,
      fastenerSize: "M3",
      material: "PETG",
      densityGcm3: 1.27,
      orientation: "flat",
    },
    notebook: [],
  };
}
