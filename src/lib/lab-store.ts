import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
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
import { newEngineeringProject, type EngineeringProject } from "./engineering/types";
import { analyzeProject, archetypeForChassis, bindEngineering } from "./engineering/archetypes";
import { migrateEngineering } from "./engineering/schema";
import { projectStorage } from "./engineering/project-storage";
import { applyPinOverrides } from "./wire/pin-overrides";

export type Bench =
  | "design"
  | "frame"
  | "print"
  | "wire"
  | "board"
  | "code"
  | "mission"
  | "leg"
  | "flight"
  | "mechanical"
  | "notebook"
  | "calculators"
  | "propulsion"
  | "aerodynamics";
export type BoardView = "schematic" | "board";
export type Filament = "natural" | "black" | "orange" | "white";
type Counts = Partial<Record<DeviceId, number>>;

export type ProjectState = Pick<
  Lab,
  | "projectName"
  | "chassis"
  | "scale"
  | "legs"
  | "part"
  | "filament"
  | "rib"
  | "motor"
  | "horn"
  | "plate"
  | "clip"
  | "spanMm"
  | "massG"
  | "speedMs"
  | "mcu"
  | "picked"
  | "sketch"
  | "notes"
  | "customId"
  | "engineering"
  | "projectId"
  | "pinOverrides"
>;
export type ProjectSnapshot = {
  id: string;
  savedAt: number;
  state: ProjectState;
  design: CustomDesign | null;
};

export type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  designId?: string;
  error?: boolean;
};

const MAX_CHAT = 40;

type Lab = {
  projectId: string;
  /** Transient identity for drafts/playback; advances even when restoring the same project. */
  projectRevision: number;
  engineering: EngineeringProject;
  projects: ProjectSnapshot[];
  pinOverrides: Record<string, string>;
  setPinOverride: (pin: string, target: string) => void;
  clearPinOverrides: () => void;
  projectName: string;
  bench: Bench;
  boardView: BoardView;
  snapshots: ProjectSnapshot[];
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
  setBoardView: (view: BoardView) => void;
  saveSnapshot: () => void;
  restoreSnapshot: (id: string) => void;
  patchEngineering: (patch: Partial<EngineeringProject>) => void;
  saveProject: () => void;
  openProject: (id: string) => void;
  importProject: (project: ProjectSnapshot) => void;
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

function designState(d: CustomDesign, s: Lab) {
  const archetype =
    d.archetype ??
    (d.motion === "plane"
      ? "fixed_wing"
      : d.motion === "hover"
        ? "multirotor"
        : ["hexapod", "quadruped", "biped", "humanoid", "rover"].includes(s.engineering.archetype)
          ? s.engineering.archetype
          : "rover");
  return {
    engineering: bindEngineering(s.engineering, { archetype }),
    customId: d.id,
    projectName: d.projectName,
    part: d.printPart,
    mcu: d.mcu,
    picked: { ...d.picked },
    sketch: d.sketch,
  };
}

function snapshotOf(s: Lab): ProjectSnapshot {
  const {
    projectName,
    chassis,
    scale,
    legs,
    part,
    filament,
    rib,
    motor,
    horn,
    plate,
    clip,
    spanMm,
    massG,
    speedMs,
    mcu,
    picked,
    sketch,
    notes,
    customId,
    engineering,
    projectId,
    pinOverrides,
  } = s;
  return {
    id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    savedAt: Date.now(),
    state: {
      projectName,
      chassis,
      scale,
      legs,
      part,
      filament,
      rib,
      motor,
      horn,
      plate,
      clip,
      spanMm,
      massG,
      speedMs,
      mcu,
      picked: { ...picked },
      sketch,
      notes,
      customId,
      engineering,
      projectId,
      pinOverrides,
    },
    design: s.customs.find((d) => d.id === customId) ?? null,
  };
}

function backup(s: Lab): ProjectSnapshot[] {
  const next = snapshotOf(s);
  const same = (p: ProjectSnapshot) =>
    JSON.stringify(p.state) === JSON.stringify(next.state) &&
    JSON.stringify(p.design) === JSON.stringify(next.design);
  const existing = s.snapshots.find(same);
  return [existing ?? next, ...s.snapshots.filter((p) => !same(p))].slice(0, 12);
}

/** Keep manual edits when a saved AI design is reopened. */
function editDesign(s: Lab, patch: Partial<CustomDesign>) {
  return s.customs.map((d) =>
    d.id === s.customId ? { ...d, ...patch, updatedAt: Date.now() } : d,
  );
}

const starter = chassisById("plane");
const projectId = () =>
  `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function restoredState(saved: ProjectSnapshot) {
  return {
    ...saved.state,
    engineering: migrateEngineering(
      saved.state.engineering,
      archetypeForChassis(saved.state.chassis),
    ),
    projectId: saved.state.projectId || projectId(),
    pinOverrides: saved.state.pinOverrides ?? {},
  };
}

/** A complete portable copy, including the active AI model and engineering work. */
export function captureProject(): ProjectSnapshot {
  return snapshotOf(useLab.getState());
}

export const useLab = create<Lab>()(
  persist(
    (set) => ({
      projectId: projectId(),
      projectRevision: 0,
      engineering: newEngineeringProject(),
      projects: [],
      pinOverrides: {},
      setPinOverride: (pin, target) =>
        set((s) => {
          const pinOverrides = { ...s.pinOverrides };
          if (target && target !== pin) pinOverrides[pin] = target;
          else delete pinOverrides[pin];
          return { pinOverrides };
        }),
      clearPinOverrides: () => set({ pinOverrides: {} }),
      projectName: starter.projectName,
      bench: "design",
      boardView: "schematic",
      snapshots: [],
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
      setProjectName: (projectName) =>
        set((s) => ({ projectName, customs: editDesign(s, { projectName }) })),
      setBench: (bench) => set({ bench }),
      setBoardView: (boardView) => set({ boardView }),
      saveSnapshot: () => set((s) => ({ snapshots: backup(s) })),
      patchEngineering: (patch) =>
        set((s) => {
          const engineering = bindEngineering(s.engineering, patch);
          return { engineering, massG: analyzeProject(engineering).massG };
        }),
      saveProject: () =>
        set((s) => {
          const current = snapshotOf(s);
          return {
            projects: [
              current,
              ...s.projects.filter((p) => p.state.projectId !== s.projectId),
            ].slice(0, 30),
          };
        }),
      openProject: (id) =>
        set((s) => {
          const saved = s.projects.find((p) => p.state.projectId === id);
          if (!saved) return {};
          return {
            ...restoredState(saved),
            projectRevision: s.projectRevision + 1,
            snapshots: backup(s),
            customs: saved.design
              ? [...s.customs.filter((d) => d.id !== saved.design!.id), saved.design]
              : s.customs,
            chat: [],
          };
        }),
      importProject: (saved) =>
        set((s) => {
          const imported = { ...saved, state: { ...restoredState(saved), projectId: projectId() } };
          return {
            ...imported.state,
            projectRevision: s.projectRevision + 1,
            snapshots: backup(s),
            projects: [imported, ...s.projects].slice(0, 30),
            customs: imported.design
              ? [...s.customs.filter((d) => d.id !== imported.design!.id), imported.design]
              : s.customs,
            chat: [],
          };
        }),
      restoreSnapshot: (id) =>
        set((s) => {
          const saved = s.snapshots.find((p) => p.id === id);
          if (!saved) return {};
          return {
            ...restoredState(saved),
            projectRevision: s.projectRevision + 1,
            snapshots: backup(s),
            customs: saved.design
              ? [...s.customs.filter((d) => d.id !== saved.design!.id), saved.design]
              : s.customs,
            chat: [],
          };
        }),
      setChassis: (id) => {
        const next = chassisById(id);
        set((s) => ({
          snapshots: backup(s),
          projectId: projectId(),
          projectRevision: s.projectRevision + 1,
          engineering: newEngineeringProject(archetypeForChassis(id)),
          pinOverrides: {},
          notes: "",
          chat: [],
          customId: null,
          chassis: next.id,
          projectName: next.projectName,
          part: next.part,
          mcu: next.mcu,
          picked: { ...next.picked },
          sketch: next.sketch,
          legs: next.legs,
        }));
      },
      setScale: (scale) => set({ scale }),
      setLegs: (legs) =>
        set((s) => ({
          legs,
          pinOverrides: s.chassis === "spider" ? {} : s.pinOverrides,
          picked: s.chassis === "spider" ? { ...s.picked, sg90: legs } : s.picked,
          projectName:
            s.chassis === "spider" ? (legs === 8 ? "Oct walker" : "Hex walker") : s.projectName,
        })),
      setPart: (part) => set((s) => ({ part, customs: editDesign(s, { printPart: part }) })),
      setFilament: (filament) => set({ filament }),
      patchRib: (patch) => set((s) => ({ rib: { ...s.rib, ...patch } })),
      patchMotor: (patch) => set((s) => ({ motor: { ...s.motor, ...patch } })),
      patchHorn: (patch) => set((s) => ({ horn: { ...s.horn, ...patch } })),
      patchPlate: (patch) => set((s) => ({ plate: { ...s.plate, ...patch } })),
      patchClip: (patch) => set((s) => ({ clip: { ...s.clip, ...patch } })),
      setSpan: (spanMm) => set({ spanMm }),
      setMass: (massG) => set({ massG }),
      setSpeed: (speedMs) => set({ speedMs }),
      setMcu: (mcu) => set((s) => ({ mcu, pinOverrides: {}, customs: editDesign(s, { mcu }) })),
      setDevice: (id, count) =>
        set((s) => {
          const picked: Counts = { ...s.picked, [id]: count };
          if (count > 0 && id === "pack2s") picked.pack3s = 0;
          if (count > 0 && id === "pack3s") picked.pack2s = 0;
          if (count > 0 && id === "bec5") picked.bec6 = 0;
          if (count > 0 && id === "bec6") picked.bec5 = 0;
          return { picked, pinOverrides: {}, customs: editDesign(s, { picked }) };
        }),
      setSketch: (sketch) => set((s) => ({ sketch, customs: editDesign(s, { sketch }) })),
      setNotes: (notes) => set({ notes }),
      saveDesign: (design) =>
        set((s) => ({
          pinOverrides: {},
          snapshots: backup(s),
          customs: [...s.customs.filter((d) => d.id !== design.id), design],
          ...designState(design, s),
        })),
      activateDesign: (id) =>
        set((s) => {
          const d = s.customs.find((x) => x.id === id);
          return d
            ? {
                ...designState(d, s),
                pinOverrides: {},
                snapshots: s.customId === id ? s.snapshots : backup(s),
              }
            : {};
        }),
      deleteDesign: (id) =>
        set((s) => {
          const customs = s.customs.filter((d) => d.id !== id);
          if (s.customId !== id) return { customs };
          const next = chassisById(s.chassis);
          return {
            customs,
            snapshots: backup(s),
            pinOverrides: {},
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
      storage: createJSONStorage(() => projectStorage),
      skipHydration: true,
      partialize: (s) => ({
        projectId: s.projectId,
        engineering: s.engineering,
        projects: s.projects,
        pinOverrides: s.pinOverrides,
        projectName: s.projectName,
        bench: s.bench,
        boardView: s.boardView,
        snapshots: s.snapshots,
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
      merge: (persisted, current) => {
        const saved = persisted && typeof persisted === "object" ? (persisted as Partial<Lab>) : {};
        return {
          ...current,
          ...saved,
          projectRevision: current.projectRevision + 1,
          engineering: migrateEngineering(
            saved.engineering,
            archetypeForChassis(saved.chassis ?? current.chassis),
          ),
          projects: Array.isArray(saved.projects) ? saved.projects : [],
        };
      },
    },
  ),
);

/** The custom design on the bench, or null when a built-in chassis is active. */
export function useActiveDesign(): CustomDesign | null {
  return useLab((s) => (s.customId ? (s.customs.find((d) => d.id === s.customId) ?? null) : null));
}

/** The wiring plan for whatever is on the bench, with a custom design's own labels. */
export function useAutomaticPlan(): Plan {
  const mcu = useLab((s) => s.mcu);
  const picked = useLab((s) => s.picked);
  const chassis = useLab((s) => s.chassis);
  const design = useActiveDesign();
  return buildPlan(
    mcu,
    picked,
    chassis,
    design ? { servos: design.servoNames, motors: design.motorNames } : undefined,
  );
}
export function useBenchPlan(): Plan {
  const plan = useAutomaticPlan();
  const overrides = useLab((s) => s.pinOverrides);
  return applyPinOverrides(plan, overrides);
}
