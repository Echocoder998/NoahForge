import { archetypeForChassis } from "./archetypes";
import { z } from "zod";
import { DesignOutput, sanitizeDesign } from "../robots/design";
import { CHASSIS } from "../robots/chassis";
import { DEVICES, MCUS } from "../wire/catalog";
import { SKETCHES } from "../code/sketches";
import { engineeringSchema, migrateEngineering } from "./schema";
import type { ProjectSnapshot } from "../lab-store";

const n = z.number().finite();
const dimension = n.min(0.1).max(2000);
const id = z.string().min(1).max(120);
const names = <T extends string>(items: T[]) => z.enum(items as [T, ...T[]]);
const picked = z.record(z.string(), n.int().min(0).max(20)).superRefine((counts, ctx) => {
  for (const [key, count] of Object.entries(counts)) {
    const part = DEVICES.find((d) => d.id === key);
    if (!part || count > part.max)
      ctx.addIssue({
        code: "custom",
        message: "Unknown component or quantity outside catalog limits",
      });
  }
});
const stateSchema = z.object({
  projectId: id.optional(),
  projectName: z.string().max(48),
  chassis: names(CHASSIS.map((p) => p.id)),
  scale: n.min(0.1).max(5),
  legs: z.union([z.literal(6), z.literal(8)]),
  part: z.enum(["rib", "motor", "horn", "plate", "clip"]),
  filament: z.enum(["natural", "black", "orange", "white"]),
  rib: z.object({
    code: z.string().regex(/^\d{4}$/),
    chord: dimension,
    thickness: dimension,
    sparX: n.min(0).max(1),
    sparD: dimension,
    wall: dimension,
    minTe: dimension,
    lights: z.boolean(),
  }),
  motor: z.object({
    od: dimension,
    thickness: dimension,
    bore: dimension,
    boltCircle: dimension,
    boltD: dimension,
    bolts: n.int().min(2).max(12),
  }),
  horn: z.object({
    hubD: dimension,
    length: dimension,
    rootW: dimension,
    tipW: dimension,
    thickness: dimension,
    hubHole: dimension,
    tipHole: dimension,
  }),
  plate: z.object({
    width: dimension,
    height: dimension,
    thickness: dimension,
    holeD: dimension,
    inset: n.min(0).max(1000),
    slot: z.boolean(),
    slotL: dimension,
    slotW: dimension,
  }),
  clip: z.object({ length: dimension, width: dimension, height: dimension, wall: dimension }),
  spanMm: dimension,
  massG: n.min(0).max(1e6),
  speedMs: n.min(0).max(300),
  mcu: names(MCUS.map((m) => m.id)),
  picked,
  sketch: names(SKETCHES.map((s) => s.id)),
  notes: z.string().max(50000),
  customId: id.nullable(),
  engineering: engineeringSchema.optional(),
  pinOverrides: z.record(z.string().max(8), z.string().max(8)).optional(),
});
const customSchema = DesignOutput.omit({ devices: true }).extend({
  id,
  picked,
  updatedAt: n.nonnegative(),
});
const fileSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  id,
  savedAt: n.nonnegative(),
  state: stateSchema,
  design: customSchema.nullable(),
});

export function projectFile(project: ProjectSnapshot): string {
  return JSON.stringify({ version: 2, ...project }, null, 2);
}

/** Strictly validate imports before any live project is replaced. */
export function parseProjectFile(text: string): ProjectSnapshot {
  if (text.length > 4_000_000)
    throw new Error(
      "Project files must be smaller than 4 MB. Reduce attached photos before exporting.",
    );
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Choose a Noah Forge JSON project file.");
  }
  const result = fileSchema.safeParse(json);
  if (!result.success)
    throw new Error(
      "This project file contains missing or invalid fields. Your current project was kept.",
    );
  const file = result.data;
  if ((file.state.customId ?? null) !== (file.design?.id ?? null))
    throw new Error("The project’s active design is missing or does not match.");
  const design = file.design
    ? sanitizeDesign(
        {
          ...file.design,
          devices: Object.entries(file.design.picked).map(([id, count]) => ({
            id: id as (typeof DEVICES)[number]["id"],
            count,
          })),
        },
        file.design.id,
      )
    : null;
  return {
    id: file.id,
    savedAt: file.savedAt,
    state: {
      ...file.state,
      projectId: file.state.projectId || file.id,
      engineering: migrateEngineering({
        ...file.state.engineering,
        archetype:
          (json as { state?: { engineering?: { archetype?: unknown } } }).state?.engineering
            ?.archetype ?? archetypeForChassis(file.state.chassis),
      }),
      pinOverrides: file.state.pinOverrides ?? {},
    },
    design,
  };
}
