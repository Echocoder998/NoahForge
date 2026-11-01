import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newEngineeringProject, type Requirement } from "./types";
import {
  MAX_PHOTO_BYTES,
  measurementDelta,
  reportHtml,
  reportMarkdown,
  requirementStatus,
  safePhoto,
} from "./report";

const requirement: Requirement = {
  id: "r1",
  text: "Mass",
  metric: "mass",
  target: 1000,
  unit: "g",
  direction: "max",
  actual: null,
  method: "test",
  evidence: "",
};
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";

describe("requirement verification evidence", () => {
  it("keeps missing and nonfinite results unverified", () => {
    assert.equal(requirementStatus(requirement), "unverified");
    assert.equal(requirementStatus({ ...requirement, actual: Number.NaN }), "unverified");
    assert.equal(requirementStatus({ ...requirement, target: Infinity, actual: 1 }), "unverified");
  });
  it("requires recorded evidence and respects inclusive minimum/maximum targets", () => {
    assert.equal(requirementStatus({ ...requirement, actual: 1000 }), "needs-evidence");
    assert.equal(
      requirementStatus({ ...requirement, actual: 1000, evidence: "Measured on scale, 1 Nov" }),
      "met",
    );
    assert.equal(
      requirementStatus({ ...requirement, actual: 1001, evidence: "Scale test" }),
      "not-met",
    );
    assert.equal(
      requirementStatus({
        ...requirement,
        direction: "min",
        actual: 1000,
        evidence: "Analysis sheet",
      }),
      "met",
    );
    assert.equal(requirementStatus({ ...requirement, direction: "min", actual: 999 }), "not-met");
  });
});

describe("measured comparisons and photos", () => {
  it("handles signed differences, missing measurements, and zero predictions", () => {
    assert.deepEqual(measurementDelta({ predicted: 10, measured: 12 }), {
      difference: 2,
      percent: 20,
    });
    assert.deepEqual(measurementDelta({ predicted: -10, measured: -12 }), {
      difference: -2,
      percent: -20,
    });
    assert.deepEqual(measurementDelta({ predicted: 0, measured: 2 }), {
      difference: 2,
      percent: null,
    });
    assert.equal(measurementDelta({ predicted: 2, measured: null }), null);
    assert.equal(measurementDelta({ predicted: Infinity, measured: 3 }), null);
  });
  it("accepts bounded actual image signatures and rejects scripts, SVG and oversized data", () => {
    assert.equal(safePhoto(png), true);
    assert.equal(safePhoto("data:image/jpeg;base64,/9j/2Q=="), true);
    assert.equal(safePhoto("javascript:alert(1)"), false);
    assert.equal(safePhoto("data:image/svg+xml;base64,PHN2Zy8+"), false);
    assert.equal(safePhoto("data:image/png;base64,PHNjcmlwdD4="), false);
    assert.equal(safePhoto(`data:image/png;base64,${"A".repeat(MAX_PHOTO_BYTES * 2)}`), false);
  });
});

describe("portable engineering reports", () => {
  it("includes mission inputs, calculation assumptions, records, evidence and legacy notes", () => {
    const project = newEngineeringProject();
    project.mission.summary = "Inspect a rover test course";
    project.mission.requirements = [
      { ...requirement, actual: 900, evidence: "Notebook n1: mass test" },
    ];
    project.notebook = [
      {
        id: "n1",
        date: "2026-11-01",
        title: "Mass test",
        kind: "experiment",
        procedure: "Weigh with battery installed",
        predicted: 1000,
        measured: 900,
        unit: "g",
        notes: "Reduced bracket mass",
        photos: [{ name: "Scale reading", dataUrl: png }],
      },
    ];
    const markdown = reportMarkdown(
      "Rover A",
      project,
      "Check M3 fasteners",
      new Date("2026-11-01T12:00:00Z"),
    );
    const html = reportHtml(
      "Rover A",
      project,
      "Check M3 fasteners",
      new Date("2026-11-01T12:00:00Z"),
    );
    for (const output of [markdown, html]) {
      assert.match(output, /Inspect a rover test course/);
      assert.match(output, /Mass test/);
      assert.match(output, /Notebook n1/);
      assert.match(output, /Check M3 fasteners/);
      assert.match(output, /2026-11-01T12:00:00/);
      assert.match(output, /Motor \/ propeller/);
      assert.match(output, /static checks do not establish dynamic stability/);
      assert.match(output, /data:image\/png;base64/);
    }
    assert.match(markdown, /-100 g \(-10%\)/);
    assert.match(html, /Print \/ save PDF/);
  });
  it("escapes user text and excludes unsafe photo URLs in both export formats", () => {
    const project = newEngineeringProject();
    project.mission.summary = '<script>alert("x")</script> | summary';
    project.mission.requirements = [
      { ...requirement, text: "A | B", actual: 1, evidence: '<img src=x onerror="bad()">' },
    ];
    project.notebook = [
      {
        id: "n1",
        date: "2026-11-01",
        title: "<img onerror=bad()>",
        kind: "decision",
        procedure: "<script>bad()</script>",
        predicted: null,
        measured: null,
        unit: "g",
        notes: "<b>note</b>",
        photos: [{ name: "unsafe", dataUrl: "javascript:alert(1)" }],
      },
    ];
    for (const output of [
      reportMarkdown("<script>name</script>", project, "<script>notes</script>"),
      reportHtml("<script>name</script>", project, "<script>notes</script>"),
    ]) {
      assert.doesNotMatch(output, /<script>/);
      assert.doesNotMatch(output, /src="javascript:/);
      assert.doesNotMatch(output, /\]\(javascript:/);
      assert.match(output, /&lt;script&gt;/);
    }
    assert.match(reportMarkdown("Test", project, ""), /A \\\| B/);
  });
  it("makes zero-current and zero-mass calculations explicit without Infinity or NaN", () => {
    const project = newEngineeringProject();
    project.flight.massItems = [];
    project.flight.hoverCurrentPerMotorA = 0;
    project.flight.electronicsCurrentA = 0;
    project.flight.cruiseCurrentA = 0;
    const markdown = reportMarkdown("Empty rig", project, "");
    assert.match(markdown, /Total mass \/ limit/);
    assert.match(markdown, /Undefined/);
    assert.doesNotMatch(markdown, /NaN|Infinity/);
  });
});
