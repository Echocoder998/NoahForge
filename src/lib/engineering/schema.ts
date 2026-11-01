import { z } from "zod";
import { newEngineeringProject, type EngineeringProject } from "./types";

const text = z.string().max(12000);
const number = z.number().finite();
const positive = number.min(0).max(1e9);
const nonnegative = number.min(0).max(1e9);
const id = z.string().min(1).max(120);
export const engineeringSchema = z.object({
  mission: z.object({
    summary: text,
    terrain: text,
    budgetUsd: nonnegative,
    maxMassG: positive,
    payloadG: nonnegative,
    targetRuntimeMin: positive,
    requirements: z
      .array(
        z.object({
          id,
          text,
          metric: z.string().max(120),
          target: number,
          unit: z.string().max(40),
          direction: z.enum(["min", "max"]),
          actual: number.nullable(),
          method: z.enum(["test", "analysis", "inspection", "demonstration"]),
          evidence: text,
        }),
      )
      .max(100),
  }),
  leg: z.object({
    coxaMm: nonnegative,
    upperMm: positive,
    lowerMm: positive,
    targetXmm: number,
    targetYmm: number,
    targetZmm: number,
    hipMinDeg: number,
    hipMaxDeg: number,
    kneeMinDeg: number,
    kneeMaxDeg: number,
    yawMinDeg: number,
    yawMaxDeg: number,
    joints: z.union([z.literal(2), z.literal(3)]),
    legCount: z.union([z.literal(4), z.literal(6), z.literal(8)]),
    bodyLengthMm: positive,
    bodyWidthMm: positive,
    strideMm: nonnegative,
    stepHeightMm: nonnegative,
    cycleSeconds: positive,
    dutyFactor: number.min(0.1).max(0.95),
    gait: z.enum(["tripod", "wave", "ripple"]),
    phase: number.min(0).max(1),
    comXmm: number,
    comYmm: number,
    bodyMassG: nonnegative,
    payloadG: nonnegative,
    linkMassG: nonnegative,
    servoTorqueNm: positive,
    servoVoltageV: positive,
    servoSource: text,
    serviceFactor: number.min(1).max(20),
  }),
  flight: z.object({
    massItems: z
      .array(
        z.object({
          id,
          name: z.string().max(160),
          massG: nonnegative,
          xMm: number,
          yMm: number,
          zMm: number,
          costUsd: nonnegative,
          source: text,
        }),
      )
      .max(64),
    rotorCount: number.int().min(1).max(16),
    thrustPerMotorG: nonnegative,
    hoverCurrentPerMotorA: nonnegative,
    electronicsCurrentA: nonnegative,
    cruiseCurrentA: nonnegative,
    batteryMah: positive,
    usableFraction: number.min(0.05).max(1),
    cellCount: number.int().min(1).max(12),
    testVoltageV: positive,
    thrustSource: text,
    wingAreaDm2: positive,
    clMax: positive,
    airDensity: positive,
  }),
  assembly: z.object({
    plateWidthMm: positive,
    plateLengthMm: positive,
    plateThicknessMm: positive,
    holeDiameterMm: positive,
    holePitchXmm: nonnegative,
    holePitchYmm: nonnegative,
    mountHeightMm: nonnegative,
    clearanceMm: nonnegative,
    fastenerSize: z.enum(["M2", "M3", "M4"]),
    material: z.enum(["PLA", "PETG", "ABS", "Aluminum"]),
    densityGcm3: positive,
    orientation: z.enum(["flat", "edge", "upright"]),
  }),
  notebook: z
    .array(
      z.object({
        id,
        date: z.string().max(60),
        title: z.string().max(240),
        kind: z.enum(["decision", "experiment", "failure", "revision"]),
        procedure: text,
        predicted: number.nullable(),
        measured: number.nullable(),
        unit: z.string().max(40),
        notes: text,
        photos: z
          .array(
            z.object({
              name: z.string().max(240),
              dataUrl: z
                .string()
                .max(700000)
                .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
            }),
          )
          .max(3),
      }),
    )
    .max(100),
});

/** Legacy projects receive new sections without losing existing values. */
export function migrateEngineering(value: unknown): EngineeringProject {
  const defaults = newEngineeringProject();
  if (!value || typeof value !== "object") return defaults;
  const old = value as Partial<EngineeringProject>;
  const merged = {
    mission: { ...defaults.mission, ...old.mission },
    leg: { ...defaults.leg, ...old.leg },
    flight: { ...defaults.flight, ...old.flight },
    assembly: { ...defaults.assembly, ...old.assembly },
    notebook: old.notebook ?? [],
  };
  const parsed = engineeringSchema.safeParse(merged);
  if (parsed.success) return parsed.data;
  // Recover individual fields; one malformed legacy value must not erase a notebook.
  const recovered = defaults;
  for (const section of ["mission", "leg", "flight", "assembly"] as const) {
    const fields = engineeringSchema.shape[section].shape as Record<string, z.ZodType>;
    const source = merged[section] as unknown as Record<string, unknown>;
    const target = recovered[section] as unknown as Record<string, unknown>;
    for (const [key, validator] of Object.entries(fields)) {
      const value = validator.safeParse(source[key]);
      if (value.success) target[key] = value.data;
    }
  }
  recovered.notebook = Array.isArray(merged.notebook)
    ? merged.notebook
        .map((entry) => engineeringSchema.shape.notebook.element.safeParse(entry))
        .filter((result) => result.success)
        .map((result) => result.data!)
        .slice(0, 100)
    : [];
  return recovered;
}
