import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyPinOverrides } from "./pin-overrides";
import { buildPlan } from "./plan";
import { chassisById } from "../robots/chassis";
import { makeSketch } from "../code/sketches";
import { buildPacket } from "../board/build";

const preset = chassisById("plane");
const initial = () => buildPlan(preset.mcu, preset.picked, "plane");
describe("editable signal assignments", () => {
  it("leaves automatic plans unchanged", () => {
    const base = initial();
    assert.equal(applyPinOverrides(base, {}), base);
  });
  it("updates wire, signal, firmware, and drawing connectivity consistently", () => {
    const base = initial();
    const source = base.servos[0]!.pin;
    const mapped = applyPinOverrides(base, { [source]: "11" });
    assert.equal(mapped.servos[0]!.pin, "11");
    assert(mapped.wires.some((wire) => wire.from.includes("D11") || wire.to.includes("D11")));
    assert.match(makeSketch("mixer", "Mapped", mapped, "Plane").code, /PIN_ELEVON_L = 11/);
    const packet = buildPacket("Mapped", mapped, preset.picked);
    assert(packet.board.traces.some((trace) => trace.net === "D11"));
    assert(!packet.board.traces.some((trace) => trace.net === `D${source}`));
    assert.equal(base.servos[0]!.pin, source);
  });
  it("supports simultaneous swaps without false collisions", () => {
    const base = initial();
    const [first, second] = base.servos.map((s) => s.pin) as [string, string];
    const mapped = applyPinOverrides(base, { [first]: second, [second]: first });
    assert.deepEqual(
      mapped.servos.map((s) => s.pin),
      [second, first],
    );
    assert(!mapped.issues.some((i) => i.title.includes("assigned twice")));
  });
  it("rejects collisions and invalid input atomically", () => {
    const base = initial();
    const source = base.servos[0]!.pin;
    for (const overrides of [
      { [source]: base.servos[1]!.pin },
      { [source]: "A4" },
      { [source]: "9;evil()" },
      { A4: "11" },
      { [source]: "13" },
    ] as Record<string, string>[]) {
      const mapped = applyPinOverrides(base, overrides);
      assert.equal(mapped.servos[0]!.pin, source);
      assert(mapped.issues.some((i) => i.level === "fault"));
      assert(!makeSketch("mixer", "Invalid", mapped, "Plane").code.includes("evil()"));
    }
  });
});
