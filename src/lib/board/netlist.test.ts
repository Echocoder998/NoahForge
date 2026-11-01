import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kicadNetlist } from "./netlist";
import { buildPacket } from "./build";
import { buildPlan } from "../wire/plan";
import { CHASSIS } from "../robots/chassis";

type Expression = string | Expression[];
function parseNetlist(source: string): Expression[] {
  const tokens = source.match(/"(?:\\.|[^"\\])*"|[()]|[^\s()]+/g) ?? [];
  let position = 0;
  const read = (): Expression => {
    const token = tokens[position++];
    assert.notEqual(token, undefined, "unterminated netlist");
    assert.notEqual(token, ")", "unexpected closing parenthesis");
    if (token !== "(") return token.startsWith('"') ? JSON.parse(token) : token;
    const children: Expression[] = [];
    while (tokens[position] !== ")") children.push(read());
    position++;
    return children;
  };
  const root = read();
  assert(Array.isArray(root));
  assert.equal(position, tokens.length, "one complete netlist document");
  return root;
}
function section(parent: Expression[], name: string): Expression[] {
  const found = parent.find((child) => Array.isArray(child) && child[0] === name);
  assert(Array.isArray(found), `missing ${name}`);
  return found;
}

describe("generic CAD connectivity export", () => {
  for (const preset of CHASSIS)
    it(`includes every pad once for ${preset.name}`, () => {
      const board = buildPacket(
        "Test",
        buildPlan(preset.mcu, preset.picked, preset.id),
        preset.picked,
      ).board;
      const netlist = kicadNetlist(board, 'Test <A&B> "project"');
      assert.match(netlist, /^\(export \(version "E"\)/);
      const root = parseNetlist(netlist);
      assert.equal(root[0], "export");
      assert.equal(section(section(root, "design"), "source")[1], 'Test <A&B> "project"');
      const components = section(root, "components").slice(1) as Expression[][];
      assert.deepEqual(
        components.map((comp) => section(comp, "ref")[1]),
        board.parts.map((part) => part.ref),
      );
      for (const comp of components) {
        assert.equal(section(comp, "footprint")[1], "");
        assert.match(
          String(section(comp, "tstamps")[1]),
          /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-8[\da-f]{3}-[\da-f]{12}$/,
        );
      }
      const nets = section(root, "nets").slice(1) as Expression[][];
      const nodes = nets.flatMap(
        (net) =>
          net.filter((child) => Array.isArray(child) && child[0] === "node") as Expression[][],
      );
      assert.equal(
        nodes.length,
        board.parts.reduce((n, p) => n + p.pads.length, 0),
      );
      assert.equal(
        new Set(nodes.map((node) => `${section(node, "ref")[1]}/${section(node, "pin")[1]}`)).size,
        nodes.length,
      );
      assert.equal(
        nets.length,
        new Set(board.parts.flatMap((p) => p.pads.map((pad) => pad.net))).size,
      );
      assert.match(netlist, /assign and verify actual footprints/);
    });
  it("keeps quoted text inside fields and component IDs stable when renamed", () => {
    const board = buildPacket(
      "Test",
      buildPlan(CHASSIS[0]!.mcu, CHASSIS[0]!.picked, CHASSIS[0]!.id),
      CHASSIS[0]!.picked,
    ).board;
    const first = parseNetlist(kicadNetlist(board, "Original"));
    const dangerous = 'quoted "name" \\path\n)(nets (net (code 99)))';
    board.parts[0]!.name = dangerous;
    const second = parseNetlist(kicadNetlist(board, dangerous));
    assert.equal(section(section(second, "design"), "source")[1], dangerous.replace(/\n/g, " "));
    assert.deepEqual(section(first, "nets"), section(second, "nets"));
    const original = section(first, "components")[1] as Expression[];
    const changed = section(second, "components")[1] as Expression[];
    assert.equal(section(changed, "value")[1], dangerous.replace(/\n/g, " "));
    assert.deepEqual(section(original, "tstamps"), section(changed, "tstamps"));
  });
});
