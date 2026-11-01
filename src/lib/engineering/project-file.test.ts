import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { useLab, type ProjectSnapshot } from "../lab-store";
import { parseProjectFile, projectFile } from "./project-file";
import { migrateEngineering } from "./schema";
import { newEngineeringProject } from "./types";

function fixture(): ProjectSnapshot {
  const initial = useLab.getInitialState();
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
  } = initial;
  return structuredClone({
    id: "portable-test",
    savedAt: 12345,
    design: null,
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
      picked,
      sketch,
      notes,
      customId,
      engineering,
      projectId,
      pinOverrides,
    },
  });
}
describe("complete project files and migration", () => {
  it("round-trips original geometry/electronics and all engineering sections", () => {
    const saved = fixture();
    saved.state.engineering.mission.summary = "Inspect a rocky terrain course";
    saved.state.engineering.leg.upperMm = 88;
    saved.state.engineering.flight.massItems[0]!.massG = 333;
    saved.state.engineering.assembly.clearanceMm = 0.6;
    saved.state.pinOverrides = { "9": "11" };
    saved.state.engineering.notebook.push({
      id: "test-one",
      date: "2026-11-01",
      title: "Payload trial",
      kind: "experiment",
      procedure: "Measure loaded runtime",
      predicted: 20,
      measured: 18,
      unit: "min",
      notes: "Repeat three times",
      photos: [],
    });
    assert.deepEqual(parseProjectFile(projectFile(saved)), saved);
  });
  it("imports version-one backups with engineering defaults", () => {
    const old = fixture();
    const json = JSON.parse(projectFile(old));
    json.version = 1;
    delete json.state.engineering;
    delete json.state.projectId;
    delete json.state.pinOverrides;
    const imported = parseProjectFile(JSON.stringify(json));
    assert.equal(imported.state.projectName, old.state.projectName);
    assert.deepEqual(imported.state.engineering, newEngineeringProject());
    assert.deepEqual(imported.state.pinOverrides, {});
  });
  it("rejects malformed, mismatched, oversized, and dangerous imports", () => {
    assert.throws(() => parseProjectFile("broken"));
    assert.throws(() => parseProjectFile(" ".repeat(4_000_001)));
    for (const mutate of [
      (p: ReturnType<typeof fixture>) => {
        p.state.customId = "missing-design";
      },
      (p: ReturnType<typeof fixture>) => {
        p.state.rib.chord = -1;
      },
      (p: ReturnType<typeof fixture>) => {
        p.state.picked = { unknown: 1 } as typeof p.state.picked;
      },
      (p: ReturnType<typeof fixture>) => {
        p.state.engineering.notebook = [
          {
            id: "evil",
            title: "Bad attachment",
            date: "2026-11-01",
            kind: "experiment",
            procedure: "",
            predicted: null,
            measured: null,
            unit: "",
            notes: "",
            photos: [{ name: "bad.svg", dataUrl: "data:image/svg+xml;base64,PHN2Zy8+" }],
          },
        ];
      },
    ]) {
      const data = fixture();
      mutate(data);
      assert.throws(() => parseProjectFile(projectFile(data)));
    }
  });
  it("merges missing new fields without changing legacy project content", () => {
    const partial = { mission: { summary: "Legacy objective" }, leg: { upperMm: 95 } };
    const migrated = migrateEngineering(partial);
    assert.equal(migrated.mission.summary, "Legacy objective");
    assert.equal(migrated.leg.upperMm, 95);
    assert.equal(migrated.flight.massItems.length, 5);
  });
  it("keeps intentionally zero inputs and recovers unrelated notebook records", () => {
    const saved = fixture();
    saved.state.engineering.mission.maxMassG = 0;
    saved.state.engineering.leg.servoTorqueNm = 0;
    assert.equal(parseProjectFile(projectFile(saved)).state.engineering.leg.servoTorqueNm, 0);
    const notebook = [
      {
        id: "n1",
        date: "2026-11-01",
        title: "Keep my measurement",
        kind: "experiment" as const,
        procedure: "Test",
        predicted: 3,
        measured: 2.8,
        unit: "N",
        notes: "Keep this",
        photos: [],
      },
    ];
    const migrated = migrateEngineering({
      ...newEngineeringProject(),
      leg: { ...newEngineeringProject().leg, upperMm: "bad" },
      notebook,
    });
    assert.deepEqual(migrated.notebook, notebook);
    assert.equal(migrated.leg.upperMm, newEngineeringProject().leg.upperMm);
  });
});
