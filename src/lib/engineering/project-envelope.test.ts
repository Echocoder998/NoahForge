import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitWorkspace } from "./project-envelope";
import { safePhoto } from "./report";
describe("project storage separation", () => {
  const snapshot = (id: string, name: string, savedAt = 0) => ({
    id: `s-${id}-${savedAt}`,
    savedAt,
    state: { projectId: id, projectName: name },
    design: null,
  });
  it("migrates named projects and restores, with the active project last", () => {
    const input = {
      state: {
        projectId: "active",
        projectName: "Current",
        projects: [snapshot("active", "Old"), snapshot("other", "Other")],
        snapshots: [snapshot("other", "Newest", 10)],
      },
    };
    const result = splitWorkspace(JSON.stringify(input));
    assert.equal(result.records.length, 2);
    assert.equal(result.records.at(-1)!.id, "active");
    const other = JSON.parse(result.records[0]!.payload).state;
    assert.equal(other.projectName, "Newest");
    assert.equal(other.snapshots.length, 1);
    assert.equal(JSON.parse(result.records.at(-1)!.payload).state.projects.length, 0);
  });
  it("never treats unloaded metadata as an editable project", () => {
    const result = splitWorkspace(
      JSON.stringify({
        state: {
          projectId: "a",
          projectName: "A",
          projects: [{ ...snapshot("b", "B"), remote: true }],
          snapshots: [],
        },
      }),
    );
    assert.equal(result.records.length, 1);
  });
  it("separates a library exceeding the old aggregate 4 MB cap", () => {
    const result = splitWorkspace(
      JSON.stringify({
        state: {
          projectId: "a",
          projectName: "A",
          notes: "a".repeat(2100000),
          projects: [
            {
              ...snapshot("b", "B"),
              state: { projectId: "b", projectName: "B", notes: "b".repeat(2100000) },
            },
          ],
          snapshots: [],
        },
      }),
    );
    assert.equal(result.records.length, 2);
    for (const row of result.records) assert.ok(Buffer.byteLength(row.payload) < 3500000);
  });
  it("retains only restore points for their owning project", () => {
    const r = splitWorkspace(
      JSON.stringify({
        state: {
          projectId: "a",
          projectName: "A",
          projects: [],
          snapshots: [snapshot("a", "A", 1), snapshot("a", "A", 2), snapshot("b", "B", 3)],
        },
      }),
    );
    assert.equal(
      JSON.parse(r.records.find((x) => x.id === "a")!.payload).state.snapshots.length,
      2,
    );
  });
  it("accepts private authenticated image paths and rejects arbitrary remote URLs", () => {
    assert.equal(safePhoto("/api/files/read?path=users%2Fowner%2Fuploads%2Fphoto.png"), true);
    assert.equal(safePhoto("https://attacker.example/photo.png"), false);
    assert.equal(safePhoto("javascript:alert(1)"), false);
  });
});
