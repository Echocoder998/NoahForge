import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  defaultClip,
  defaultHorn,
  defaultMotor,
  defaultPlate,
  defaultRib,
  type ClipParams,
  type HornParams,
  type MotorParams,
  type PartKind,
  type PlateParams,
  type RibParams,
} from "./aero/parts";
import type { SketchId } from "./code/sketches";
import { chassisById, type ChassisId } from "./robots/chassis";
import type { CustomDesign } from "./robots/design";
import type { DeviceId, McuId } from "./wire/catalog";
import { buildPlan, type Plan } from "./wire/plan";

export type Bench = "design" | "frame" | "print" | "wire" | "code";
export type Filament = "natural" | "black" | "orange" | "white";
type Counts = Partial<Record<DeviceId, number>>;

export type ChatTurn = { role: "user" | "assistant"; text: string; designId?: string; error?: boolean };

const MAX_CHAT = 40;

type Lab = {
  projectName: string;
  bench: Bench;
  chassis: ChassisId;
  scale: number;
  legs: 6 | 8;
  part: PartKind;
  filament: Filament;
  rib: RibParams;
  motor: MotorParams;
  horn: HornParams;
  plate: PlateParams;
  clip: ClipParams;
  spanMm: number;
  massG: number;
  speedMs: number;
  mcu: McuId;
  picked: Counts;
  sketch: SketchId;
  notes: string;
  customs: CustomDesign[];
  customId: string | null;
  chat: ChatTurn[];
  setProjectName: (name: string) => void;
  setBench: (bench: Bench) => void;
  setChassis: (id: ChassisId) => void;
  setScale: (scale: number) => void;
  setLegs: (legs: 6 | 8) => void;
  setPart: (part: PartKind) => void;
  setFilament: (filament: Filament) => void;
  patchRib: (patch: Partial<RibParams>) => void;
  patchMotor: (patch: Partial<MotorParams>) => void;
  patchHorn: (patch: Partial<HornParams>) => void;
  patchPlate: (patch: Partial<PlateParams>) => void;
  patchClip: (patch: Partial<ClipParams>) => void;
  setSpan: (spanMm: number) => void;
  setMass: (massG: number) => void;
  setSpeed: (speedMs: number) => void;
  setMcu: (mcu: McuId) => void;
  setDevice: (id: DeviceId, count: number) => void;
  setSketch: (sketch: SketchId) => void;
  setNotes: (notes: string) => void;
  saveDesign: (design: CustomDesign) => void;
  activateDesign: (id: string) => void;
  deleteDesign: (id: string) => void;
  pushChat: (turn: ChatTurn) => void;
  clearChat: () => void;
};

function designState(d: CustomDesign) {
  return {
    customId: d.id,
    projectName: d.projectName,
    part: d.printPart,
    mcu: d.mcu,
    picked: { ...d.picked },
    sketch: d.sketch,
  };
}

const starter = chassisById("plane");

export const useLab = create<Lab>()(
  persist(
    (set) => ({
      projectName: starter.projectName,
      bench: "frame",
      chassis: starter.id,
      scale: 1,
      legs: starter.legs,
      part: starter.part,
      filament: "natural",
      rib: defaultRib,
      motor: defaultMotor,
      horn: defaultHorn,
      plate: defaultPlate,
      clip: defaultClip,
      spanMm: 900,
      massG: 650,
      speedMs: 12,
      mcu: starter.mcu,
      picked: starter.picked,
      sketch: starter.sketch,
      notes: "",
      customs: [],
      customId: null,
      chat: [],
      setProjectName: (projectName) => set({ projectName }),
      setBench: (bench) => set({ bench }),
      setChassis: (id) => {
        const next = chassisById(id);
        set({
          customId: null,
          chassis: next.id,
          projectName: next.projectName,
          part: next.part,
          mcu: next.mcu,
          picked: { ...next.picked },
          sketch: next.sketch,
          legs: next.legs,
        });
      },
      setScale: (scale) => set({ scale }),
      setLegs: (legs) =>
        set((s) => ({
          legs,
          picked: s.chassis === "spider" ? { ...s.picked, sg90: legs } : s.picked,
          projectName: s.chassis === "spider" ? (legs === 8 ? "Oct walker" : "Hex walker") : s.projectName,
        })),
      setPart: (part) => set({ part }),
      setFilament: (filament) => set({ filament }),
      patchRib: (patch) => set((s) => ({ rib: { ...s.rib, ...patch } })),
      patchMotor: (patch) => set((s) => ({ motor: { ...s.motor, ...patch } })),
      patchHorn: (patch) => set((s) => ({ horn: { ...s.horn, ...patch } })),
      patchPlate: (patch) => set((s) => ({ plate: { ...s.plate, ...patch } })),
      patchClip: (patch) => set((s) => ({ clip: { ...s.clip, ...patch } })),
      setSpan: (spanMm) => set({ spanMm }),
      setMass: (massG) => set({ massG }),
      setSpeed: (speedMs) => set({ speedMs }),
      setMcu: (mcu) => set({ mcu }),
      setDevice: (id, count) =>
        set((s) => {
          const picked: Counts = { ...s.picked, [id]: count };
          if (count > 0 && id === "pack2s") picked.pack3s = 0;
          if (count > 0 && id === "pack3s") picked.pack2s = 0;
          if (count > 0 && id === "bec5") picked.bec6 = 0;
          if (count > 0 && id === "bec6") picked.bec5 = 0;
          return { picked };
        }),
      setSketch: (sketch) => set({ sketch }),
      setNotes: (notes) => set({ notes }),
      saveDesign: (design) =>
        set((s) => ({
          customs: [...s.customs.filter((d) => d.id !== design.id), design],
          ...designState(design),
        })),
      activateDesign: (id) =>
        set((s) => {
          const d = s.customs.find((x) => x.id === id);
          return d ? designState(d) : {};
        }),
      deleteDesign: (id) =>
        set((s) => {
          const customs = s.customs.filter((d) => d.id !== id);
          if (s.customId !== id) return { customs };
          const next = chassisById(s.chassis);
          return {
            customs,
            customId: null,
            projectName: next.projectName,
            part: next.part,
            mcu: next.mcu,
            picked: { ...next.picked },
            sketch: next.sketch,
          };
        }),
      pushChat: (turn) => set((s) => ({ chat: [...s.chat, turn].slice(-MAX_CHAT) })),
      clearChat: () => set({ chat: [] }),
    }),
    {
      name: "airframe-lab",
      skipHydration: true,
      partialize: (s) => ({
        projectName: s.projectName,
        bench: s.bench,
        chassis: s.chassis,
        scale: s.scale,
        legs: s.legs,
        part: s.part,
        filament: s.filament,
        rib: s.rib,
        motor: s.motor,
        horn: s.horn,
        plate: s.plate,
        clip: s.clip,
        spanMm: s.spanMm,
        massG: s.massG,
        speedMs: s.speedMs,
        mcu: s.mcu,
        picked: s.picked,
        sketch: s.sketch,
        notes: s.notes,
        customs: s.customs,
        customId: s.customId,
        chat: s.chat,
      }),
    },
  ),
);

/** The custom design on the bench, or null when a built-in chassis is active. */
export function useActiveDesign(): CustomDesign | null {
  return useLab((s) => (s.customId ? (s.customs.find((d) => d.id === s.customId) ?? null) : null));
}

/** The wiring plan for whatever is on the bench, with a custom design's own labels. */
export function useBenchPlan(): Plan {
  const mcu = useLab((s) => s.mcu);
  const picked = useLab((s) => s.picked);
  const chassis = useLab((s) => s.chassis);
  const design = useActiveDesign();
  return buildPlan(mcu, picked, chassis, design ? { servos: design.servoNames, motors: design.motorNames } : undefined);
}
