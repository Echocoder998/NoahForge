import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { CustomDesign } from "./robots/design";

// Give Zustand an isolated, synchronous browser-storage substitute at import
// time. The tests never read or clear a real browser's localStorage.
const entries = new Map<string, string>();
const memoryStorage: Storage = {
  get length() {
    return entries.size;
  },
  clear: () => entries.clear(),
  getItem: (key) => entries.get(key) ?? null,
  key: (index) => [...entries.keys()][index] ?? null,
  removeItem: (key) => {
    entries.delete(key);
  },
  setItem: (key, value) => {
    entries.set(key, value);
  },
};
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: memoryStorage },
});
const { useLab } = await import("./lab-store");
if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
else Reflect.deleteProperty(globalThis, "window");

type State = ReturnType<typeof useLab.getState>;

function currentProject(s: State = useLab.getState()) {
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
  } = s;
  return structuredClone({
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
  });
}

function design(id = "robot-one"): CustomDesign {
  return {
    id,
    name: "Desk rover",
    projectName: "Sensor rover",
    blurb: "A two-wheel rover with a sonar sensor.",
    motion: "ground",
    controls: "W forward, S back, A left, D right.",
    parts: [
      {
        shape: "box",
        size: { x: 1, y: 0.2, z: 1 },
        pos: { x: 0, y: 0.3, z: 0 },
        rot: { x: 0, y: 0, z: 0 },
        finish: "body",
        animate: "none",
        axis: "y",
        pivot: { x: 0, y: 0.3, z: 0 },
      },
    ],
    mcu: "uno",
    picked: { pack2s: 1, switch: 1, drv8833: 1, hcsr04: 1 },
    servoNames: [],
    motorNames: [],
    sketch: "bringup",
    printPart: "plate",
    updatedAt: 1,
  };
}

beforeEach(() => {
  useLab.setState(useLab.getInitialState(), true);
  memoryStorage.clear();
});

describe("project recovery", { concurrency: false }, () => {
  it("restores a saved setup including edited print dimensions, electronics, and notes", () => {
    const actions = useLab.getState();
    actions.setProjectName("My tuned wing");
    actions.setScale(1.3);
    actions.setFilament("orange");
    actions.patchRib({ chord: 210, sparD: 8 });
    actions.patchMotor({ boltCircle: 22 });
    actions.patchHorn({ length: 45 });
    actions.patchPlate({ width: 90 });
    actions.patchClip({ wall: 2.2 });
    actions.setSpan(1150);
    actions.setMass(730);
    actions.setSpeed(14);
    actions.setMcu("teensy40");
    actions.setDevice("sg90", 3);
    actions.setSketch("rate");
    actions.setNotes("Left horn is reversed; check it before the next test.");
    const expected = currentProject();
    actions.saveSnapshot();
    const saved = useLab.getState().snapshots[0]!;

    actions.setChassis("drone");
    actions.patchRib({ chord: 150 });
    actions.setScale(0.8);
    actions.setNotes("Outgoing quad setup");
    const outgoing = currentProject();
    actions.restoreSnapshot(saved.id);

    assert.deepEqual(currentProject(), expected);
    assert.deepEqual(
      saved.state.rib,
      expected.rib,
      "later print edits must not mutate the saved dimensions",
    );
    assert.ok(
      useLab
        .getState()
        .snapshots.some((snapshot) => JSON.stringify(snapshot.state) === JSON.stringify(outgoing)),
      "restoring a backup must preserve the setup being replaced",
    );
  });

  it("automatically backs up a manually edited template before loading another template", () => {
    const actions = useLab.getState();
    actions.setProjectName("Personal wing revision");
    actions.setDevice("sg90", 4);
    actions.setMcu("teensy40");
    actions.setNotes("Do not lose this wiring change");
    const expected = currentProject();
    actions.setChassis("spider");
    const saved = useLab
      .getState()
      .snapshots.find((snapshot) => snapshot.state.projectName === expected.projectName)!;
    assert.ok(saved, "template replacement must leave a recoverable backup");
    assert.deepEqual(saved.state, expected);
    actions.restoreSnapshot(saved.id);
    assert.deepEqual(currentProject(), expected);
  });

  it("preserves the current setup when an AI result activates a new design", () => {
    const actions = useLab.getState();
    actions.setProjectName("Custom-built wing");
    actions.setDevice("sg90", 4);
    actions.setNotes("Manual work before generating a new idea");
    const expected = currentProject();
    actions.saveDesign(design());
    assert.equal(useLab.getState().customId, "robot-one");
    const saved = useLab
      .getState()
      .snapshots.find((snapshot) => snapshot.state.projectName === expected.projectName)!;
    assert.ok(saved, "an AI result must not discard the previous project");
    actions.restoreSnapshot(saved.id);
    assert.deepEqual(currentProject(), expected);
  });

  it("deduplicates unchanged saves and retains the latest twelve distinct setups", () => {
    const actions = useLab.getState();
    actions.saveSnapshot();
    actions.saveSnapshot();
    assert.equal(useLab.getState().snapshots.length, 1);
    for (let i = 0; i < 15; i++) {
      actions.setNotes(`Revision ${i}`);
      actions.saveSnapshot();
    }
    const snapshots = useLab.getState().snapshots;
    assert.equal(snapshots.length, 12);
    assert.equal(snapshots[0]!.state.notes, "Revision 14");
    assert.equal(snapshots.at(-1)!.state.notes, "Revision 3");
  });

  it("ignores an unknown backup without replacing or backing up the live project", () => {
    const before = useLab.getState();
    before.restoreSnapshot("missing-backup");
    assert.deepEqual(currentProject(), currentProject(before));
    assert.deepEqual(useLab.getState().snapshots, []);
  });
});

describe("saved AI design edits", { concurrency: false }, () => {
  it("keeps manual controller, device, name, firmware, and printable-part changes after reopening", () => {
    const actions = useLab.getState();
    actions.saveDesign(design());
    actions.setProjectName("Renamed rover");
    actions.setMcu("esp32");
    actions.setDevice("pack3s", 1);
    actions.setDevice("bec5", 1);
    actions.setDevice("bec6", 1);
    actions.setDevice("hcsr04", 0);
    actions.setSketch("rate");
    actions.setPart("clip");
    const expected = currentProject();
    const storedDesign = structuredClone(useLab.getState().customs[0]!);
    actions.setChassis("drone");
    actions.activateDesign("robot-one");

    const restored = useLab.getState();
    assert.equal(restored.projectName, expected.projectName);
    assert.equal(restored.mcu, expected.mcu);
    assert.equal(restored.sketch, expected.sketch);
    assert.equal(restored.part, expected.part);
    assert.deepEqual(restored.picked, expected.picked);
    assert.equal(restored.picked.pack2s, 0, "battery exclusivity must survive reopening");
    assert.equal(restored.picked.bec5, 0, "regulator exclusivity must survive reopening");
    assert.deepEqual(restored.customs[0], storedDesign);
  });

  it("restores a custom design backup even after the saved design was edited and deleted", () => {
    const actions = useLab.getState();
    actions.saveDesign(design());
    actions.setProjectName("Original custom revision");
    actions.setNotes("Original assembly notes");
    actions.saveSnapshot();
    const saved = useLab.getState().snapshots[0]!;
    const expected = currentProject();
    actions.setMcu("teensy40");
    actions.setProjectName("Later revision");
    actions.deleteDesign("robot-one");
    actions.restoreSnapshot(saved.id);

    assert.deepEqual(currentProject(), expected);
    assert.equal(
      useLab.getState().customs.find((item) => item.id === "robot-one")!.projectName,
      "Original custom revision",
    );
    actions.setChassis("heli");
    actions.activateDesign("robot-one");
    assert.equal(
      useLab.getState().mcu,
      expected.mcu,
      "reopening must not revive the later design revision",
    );
  });
});

describe("browser-local persistence", { concurrency: false }, () => {
  it("merges legacy saved projects with defaults for the new board view and backups", async () => {
    memoryStorage.setItem(
      "airframe-lab",
      JSON.stringify({
        version: 0,
        state: {
          projectName: "Legacy wing",
          bench: "wire",
          notes: "Old work",
          mcu: "esp32",
          picked: { sg90: 3 },
        },
      }),
    );
    await useLab.persist.rehydrate();
    const restored = useLab.getState();
    assert.equal(restored.projectName, "Legacy wing");
    assert.equal(restored.bench, "wire");
    assert.equal(restored.notes, "Old work");
    assert.equal(restored.mcu, "esp32");
    assert.deepEqual(restored.picked, { sg90: 3 });
    assert.equal(restored.boardView, "schematic");
    assert.deepEqual(restored.snapshots, []);
    restored.setBoardView("board");
    restored.saveSnapshot();
    assert.equal(
      useLab.getState().snapshots[0]!.state.projectName,
      "Legacy wing",
      "legacy projects retain working actions",
    );
  });

  it("persists the board view, recoverable setup, and custom design across rehydration", async () => {
    const actions = useLab.getState();
    actions.saveDesign(design());
    actions.setProjectName("Persisted rover");
    actions.setBoardView("board");
    actions.setNotes("Persisted notes");
    actions.saveSnapshot();
    const expected = currentProject();
    const savedText = memoryStorage.getItem("airframe-lab")!;
    useLab.setState(useLab.getInitialState(), true);
    memoryStorage.setItem("airframe-lab", savedText);
    await useLab.persist.rehydrate();

    assert.deepEqual(currentProject(), expected);
    assert.equal(useLab.getState().boardView, "board");
    assert.ok(
      useLab
        .getState()
        .snapshots.some((snapshot) => snapshot.state.projectName === "Persisted rover"),
    );
    assert.equal(useLab.getState().customs[0]!.projectName, "Persisted rover");
    useLab.getState().restoreSnapshot(useLab.getState().snapshots[0]!.id);
    assert.equal(useLab.getState().notes, "Persisted notes");
  });
});
