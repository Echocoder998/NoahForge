import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPacket, type Board } from "./build";
import { boardSvg, schematicSvg } from "./svg";
import { CHASSIS } from "../robots/chassis";
import { buildPlan, type Counts } from "../wire/plan";

const pointKey = (point: { x: number; y: number }) => `${point.x.toFixed(5)},${point.y.toFixed(5)}`;

// Build an independent graph from segment endpoints. Generated bottom-layer
// endpoints represent vias, and the pads are through-hole connection points.
function reachablePads(board: Board, net: string): Set<string> {
  const traces = board.traces.filter((trace) => trace.net === net);
  const pads = board.parts.flatMap((part) => part.pads).filter((pad) => pad.net === net);
  const graph = new Map<string, Set<string>>();
  for (const trace of traces) {
    for (let i = 1; i < trace.points.length; i++) {
      const a = pointKey(trace.points[i - 1]!);
      const b = pointKey(trace.points[i]!);
      graph.set(a, new Set([...(graph.get(a) ?? []), b]));
      graph.set(b, new Set([...(graph.get(b) ?? []), a]));
    }
  }
  const seen = new Set<string>();
  const pending = [pointKey(pads[0]!)];
  while (pending.length) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    pending.push(...(graph.get(current) ?? []));
  }
  return seen;
}

function assertConnected(board: Board) {
  const pads = board.parts.flatMap((part) => part.pads);
  for (const net of new Set(pads.map((pad) => pad.net))) {
    const reachable = reachablePads(board, net);
    for (const pad of pads.filter((p) => p.net === net)) {
      assert.ok(reachable.has(pointKey(pad)), `${net}: ${pad.name} must connect to the first pad`);
    }
  }
}

describe("concept board continuity", () => {
  for (const preset of CHASSIS) {
    it(`connects every signal, supply and ground pad for ${preset.name}`, () => {
      const packet = buildPacket(
        preset.projectName,
        buildPlan(preset.mcu, preset.picked, preset.id),
        preset.picked,
      );
      assertConnected(packet.board);
      assert.ok(
        packet.board.checks.some(
          (check) => check.level === "warn" && check.title === "Concept layout only",
        ),
      );
    });
  }

  it("keeps repeated I2C lanes shared and inside the header placement", () => {
    const counts: Counts = {
      pack2s: 1,
      bec5: 1,
      sg90: 12,
      esc: 4,
      mpu6050: 1,
      bmp280: 1,
      gps: 1,
      receiver: 1,
    };
    const { board } = buildPacket("Many headers", buildPlan("teensy40", counts), counts);
    assertConnected(board);
    const headerLeft = Math.min(
      ...board.parts
        .filter((part) => part.ref !== "J1" && part.ref.startsWith("J"))
        .map((part) => part.x),
    );
    for (const net of ["SDA", "SCL"]) {
      const runs = board.traces.filter((trace) => trace.net === net && trace.layer === "bottom");
      assert.equal(runs.length, 2, "both I2C modules need a branch");
      assert.equal(
        new Set(runs.map((trace) => trace.points[0]!.x)).size,
        1,
        "a shared bus must reuse its lane",
      );
    }
    for (const trace of board.traces) {
      for (const point of trace.points) {
        assert.ok(
          point.x >= 0 && point.x <= board.width && point.y >= 0 && point.y <= board.height,
          "all drawn routes stay inside the board",
        );
      }
      if (trace.layer === "bottom" && trace.kind !== "ground") {
        assert.ok(
          trace.points.every((point) => point.x < headerLeft),
          "signal lanes cannot enter header footprints",
        );
      }
    }
  });

  it("connects all schematic grounds while keeping ground out of the positive switch", () => {
    const counts: Counts = { pack2s: 1, switch: 1, bec5: 1, sg90: 2, mpu6050: 1 };
    const { schematic } = buildPacket("Ground test", buildPlan("uno", counts), counts);
    const switchBlock = schematic.blocks.find((block) => block.ref === "SW1")!;
    assert.deepEqual(
      switchBlock.pins.map((pin) => pin.name),
      ["IN", "OUT"],
    );
    for (const block of schematic.blocks) {
      for (const pin of block.pins.filter((candidate) => candidate.name === "GND")) {
        assert.ok(
          schematic.wires.some(
            (wire) =>
              wire.net === "GND" &&
              ((wire.x1 === pin.x && wire.y1 === pin.y) ||
                (wire.x2 === pin.x && wire.y2 === pin.y)),
          ),
          `${block.ref} ground must be connected`,
        );
      }
    }
  });

  for (const counts of [
    { pack2s: 1, switch: 1 },
    { pack2s: 1, switch: 1, bec6: 1, sg90: 6 },
  ] satisfies Counts[]) {
    it(`draws a separate logic supply when no suitable logic rail is selected (${counts.bec6 ? "6 V servo rail" : "battery only"})`, () => {
      const { schematic, board } = buildPacket("Power test", buildPlan("teensy40", counts), counts);
      const usb = schematic.blocks.find((block) => block.ref === "P1")!;
      const source = usb.pins.find((pin) => pin.name === "+")!;
      const logic = schematic.wires.find((wire) => wire.net === "VIN")!;
      assert.equal(logic.x1, source.x);
      assert.equal(logic.y1, source.y);
      assert.match(board.parts[0]!.name, /USB/);
      for (const block of schematic.blocks) {
        assert.ok(block.y + block.h <= schematic.height, "power blocks must fit the schematic");
      }
    });
  }

  it("exports concept labels and escapes project names", () => {
    const { board, schematic } = buildPacket("A < B & C", buildPlan("uno", {}), {});
    assert.match(boardSvg(board), /Not Gerber/);
    assert.match(boardSvg(board), /A &lt; B &amp; C/);
    assert.match(schematicSvg(schematic, "A < B & C"), /Concept schematic/);
    assert.match(schematicSvg(schematic, "A < B & C"), /A &lt; B &amp; C/);
  });
});
